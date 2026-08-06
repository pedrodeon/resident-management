-- Tail of the probe cleanup: the "claimed a shift" notifications the probe
-- accounts raised. They carry no target_id (shift events identify their
-- subject by shift_date/slot), so the target_id-keyed delete in
-- 20260806042034 left them behind. Their actor is already null and the shifts
-- themselves cascaded away with the accounts, so these rows now point at
-- nothing. Owner-level, like every other delete against this append-only table.

delete from public.notifications
 where actor is null
   and shift_date in (date '2026-08-16', date '2026-08-20');
