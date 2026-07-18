-- Fix for 20260718000925: with `search_path = ''` the CASE result stays plain
-- text and won't implicitly coerce to presence_status ("column status is of
-- type presence_status but expression is of type text"). Cast explicitly.
-- (The original migration file carries the same cast so a fresh apply is
-- already correct; this brings an already-migrated database up to match.)

create or replace function public.set_presence(
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

create or replace function public.set_presence_bulk(
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
