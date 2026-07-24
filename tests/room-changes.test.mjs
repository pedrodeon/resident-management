// Room reassignment (step 7). This is RD-only, and the log matters for damage
// attribution: it establishes which room a resident occupied during which
// window, so move-out damage lands on the right occupant.

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
  RD_EMAIL,
} from "./helpers.mjs";

const PETIT = "S1000104";

let ra, rd, rdId, admin, petit, originalRoomId, otherRoomId;

before(async () => {
  await assertSeededDevDatabase();
  admin = adminClient();
  ({ client: ra } = await staffClient(RA_EMAIL));
  ({ client: rd, userId: rdId } = await staffClient(RD_EMAIL));

  petit = await residentByStudentId(PETIT);
  originalRoomId = petit.room_id;

  const holiday1 = await hallwayByName("Holiday 1");
  const { data: rooms } = await admin
    .from("rooms")
    .select("id")
    .eq("hallway_id", holiday1.id);
  otherRoomId = rooms.find((r) => r.id !== originalRoomId).id;
});

after(async () => {
  await restoreResident(PETIT, { room_id: originalRoomId });
});

describe("reassign_room", () => {
  test("an RA cannot reassign rooms", async () => {
    const { error } = await ra.rpc("reassign_room", {
      target_resident: petit.id,
      to_room: otherRoomId,
      reason: "should be rejected",
    });
    assert.ok(error, "an RA reassigned a room");

    const { data: after } = await admin
      .from("residents")
      .select("room_id")
      .eq("id", petit.id)
      .single();
    assert.equal(after.room_id, originalRoomId, "the room changed anyway");
  });

  test("the RD can reassign, and the resident moves", async () => {
    const before = await eventCount("room_change_events", petit.id);

    const { error } = await rd.rpc("reassign_room", {
      target_resident: petit.id,
      to_room: otherRoomId,
      reason: "test suite",
    });
    assert.equal(error, null, error?.message);

    const { data: after } = await admin
      .from("residents")
      .select("room_id")
      .eq("id", petit.id)
      .single();
    assert.equal(after.room_id, otherRoomId);

    const delta = (await eventCount("room_change_events", petit.id)) - before;
    assert.equal(delta, 1, `wrote ${delta} events, expected exactly 1`);
  });

  test("the event captures both endpoints and who moved them", async () => {
    // Without from/to and a timestamp, you cannot say which resident was in a
    // room when damage appeared.
    const { data: event } = await admin
      .from("room_change_events")
      .select("from_room_id, to_room_id, changed_by, reason")
      .eq("resident_id", petit.id)
      .order("timestamp", { ascending: false })
      .limit(1)
      .single();

    assert.equal(event.from_room_id, originalRoomId);
    assert.equal(event.to_room_id, otherRoomId);
    assert.equal(event.changed_by, rdId);
    assert.equal(event.reason, "test suite");
  });

  test("reassigning to the same room is rejected", async () => {
    const { error } = await rd.rpc("reassign_room", {
      target_resident: petit.id,
      to_room: otherRoomId,
    });
    assert.ok(error, "a no-op reassignment was recorded");
  });

  test("the audit trail cannot be written directly", async () => {
    const { error } = await rd.from("room_change_events").insert({
      resident_id: petit.id,
      from_room_id: originalRoomId,
      to_room_id: otherRoomId,
    });
    assert.ok(error, "direct insert into room_change_events succeeded");
  });

  test("staff can read room-change history", async () => {
    // The resident-detail screen shows this to every staff member.
    const { data, error } = await ra
      .from("room_change_events")
      .select("id")
      .eq("resident_id", petit.id);
    assert.equal(error, null, error?.message);
    assert.ok(data.length > 0, "an RA could not read room-change history");
  });
});
