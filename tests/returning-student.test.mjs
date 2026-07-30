// The returning-student rule: a student who comes back is the SAME person with
// a NEW occupancy. The old stay must survive byte-for-byte — its room, status,
// and the inspections and events hanging off it are what a damage dispute is
// settled from, so anything that reuses or resets it destroys the evidence.
//
// These assert the database-level guarantees the flow depends on. The flow's own
// server action layers messaging on top (see
// src/app/(app)/admin/residents/actions.ts); what cannot be allowed to regress
// is what Postgres enforces.

import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import {
  adminClient,
  staffClient,
  assertSeededDevDatabase,
  occupancyByStudentId,
  personByStudentId,
  hallwayByName,
  currentTerm,
  RA_EMAIL,
  RD_EMAIL,
} from "./helpers.mjs";

// S1000122 is seeded checked_out — the returning-student shape.
const RETURNER = "S1000122";
const NEW_STUDENT_ID = "S9998001"; // created and removed by this suite
const NEXT_TERM = "Suite Next Term";

let admin, ra, rd, term, roomA, roomB, returner, priorStay;
const openedStayIds = [];

before(async () => {
  await assertSeededDevDatabase();
  admin = adminClient();
  ({ client: ra } = await staffClient(RA_EMAIL));
  ({ client: rd } = await staffClient(RD_EMAIL));
  term = await currentTerm();

  const lebanon3 = await hallwayByName("Lebanon 3");
  const { data: rooms } = await admin
    .from("rooms")
    .select("id, room_number")
    .eq("hallway_id", lebanon3.id)
    .order("room_number");
  roomA = rooms[0];
  roomB = rooms[1];

  returner = await personByStudentId(RETURNER);
  const { data: prior } = await admin
    .from("occupancies")
    .select("id, term, room_id, occupancy_status, is_present, is_archived")
    .eq("person_id", returner.id)
    .eq("term", term)
    .single();
  priorStay = prior;
});

after(async () => {
  // Remove only what this suite created; the fixtures stay as seeded.
  for (const id of openedStayIds) {
    await admin.from("occupancies").delete().eq("id", id);
  }
  await admin.from("people").delete().eq("student_id", NEW_STUDENT_ID);
  await admin
    .from("occupancies")
    .update({ is_archived: priorStay.is_archived })
    .eq("id", priorStay.id);
});

describe("opening a stay for a returning student", () => {
  test("the RD can open a second stay when the first is checked out", async () => {
    const { data: opened, error } = await rd
      .from("occupancies")
      .insert({ person_id: returner.id, room_id: roomA.id, term: NEXT_TERM })
      .select("id, occupancy_status, is_present, is_archived, term")
      .single();
    assert.equal(error, null, error?.message);
    openedStayIds.push(opened.id);

    assert.equal(opened.occupancy_status, "expected", "a new stay must start `expected`");
    assert.equal(opened.is_archived, false);
    assert.equal(opened.term, NEXT_TERM);
  });

  test("no second person record is created", async () => {
    const { count } = await admin
      .from("people")
      .select("*", { count: "exact", head: true })
      .eq("student_id", RETURNER);
    assert.equal(count, 1, "the returning student was duplicated");

    const { count: stays } = await admin
      .from("occupancies")
      .select("*", { count: "exact", head: true })
      .eq("person_id", returner.id);
    assert.equal(stays, 2, `expected 2 stays for one person, got ${stays}`);
  });

  test("the prior stay is untouched", async () => {
    // Not "roughly the same" — identical. Reusing or resetting it is exactly
    // the failure the person/occupancy split exists to prevent.
    const { data: after } = await admin
      .from("occupancies")
      .select("term, room_id, occupancy_status, is_present")
      .eq("id", priorStay.id)
      .single();
    assert.deepEqual(after, {
      term: priorStay.term,
      room_id: priorStay.room_id,
      occupancy_status: priorStay.occupancy_status,
      is_present: priorStay.is_present,
    });
  });

  test("the new stay carries none of the old stay's history", async () => {
    const newStayId = openedStayIds[0];
    for (const table of [
      "occupancy_events",
      "presence_events",
      "room_change_events",
      "inspections",
    ]) {
      const { count } = await admin
        .from(table)
        .select("*", { count: "exact", head: true })
        .eq("occupancy_id", newStayId);
      assert.equal(count, 0, `the new stay inherited ${count} row(s) from ${table}`);
    }
  });

  test("a stay in another term stays off the everyday screens", async () => {
    const { data: view } = await ra
      .from("current_residents")
      .select("id, term")
      .eq("id", openedStayIds[0]);
    assert.equal(view?.length ?? 0, 0, "a future-term stay appeared in current_residents");
  });

  test("archiving the prior stay leaves it queryable", async () => {
    const { error } = await rd
      .from("occupancies")
      .update({ is_archived: true })
      .eq("id", priorStay.id);
    assert.equal(error, null, error?.message);

    const { data: still } = await admin
      .from("occupancies")
      .select("id, occupancy_status, room_id")
      .eq("id", priorStay.id)
      .maybeSingle();
    assert.ok(still, "archiving deleted the stay");
    assert.equal(still.occupancy_status, priorStay.occupancy_status);
    assert.equal(still.room_id, priorStay.room_id);

    const { data: view } = await ra
      .from("current_residents")
      .select("id")
      .eq("id", priorStay.id);
    assert.equal(view?.length ?? 0, 0, "an archived stay is still on everyday screens");
  });
});

describe("guards", () => {
  test("a second ACTIVE stay for one person is rejected", async () => {
    // The one thing multiple stays must never mean: the same person live in two
    // rooms, listed twice on the break roster.
    const active = await occupancyByStudentId("S1000101"); // seeded checked_in
    const { error } = await rd
      .from("occupancies")
      .insert({ person_id: active.person_id, room_id: roomB.id, term: NEXT_TERM });
    assert.ok(error, "a person got two active stays");
    assert.match(error.message, /occupancies_one_active_per_person|duplicate key/i);
  });

  test("a duplicate student ID is rejected at the database", async () => {
    const { data: created, error } = await rd
      .from("people")
      .insert({ full_name: "Suite Newcomer", student_id: NEW_STUDENT_ID })
      .select("id")
      .single();
    assert.equal(error, null, error?.message);

    const { error: dupError } = await rd
      .from("people")
      .insert({ full_name: "Suite Newcomer Again", student_id: NEW_STUDENT_ID });
    assert.ok(dupError, "two people rows share a student ID");
    assert.equal(dupError.code, "23505");

    // A brand-new student's first stay behaves like any other.
    const { data: firstStay, error: stayError } = await rd
      .from("occupancies")
      .insert({ person_id: created.id, room_id: roomB.id, term: NEXT_TERM })
      .select("id, occupancy_status")
      .single();
    assert.equal(stayError, null, stayError?.message);
    openedStayIds.push(firstStay.id);
    assert.equal(firstStay.occupancy_status, "expected");
  });

  test("an RA cannot open a stay for anyone", async () => {
    // Opening a stay is a roster write: RD-only, enforced by RLS not the UI.
    const { error } = await ra
      .from("occupancies")
      .insert({ person_id: returner.id, room_id: roomB.id, term: "RA Term" });
    assert.ok(error, "an RA opened a stay");
  });

  test("an RA cannot create a person", async () => {
    const { error } = await ra
      .from("people")
      .insert({ full_name: "RA Newcomer", student_id: "S9998999" });
    assert.ok(error, "an RA created a person record");
  });
});
