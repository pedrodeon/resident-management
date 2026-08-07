-- Probe rows from verifying the reports screen: one room check and the
-- shift-claim notifications left behind by the throwaway staff accounts that
-- generated the week's counts. Their authors are already gone (removing the
-- accounts nulled the room check's author and cascaded the shift away), so
-- these rows now point at nobody.
--
-- room_checks and notifications are append-only — no delete policy for any
-- role, service_role included — so an owner-level migration is the only way
-- to clear them, same as the cleanups before it.

delete from public.room_checks where notes = 'PROBE-REPORT';

delete from public.notifications
 where actor is null
   and shift_date in (date '2026-08-09', date '2026-08-16', date '2026-08-20');
