# Tudor Hall — Supabase setup

One-time setup to stand up the database. Steps 1–3 happen in the Supabase
dashboard and only you can do them; the rest runs from this repo.

## 1. Create the org + project (dashboard)

1. Create a **new, dedicated Supabase organization** for this project — do NOT
   reuse an existing org (garagehero etc.). On Free/Pro, every org member sees
   every project in the org; an isolated org keeps this FERPA-sensitive data
   walled off.
2. Create the project inside that org. Pick a strong database password and a
   nearby region.

## 2. Security settings (dashboard → Project Settings)

- Data API: **on**
- "Automatically expose new tables": **off** (the migration grants access
  explicitly)
- Automatic RLS on new tables: **on**

## 3. Keys → `.env.local`

Copy from Project Settings → API into `.env.local` (see `.env.local.example`):

- Project URL → `NEXT_PUBLIC_SUPABASE_URL`
- `anon` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (server-only; never expose)

`.env.local` is gitignored. Never commit real keys.

## 4. Apply the schema

```sh
npx supabase login                      # opens browser, one-time
npx supabase link --project-ref <ref>   # <ref> from the project URL
npx supabase db push                    # applies supabase/migrations/
```

The migrations also seed the 12-item inspection template — that's real
reference data the app depends on, not dev-only fixtures.

## 5. Seed the building structure

1. **Hallways + rooms** (the real building: 8 hallways, 84 rooms, capacity 2):

   ```sh
   npx supabase db push --include-seed
   ```

   Applies `supabase/seed.sql`. The seed carries only real building
   structure — residents are added through the app (RD → Admin) and real
   resident records still require Residence Life / IT sign-off first.
   Caveat: the CLI only *executes* a seed file it hasn't recorded before;
   on an already-seeded database, edits to `seed.sql` must be applied by
   pasting it into the dashboard SQL editor (it's idempotent).

2. **Staff accounts (RD + 2 RAs):**

   ```sh
   npm run seed:staff
   ```

   Creates `rd@tudor.test`, `ra1@tudor.test`, `ra2@tudor.test` with the dev
   password printed at the end (override via `SEED_STAFF_PASSWORD`).

## 6. Smoke test

`npm run dev` → http://localhost:3000 → sign in as `rd@tudor.test`. You should
land on the TUDOR HALL dashboard showing all 8 hallways (counts are zero until
residents are added). Sign in as `ra1@tudor.test` to see the RA view (no Admin
link).

## 7. Run the tests

```bash
npm test
```

Checks over the RLS policies, the RPCs, and the auth-redirect rules. Run these
after any change to a policy, grant, `SECURITY DEFINER` function, or the
login/access guards — they are the only thing that will catch a silently
widened permission or a reintroduced redirect loop.

They mutate fixture rows, so they refuse to start unless the fake fixture roster
is present — a guard against ever pointing them at real resident records. **The
main project deliberately has no fixtures** (they were retired in migration
`20260728215914`), so against it the suite aborts by design.

### Running them against a fixture project

1. Create a **second** Supabase project (same dedicated org, same settings as
   step 2). It holds only invented data.
2. Apply the schema and the building structure to it:

   ```sh
   npx supabase link --project-ref <fixture-ref>
   npx supabase db push --include-seed
   npm run seed:staff
   ```

3. Load the fake roster — 24 invented people with one active stay each:

   ```bash
   psql "<fixture connection string>" -f supabase/seed-fixtures.sql
   ```

   (Or paste the file into that project's SQL editor.) It's idempotent and ends
   with a check block that fails loudly if the invariants the suite asserts —
   exactly 3 checked-in stays in Holiday 1, ≥20 stays, no presence events for
   `S1000104` — aren't met.

4. Point `.env.local` at the fixture project's URL and keys, then `npm test`.
   **Relink to the main project afterwards** (`npx supabase link --project-ref
   <main-ref>`), or a later `db push` will land in the wrong place.

A fixture project drifts as the suite runs (events are append-only, so they
accumulate). If the counts stop matching, delete the project and redo this —
that's cheaper than unpicking it.

## Email (RA weekly report)

The RA weekly report sends through [Resend](https://resend.com) from server
actions — the API key never reaches the browser. Add to `.env.local`:

```
RESEND_API_KEY=...                      # server-only
EMAIL_FROM="Tudor Hall <reports@...>"   # a sender on your verified domain
RD_EMAIL=rd@your-university.edu         # both report types go to the RD
```

These serve the **RA weekly report only** (Admin → Reports and the Saturday
cron). Incident reports and maintenance requests no longer send e-mail at all:
they are stored in the app and the RD is notified through the in-app bell, so
they work with no e-mail configuration whatsoever.

## App icon (home screen)

The home-screen name is "Tudor Hall" (manifest `short_name` +
`apple-mobile-web-app-title`); the icons in `public/icons/` are generated
from `public/icon-source.png` — the circular crest centered on a solid
brand-navy (#16264a) square, since iOS tiles allow no transparency:

- `apple-touch-icon.png` (180×180, iOS home screen)
- `icon-192.png`, `icon-512.png` (manifest)
- `icon-512-maskable.png` (crest at 72% for Android's mask safe zone)

To swap in a purpose-built square icon later, either overwrite those four
files with the same names/sizes, or replace `public/icon-source.png` and
rerun `python3 scripts/make-icons.py` (needs Pillow). No code changes
needed; devices refresh the icon when the app is re-added to the home
screen.

## Seeding the real RA accounts

`npm run seed:ras` creates the real staff accounts from
`scripts/ra-roster.json` (copy `ra-roster.example.json`; the real file is
gitignored — staff names/emails stay off the repo). All new accounts share
one temporary password from `RA_TEMP_PASSWORD` in `.env.local` (min 10
chars, never hardcoded) and are created as the auth-user + users-row PAIR
with `must_change_password = TRUE`: on first login the app allows nothing
but /change-password until they set their own. Safe to re-run — existing
accounts are never reset or re-flagged; a missing users row is repaired.
The script prints a per-account summary so you can confirm all 6 RAs.

## RA weekly report (scheduled send — needs deployment)

Admin → Reports shows the per-RA weekly report (room checks + desk shifts)
on demand and can email it to RD_EMAIL immediately. The **automatic** send —
every Saturday 9:00 PM America/Chicago, first one 2026-08-22 — only fires on
an always-on host. To activate it, deploy to Vercel:

1. Deploy the repo (`vercel.json` ships the two cron schedules — 02:00 and
   03:00 UTC Sunday; the endpoint itself picks whichever is 9 PM Chicago, so
   DST is handled. Hobby plan allows exactly 2 cron jobs — this uses both).
2. Set the same env vars as `.env.local` in the Vercel project, **plus
   `CRON_SECRET`** (any long random string, e.g. `openssl rand -hex 32`).
   Vercel sends it as the Bearer token on cron requests;
   `/api/cron/weekly-report` rejects everything else with 401.
3. Nothing else — the endpoint refuses to send before 2026-08-22 even if
   deployed early.

## Notes for later

- **The current term** lives in the single-row `app_settings` table, seeded
  `Fall 2026`. Everyday screens show only that term's non-archived occupancies
  (via the `current_residents` view), so rolling over a semester is an RD form
  field — Admin → Residents → Current term — not a deploy or a delete.
- **Rolling back the person/occupancy split:** `supabase/rollback/` holds a
  reviewed down script. It is not part of the migration sequence and running it
  also means deleting that version's row from
  `supabase_migrations.schema_migrations`. The pre-split table survives as
  `residents_pre_split` (service-role read only).
- **Adding a table?** With "automatically expose new tables" off, a new table
  gets no grants at all. Every migration that adds one must `grant` explicitly
  to `authenticated` (and `service_role` where a script needs it) — an RLS
  policy alone will not grant access.
- **Storage:** the private `inspection-photos` bucket and its policies are
  created by the migrations. Staff can upload and view but never overwrite or
  delete (photos are as immutable as the snapshot they belong to); only the
  service-role key can remove objects. Abandoned uploads (form closed before
  saving) may orphan under the bucket — harmless; clear them from the
  dashboard if they ever add up.
- **Staff invites** currently set a temporary password shown once in the admin
  UI, because dev has no SMTP. Configure an SMTP provider in Supabase and
  switch `inviteStaff` to `inviteUserByEmail` before real use.
- **Before any real deployment:** delete the `*@tudor.test` dev accounts
  (the fake resident rows are already gone — retired in migration
  `20260728215914`).
