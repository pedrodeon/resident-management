-- Reversal of 20260729221553_person_occupancy_split.sql.
--
-- NOT part of the migration sequence, and NOT applied automatically. Running a
-- hand-written "down" outside the CLI desyncs supabase_migrations.schema_migrations,
-- so if you use this, also delete that migration's row from that table:
--
--   delete from supabase_migrations.schema_migrations
--   where version = '20260729221553';
--
-- This is mechanical because the split preserved primary keys:
-- occupancies.id == the old residents.id, so the four child tables' values are
-- already correct for the pre-split world and only the column name and FK
-- target need reversing. No data is remapped here either.
--
-- LIMITS, stated plainly:
--   * Any occupancy created AFTER the split that is a person's second stay
--     cannot be represented in the old single-row-per-resident shape. This
--     script refuses to run in that case rather than silently dropping a stay.
--   * residents_pre_split is restored as the roster, so any roster edits made
--     after the split are lost. The assertion below catches the common cases.

begin;

-- ---------------------------------------------------------------------------
-- 0. Refuse to run if the new model holds data the old one cannot express
-- ---------------------------------------------------------------------------

do $$
declare
  extra_stays int;
  occ_total int;
  backup_total int;
begin
  if not exists (select 1 from information_schema.tables
                 where table_schema='public' and table_name='residents_pre_split') then
    raise exception 'residents_pre_split is missing — nothing to roll back to';
  end if;

  select count(*) into extra_stays
  from (
    select person_id from public.occupancies group by person_id having count(*) > 1
  ) multi;
  if extra_stays > 0 then
    raise exception
      '% person(s) now have more than one occupancy; the pre-split shape cannot '
      'hold that. Roll back manually after deciding which stay to keep.', extra_stays;
  end if;

  select count(*) into occ_total from public.occupancies;
  select count(*) into backup_total from public.residents_pre_split;
  if occ_total <> backup_total then
    raise exception
      'occupancies has % row(s) but the pre-split backup has % — the roster '
      'changed after the split; roll back manually.', occ_total, backup_total;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. Restore the old roster table
-- ---------------------------------------------------------------------------

alter table public.residents_pre_split rename to residents;

grant select on public.residents to authenticated;
grant select, insert, update, delete on public.residents to service_role;
revoke all on public.residents from anon;

-- ---------------------------------------------------------------------------
-- 2. Reverse the four child repointings
-- ---------------------------------------------------------------------------

do $$
declare
  t record;
begin
  for t in
    select * from (values
      ('presence_events',    'cascade'),
      ('occupancy_events',   'cascade'),
      ('room_change_events', 'cascade'),
      ('inspections',        'none')
    ) as v(tbl, on_del)
  loop
    execute format('alter table public.%I drop constraint if exists %I',
                   t.tbl, t.tbl || '_occupancy_id_fkey');
    execute format('alter table public.%I rename column occupancy_id to resident_id', t.tbl);
    if t.on_del = 'cascade' then
      execute format(
        'alter table public.%I add constraint %I foreign key (resident_id) '
        || 'references public.residents (id) on delete cascade',
        t.tbl, t.tbl || '_resident_id_fkey');
    else
      execute format(
        'alter table public.%I add constraint %I foreign key (resident_id) '
        || 'references public.residents (id)',
        t.tbl, t.tbl || '_resident_id_fkey');
    end if;
  end loop;
end $$;

alter index if exists public.presence_events_occupancy_time_idx
  rename to presence_events_resident_time_idx;
alter index if exists public.occupancy_events_occupancy_time_idx
  rename to occupancy_events_resident_time_idx;
alter index if exists public.room_change_events_occupancy_time_idx
  rename to room_change_events_resident_time_idx;
drop index if exists public.inspections_occupancy_idx;

-- ---------------------------------------------------------------------------
-- 3. Restore the two policies that read inspections
-- ---------------------------------------------------------------------------

drop policy if exists "staff insert inspection signatures" on public.inspection_signatures;
create policy "staff insert inspection signatures" on public.inspection_signatures
  for insert to authenticated
  with check (
    public.is_staff()
    and captured_by = (select auth.uid())
    and exists (
      select 1 from public.inspections i
      where i.id = inspection_id
        and i.type in ('move_in', 'move_out')
        and i.resident_id is not null
    )
  );

drop policy if exists "staff insert signature waivers" on public.inspection_signature_waivers;
create policy "staff insert signature waivers" on public.inspection_signature_waivers
  for insert to authenticated
  with check (
    public.is_staff()
    and waived_by = (select auth.uid())
    and exists (
      select 1 from public.inspections i
      where i.id = inspection_id
        and i.type = 'move_out'
        and i.resident_id is not null
    )
  );

-- ---------------------------------------------------------------------------
-- 4. Restore the five RPCs (as of 20260729130713 + 20260728200318)
-- ---------------------------------------------------------------------------

drop view if exists public.current_residents;

drop function if exists public.set_presence(uuid, boolean, text);
drop function if exists public.set_presence_bulk(uuid, boolean);
drop function if exists public.record_occupancy(uuid, public.occupancy_event_type, text);
drop function if exists public.reassign_room(uuid, uuid, text);
drop function if exists public.create_inspection(uuid, uuid, public.inspection_type, text, jsonb);

create function public.set_presence(
  target_resident uuid,
  make_present boolean,
  event_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  updated_count int;
begin
  if not public.is_staff() then
    raise exception 'only staff may set presence'
      using errcode = 'insufficient_privilege';
  end if;

  update public.residents
    set is_present = make_present
    where id = target_resident
      and occupancy_status = 'checked_in';

  get diagnostics updated_count = row_count;
  if updated_count = 0 then
    raise exception 'resident % is not checked in', target_resident
      using errcode = 'check_violation';
  end if;

  insert into public.presence_events (resident_id, status, recorded_by, note)
  values (
    target_resident,
    (case when make_present then 'returned' else 'away' end)::public.presence_status,
    (select auth.uid()),
    event_note
  );
end;
$$;

create function public.set_presence_bulk(
  target_hallway uuid,
  make_present boolean
)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed_count int;
begin
  if not public.is_staff() then
    raise exception 'only staff may set presence'
      using errcode = 'insufficient_privilege';
  end if;

  with affected as (
    update public.residents r
      set is_present = make_present
      from public.rooms rm
      where r.room_id = rm.id
        and rm.hallway_id = target_hallway
        and r.occupancy_status = 'checked_in'
        and r.is_present is distinct from make_present
      returning r.id
  ),
  logged as (
    insert into public.presence_events (resident_id, status, recorded_by)
    select affected.id,
           (case when make_present then 'returned' else 'away' end)::public.presence_status,
           (select auth.uid())
    from affected
    returning 1
  )
  select count(*) into changed_count from logged;

  return changed_count;
end;
$$;

create function public.record_occupancy(
  target_resident uuid,
  event_type public.occupancy_event_type,
  event_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_status public.occupancy_status;
begin
  if not public.is_staff() then
    raise exception 'only staff may record occupancy'
      using errcode = 'insufficient_privilege';
  end if;

  select occupancy_status into current_status
    from public.residents where id = target_resident
    for update;

  if current_status is null then
    raise exception 'resident % not found', target_resident
      using errcode = 'no_data_found';
  end if;

  if event_type = 'check_in' then
    if current_status <> 'expected' then
      raise exception 'resident % cannot check in from status %', target_resident, current_status
        using errcode = 'check_violation';
    end if;
    if not exists (
      select 1
      from public.inspections i
      where i.resident_id = target_resident
        and i.type = 'move_in'
        and (
          select count(distinct s.role)
          from public.inspection_signatures s
          where s.inspection_id = i.id
        ) = 2
    ) then
      raise exception
        'check-in requires a move-in inspection signed by both the resident and the RA'
        using errcode = 'check_violation';
    end if;
    update public.residents
      set occupancy_status = 'checked_in', is_present = true
      where id = target_resident;
  else
    if current_status <> 'checked_in' then
      raise exception 'resident % cannot check out from status %', target_resident, current_status
        using errcode = 'check_violation';
    end if;
    if not exists (
      select 1
      from public.inspections i
      where i.resident_id = target_resident
        and i.type = 'move_out'
        and exists (
          select 1 from public.inspection_signatures s
          where s.inspection_id = i.id and s.role = 'ra'
        )
        and (
          exists (
            select 1 from public.inspection_signatures s
            where s.inspection_id = i.id and s.role = 'resident'
          )
          or exists (
            select 1 from public.inspection_signature_waivers w
            where w.inspection_id = i.id
          )
        )
    ) then
      raise exception
        'check-out requires a move-out inspection signed by the RA and either signed by the resident or carrying a recorded waiver'
        using errcode = 'check_violation';
    end if;
    update public.residents
      set occupancy_status = 'checked_out', is_present = false
      where id = target_resident;
  end if;

  insert into public.occupancy_events (resident_id, type, recorded_by, note)
  values (target_resident, event_type, (select auth.uid()), event_note);
end;
$$;

create function public.reassign_room(
  target_resident uuid,
  to_room uuid,
  reason text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  from_room uuid;
begin
  if not public.is_rd() then
    raise exception 'only the RD may reassign rooms'
      using errcode = 'insufficient_privilege';
  end if;

  select room_id into from_room
    from public.residents where id = target_resident
    for update;

  if from_room is null then
    raise exception 'resident % not found', target_resident
      using errcode = 'no_data_found';
  end if;

  if from_room = to_room then
    raise exception 'resident is already in that room'
      using errcode = 'check_violation';
  end if;

  update public.residents set room_id = to_room where id = target_resident;

  insert into public.room_change_events
    (resident_id, from_room_id, to_room_id, changed_by, reason)
  values
    (target_resident, from_room, to_room, (select auth.uid()), reason);
end;
$$;

create function public.create_inspection(
  target_room uuid,
  target_resident uuid,
  inspection_type public.inspection_type,
  inspection_notes text,
  items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_inspection_id uuid;
begin
  if not public.is_staff() then
    raise exception 'only staff may create inspections'
      using errcode = 'insufficient_privilege';
  end if;

  insert into public.inspections (room_id, resident_id, type, inspected_by, notes)
  values (target_room, target_resident, inspection_type,
          (select auth.uid()), inspection_notes)
  returning id into new_inspection_id;

  with inserted_items as (
    insert into public.inspection_items (inspection_id, inventory_item_id, condition, note)
    select new_inspection_id,
           (elem->>'item_id')::uuid,
           (elem->>'condition')::public.item_condition,
           nullif(elem->>'note', '')
    from jsonb_array_elements(items) as elem
    returning id, inventory_item_id
  )
  insert into public.inspection_photos (inspection_id, inspection_item_id, storage_path)
  select new_inspection_id, ii.id, photo.value
  from jsonb_array_elements(items) as elem
  join inserted_items ii
    on ii.inventory_item_id = (elem->>'item_id')::uuid
  cross join lateral jsonb_array_elements_text(coalesce(elem->'photos', '[]'::jsonb)) as photo;

  return new_inspection_id;
end;
$$;

revoke execute on function public.set_presence(uuid, boolean, text) from anon;
revoke execute on function public.set_presence_bulk(uuid, boolean) from anon;
revoke execute on function public.record_occupancy(uuid, public.occupancy_event_type, text) from anon;
revoke execute on function public.reassign_room(uuid, uuid, text) from anon;
revoke execute on function public.create_inspection(uuid, uuid, public.inspection_type, text, jsonb) from anon;

grant execute on function public.set_presence(uuid, boolean, text) to authenticated;
grant execute on function public.set_presence_bulk(uuid, boolean) to authenticated;
grant execute on function public.record_occupancy(uuid, public.occupancy_event_type, text) to authenticated;
grant execute on function public.reassign_room(uuid, uuid, text) to authenticated;
grant execute on function public.create_inspection(uuid, uuid, public.inspection_type, text, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Drop the new model
-- ---------------------------------------------------------------------------

drop table if exists public.occupancies;
drop table if exists public.people;
drop table if exists public.app_settings;
drop function if exists public.touch_updated_at();

commit;
