// Shared setup for the access-control suite.
//
// These tests run against the LIVE linked Supabase project using the seeded
// fake data. They mutate rows and restore them afterwards. A guard below
// refuses to run unless the known fake seed is present, so the suite can never
// be pointed at a database holding real resident records.

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const STAFF_PASSWORD =
  process.env.SEED_STAFF_PASSWORD ?? "tudor-dev-only-2026";

if (!url || !anonKey || !serviceKey || url.includes("your-project-ref")) {
  throw new Error(
    "Missing Supabase env. Run via `npm test` so .env.local is loaded, and see docs/SETUP.md.",
  );
}

/** Service-role client: bypasses RLS. Used only for fixtures and restoring state. */
export function adminClient() {
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Anonymous client — what an unauthenticated caller gets. */
export function anonClient() {
  return createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Signed-in staff client. Runs under that user's RLS policies. */
export async function staffClient(email) {
  const client = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password: STAFF_PASSWORD,
  });
  if (error) {
    throw new Error(
      `Could not sign in as ${email}: ${error.message}. Run \`npm run seed:staff\`.`,
    );
  }
  return { client, userId: data.user.id };
}

export const RA_EMAIL = "ra1@tudor.test";
export const RD_EMAIL = "rd@tudor.test";

/**
 * Refuse to run against anything but the fake seed. "Testy McTestface" is
 * unmistakably fixture data; if it's absent, this may be a database with real
 * student records and these destructive tests must not touch it.
 */
export async function assertSeededDevDatabase() {
  const admin = adminClient();
  const { data, error } = await admin
    .from("residents")
    .select("full_name")
    .eq("student_id", "S1000101")
    .maybeSingle();

  if (error) {
    throw new Error(`Could not reach the database: ${error.message}`);
  }
  if (!data || data.full_name !== "Testy McTestface") {
    throw new Error(
      "Seed fixture not found. These tests mutate data and must only run " +
        "against a seeded dev database — never one holding real resident " +
        "records. See docs/SETUP.md.",
    );
  }
}

/** Look up a seeded resident by student ID. */
export async function residentByStudentId(studentId) {
  const admin = adminClient();
  const { data, error } = await admin
    .from("residents")
    .select("id, full_name, room_id, occupancy_status, is_present")
    .eq("student_id", studentId)
    .single();
  if (error) throw new Error(`Fixture ${studentId} missing: ${error.message}`);
  return data;
}

/** Look up a seeded hallway by name. */
export async function hallwayByName(name) {
  const admin = adminClient();
  const { data, error } = await admin
    .from("hallways")
    .select("id, name")
    .eq("name", name)
    .single();
  if (error) throw new Error(`Hallway "${name}" missing: ${error.message}`);
  return data;
}

/** Restore a resident's mutable state (service role bypasses the RD-only RLS). */
export async function restoreResident(studentId, fields) {
  const admin = adminClient();
  const { error } = await admin
    .from("residents")
    .update(fields)
    .eq("student_id", studentId);
  if (error) throw new Error(`Restore failed for ${studentId}: ${error.message}`);
}

/** Count rows in an append-only event table for one resident. */
export async function eventCount(table, residentId) {
  const admin = adminClient();
  const { count, error } = await admin
    .from(table)
    .select("*", { count: "exact", head: true })
    .eq("resident_id", residentId);
  if (error) throw new Error(`Count failed on ${table}: ${error.message}`);
  return count ?? 0;
}
