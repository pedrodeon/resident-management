-- Removes the probe rows written while verifying the staff-removal fix
-- (migration 20260806040634 and its desk_shifts follow-up): two incident
-- reports, two maintenance requests, and the notifications they raised, all
-- tagged PROBE-B1. incident_reports, maintenance_requests and notifications
-- are append-only by design — no delete policy exists for any role,
-- service_role included — so an owner-level migration is the only way to
-- clear them, same as 20260730173932 and 20260806035158 before it.

delete from public.notifications
 where target_id in (
   select id from public.incident_reports where description like 'PROBE-B1%'
   union all
   select id from public.maintenance_requests where description like 'PROBE-B1%'
 );

delete from public.incident_reports where description like 'PROBE-B1%';
delete from public.maintenance_requests where description like 'PROBE-B1%';

-- The probes' desk shifts are already gone: removing their accounts cascaded
-- the rows away, which is exactly the behaviour the follow-up migration set up.
