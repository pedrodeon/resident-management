-- One-off cleanup: empty every table that holds SEED / TEST data, so the
-- real Fall 2026 roster imports into a clean database. Approved by the RD
-- (written approval from Residence Life on file) before the switch to real
-- resident records.
--
-- This has to be a migration rather than an app-side delete: the audit
-- tables (events, inspections, signatures, room_checks, maintenance,
-- notifications) deliberately have NO delete policy or grant for any role,
-- service_role included. The owner-level migration is the only way through,
-- which is exactly the intended escape hatch.
--
-- DELIBERATELY UNTOUCHED — the building and its staff:
--   hallways, rooms, users, hallway_assignments, inventory_items,
--   app_settings
--
-- Order below follows the foreign keys: children first, parents last.
-- Unconditional deletes are correct here because every row in these tables
-- is seed/test data; on a fresh database they are already empty, so this is
-- a no-op when replayed elsewhere.

-- Inspections and everything hanging off them --------------------------------
delete from public.inspection_photos;
delete from public.inspection_signature_waivers;
delete from public.inspection_signatures;
delete from public.inspection_items;
delete from public.inspections;

-- Occupancy history, then the stays, then the people --------------------------
delete from public.occupancy_events;
delete from public.presence_events;
delete from public.room_change_events;
delete from public.occupancies;
delete from public.people;

-- Weekly room condition checks ------------------------------------------------
delete from public.room_checks;

-- Staff-filed maintenance requests (both rows were probes) ---------------------
delete from public.maintenance_requests;

-- Front-desk schedule: test claims plus the released/orphan rows --------------
delete from public.notifications;
delete from public.notification_seen;
delete from public.desk_shifts;

-- The pre-split legacy table keeps its shape (the documented rollback path in
-- supabase/rollback/ still needs it) but loses its fake rows.
delete from public.residents_pre_split;
