// Guards the /login <-> / redirect loop. The loop happened when an
// authenticated user had no row in public.users: the app guard treated that
// like "not signed in" and sent them to /login, which sent authenticated users
// back to / — forever. The two states must resolve differently.

import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import { accessDecision } from "../src/lib/access.ts";
import {
  adminClient,
  anonClient,
  assertSeededDevDatabase,
  STAFF_PASSWORD,
} from "./helpers.mjs";

describe("accessDecision (the redirect rule)", () => {
  test("not authenticated -> /login", () => {
    assert.equal(
      accessDecision({ authenticated: false, hasStaffRecord: false }),
      "redirect-login",
    );
  });

  test("authenticated with a staff record -> allow", () => {
    assert.equal(
      accessDecision({ authenticated: true, hasStaffRecord: true }),
      "allow",
    );
  });

  test("authenticated but NO staff record -> /no-access, never /login", () => {
    // This is the loop case. It must not resolve to "redirect-login".
    const decision = accessDecision({
      authenticated: true,
      hasStaffRecord: false,
    });
    assert.equal(decision, "redirect-no-access");
    assert.notEqual(decision, "redirect-login", "would re-enter the loop");
  });
});

describe("authenticated session with no users row (the loop trigger)", () => {
  const email = "loop-probe@tudor.test";
  let admin, createdUserId;

  before(async () => {
    await assertSeededDevDatabase();
    admin = adminClient();
    // An auth user with NO matching public.users row — a staff account that
    // was removed, or an auth user created before their row exists.
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: STAFF_PASSWORD,
      email_confirm: true,
    });
    if (error) throw new Error(`setup failed: ${error.message}`);
    createdUserId = data.user.id;
  });

  after(async () => {
    if (createdUserId) await admin.auth.admin.deleteUser(createdUserId);
  });

  test("the state is real: valid session, no staff row", async () => {
    // They can authenticate...
    const client = anonClient();
    const { data: signIn, error: signInErr } = await client.auth.signInWithPassword({
      email,
      password: STAFF_PASSWORD,
    });
    assert.equal(signInErr, null, "no-staff user could not authenticate");
    assert.ok(signIn.user, "no session established");

    // ...but they have no staff record.
    const { data: staffRow } = await admin
      .from("users")
      .select("id")
      .eq("id", createdUserId)
      .maybeSingle();
    assert.equal(staffRow, null, "unexpected staff row for the probe user");

    await client.auth.signOut();
  });

  test("that exact state routes to /no-access, breaking the loop", async () => {
    const { data: staffRow } = await admin
      .from("users")
      .select("id")
      .eq("id", createdUserId)
      .maybeSingle();

    // Feed the real observed state through the same rule the app uses.
    const decision = accessDecision({
      authenticated: true,
      hasStaffRecord: staffRow !== null,
    });
    assert.equal(decision, "redirect-no-access");
  });
});
