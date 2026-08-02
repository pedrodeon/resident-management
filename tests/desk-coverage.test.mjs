// Coverage requests + notifications: the opt-out rule (inside 24 h the only
// way off a shift is a coverage request, and you stay assigned until someone
// accepts), the first-come-first-served accept race, and the broadcast
// notification rows the RPCs write in the same transaction.

import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import {
  adminClient,
  anonClient,
  staffClient,
  assertSeededDevDatabase,
  RA_EMAIL,
  RA2_EMAIL,
  RD_EMAIL,
} from "./helpers.mjs";

let admin, anon, ra, raId, ra2, ra2Id, rd;

const farDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  .toISOString()
  .slice(0, 10);
const todayDate = new Date().toISOString().slice(0, 10);

async function shiftRow(date, slot) {
  const { data } = await admin
    .from("desk_shifts")
    .select("claimed_by, coverage_requested_at")
    .eq("shift_date", date)
    .eq("slot", slot)
    .maybeSingle();
  return data;
}

before(async () => {
  await assertSeededDevDatabase();
  admin = adminClient();
  anon = anonClient();
  ({ client: ra, userId: raId } = await staffClient(RA_EMAIL));
  ({ client: ra2, userId: ra2Id } = await staffClient(RA2_EMAIL));
  ({ client: rd } = await staffClient(RD_EMAIL));
});

after(async () => {
  for (const [date, slot] of [[farDate, 1], [farDate, 2], [todayDate, 1], [todayDate, 2]]) {
    await rd.rpc("set_desk_shift", {
      target_date: date,
      target_slot: slot,
      target_user: null,
    });
  }
});

describe("requesting coverage", () => {
  test("an owner flags their own shift (>24 h out)", async () => {
    await ra.rpc("claim_desk_shift", { target_date: farDate, target_slot: 1, claiming: true });
    const { error } = await ra.rpc("request_shift_coverage", {
      target_date: farDate,
      target_slot: 1,
      requesting: true,
    });
    assert.equal(error, null, error?.message);
    const row = await shiftRow(farDate, 1);
    assert.equal(row.claimed_by, raId, "owner must STAY assigned");
    assert.ok(row.coverage_requested_at, "flag must be set");
  });

  test("requesting coverage on someone else's shift is refused", async () => {
    const { error } = await ra2.rpc("request_shift_coverage", {
      target_date: farDate,
      target_slot: 1,
      requesting: true,
    });
    assert.ok(error, "flagged a shift the caller does not hold");
  });

  test("inside 24 h: release is still refused, coverage request works", async () => {
    // The RD plants today's slot-2 shift on RA1 (only the RD can, inside 24 h).
    await rd.rpc("set_desk_shift", { target_date: todayDate, target_slot: 2, target_user: raId });

    const release = await ra.rpc("claim_desk_shift", {
      target_date: todayDate,
      target_slot: 2,
      claiming: false,
    });
    assert.ok(release.error, "released a shift inside the 24 h lock");

    const request = await ra.rpc("request_shift_coverage", {
      target_date: todayDate,
      target_slot: 2,
      requesting: true,
    });
    // Today's slot 2 (8 PM) may already have started late at night; both
    // outcomes respect the rule, but before 8 PM this must succeed.
    if (new Date().getHours() < 20) {
      assert.equal(request.error, null, request.error?.message);
      const row = await shiftRow(todayDate, 2);
      assert.equal(row.claimed_by, raId, "owner stays assigned until accepted");
      assert.ok(row.coverage_requested_at);
    }
  });

  test("withdrawing your own request works and keeps you assigned", async () => {
    const { error } = await ra.rpc("request_shift_coverage", {
      target_date: farDate,
      target_slot: 1,
      requesting: false,
    });
    assert.equal(error, null, error?.message);
    const row = await shiftRow(farDate, 1);
    assert.equal(row.claimed_by, raId);
    assert.equal(row.coverage_requested_at, null);
    // Re-flag for the accept tests below.
    await ra.rpc("request_shift_coverage", { target_date: farDate, target_slot: 1, requesting: true });
  });
});

describe("accepting coverage", () => {
  test("accepting your own request is refused", async () => {
    const { error } = await ra.rpc("accept_shift_coverage", {
      target_date: farDate,
      target_slot: 1,
    });
    assert.ok(error, "the owner accepted their own request");
  });

  test("the race: two simultaneous accepts — exactly one wins", async () => {
    const [a, b] = await Promise.all([
      ra2.rpc("accept_shift_coverage", { target_date: farDate, target_slot: 1 }),
      rd.rpc("accept_shift_coverage", { target_date: farDate, target_slot: 1 }),
    ]);
    const failures = [a, b].filter((r) => r.error);
    assert.equal(failures.length, 1, "exactly one of two racing accepts must lose");
    assert.match(failures[0].error.message, /already covered/);

    const row = await shiftRow(farDate, 1);
    assert.ok(row.claimed_by, "the shift must end up assigned to exactly one person");
    assert.equal(row.coverage_requested_at, null, "the request must be closed");
  });

  test("accepting when there is no open request is refused", async () => {
    const { error } = await ra2.rpc("accept_shift_coverage", {
      target_date: farDate,
      target_slot: 1,
    });
    assert.ok(error, "accepted a shift with no open request");
    assert.match(error.message, /already covered/);
  });
});

describe("closing requests by other paths", () => {
  test("releasing (outside 24 h) clears an open coverage request", async () => {
    await ra.rpc("claim_desk_shift", { target_date: farDate, target_slot: 2, claiming: true });
    await ra.rpc("request_shift_coverage", { target_date: farDate, target_slot: 2, requesting: true });
    const { error } = await ra.rpc("claim_desk_shift", {
      target_date: farDate,
      target_slot: 2,
      claiming: false,
    });
    assert.equal(error, null, error?.message);
    const row = await shiftRow(farDate, 2);
    assert.equal(row.claimed_by, null);
    assert.equal(row.coverage_requested_at, null);
  });

  test("an RD assignment closes an open request (force-fill)", async () => {
    await ra.rpc("claim_desk_shift", { target_date: farDate, target_slot: 2, claiming: true });
    await ra.rpc("request_shift_coverage", { target_date: farDate, target_slot: 2, requesting: true });
    const { error } = await rd.rpc("set_desk_shift", {
      target_date: farDate,
      target_slot: 2,
      target_user: ra2Id,
    });
    assert.equal(error, null, error?.message);
    const row = await shiftRow(farDate, 2);
    assert.equal(row.claimed_by, ra2Id);
    assert.equal(row.coverage_requested_at, null);
  });
});

describe("notifications", () => {
  test("every mutation above left a broadcast row staff can read", async () => {
    const { data, error } = await ra2
      .from("notifications")
      .select("type")
      .order("created_at", { ascending: false })
      .limit(30);
    assert.equal(error, null, error?.message);
    const types = new Set(data.map((n) => n.type));
    for (const expected of [
      "claimed",
      "released",
      "coverage_requested",
      "coverage_withdrawn",
      "coverage_accepted",
      "assigned",
    ]) {
      assert.ok(types.has(expected), `no '${expected}' notification was written`);
    }
  });

  test("nobody inserts notifications directly — not even staff", async () => {
    const { error } = await rd.from("notifications").insert({
      type: "claimed",
      shift_date: farDate,
      slot: 1,
      actor: raId,
    });
    assert.ok(error, "a direct notification insert was accepted");
  });

  test("anon sees no notifications", async () => {
    const { data, error } = await anon.from("notifications").select("id").limit(1);
    assert.ok(error !== null || (data?.length ?? 0) === 0, "anon read the feed");
  });

  test("the seen-watermark is per-user and self-service only", async () => {
    const mine = await ra.from("notification_seen").upsert({
      user_id: raId,
      seen_at: new Date().toISOString(),
    });
    assert.equal(mine.error, null, mine.error?.message);

    const forged = await ra.from("notification_seen").upsert({
      user_id: ra2Id,
      seen_at: new Date().toISOString(),
    });
    assert.ok(forged.error, "moved someone else's watermark");
  });
});
