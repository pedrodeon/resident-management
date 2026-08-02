-- Forced first-login password change. Accounts seeded with a shared
-- temporary password (scripts/seed-ra-accounts.mjs) get this flag; the app
-- shell redirects flagged users to /change-password and nothing else until
-- they set their own password.
--
-- The flag is cleared by the change-password server action using the
-- service role after a successful password update — deliberately NOT via an
-- RLS self-update policy, so a user can't clear it without actually
-- changing the password.

alter table public.users
  add column must_change_password boolean not null default false;
