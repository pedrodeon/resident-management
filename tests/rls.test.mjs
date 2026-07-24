// The access model from CLAUDE.md, as executable rules:
//   anon             — sees nothing at all
//   any staff (RA/RD) — reads everything
//   RD only          — writes the roster (residents, rooms, hallways, staff,
//                      hallway_assignments, inventory template)

import { test, before, describe } from "node:test";
import assert from "node:assert/strict";
import {
  adminClient,
  anonClient,
  staffClient,
  assertSeededDevDatabase,
  hallwayByName,
  RA_EMAIL,
  RD_EMAIL,
} from "./helpers.mjs";

let anon, ra, rd, admin, holiday1, someRoomId;

before(async () => {
  await assertSeededDevDatabase();
  admin = adminClient();
  anon = anonClient();
  ({ client: ra } = await staffClient(RA_EMAIL));
  ({ client: rd } = await staffClient(RD_EMAIL));
  holiday1 = await hallwayByName("Holiday 1");
  const { data: room } = await admin.from("rooms").select("id").limit(1).single();
  someRoomId = room.id;
});

describe("anonymous callers", () => {
  // The anon key ships to the browser, so this is the outermost boundary.
  for (const table of [
    "residents",
    "hallways",
    "rooms",
    "users",
    "hallway_assignments",
    "inventory_items",
    "inspections",
    "presence_events",
    "occupancy_events",
    "room_change_events",
  ]) {
    test(`cannot read ${table}`, async () => {
      const { data, error } = await anon.from(table).select("*").limit(1);
      // Either denied outright, or RLS filters every row. Both are acceptable;
      // leaking even one row is not.
      assert.ok(
        error !== null || (data?.length ?? 0) === 0,
        `anon saw ${data?.length} row(s) of ${table}`,
      );
    });
  }

  test("cannot insert a resident", async () => {
    const { error } = await anon
      .from("residents")
      .insert({ full_name: "Anon", student_id: "S0000001", room_id: someRoomId });
    assert.ok(error, "anon insert into residents succeeded");
  });
});

describe("any staff member (RA) can read the building", () => {
  test("reads all 8 hallways", async () => {
    const { data, error } = await ra.from("hallways").select("id");
    assert.equal(error, null);
    assert.equal(data.length, 8);
  });

  test("reads residents building-wide, not just their own hallways", async () => {
    // Coverage is metadata, never access control — RA1 covers 3 hallways but
    // must still see every resident.
    const { data, error } = await ra.from("residents").select("id, room_id");
    assert.equal(error, null);
    assert.ok(data.length >= 20, `RA saw only ${data.length} residents`);

    const { data: covered } = await admin
      .from("rooms")
      .select("id")
      .eq("hallway_id", holiday1.id);
    const coveredRoomIds = new Set(covered.map((r) => r.id));
    const outsideCoverage = data.filter((r) => !coveredRoomIds.has(r.room_id));
    assert.ok(outsideCoverage.length > 0, "RA only saw their own hallway");
  });

  test("reads rooms, staff, and the inventory template", async () => {
    for (const table of ["rooms", "users", "inventory_items"]) {
      const { data, error } = await ra.from(table).select("id").limit(1);
      assert.equal(error, null, `RA could not read ${table}: ${error?.message}`);
      assert.ok(data.length > 0, `RA saw no rows of ${table}`);
    }
  });
});

describe("roster writes are RD-only", () => {
  test("RA cannot insert a resident", async () => {
    const { error } = await ra
      .from("residents")
      .insert({ full_name: "RA Insert", student_id: "S0000002", room_id: someRoomId });
    assert.ok(error, "RA insert into residents succeeded");
  });

  test("RA cannot update a resident", async () => {
    const { data } = await ra
      .from("residents")
      .update({ full_name: "Tampered" })
      .eq("student_id", "S1000101")
      .select();
    assert.equal(data?.length ?? 0, 0, "RA update touched rows");

    // Confirm from a privileged read that nothing actually changed.
    const { data: after } = await admin
      .from("residents")
      .select("full_name")
      .eq("student_id", "S1000101")
      .single();
    assert.equal(after.full_name, "Testy McTestface");
  });

  test("RA cannot delete a resident", async () => {
    const { data } = await ra
      .from("residents")
      .delete()
      .eq("student_id", "S1000101")
      .select();
    assert.equal(data?.length ?? 0, 0, "RA delete removed rows");
  });

  test("RA cannot create a room", async () => {
    const { error } = await ra
      .from("rooms")
      .insert({ hallway_id: holiday1.id, room_number: "RA-1", capacity: 1 });
    assert.ok(error, "RA created a room");
  });

  test("RA cannot edit the inventory template", async () => {
    const { error } = await ra
      .from("inventory_items")
      .insert({ name: "RA item", sort_order: 900 });
    assert.ok(error, "RA added a template item");
  });

  test("RD can create and delete a resident", async () => {
    const { data: created, error: insErr } = await rd
      .from("residents")
      .insert({ full_name: "Suite Fixture", student_id: "S0009001", room_id: someRoomId })
      .select()
      .single();
    assert.equal(insErr, null, insErr?.message);
    assert.ok(created);

    const { error: delErr } = await rd.from("residents").delete().eq("id", created.id);
    assert.equal(delErr, null, delErr?.message);
  });

  test("RD can create and delete a room", async () => {
    const { data: created, error: insErr } = await rd
      .from("rooms")
      .insert({ hallway_id: holiday1.id, room_number: "RD-TEST", capacity: 1 })
      .select()
      .single();
    assert.equal(insErr, null, insErr?.message);

    const { error: delErr } = await rd.from("rooms").delete().eq("id", created.id);
    assert.equal(delErr, null, delErr?.message);
  });

  test("RD can edit the inventory template", async () => {
    const { data: created, error: insErr } = await rd
      .from("inventory_items")
      .insert({ name: "Suite item", sort_order: 901 })
      .select()
      .single();
    assert.equal(insErr, null, insErr?.message);

    const { error: delErr } = await rd.from("inventory_items").delete().eq("id", created.id);
    assert.equal(delErr, null, delErr?.message);
  });
});
