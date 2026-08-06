-- Clear the rows created while verifying the new incident/maintenance flow.
-- Every row in these three tables at this point is a PROBE-ROW from that
-- verification: incident_reports was created empty in the previous migration,
-- and maintenance_requests plus notifications were emptied when the seed data
-- was cleared for the real roster (20260805161303).
--
-- Owner-level again because these tables are append-only by design — no
-- delete grant exists for any role, service_role included.
--
-- On a fresh database this is a no-op.

delete from public.notifications;
delete from public.incident_reports;
delete from public.maintenance_requests;
