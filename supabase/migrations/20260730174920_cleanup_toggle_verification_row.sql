-- One-off cleanup: remove the row created by the toggle-bug verification
-- (2026-07-30, "Toggle verification — delete me") — the end-to-end proof that
-- the submitted urgency is the selected pill (it landed as 'high'). Same
-- owner-level path as 20260730173932; the app's no-delete posture is unchanged.

delete from public.maintenance_requests
where id = 'feab6f4f-00cb-4a5b-9032-c40bfdc22f45';
