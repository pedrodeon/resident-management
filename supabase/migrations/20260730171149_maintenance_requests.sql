-- Maintenance requests: anything broken anywhere in the building, flagged by
-- any staff member. The email to facilities is the notification; this table is
-- the working list — what's still open, and who closed what when.
--
-- Unlike the audit tables (events, inspections), status here is MEANT to be
-- mutable: open -> done (and back, for premature closes) is the whole point.
-- What nobody can do is DELETE: closed requests stay as history, and there is
-- deliberately no delete policy for any role.
--
-- No resident data lives here — location is free text, never a person.

create table public.maintenance_requests (
  id uuid primary key default gen_random_uuid(),
  location text not null,
  description text not null,
  urgency text not null default 'normal'
    check (urgency in ('low', 'normal', 'high')),
  status text not null default 'open'
    check (status in ('open', 'done')),
  created_by uuid not null references public.users (id),
  created_at timestamptz not null default now(),
  done_by uuid references public.users (id),
  done_at timestamptz,
  -- The pair moves together: done has both, open has neither.
  check (
    (status = 'done' and done_by is not null and done_at is not null)
    or (status = 'open' and done_by is null and done_at is null)
  ),
  check (btrim(location) <> ''),
  check (btrim(description) <> '')
);

comment on table public.maintenance_requests is
  'Staff-filed maintenance requests. Email is the notification; this is the '
  'open/done working list. No delete policy for any role — history stays.';

create index maintenance_requests_status_idx
  on public.maintenance_requests (status, created_at desc);

alter table public.maintenance_requests enable row level security;

-- Any staff member files and reads; created_by is pinned to the caller so a
-- request can't be filed in someone else's name.
create policy "staff read maintenance requests" on public.maintenance_requests
  for select to authenticated using (public.is_staff());

create policy "staff file maintenance requests" on public.maintenance_requests
  for insert to authenticated
  with check (public.is_staff() and created_by = (select auth.uid()));

-- Any staff member can close or reopen (whoever fixes it marks it). The check
-- constraint above keeps done_by/done_at consistent with the status.
create policy "staff update maintenance status" on public.maintenance_requests
  for update to authenticated
  using (public.is_staff())
  with check (public.is_staff());

-- Auto-expose is off (20260717032303): grant explicitly. No delete grant even
-- for service_role — same posture as the audit tables.
grant select, insert, update on public.maintenance_requests to authenticated;
grant select, insert, update on public.maintenance_requests to service_role;
