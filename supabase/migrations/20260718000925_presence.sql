-- Step 4: the live present/away toggle and its audit log.
--
-- RAs cannot UPDATE residents directly (roster writes are RD-only, step 2),
-- so presence flows exclusively through the SECURITY DEFINER RPCs below.
-- Each flip updates residents.is_present AND writes a presence_events row in
-- one call, so the live flag and the audit trail can never diverge.

-- ---------------------------------------------------------------------------
-- presence_events (append-only break-toggle history)
-- ---------------------------------------------------------------------------

create type public.presence_status as enum ('away', 'returned');

create table public.presence_events (
  id uuid primary key default gen_random_uuid(),
  resident_id uuid not null references public.residents (id) on delete cascade,
  status public.presence_status not null,
  timestamp timestamptz not null default now(),
  recorded_by uuid references public.users (id),
  note text
);

comment on table public.presence_events is
  'Append-only log of presence-toggle flips. Written only via set_presence().';

create index presence_events_resident_time_idx
  on public.presence_events (resident_id, timestamp desc);

alter table public.presence_events enable row level security;

-- Staff can read the history (step 7: "who stayed over Thanksgiving?").
-- There is deliberately NO insert/update/delete policy: the table is
-- append-only and written solely through the SECURITY DEFINER RPCs, which
-- bypass RLS as the function owner. This keeps the audited path the only path.
create policy "staff can read presence events" on public.presence_events
  for select to authenticated using (public.is_staff());

-- auto-expose is off, so grant service_role explicitly (see 20260717032303).
grant select, insert on public.presence_events to service_role;

-- ---------------------------------------------------------------------------
-- set_presence — flip one resident, log the change
-- ---------------------------------------------------------------------------

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

  -- Presence is meaningful only while checked in.
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

-- ---------------------------------------------------------------------------
-- set_presence_bulk — flip every checked-in resident in a hallway
-- ---------------------------------------------------------------------------
-- Hallway-scoped so the client sends one call, not 150 ids. Logs an event
-- only for residents whose value actually changed, so "mark all present" when
-- most are already present doesn't flood the audit trail.

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

revoke execute on function public.set_presence(uuid, boolean, text) from anon;
revoke execute on function public.set_presence_bulk(uuid, boolean) from anon;
grant execute on function public.set_presence(uuid, boolean, text) to authenticated;
grant execute on function public.set_presence_bulk(uuid, boolean) to authenticated;
