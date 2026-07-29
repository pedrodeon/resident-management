// Move-in / move-out (step 5). Occupancy is the one roster write ANY staff may
// record, and it must follow a one-way lifecycle: a resident checks in once and
// out once. residents.occupancy_status is only a cache of the event log.
//
// Since the two-signature step landed, check_in additionally requires a
// move-in inspection signed by BOTH the resident and the RA — covered below
// and in move-in-signatures.test.mjs.

import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import {
  adminClient,
  staffClient,
  assertSeededDevDatabase,
  residentByStudentId,
  eventCount,
  restoreResident,
  RA_EMAIL,
} from "./helpers.mjs";

const PETIT = "S1000104"; // seeded `expected`
const TESTY = "S1000101"; // seeded `checked_in`

let ra, raId, admin, petit;

before(async () => {
  await assertSeededDevDatabase();
  admin = adminClient();
  ({ client: ra, userId: raId } = await staffClient(RA_EMAIL));
  petit = await residentByStudentId(PETIT);
});

after(async () => {
  await restoreResident(PETIT, { occupancy_status: "expected", is_present: true });
});

// Check-in is gated on a fully-signed move-in inspection; build one for a
// resident so the lifecycle tests can proceed past the gate.
async function createSignedMoveIn(client, userId, residentId, roomId) {
  const { data: item } = await adminClient()
    .from("inventory_items")
    .select("id")
    .order("sort_order")
    .limit(1)
    .single();
  const { data: inspectionId, error } = await client.rpc("create_inspection", {
    target_room: roomId,
    target_resident: residentId,
    inspection_type: "move_in",
    inspection_notes: "suite: signed move-in",
    items: [{ item_id: item.id, condition: "good", note: null }],
  });
  if (error) throw new Error(`setup inspection failed: ${error.message}`);
  for (const role of ["resident", "ra"]) {
    const { error: sigErr } = await client.from("inspection_signatures").insert({
      inspection_id: inspectionId,
      role,
      storage_path: `signatures/${inspectionId}/${role}-${crypto.randomUUID()}.png`,
      captured_by: userId,
    });
    if (sigErr) throw new Error(`setup signature failed: ${sigErr.message}`);
  }
  return inspectionId;
}

describe("record_occupancy", () => {
  test("check_in is rejected while the move-in inspection is unsigned", async () => {
    // No move-in inspection at all yet.
    const { error } = await ra.rpc("record_occupancy", {
      target_resident: petit.id,
      event_type: "check_in",
    });
    assert.ok(error, "checked in without any move-in inspection");
    assert.match(error.message, /signed/i, "error should explain the gate");
  });

  test("check_in is rejected when only one of two signatures exists", async () => {
    const { data: inspectionId } = await ra.rpc("create_inspection", {
      target_room: petit.room_id,
      target_resident: petit.id,
      inspection_type: "move_in",
      inspection_notes: "suite: half-signed",
      items: [],
    });
    const { data: raUser } = await ra.auth.getUser();
    await ra.from("inspection_signatures").insert({
      inspection_id: inspectionId,
      role: "resident",
      storage_path: `signatures/${inspectionId}/resident-${crypto.randomUUID()}.png`,
      captured_by: raUser.user.id,
    });

    const { error } = await ra.rpc("record_occupancy", {
      target_resident: petit.id,
      event_type: "check_in",
    });
    assert.ok(error, "checked in with a half-signed inspection");
  });

  test("an RA can check in an expected resident once both have signed", async () => {
    await createSignedMoveIn(ra, raId, petit.id, petit.room_id);
    const before = await eventCount("occupancy_events", petit.id);

    const { error } = await ra.rpc("record_occupancy", {
      target_resident: petit.id,
      event_type: "check_in",
    });
    assert.equal(error, null, error?.message);

    const { data: after } = await admin
      .from("residents")
      .select("occupancy_status, is_present")
      .eq("id", petit.id)
      .single();
    assert.equal(after.occupancy_status, "checked_in");
    assert.equal(after.is_present, true, "check-in should put them in the building");

    const delta = (await eventCount("occupancy_events", petit.id)) - before;
    assert.equal(delta, 1, `wrote ${delta} events, expected exactly 1`);
  });

  test("the event records the type and who did it", async () => {
    const { data: event } = await admin
      .from("occupancy_events")
      .select("type, recorded_by")
      .eq("resident_id", petit.id)
      .order("timestamp", { ascending: false })
      .limit(1)
      .single();
    assert.equal(event.type, "check_in");
    assert.equal(event.recorded_by, raId);
  });

  test("checking in twice is rejected", async () => {
    const { error } = await ra.rpc("record_occupancy", {
      target_resident: petit.id,
      event_type: "check_in",
    });
    assert.ok(error, "a second check-in succeeded");
  });

  test("an RA can check out a checked-in resident", async () => {
    const { error } = await ra.rpc("record_occupancy", {
      target_resident: petit.id,
      event_type: "check_out",
    });
    assert.equal(error, null, error?.message);

    const { data: after } = await admin
      .from("residents")
      .select("occupancy_status, is_present")
      .eq("id", petit.id)
      .single();
    assert.equal(after.occupancy_status, "checked_out");
    assert.equal(after.is_present, false, "checked-out residents are not in the building");
  });

  test("checking out twice is rejected", async () => {
    const { error } = await ra.rpc("record_occupancy", {
      target_resident: petit.id,
      event_type: "check_out",
    });
    assert.ok(error, "a second check-out succeeded");
  });

  test("checking out someone who never checked in is rejected", async () => {
    const { data: expected } = await admin
      .from("residents")
      .select("id")
      .eq("occupancy_status", "expected")
      .limit(1)
      .single();
    const { error } = await ra.rpc("record_occupancy", {
      target_resident: expected.id,
      event_type: "check_out",
    });
    assert.ok(error, "checked out an `expected` resident");
  });

  test("the status cache matches the latest event", async () => {
    // occupancy_status is a cache; the event log is the source of truth. If
    // they drift, occupancy reporting silently lies.
    const testy = await residentByStudentId(TESTY);
    const { data: latest } = await admin
      .from("occupancy_events")
      .select("type")
      .eq("resident_id", testy.id)
      .order("timestamp", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latest) {
      const expected = latest.type === "check_in" ? "checked_in" : "checked_out";
      assert.equal(testy.occupancy_status, expected, "cache drifted from the log");
    }
  });

  test("the audit trail cannot be written directly", async () => {
    const { error } = await ra
      .from("occupancy_events")
      .insert({ resident_id: petit.id, type: "check_in" });
    assert.ok(error, "direct insert into occupancy_events succeeded");
  });
});
