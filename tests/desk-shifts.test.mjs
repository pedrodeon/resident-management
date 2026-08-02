// Front-desk shifts: all writes go through the two RPCs. What's under test is
// the 24-hour lock (self-service claims/releases refused inside 24 h of the
// shift start), ownership (release only your own), the double-claim guard,
// and the RD-only override that ignores the lock.

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

let admin, anon, ra, raId, rd;

// A date far enough out that its shifts are always >24 h away.
const farDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  .toISOString()
  .slice(0, 10);
// Today's slot-1 shift (6 PM) is always inside the 24 h lock window.
const todayDate = new Date().toISOString().slice(0, 10);

before(async () => {
  await assertSeededDevDatabase();
  admin = adminClient();
  anon = anonClient();
  ({ client: ra, userId: raId } = await staffClient(RA_EMAIL));
  ({ client: rd } = await staffClient(RD_EMAIL));
});

after(async () => {
  // Clear anything the suite claimed. set_desk_shift(null) is the RD's
  // override, so it works regardless of timing.
  for (const [date, slot] of [[farDate, 1], [farDate, 2], [todayDate, 1]]) {
    await rd.rpc("set_desk_shift", {
      target_date: date,
      target_slot: slot,
      target_user: null,
    });
  }
});

describe("claiming", () => {
  test("an RA claims an open shift more than 24 h out", async () => {
    const { error } = await ra.rpc("claim_desk_shift", {
      target_date: farDate,
      target_slot: 1,
      claiming: true,
    });
    assert.equal(error, null, error?.message);

    const { data } = await admin
      .from("desk_shifts")
      .select("claimed_by, claimed_at")
      .eq("shift_date", farDate)
      .eq("slot", 1)
      .single();
    assert.equal(data.claimed_by, raId);
    assert.ok(data.claimed_at, "claimed_at must be set with claimed_by");
  });

  test("claiming a shift someone else holds is refused", async () => {
    const { error } = await rd.rpc("claim_desk_shift", {
      target_date: farDate,
      target_slot: 1,
      claiming: true,
    });
    assert.ok(error, "a second claim of a held shift succeeded");
    assert.match(error.message, /already claimed/);
  });

  test("claiming inside 24 h is refused — even though the slot is open", async () => {
    const { error } = await ra.rpc("claim_desk_shift", {
      target_date: todayDate,
      target_slot: 1,
      claiming: true,
    });
    assert.ok(error, "a claim inside the 24 h window succeeded");
    assert.match(error.message, /lock 24 hours/);
  });

  test("anon cannot claim", async () => {
    const { error } = await anon.rpc("claim_desk_shift", {
      target_date: farDate,
      target_slot: 2,
      claiming: true,
    });
    assert.ok(error, "anon claimed a shift");
  });
});

describe("releasing", () => {
  test("releasing someone else's shift is refused", async () => {
    const { error } = await rd.rpc("claim_desk_shift", {
      target_date: farDate,
      target_slot: 1,
      claiming: false,
    });
    assert.ok(error, "released a shift belonging to someone else");
    assert.match(error.message, /only release a shift you claimed/);
  });

  test("the owner releases their own shift (>24 h out)", async () => {
    const { error } = await ra.rpc("claim_desk_shift", {
      target_date: farDate,
      target_slot: 1,
      claiming: false,
    });
    assert.equal(error, null, error?.message);

    const { data } = await admin
      .from("desk_shifts")
      .select("claimed_by, claimed_at")
      .eq("shift_date", farDate)
      .eq("slot", 1)
      .single();
    assert.equal(data.claimed_by, null);
    assert.equal(data.claimed_at, null);
  });
});

describe("RD override", () => {
  test("an RA cannot call set_desk_shift", async () => {
    const { error } = await ra.rpc("set_desk_shift", {
      target_date: farDate,
      target_slot: 2,
      target_user: raId,
    });
    assert.ok(error, "an RA used the RD override");
    assert.match(error.message, /only the RD/);
  });

  test("the RD assigns inside 24 h — the lock does not apply", async () => {
    const { error } = await rd.rpc("set_desk_shift", {
      target_date: todayDate,
      target_slot: 1,
      target_user: raId,
    });
    assert.equal(error, null, error?.message);

    const { data } = await admin
      .from("desk_shifts")
      .select("claimed_by")
      .eq("shift_date", todayDate)
      .eq("slot", 1)
      .single();
    assert.equal(data.claimed_by, raId);
  });

  test("the RD clears a shift back to open", async () => {
    const { error } = await rd.rpc("set_desk_shift", {
      target_date: todayDate,
      target_slot: 1,
      target_user: null,
    });
    assert.equal(error, null, error?.message);

    const { data } = await admin
      .from("desk_shifts")
      .select("claimed_by")
      .eq("shift_date", todayDate)
      .eq("slot", 1)
      .single();
    assert.equal(data.claimed_by, null);
  });
});

describe("no direct writes", () => {
  test("staff cannot insert into desk_shifts directly", async () => {
    const { error } = await ra.from("desk_shifts").insert({
      shift_date: farDate,
      slot: 2,
      claimed_by: raId,
      claimed_at: new Date().toISOString(),
    });
    assert.ok(error, "a direct insert bypassed the RPCs");
  });
});
