-- Remove the rows left by the pre-deploy audit: the desk-shift notifications
-- and the empty shift row created while verifying the Front Desk RPCs still
-- worked after the notifications table changed shape. The real incident
-- report and its notification (filed from an @lcuniversity.edu account) are
-- deliberately kept.
--
-- Owner-level because notifications and desk_shifts have no delete grant for
-- any role — the same append-only posture as the other audit tables. Without
-- this the temporary audit staff accounts cannot be removed: users.id is
-- referenced by notifications.actor.
--
-- No-op on a fresh database.

delete from public.notifications
where actor in (
  select id from public.users where email like '%@tudor.test'
);

delete from public.desk_shifts where claimed_by is null;
