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

## 5. Seed fake data

1. **Building + residents:** open the dashboard SQL editor, paste the contents
   of `supabase/seed.sql`, run it. (All fake data — real resident records must
   never enter dev.)
2. **Staff accounts (RD + 2 RAs):**

   ```sh
   npm run seed:staff
   ```

   Creates `rd@tudor.test`, `ra1@tudor.test`, `ra2@tudor.test` with the dev
   password printed at the end (override via `SEED_STAFF_PASSWORD`).

## 6. Smoke test

`npm run dev` → http://localhost:3000 → sign in as `rd@tudor.test`. You should
land in the TUDOR HALL shell signed in as the RD.
