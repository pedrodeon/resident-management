-- Removing a staff member must not be blocked by the work they did.
--
-- Every table that records "who did this" pointed at users(id) with no delete
-- rule, so an RA who had filed one incident, claimed one shift, or done one
-- room check could never be removed — the FK refused and Admin → Staff failed
-- with a raw database error. An RA leaving mid-semester is normal, so this is
-- the wrong tradeoff.
--
-- Fix: ON DELETE SET NULL everywhere the attribution is a detail of a record
-- that must survive. The incident, the shift, the inspection all remain; only
-- the link to the removed person is dropped, and the screens render such rows
-- as "Former staff". NOT NULL comes off the columns that need it.
--
-- The one exception is notification_seen: it holds a single per-user
-- read-watermark and is meaningless without its user, so it CASCADEs.
-- hallway_assignments already cascaded (coverage without a person is noise).

-- ---------------------------------------------------------------------------
-- Already-nullable columns: just swap the FK rule.
-- ---------------------------------------------------------------------------

alter table public.occupancy_events
  drop constraint occupancy_events_recorded_by_fkey,
  add constraint occupancy_events_recorded_by_fkey
    foreign key (recorded_by) references public.users (id) on delete set null;

alter table public.presence_events
  drop constraint presence_events_recorded_by_fkey,
  add constraint presence_events_recorded_by_fkey
    foreign key (recorded_by) references public.users (id) on delete set null;

alter table public.room_change_events
  drop constraint room_change_events_changed_by_fkey,
  add constraint room_change_events_changed_by_fkey
    foreign key (changed_by) references public.users (id) on delete set null;

alter table public.inspections
  drop constraint inspections_inspected_by_fkey,
  add constraint inspections_inspected_by_fkey
    foreign key (inspected_by) references public.users (id) on delete set null;

alter table public.desk_shifts
  drop constraint desk_shifts_claimed_by_fkey,
  add constraint desk_shifts_claimed_by_fkey
    foreign key (claimed_by) references public.users (id) on delete set null;

alter table public.notifications
  drop constraint notifications_other_user_fkey,
  add constraint notifications_other_user_fkey
    foreign key (other_user) references public.users (id) on delete set null;

alter table public.maintenance_requests
  drop constraint maintenance_requests_done_by_fkey,
  add constraint maintenance_requests_done_by_fkey
    foreign key (done_by) references public.users (id) on delete set null;

-- ---------------------------------------------------------------------------
-- NOT NULL columns: drop the constraint, then swap the FK rule.
-- ---------------------------------------------------------------------------

alter table public.room_checks
  alter column checked_by drop not null,
  drop constraint room_checks_checked_by_fkey,
  add constraint room_checks_checked_by_fkey
    foreign key (checked_by) references public.users (id) on delete set null;

alter table public.inspection_signatures
  alter column captured_by drop not null,
  drop constraint inspection_signatures_captured_by_fkey,
  add constraint inspection_signatures_captured_by_fkey
    foreign key (captured_by) references public.users (id) on delete set null;

alter table public.inspection_signature_waivers
  alter column waived_by drop not null,
  drop constraint inspection_signature_waivers_waived_by_fkey,
  add constraint inspection_signature_waivers_waived_by_fkey
    foreign key (waived_by) references public.users (id) on delete set null;

alter table public.incident_reports
  alter column created_by drop not null,
  drop constraint incident_reports_created_by_fkey,
  add constraint incident_reports_created_by_fkey
    foreign key (created_by) references public.users (id) on delete set null;

alter table public.notifications
  alter column actor drop not null,
  drop constraint notifications_actor_fkey,
  add constraint notifications_actor_fkey
    foreign key (actor) references public.users (id) on delete set null;

alter table public.maintenance_requests
  alter column created_by drop not null,
  drop constraint maintenance_requests_created_by_fkey,
  add constraint maintenance_requests_created_by_fkey
    foreign key (created_by) references public.users (id) on delete set null;

-- The done_by/status pairing check would fire the moment done_by went null on
-- a closed request, blocking the delete all over again. Keep what the check is
-- really for — a closed request has a closing timestamp — and let the person
-- fall away with the rest.
alter table public.maintenance_requests
  drop constraint maintenance_requests_check;
alter table public.maintenance_requests
  add constraint maintenance_requests_check check (
    (status = 'done' and done_at is not null)
    or (status = 'open' and done_by is null and done_at is null)
  );

-- ---------------------------------------------------------------------------
-- The watermark belongs to its user; it goes with them.
-- ---------------------------------------------------------------------------

alter table public.notification_seen
  drop constraint notification_seen_user_id_fkey,
  add constraint notification_seen_user_id_fkey
    foreign key (user_id) references public.users (id) on delete cascade;

-- ---------------------------------------------------------------------------
-- The RLS policies that pin a row to its author are INSERT-time checks
-- (created_by = auth.uid()), so a later SET NULL cannot be used to forge one:
-- there is no UPDATE policy on any of these tables to begin with.
-- ---------------------------------------------------------------------------
