// The presence toggle (step 4). The invariant that matters: is_present and its
// presence_events row are written together by set_presence, so the live flag
// and the audit trail can never disagree — and an RA can do it despite having
// no direct UPDATE on residents.

import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import {
  adminClient,
  staffClient,
  assertSeededDevDatabase,
  residentByStudentId,
  hallwayByName,
  eventCount,
  restoreResident,
  RA_EMAIL,
} from "./helpers.mjs";

// Seed state for Holiday 1: everyone present except Sample Suzuki (away).
const TESTY = "S1000101"; // checked_in, present
const PETIT = "S1000104"; // expected — presence does not apply
const SUZUKI = "S1000103"; // checked_in, away

let ra, raId, admin, testy, holiday1;

before(async () => {
  await assertSeededDevDatabase();
  admin = adminClient();
  ({ client: ra, userId: raId } = await staffClient(RA_EMAIL));
  testy = await residentByStudentId(TESTY);
  holiday1 = await hallwayByName("Holiday 1");
});

after(async () => {
  // Put Holiday 1 back to seed presence. The events themselves are
  // append-only by design and remain.
  await restoreResident(TESTY, { is_present: true });
  await restoreResident("S1000102", { is_present: true });
  await restoreResident(SUZUKI, { is_present: false });
});

describe("set_presence", () => {
  test("an RA can flip presence even though they cannot UPDATE residents", async () => {
    const before = await eventCount("presence_events", testy.id);

    const { error } = await ra.rpc("set_presence", {
      target_resident: testy.id,
      make_present: false,
    });
    assert.equal(error, null, error?.message);

    const { data: after } = await admin
      .from("residents")
      .select("is_present")
      .eq("id", testy.id)
      .single();
    assert.equal(after.is_present, false, "flag did not flip");

    const delta = (await eventCount("presence_events", testy.id)) - before;
    assert.equal(delta, 1, `wrote ${delta} events, expected exactly 1`);
  });

  test("the event records status and who did it", async () => {
    const { data: event } = await admin
      .from("presence_events")
      .select("status, recorded_by")
      .eq("resident_id", testy.id)
      .order("timestamp", { ascending: false })
      .limit(1)
      .single();

    assert.equal(event.status, "away");
    assert.equal(event.recorded_by, raId, "event not attributed to the acting RA");
  });

  test("flipping back writes a 'returned' event", async () => {
    const { error } = await ra.rpc("set_presence", {
      target_resident: testy.id,
      make_present: true,
    });
    assert.equal(error, null, error?.message);

    const { data: event } = await admin
      .from("presence_events")
      .select("status")
      .eq("resident_id", testy.id)
      .order("timestamp", { ascending: false })
      .limit(1)
      .single();
    assert.equal(event.status, "returned");
  });

  test("presence only applies to checked-in residents", async () => {
    const petit = await residentByStudentId(PETIT);
    const { error } = await ra.rpc("set_presence", {
      target_resident: petit.id,
      make_present: false,
    });
    assert.ok(error, "set_presence succeeded on an `expected` resident");
  });

  test("the audit trail cannot be written directly", async () => {
    // Writes must go through the RPC so the flag and the log stay in step.
    const { error } = await ra
      .from("presence_events")
      .insert({ resident_id: testy.id, status: "away" });
    assert.ok(error, "direct insert into presence_events succeeded");
  });

  test("the audit trail cannot be edited or deleted", async () => {
    const { data: updated } = await ra
      .from("presence_events")
      .update({ status: "returned" })
      .eq("resident_id", testy.id)
      .select();
    assert.equal(updated?.length ?? 0, 0, "an event was edited");

    const { data: deleted } = await ra
      .from("presence_events")
      .delete()
      .eq("resident_id", testy.id)
      .select();
    assert.equal(deleted?.length ?? 0, 0, "an event was deleted");
  });
});

describe("set_presence_bulk", () => {
  test("marks a whole hallway away and reports the count changed", async () => {
    // Seed: 3 checked-in in Holiday 1, one already away → 2 should change.
    const { data: changed, error } = await ra.rpc("set_presence_bulk", {
      target_hallway: holiday1.id,
      make_present: false,
    });
    assert.equal(error, null, error?.message);
    assert.equal(changed, 2, `expected 2 changed, got ${changed}`);
  });

  test("re-running is a no-op and logs nothing", async () => {
    // Everyone is already away, so nothing should change — otherwise "mark all
    // away" after a break would flood the audit trail with non-events.
    const { data: changed, error } = await ra.rpc("set_presence_bulk", {
      target_hallway: holiday1.id,
      make_present: false,
    });
    assert.equal(error, null, error?.message);
    assert.equal(changed, 0, `re-run changed ${changed} rows`);
  });

  test("marks the hallway present again", async () => {
    const { data: changed, error } = await ra.rpc("set_presence_bulk", {
      target_hallway: holiday1.id,
      make_present: true,
    });
    assert.equal(error, null, error?.message);
    assert.equal(changed, 3, `expected 3 changed, got ${changed}`);
  });

  test("leaves residents who are not checked in alone", async () => {
    const petit = await residentByStudentId(PETIT);
    assert.equal(petit.occupancy_status, "expected");
    // Bulk ran twice above; an `expected` resident must never be touched.
    const count = await eventCount("presence_events", petit.id);
    assert.equal(count, 0, "bulk wrote presence events for an expected resident");
  });
});
