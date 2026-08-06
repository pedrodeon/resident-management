-- Incident reports and maintenance requests stop being e-mail and become
-- records in the app, with the RD notified through the existing bell.
--
-- The old design sent incident reports by e-mail and stored NOTHING, so a
-- failed send lost a report about a real student. Now every report is a row.
-- That makes access control the whole ballgame: incident narratives name
-- students, so only the RD may read them — enforced by RLS, not by hiding
-- screens.
--
-- Maintenance becomes RD-only too (decision from the RD): any staff files,
-- only the RD reads the queue and closes it.

-- ---------------------------------------------------------------------------
-- incident_reports
-- ---------------------------------------------------------------------------

create table public.incident_reports (
  id uuid primary key default gen_random_uuid(),
  occurred_on date not null,
  occurred_at time not null,
  description text not null,
  people_involved text,
  actions_taken text,
  -- Where it happened, when that's meaningful. Never a resident reference:
  -- anyone involved is named in the free-text fields, like the paper form.
  room_id uuid references public.rooms (id),
  created_by uuid not null references public.users (id),
  created_at timestamptz not null default now(),
  check (btrim(description) <> '')
);

comment on table public.incident_reports is
  'Staff-filed incident reports. Student conduct data: RD-only SELECT, '
  'append-only (no update/delete for any role, service_role included).';

create index incident_reports_created_idx
  on public.incident_reports (created_at desc);

alter table public.incident_reports enable row level security;

-- Only the RD reads them. An RA cannot see these through the UI, a direct
-- URL, or the API — this policy is the boundary.
create policy "rd reads incident reports" on public.incident_reports
  for select to authenticated using (public.is_rd());

-- Any staff member files one, as themselves.
create policy "staff file incident reports" on public.incident_reports
  for insert to authenticated
  with check (public.is_staff() and created_by = (select auth.uid()));

-- No update/delete policy on purpose: a filed report is a permanent record.

-- Auto-expose is off (20260717032303): grant explicitly. No delete grant for
-- anyone, service_role included — same posture as the other audit tables.
grant select, insert on public.incident_reports to authenticated;
grant select, insert on public.incident_reports to service_role;

-- ---------------------------------------------------------------------------
-- maintenance_requests: reading and closing become RD-only
-- ---------------------------------------------------------------------------
-- Filing stays open to every staff member; the queue itself is now the RD's.

drop policy "staff read maintenance requests" on public.maintenance_requests;
create policy "rd reads maintenance requests" on public.maintenance_requests
  for select to authenticated using (public.is_rd());

drop policy "staff update maintenance status" on public.maintenance_requests;
create policy "rd updates maintenance status" on public.maintenance_requests
  for update to authenticated
  using (public.is_rd())
  with check (public.is_rd());

-- ---------------------------------------------------------------------------
-- notifications: no longer only about desk shifts
-- ---------------------------------------------------------------------------
-- Shift events keep their date/slot; report events carry a target_id instead,
-- and are addressed to the RD alone so incident traffic never reaches an RA's
-- bell (the header badge counts through the caller's own client, so RLS
-- filters it automatically).

alter table public.notifications
  alter column shift_date drop not null,
  alter column slot drop not null,
  add column target_id uuid,
  add column audience text not null default 'all'
    check (audience in ('all', 'rd'));

alter table public.notifications
  drop constraint notifications_type_check;
alter table public.notifications
  add constraint notifications_type_check check (type in (
    'claimed', 'released', 'coverage_requested', 'coverage_withdrawn',
    'coverage_accepted', 'assigned',
    'incident_filed', 'maintenance_filed'
  ));

-- Shape follows the kind: a shift event needs its slot, a report event needs
-- the row it points at.
alter table public.notifications
  add constraint notifications_shape check (
    (type in ('incident_filed', 'maintenance_filed')
       and target_id is not null and shift_date is null and slot is null)
    or
    (type not in ('incident_filed', 'maintenance_filed')
       and shift_date is not null and slot is not null)
  );

drop policy "staff read notifications" on public.notifications;
create policy "staff read notifications" on public.notifications
  for select to authenticated
  using (public.is_staff() and (audience = 'all' or public.is_rd()));

-- ---------------------------------------------------------------------------
-- file_incident_report — the row and its notification, one transaction
-- ---------------------------------------------------------------------------

create function public.file_incident_report(
  occurred_on date,
  occurred_at time,
  description text,
  people_involved text default null,
  actions_taken text default null,
  room_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  new_id uuid;
begin
  if not public.is_staff() then
    raise exception 'only staff may file incident reports'
      using errcode = 'insufficient_privilege';
  end if;
  if btrim(coalesce(description, '')) = '' then
    raise exception 'describe what happened' using errcode = 'check_violation';
  end if;

  insert into public.incident_reports (
    occurred_on, occurred_at, description, people_involved, actions_taken,
    room_id, created_by
  ) values (
    occurred_on, occurred_at, description,
    nullif(btrim(coalesce(people_involved, '')), ''),
    nullif(btrim(coalesce(actions_taken, '')), ''),
    room_id, caller
  )
  returning id into new_id;

  -- A notification exists iff the report does.
  insert into public.notifications (type, actor, target_id, audience)
  values ('incident_filed', caller, new_id, 'rd');

  return new_id;
end;
$$;

revoke execute on function public.file_incident_report(date, time, text, text, text, uuid)
  from anon;

-- ---------------------------------------------------------------------------
-- file_maintenance_request — same pairing
-- ---------------------------------------------------------------------------

create function public.file_maintenance_request(
  location text,
  description text,
  urgency text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  new_id uuid;
begin
  if not public.is_staff() then
    raise exception 'only staff may file maintenance requests'
      using errcode = 'insufficient_privilege';
  end if;
  if btrim(coalesce(location, '')) = '' then
    raise exception 'say where the problem is' using errcode = 'check_violation';
  end if;
  if btrim(coalesce(description, '')) = '' then
    raise exception 'describe what is broken' using errcode = 'check_violation';
  end if;
  if urgency not in ('low', 'normal', 'high') then
    raise exception 'pick an urgency' using errcode = 'check_violation';
  end if;

  insert into public.maintenance_requests (location, description, urgency, created_by)
  values (btrim(location), btrim(description), urgency, caller)
  returning id into new_id;

  insert into public.notifications (type, actor, target_id, audience)
  values ('maintenance_filed', caller, new_id, 'rd');

  return new_id;
end;
$$;

revoke execute on function public.file_maintenance_request(text, text, text) from anon;
