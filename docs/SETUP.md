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

## 5. Seed fake data

1. **Building + residents** (8 hallways, 24 rooms, 20 fake residents):

   ```sh
   npx supabase db push --include-seed
   ```

   Applies `supabase/seed.sql`. All fake data — real resident records must
   never enter dev. (You can also paste the file into the dashboard SQL editor.)

2. **Staff accounts (RD + 2 RAs):**

   ```sh
   npm run seed:staff
   ```

   Creates `rd@tudor.test`, `ra1@tudor.test`, `ra2@tudor.test` with the dev
   password printed at the end (override via `SEED_STAFF_PASSWORD`).

## 6. Smoke test

`npm run dev` → http://localhost:3000 → sign in as `rd@tudor.test`. You should
land on the TUDOR HALL dashboard showing all 8 hallways with counts. Sign in as
`ra1@tudor.test` to see the RA view (no Admin link).

## 7. Run the tests

```bash
npm test
```

Checks over the RLS policies, the RPCs, and the auth-redirect rules. Run these
after any change to a policy, grant, `SECURITY DEFINER` function, or the
login/access guards — they are the only thing that will catch a silently
widened permission or a reintroduced redirect loop.

They run against the linked project and mutate seeded rows (restoring them
afterwards), so they refuse to start unless the fake seed is present.

## Notes for later

- **Adding a table?** With "automatically expose new tables" off, a new table
  gets no grants at all. Every migration that adds one must `grant` explicitly
  to `authenticated` (and `service_role` where a script needs it) — an RLS
  policy alone will not grant access.
- **Staff invites** currently set a temporary password shown once in the admin
  UI, because dev has no SMTP. Configure an SMTP provider in Supabase and
  switch `inviteStaff` to `inviteUserByEmail` before real use.
- **Before any real deployment:** delete the `*@tudor.test` dev accounts and the
  fake resident rows.
