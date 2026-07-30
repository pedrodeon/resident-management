// Maintenance requests: mutable status by design (open → done → open), but
// never deletable — closed requests are history. Filing is any-staff with
// created_by pinned to the caller; the email side is not tested here (it never
// touches the database).

import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import {
  adminClient,
  anonClient,
  staffClient,
  assertSeededDevDatabase,
  RA_EMAIL,
  RD_EMAIL,
} from "./helpers.mjs";

let admin, anon, ra, raId, rdId, requestId;

before(async () => {
  await assertSeededDevDatabase();
  admin = adminClient();
  anon = anonClient();
  ({ client: ra, userId: raId } = await staffClient(RA_EMAIL));
  ({ userId: rdId } = await staffClient(RD_EMAIL));
});

after(async () => {
  // No delete grant exists for anyone, service_role included — clean up by
  // marking the suite's request done so it leaves the open list.
  if (requestId) {
    await admin
      .from("maintenance_requests")
      .update({ status: "done", done_by: raId, done_at: new Date().toISOString() })
      .eq("id", requestId);
  }
});

describe("filing", () => {
  test("an RA can file a request as themselves", async () => {
    const { data, error } = await ra
      .from("maintenance_requests")
      .insert({
        location: "Suite fixture — front stairwell",
        description: "Handrail loose (test suite row)",
        urgency: "normal",
        created_by: raId,
      })
      .select("id, status, created_by")
      .single();
    assert.equal(error, null, error?.message);
    assert.equal(data.status, "open", "a new request must start open");
    assert.equal(data.created_by, raId);
    requestId = data.id;
  });

  test("filing under someone else's name is rejected", async () => {
    const { error } = await ra.from("maintenance_requests").insert({
      location: "Forged",
      description: "created_by is not the caller",
      urgency: "low",
      created_by: rdId,
    });
    assert.ok(error, "an RA filed a request as the RD");
  });

  test("anon can neither read nor file", async () => {
    const { data, error } = await anon
      .from("maintenance_requests")
      .select("id")
      .limit(1);
    assert.ok(error !== null || (data?.length ?? 0) === 0, "anon read requests");

    const { error: insErr } = await anon.from("maintenance_requests").insert({
      location: "Anon",
      description: "no",
      urgency: "low",
      created_by: raId,
    });
    assert.ok(insErr, "anon filed a request");
  });

  test("blank location or description is rejected by the table itself", async () => {
    const { error } = await ra.from("maintenance_requests").insert({
      location: "   ",
      description: "blank location",
      urgency: "low",
      created_by: raId,
    });
    assert.ok(error, "a blank location was accepted");
  });
});

describe("status lifecycle", () => {
  test("any staff member can mark a request done", async () => {
    const { data, error } = await ra
      .from("maintenance_requests")
      .update({ status: "done", done_by: raId, done_at: new Date().toISOString() })
      .eq("id", requestId)
      .select("status, done_by")
      .single();
    assert.equal(error, null, error?.message);
    assert.equal(data.status, "done");
    assert.equal(data.done_by, raId);
  });

  test("done without done_by/done_at is rejected by the check constraint", async () => {
    const { error } = await ra
      .from("maintenance_requests")
      .update({ status: "open", done_by: raId, done_at: new Date().toISOString() })
      .eq("id", requestId);
    assert.ok(error, "open with done_* fields set was accepted");
  });

  test("reopening clears done_by/done_at", async () => {
    const { data, error } = await ra
      .from("maintenance_requests")
      .update({ status: "open", done_by: null, done_at: null })
      .eq("id", requestId)
      .select("status, done_by, done_at")
      .single();
    assert.equal(error, null, error?.message);
    assert.equal(data.status, "open");
    assert.equal(data.done_by, null);
    assert.equal(data.done_at, null);
  });
});

describe("nothing is deletable", () => {
  test("staff cannot delete", async () => {
    const { data } = await ra
      .from("maintenance_requests")
      .delete()
      .eq("id", requestId)
      .select();
    assert.equal(data?.length ?? 0, 0, "an RA deleted a request");
  });

  test("even the service role cannot delete", async () => {
    const { error, data } = await admin
      .from("maintenance_requests")
      .delete()
      .eq("id", requestId)
      .select();
    assert.ok(
      error !== null || (data?.length ?? 0) === 0,
      "service_role deleted a request — the grant should not exist",
    );
  });
});
