-- Split `residents` into `people` (the person, once) + `occupancies`
-- (one person, one room, one term).
--
-- Why: a single residents row conflated a person with their stay, so a
-- returning student had nowhere to go but an edited old row — silently
-- rewriting the history that damage disputes rest on. After this, a returning
-- student is the same `people` row plus a NEW `occupancies` row; old
-- occupancies are never reused or reset. Inspections and all three event
-- tables hang off the OCCUPANCY, so every record stays pinned to the exact
-- stay it was taken during. Archived occupancies are hidden from everyday
-- screens but stay queryable.
--
-- THE SAFETY TRICK: occupancies.id is backfilled with the OLD residents.id, so
-- the four child FK columns keep their exact values. Repointing is a column
-- rename plus an FK swap with ZERO value remapping — nothing can be
-- mis-associated because nothing moves. inspection_items, inspection_photos,
-- inspection_signatures and inspection_signature_waivers reach the occupancy
-- transitively through inspection_id and need no change at all.
--
-- Assertions at the end abort the whole transaction if any count drifts or any
-- child row would be orphaned. The old table is renamed (not dropped), so the
-- pre-split state stays inspectable and the down script is mechanical.
--
-- Idempotent: every step is guarded, so a re-run is a no-op.

-- ---------------------------------------------------------------------------
-- 0. updated_at trigger helper
-- ---------------------------------------------------------------------------

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. app_settings — one row, holds the current term
-- ---------------------------------------------------------------------------
-- The term lives in the database, not an env var, so RPCs (and future RLS) can
-- read it and rolling over to a new term is a form field rather than a deploy.

create table if not exists public.app_settings (
  -- Single-row table: the primary key can only ever be true.
  id boolean primary key default true check (id),
  current_term text not null,
  updated_at timestamptz not null default now()
);

insert into public.app_settings (id, current_term)
values (true, 'Fall 2026')
on conflict (id) do nothing;

alter table public.app_settings enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public'
                 and tablename = 'app_settings'
                 and policyname = 'staff read settings') then
    create policy "staff read settings" on public.app_settings
      for select to authenticated using (public.is_staff());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public'
                 and tablename = 'app_settings'
                 and policyname = 'rd updates settings') then
    create policy "rd updates settings" on public.app_settings
      for update to authenticated
      using (public.is_rd()) with check (public.is_rd());
  end if;
end $$;

-- Auto-expose is off (see 20260717032303): grant explicitly, or RLS guards a
-- table nobody can reach.
revoke all on public.app_settings from anon;
grant select, update on public.app_settings to authenticated;
grant select, insert, update on public.app_settings to service_role;

drop trigger if exists app_settings_touch on public.app_settings;
create trigger app_settings_touch before update on public.app_settings
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- 2. people — the person, once, across every stay
-- ---------------------------------------------------------------------------

create table if not exists public.people (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  student_id text not null unique,
  phone text,
  emergency_contact text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.people is
  'A person, once, across every stay. Records, not accounts. Sensitive '
  '(FERPA): never expose without RLS.';

alter table public.people enable row level security;

-- Same rule the old roster had: all staff read, only the RD writes.
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public'
                 and tablename='people' and policyname='staff read people') then
    create policy "staff read people" on public.people
      for select to authenticated using (public.is_staff());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public'
                 and tablename='people' and policyname='rd creates people') then
    create policy "rd creates people" on public.people
      for insert to authenticated with check (public.is_rd());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public'
                 and tablename='people' and policyname='rd updates people') then
    create policy "rd updates people" on public.people
      for update to authenticated
      using (public.is_rd()) with check (public.is_rd());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public'
                 and tablename='people' and policyname='rd deletes people') then
    create policy "rd deletes people" on public.people
      for delete to authenticated using (public.is_rd());
  end if;
end $$;

revoke all on public.people from anon;
grant select, insert, update, delete on public.people to authenticated;
grant select, insert, update, delete on public.people to service_role;

drop trigger if exists people_touch on public.people;
create trigger people_touch before update on public.people
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- 3. occupancies — one person, one room, one term
-- ---------------------------------------------------------------------------

create table if not exists public.occupancies (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people (id) on delete cascade,
  -- No cascade, matching the old residents.room_id: a room with an occupant
  -- cannot be deleted out from under them.
  room_id uuid not null references public.rooms (id),
  -- Free text, e.g. 'Fall 2026'. Deliberately not an enum: terms are named by
  -- Residence Life, not by a migration.
  term text not null,
  -- Cache; source of truth is the latest occupancy_events row for this stay.
  occupancy_status public.occupancy_status not null default 'expected',
  -- THE LIVE TOGGLE. Presence means "in the building during THIS stay", so it
  -- belongs to the occupancy, not the person. Only meaningful while checked_in.
  is_present boolean not null default true,
  -- Archived = hidden from everyday screens, never deleted.
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.occupancies is
  'One person in one room for one term. A returning student gets a NEW row; '
  'old occupancies are never reused or reset. Archived rows stay queryable '
  'for dispute history.';

create index if not exists occupancies_room_idx on public.occupancies (room_id);
create index if not exists occupancies_person_idx on public.occupancies (person_id);
create index if not exists occupancies_term_idx
  on public.occupancies (term, is_archived);

-- At most one ACTIVE stay per person: allows full history and re-admission
-- after a check-out, but stops the same person being live in two rooms.
create unique index if not exists occupancies_one_active_per_person
  on public.occupancies (person_id)
  where is_archived = false and occupancy_status <> 'checked_out';

alter table public.occupancies enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public'
                 and tablename='occupancies'
                 and policyname='staff read occupancies') then
    create policy "staff read occupancies" on public.occupancies
      for select to authenticated using (public.is_staff());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public'
                 and tablename='occupancies'
                 and policyname='rd creates occupancies') then
    create policy "rd creates occupancies" on public.occupancies
      for insert to authenticated with check (public.is_rd());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public'
                 and tablename='occupancies'
                 and policyname='rd updates occupancies') then
    create policy "rd updates occupancies" on public.occupancies
      for update to authenticated
      using (public.is_rd()) with check (public.is_rd());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public'
                 and tablename='occupancies'
                 and policyname='rd deletes occupancies') then
    create policy "rd deletes occupancies" on public.occupancies
      for delete to authenticated using (public.is_rd());
  end if;
end $$;

revoke all on public.occupancies from anon;
grant select, insert, update, delete on public.occupancies to authenticated;
grant select, insert, update, delete on public.occupancies to service_role;

drop trigger if exists occupancies_touch on public.occupancies;
create trigger occupancies_touch before update on public.occupancies
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- 4. Backfill — one people row + one occupancies row per existing resident
-- ---------------------------------------------------------------------------
-- Runs only while the source table still exists (i.e. the first time).

do $$
declare
  term_now text;
begin
  if not exists (select 1 from information_schema.tables
                 where table_schema = 'public' and table_name = 'residents') then
    raise notice 'residents already split — skipping backfill';
    return;
  end if;

  select current_term into term_now from public.app_settings where id;

  insert into public.people (full_name, student_id, phone, emergency_contact)
  select r.full_name, r.student_id, r.phone, r.emergency_contact
  from public.residents r
  on conflict (student_id) do nothing;

  -- id = the OLD residents.id. This is what makes repointing the four child
  -- tables a pure rename with no value remapping.
  insert into public.occupancies
    (id, person_id, room_id, term, occupancy_status, is_present, is_archived)
  select r.id, p.id, r.room_id, term_now, r.occupancy_status, r.is_present, false
  from public.residents r
  join public.people p on p.student_id = r.student_id
  on conflict (id) do nothing;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Repoint the four child tables: resident_id -> occupancy_id
-- ---------------------------------------------------------------------------
-- The values are already correct (see above), so this only renames the column
-- and swaps which table the FK points at, preserving each one's on-delete rule
-- (cascade on the three event tables; plain NO ACTION and nullable on
-- inspections, so the legacy periodic row with a null stays legal).
--
-- Old constraints are found by querying pg_constraint rather than by guessing
-- names: a `drop constraint if exists` on a wrong name would silently leave the
-- FK pointing at the retired table and still enforcing it.

do $$
declare
  t record;
  fk record;
  residents_exists boolean;
begin
  select exists (select 1 from information_schema.tables
                 where table_schema='public' and table_name='residents')
    into residents_exists;

  for t in
    select * from (values
      ('presence_events',    'cascade'),
      ('occupancy_events',   'cascade'),
      ('room_change_events', 'cascade'),
      ('inspections',        'none')
    ) as v(tbl, on_del)
  loop
    -- Drop every FK from this table to the old residents table, whatever it
    -- happens to be named.
    if residents_exists then
      for fk in
        select conname from pg_constraint
        where contype = 'f'
          and conrelid = ('public.' || t.tbl)::regclass
          and confrelid = 'public.residents'::regclass
      loop
        execute format('alter table public.%I drop constraint %I', t.tbl, fk.conname);
      end loop;
    end if;

    -- Rename the column unless a previous run already did.
    if exists (select 1 from information_schema.columns
               where table_schema='public' and table_name=t.tbl
                 and column_name='resident_id') then
      execute format('alter table public.%I rename column resident_id to occupancy_id', t.tbl);
    end if;

    -- Add the new FK once.
    if not exists (
      select 1 from pg_constraint
      where conname = t.tbl || '_occupancy_id_fkey'
        and conrelid = ('public.' || t.tbl)::regclass
    ) then
      if t.on_del = 'cascade' then
        execute format(
          'alter table public.%I add constraint %I foreign key (occupancy_id) '
          || 'references public.occupancies (id) on delete cascade',
          t.tbl, t.tbl || '_occupancy_id_fkey');
      else
        execute format(
          'alter table public.%I add constraint %I foreign key (occupancy_id) '
          || 'references public.occupancies (id)',
          t.tbl, t.tbl || '_occupancy_id_fkey');
      end if;
    end if;
  end loop;
end $$;

-- Rename the three event indexes to match the column, and add the one that was
-- always missing: both record_occupancy gates filter inspections by this column.
alter index if exists public.presence_events_resident_time_idx
  rename to presence_events_occupancy_time_idx;
alter index if exists public.occupancy_events_resident_time_idx
  rename to occupancy_events_occupancy_time_idx;
alter index if exists public.room_change_events_resident_time_idx
  rename to room_change_events_occupancy_time_idx;
create index if not exists inspections_occupancy_idx
  on public.inspections (occupancy_id);

-- ---------------------------------------------------------------------------
-- 6. Integrity assertions — abort the transaction rather than orphan anything
-- ---------------------------------------------------------------------------
-- This is what makes "lose or orphan nothing" enforceable rather than hopeful.

do $$
declare
  src_rows int;
  src_people int;
  n_people int;
  n_occ int;
  orphans int;
  t text;
begin
  if not exists (select 1 from information_schema.tables
                 where table_schema='public' and table_name='residents') then
    raise notice 'source table already retired — skipping count assertions';
  else
    select count(*), count(distinct student_id) into src_rows, src_people
      from public.residents;
    select count(*) into n_people from public.people;
    select count(*) into n_occ from public.occupancies;

    if n_people <> src_people then
      raise exception 'people count is %, expected % (distinct student_id in residents)',
        n_people, src_people;
    end if;
    if n_occ <> src_rows then
      raise exception 'occupancies count is %, expected % (rows in residents)',
        n_occ, src_rows;
    end if;
  end if;

  -- No child row may point at a missing occupancy. inspections.occupancy_id is
  -- nullable (legacy periodic rows), so nulls are excluded rather than failed.
  foreach t in array
    array['presence_events','occupancy_events','room_change_events','inspections']
  loop
    execute format(
      'select count(*) from public.%I c where c.occupancy_id is not null '
      || 'and not exists (select 1 from public.occupancies o where o.id = c.occupancy_id)',
      t) into orphans;
    if orphans > 0 then
      raise exception 'ORPHANS: % row(s) in % reference a missing occupancy', orphans, t;
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 7. current_residents — the everyday-screen view
-- ---------------------------------------------------------------------------
-- security_invoker is MANDATORY: without it the view runs as its owner and
-- bypasses the caller's RLS entirely.
--
-- `id` is the OCCUPANCY id — the same value the app has always passed to the
-- RPCs — so existing call sites keep their contract. Keeping the current-term
-- and not-archived filters here puts them in ONE place instead of being
-- retyped across every screen query, where forgetting one silently leaks an
-- archived stay onto an everyday screen.

create or replace view public.current_residents
with (security_invoker = true) as
select
  o.id,
  o.person_id,
  p.full_name,
  p.student_id,
  p.phone,
  p.emergency_contact,
  o.room_id,
  o.term,
  o.occupancy_status,
  o.is_present
from public.occupancies o
join public.people p on p.id = o.person_id
where o.is_archived = false
  and o.term = (select s.current_term from public.app_settings s where s.id);

comment on view public.current_residents is
  'Current-term, non-archived occupancies joined to their person. `id` is the '
  'occupancy id. security_invoker: the caller''s RLS still applies.';

revoke all on public.current_residents from anon;
grant select on public.current_residents to authenticated;
grant select on public.current_residents to service_role;

-- ---------------------------------------------------------------------------
-- 8. Policies that reached the roster through inspections
-- ---------------------------------------------------------------------------
-- Same rule, new column name: a signature or waiver may only attach to an
-- inspection that names a stay.

drop policy if exists "staff insert inspection signatures"
  on public.inspection_signatures;
create policy "staff insert inspection signatures" on public.inspection_signatures
  for insert to authenticated
  with check (
    public.is_staff()
    and captured_by = (select auth.uid())
    and exists (
      select 1 from public.inspections i
      where i.id = inspection_id
        and i.type in ('move_in', 'move_out')
        and i.occupancy_id is not null
    )
  );

drop policy if exists "staff insert signature waivers"
  on public.inspection_signature_waivers;
create policy "staff insert signature waivers" on public.inspection_signature_waivers
  for insert to authenticated
  with check (
    public.is_staff()
    and waived_by = (select auth.uid())
    and exists (
      select 1 from public.inspections i
      where i.id = inspection_id
        and i.type = 'move_out'
        and i.occupancy_id is not null
    )
  );

-- ---------------------------------------------------------------------------
-- 9. The five RPCs — drop + create, not create or replace
-- ---------------------------------------------------------------------------
-- Postgres cannot rename an input parameter via `create or replace`, and
-- target_resident -> target_occupancy is exactly that.
--
-- DROPPING A FUNCTION DISCARDS ITS ACL, so every one is re-granted at the end
-- of this section. Forgetting that yields "permission denied" at runtime.

drop function if exists public.set_presence(uuid, boolean, text);
drop function if exists public.set_presence_bulk(uuid, boolean);
drop function if exists public.record_occupancy(uuid, public.occupancy_event_type, text);
drop function if exists public.reassign_room(uuid, uuid, text);
drop function if exists public.create_inspection(uuid, uuid, public.inspection_type, text, jsonb);

-- 9a. set_presence — flip one stay's presence, log the change
create function public.set_presence(
  target_occupancy uuid,
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

  -- Presence is meaningful only for an active, checked-in stay.
  update public.occupancies
    set is_present = make_present
    where id = target_occupancy
      and occupancy_status = 'checked_in'
      and is_archived = false;

  get diagnostics updated_count = row_count;
  if updated_count = 0 then
    raise exception 'occupancy % is not an active checked-in stay', target_occupancy
      using errcode = 'check_violation';
  end if;

  insert into public.presence_events (occupancy_id, status, recorded_by, note)
  values (
    target_occupancy,
    (case when make_present then 'returned' else 'away' end)::public.presence_status,
    (select auth.uid()),
    event_note
  );
end;
$$;

-- 9b. set_presence_bulk — a whole hallway at once
-- Writes an event only where the value actually changed, so "mark all present"
-- when everyone is already present logs nothing.
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
    update public.occupancies o
      set is_present = make_present
      from public.rooms rm
      where o.room_id = rm.id
        and rm.hallway_id = target_hallway
        and o.occupancy_status = 'checked_in'
        -- A hallway sweep must never reach last year's or an archived stay.
        and o.is_archived = false
        and o.term = (select s.current_term from public.app_settings s where s.id)
        and o.is_present is distinct from make_present
      returning o.id
  ),
  logged as (
    insert into public.presence_events (occupancy_id, status, recorded_by)
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

-- 9c. record_occupancy — the signature-gated check-in / check-out
-- Gate logic is unchanged; it now filters inspections by occupancy_id and locks
-- the occupancy row.
create function public.record_occupancy(
  target_occupancy uuid,
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
    from public.occupancies where id = target_occupancy
    for update;

  if current_status is null then
    raise exception 'occupancy % not found', target_occupancy
      using errcode = 'no_data_found';
  end if;

  if event_type = 'check_in' then
    if current_status <> 'expected' then
      raise exception 'occupancy % cannot check in from status %',
        target_occupancy, current_status
        using errcode = 'check_violation';
    end if;
    if not exists (
      select 1
      from public.inspections i
      where i.occupancy_id = target_occupancy
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
    update public.occupancies
      set occupancy_status = 'checked_in', is_present = true
      where id = target_occupancy;
  else -- check_out
    if current_status <> 'checked_in' then
      raise exception 'occupancy % cannot check out from status %',
        target_occupancy, current_status
        using errcode = 'check_violation';
    end if;
    if not exists (
      select 1
      from public.inspections i
      where i.occupancy_id = target_occupancy
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
    update public.occupancies
      set occupancy_status = 'checked_out', is_present = false
      where id = target_occupancy;
  end if;

  insert into public.occupancy_events (occupancy_id, type, recorded_by, note)
  values (target_occupancy, event_type, (select auth.uid()), event_note);
end;
$$;

-- 9d. reassign_room — RD-only room move within a stay
-- occupancies.room_id stays MUTABLE, with room_change_events as the history —
-- exactly as before. Closing one occupancy and opening another per room move
-- would fragment a single term's stay and break move-in/move-out pairing.
create function public.reassign_room(
  target_occupancy uuid,
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
    from public.occupancies where id = target_occupancy
    for update;

  if from_room is null then
    raise exception 'occupancy % not found', target_occupancy
      using errcode = 'no_data_found';
  end if;

  if from_room = to_room then
    raise exception 'this stay is already in that room'
      using errcode = 'check_violation';
  end if;

  update public.occupancies set room_id = to_room where id = target_occupancy;

  insert into public.room_change_events
    (occupancy_id, from_room_id, to_room_id, changed_by, reason)
  values
    (target_occupancy, from_room, to_room, (select auth.uid()), reason);
end;
$$;

-- 9e. create_inspection — a snapshot bound to one stay (photos included)
create function public.create_inspection(
  target_room uuid,
  target_occupancy uuid,
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

  insert into public.inspections (room_id, occupancy_id, type, inspected_by, notes)
  values (target_room, target_occupancy, inspection_type,
          (select auth.uid()), inspection_notes)
  returning id into new_inspection_id;

  -- Items and their photos in one pass, so the whole snapshot (rows AND photo
  -- links) commits or nothing does.
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

-- Re-grant every function: the drops above discarded their ACLs.
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
-- 10. Retire the old table — renamed and locked down, NOT dropped
-- ---------------------------------------------------------------------------
-- Kept so this migration is reversible and the pre-split state stays
-- inspectable. The app roles lose access; service_role keeps SELECT for
-- rollback and verification.

do $$ begin
  if exists (select 1 from information_schema.tables
             where table_schema='public' and table_name='residents') then
    alter table public.residents rename to residents_pre_split;
  end if;
end $$;

comment on table public.residents_pre_split is
  'Pre-split snapshot of the old residents table (migration '
  '20260729221553_person_occupancy_split). Retained for reversibility; not '
  'read by the app. occupancies.id equals the id here for every migrated row.';

revoke all on public.residents_pre_split from anon;
revoke all on public.residents_pre_split from authenticated;
grant select on public.residents_pre_split to service_role;
