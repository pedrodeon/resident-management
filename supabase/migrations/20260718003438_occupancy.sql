-- Step 5: the semester move-in / move-out flow.
--
-- Occupancy is the one write ANY staff (RA or RD) may record. RAs can't UPDATE
-- residents directly under RLS, so check-in/out flows through the SECURITY
-- DEFINER RPC below, which appends the occupancy_event AND updates the
-- residents cache (occupancy_status + is_present) atomically. Same posture as
-- set_presence (step 4): the append-only log is the source of truth, the
-- residents columns are a cache that can never drift from it.

-- ---------------------------------------------------------------------------
-- occupancy_events (append-only move-in / move-out log)
-- ---------------------------------------------------------------------------

create type public.occupancy_event_type as enum ('check_in', 'check_out');

create table public.occupancy_events (
  id uuid primary key default gen_random_uuid(),
  resident_id uuid not null references public.residents (id) on delete cascade,
  type public.occupancy_event_type not null,
  timestamp timestamptz not null default now(),
  recorded_by uuid references public.users (id),
  note text
);

comment on table public.occupancy_events is
  'Append-only move-in/out log. Source of truth for occupancy_status. '
  'Written only via record_occupancy().';

create index occupancy_events_resident_time_idx
  on public.occupancy_events (resident_id, timestamp desc);

alter table public.occupancy_events enable row level security;

-- Staff read the history; no write policy — append-only, written solely
-- through the SECURITY DEFINER RPC (which bypasses RLS as its owner).
create policy "staff can read occupancy events" on public.occupancy_events
  for select to authenticated using (public.is_staff());

-- auto-expose is off (see 20260717032303); grant service_role select+insert.
-- No delete: keep the audit trail append-only even for the backend key.
grant select, insert on public.occupancy_events to service_role;

-- ---------------------------------------------------------------------------
-- record_occupancy — append an event, advance the resident's status
-- ---------------------------------------------------------------------------
-- One-way lifecycle (CLAUDE.md: check in ONCE, check out ONCE):
--   expected --check_in--> checked_in --check_out--> checked_out

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
    update public.residents
      set occupancy_status = 'checked_in', is_present = true
      where id = target_resident;
  else -- check_out
    if current_status <> 'checked_in' then
      raise exception 'resident % cannot check out from status %', target_resident, current_status
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

revoke execute on function
  public.record_occupancy(uuid, public.occupancy_event_type, text) from anon;
grant execute on function
  public.record_occupancy(uuid, public.occupancy_event_type, text) to authenticated;
