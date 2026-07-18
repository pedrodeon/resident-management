-- Fix: with "automatically expose new tables" off, the `authenticated` role
-- got no table privileges on tables added after step 2. Their RLS SELECT
-- policies were therefore dead — a policy can't grant access the role lacks at
-- the table level. The inspections migration (20260718005000) carries these
-- same grants so a fresh apply is correct; this brings an already-migrated
-- database up to match, and closes the identical gap on the event tables so
-- step 7's history views can read them.

grant select, insert, update, delete on public.inventory_items to authenticated;
grant select on public.inspections to authenticated;
grant select on public.inspection_items to authenticated;

-- Event tables (added in steps 4 and 5): staff need SELECT for history views.
-- Writes still flow only through the SECURITY DEFINER RPCs.
grant select on public.presence_events to authenticated;
grant select on public.occupancy_events to authenticated;
