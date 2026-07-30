-- One-off cleanup, user-confirmed 2026-07-30: remove the two probe rows the
-- feature verification left in maintenance_requests. The table deliberately
-- grants DELETE to no role (closed requests are history), so removal has to
-- happen here, as the table owner — that posture is unchanged for the app.
--
-- Deleted BY ID, nothing pattern-based:
--   19dcf402-7d41-4780-af2f-a3f68716184a  "Probe — stairwell"
--   66b2c23b-36f8-4877-9db8-a94bca89f661  "Probe — Lebanon 2 bathroom sink"

delete from public.maintenance_requests
where id in (
  '19dcf402-7d41-4780-af2f-a3f68716184a',
  '66b2c23b-36f8-4877-9db8-a94bca89f661'
);
