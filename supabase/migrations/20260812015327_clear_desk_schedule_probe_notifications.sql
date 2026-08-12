-- Two notifications left over from verifying the new desk schedule: a
-- throwaway RD account assigned and then cleared a Saturday shift, to check
-- that a shift on an unstaffed night still renders and can still be cleared.
-- The account is gone, so both rows now have a null actor and point at a
-- shift that no longer exists.
--
-- notifications is append-only — no delete policy for any role, service_role
-- included — so an owner-level migration is the only way to clear them.

delete from public.notifications
 where actor is null
   and type = 'assigned'
   and shift_date = date '2026-08-15';
