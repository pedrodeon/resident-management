// The access model from CLAUDE.md, as executable rules:
//   anon             — sees nothing at all
//   any staff (RA/RD) — reads everything
//   RD only          — writes the roster (people, occupancies, rooms, hallways,
//                      staff, hallway_assignments, inventory template, the
//                      current term)
//
// Since the person/occupancy split the roster is TWO tables, so every roster
// rule is asserted on both: an RA who can write either one can rewrite history.

import { test, before, describe } from "node:test";
import assert from "node:assert/strict";
import {
  adminClient,
  anonClient,
  staffClient,
  assertSeededDevDatabase,
  hallwayByName,
  currentTerm,
  RA_EMAIL,
  RD_EMAIL,
} from "./helpers.mjs";

let anon, ra, rd, admin, holiday1, someRoomId, term;

before(async () => {
  await assertSeededDevDatabase();
  admin = adminClient();
  anon = anonClient();
  ({ client: ra } = await staffClient(RA_EMAIL));
  ({ client: rd } = await staffClient(RD_EMAIL));
  holiday1 = await hallwayByName("Holiday 1");
  const { data: room } = await admin.from("rooms").select("id").limit(1).single();
  someRoomId = room.id;
  term = await currentTerm();
});

describe("anonymous callers", () => {
  // The anon key ships to the browser, so this is the outermost boundary.
  for (const table of [
    "people",
    "occupancies",
    "current_residents",
    "app_settings",
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

  test("cannot insert a person", async () => {
    const { error } = await anon
      .from("people")
      .insert({ full_name: "Anon", student_id: "S0000001" });
    assert.ok(error, "anon insert into people succeeded");
  });

  test("cannot insert an occupancy", async () => {
    const { error } = await anon
      .from("occupancies")
      .insert({ person_id: crypto.randomUUID(), room_id: someRoomId, term });
    assert.ok(error, "anon insert into occupancies succeeded");
  });
});

describe("any staff member (RA) can read the building", () => {
  test("reads all 8 hallways", async () => {
    const { data, error } = await ra.from("hallways").select("id");
    assert.equal(error, null);
    assert.equal(data.length, 8);
  });

  test("reads the roster building-wide, not just their own hallways", async () => {
    // Coverage is metadata, never access control — RA1 covers 3 hallways but
    // must still see every resident.
    const { data, error } = await ra
      .from("occupancies")
      .select("id, room_id");
    assert.equal(error, null);
    assert.ok(data.length >= 20, `RA saw only ${data.length} stays`);

    const { data: covered } = await admin
      .from("rooms")
      .select("id")
      .eq("hallway_id", holiday1.id);
    const coveredRoomIds = new Set(covered.map((r) => r.id));
    const outsideCoverage = data.filter((r) => !coveredRoomIds.has(r.room_id));
    assert.ok(outsideCoverage.length > 0, "RA only saw their own hallway");
  });

  test("reads people, and the current_residents view the screens use", async () => {
    for (const table of ["people", "current_residents"]) {
      const { data, error } = await ra.from(table).select("id").limit(1);
      assert.equal(error, null, `RA could not read ${table}: ${error?.message}`);
      assert.ok(data.length > 0, `RA saw no rows of ${table}`);
    }
  });

  test("reads the current term", async () => {
    const { data, error } = await ra
      .from("app_settings")
      .select("current_term")
      .single();
    assert.equal(error, null, error?.message);
    assert.equal(data.current_term, term);
  });

  test("reads rooms, staff, and the inventory template", async () => {
    for (const table of ["rooms", "users", "inventory_items"]) {
      const { data, error } = await ra.from(table).select("id").limit(1);
      assert.equal(error, null, `RA could not read ${table}: ${error?.message}`);
      assert.ok(data.length > 0, `RA saw no rows of ${table}`);
    }
  });
});

describe("the current_residents view scopes what the screens see", () => {
  // The view is where "current term, not archived" lives. If it leaked, every
  // everyday screen would show last year's residents as if they were here.
  test("returns only current-term, non-archived stays", async () => {
    const { data, error } = await ra.from("current_residents").select("id, term");
    assert.equal(error, null, error?.message);
    for (const row of data) {
      assert.equal(row.term, term, `view exposed a ${row.term} stay`);
    }

    const { data: archived } = await admin
      .from("occupancies")
      .select("id")
      .or(`is_archived.eq.true,term.neq.${term}`);
    const hiddenIds = new Set((archived ?? []).map((o) => o.id));
    const leaked = data.filter((r) => hiddenIds.has(r.id));
    assert.equal(leaked.length, 0, "the view exposed an archived or past stay");
  });

  test("the view is read-only to staff", async () => {
    const { error } = await rd
      .from("current_residents")
      .insert({ full_name: "Via View", student_id: "S0009100", room_id: someRoomId });
    assert.ok(error, "an insert through the view succeeded");
  });
});

describe("roster writes are RD-only", () => {
  test("RA cannot insert a person", async () => {
    const { error } = await ra
      .from("people")
      .insert({ full_name: "RA Insert", student_id: "S0000002" });
    assert.ok(error, "RA insert into people succeeded");
  });

  test("RA cannot insert an occupancy", async () => {
    const { data: person } = await admin
      .from("people")
      .select("id")
      .eq("student_id", "S1000101")
      .single();
    const { error } = await ra
      .from("occupancies")
      .insert({ person_id: person.id, room_id: someRoomId, term: "RA Term" });
    assert.ok(error, "RA opened a stay");
  });

  test("RA cannot update a person", async () => {
    const { data } = await ra
      .from("people")
      .update({ full_name: "Tampered" })
      .eq("student_id", "S1000101")
      .select();
    assert.equal(data?.length ?? 0, 0, "RA update touched rows");

    // Confirm from a privileged read that nothing actually changed.
    const { data: after } = await admin
      .from("people")
      .select("full_name")
      .eq("student_id", "S1000101")
      .single();
    assert.equal(after.full_name, "Testy McTestface");
  });

  test("RA cannot archive a stay", async () => {
    // Archiving hides a resident from every everyday screen, including the
    // hallway roster used during a break — RD-only for the same reason deletes
    // are.
    const { data: stay } = await admin
      .from("occupancies")
      .select("id, is_archived")
      .eq("is_archived", false)
      .limit(1)
      .single();

    const { data } = await ra
      .from("occupancies")
      .update({ is_archived: true })
      .eq("id", stay.id)
      .select();
    assert.equal(data?.length ?? 0, 0, "RA archived a stay");

    const { data: after } = await admin
      .from("occupancies")
      .select("is_archived")
      .eq("id", stay.id)
      .single();
    assert.equal(after.is_archived, false, "the stay was archived anyway");
  });

  test("RA cannot delete a person or a stay", async () => {
    const { data: people } = await ra
      .from("people")
      .delete()
      .eq("student_id", "S1000101")
      .select();
    assert.equal(people?.length ?? 0, 0, "RA delete removed a person");

    const { data: stays } = await ra
      .from("occupancies")
      .delete()
      .eq("term", term)
      .select();
    assert.equal(stays?.length ?? 0, 0, "RA delete removed a stay");
  });

  test("RA cannot change the current term", async () => {
    // Rolling the term over hides the whole building at once.
    const { data } = await ra
      .from("app_settings")
      .update({ current_term: "RA Term" })
      .eq("id", true)
      .select();
    assert.equal(data?.length ?? 0, 0, "RA changed the current term");
    assert.equal(await currentTerm(), term, "the term changed anyway");
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

  test("RD can create and delete a person and a stay", async () => {
    const { data: person, error: personErr } = await rd
      .from("people")
      .insert({ full_name: "Suite Fixture", student_id: "S0009001" })
      .select()
      .single();
    assert.equal(personErr, null, personErr?.message);

    const { data: stay, error: stayErr } = await rd
      .from("occupancies")
      .insert({ person_id: person.id, room_id: someRoomId, term })
      .select()
      .single();
    assert.equal(stayErr, null, stayErr?.message);

    // Deleting the person cascades the stay — clean up both explicitly anyway.
    const { error: stayDelErr } = await rd
      .from("occupancies")
      .delete()
      .eq("id", stay.id);
    assert.equal(stayDelErr, null, stayDelErr?.message);

    const { error: personDelErr } = await rd
      .from("people")
      .delete()
      .eq("id", person.id);
    assert.equal(personDelErr, null, personDelErr?.message);
  });

  test("RD can set the current term, and put it back", async () => {
    const { error } = await rd
      .from("app_settings")
      .update({ current_term: "Suite Term" })
      .eq("id", true);
    assert.equal(error, null, error?.message);
    assert.equal(await currentTerm(), "Suite Term");

    const { error: restoreErr } = await rd
      .from("app_settings")
      .update({ current_term: term })
      .eq("id", true);
    assert.equal(restoreErr, null, restoreErr?.message);
    assert.equal(await currentTerm(), term, "the fixture term was not restored");
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

describe("one active stay per person", () => {
  // The whole point of the split is multiple stays over time — but two LIVE
  // stays would put one person in two rooms, and the hallway roster would list
  // them twice during a break.
  test("a second active stay for the same person is rejected", async () => {
    const { data: person } = await admin
      .from("people")
      .select("id")
      .eq("student_id", "S1000101")
      .single();

    const { error } = await rd
      .from("occupancies")
      .insert({ person_id: person.id, room_id: someRoomId, term });
    assert.ok(error, "a person got two active stays");
  });

  test("a past-term stay for the same person is allowed", async () => {
    const { data: person } = await admin
      .from("people")
      .select("id")
      .eq("student_id", "S1000101")
      .single();

    const { data: created, error } = await rd
      .from("occupancies")
      .insert({
        person_id: person.id,
        room_id: someRoomId,
        term: "Suite Past Term",
        occupancy_status: "checked_out",
      })
      .select()
      .single();
    assert.equal(error, null, error?.message);

    // ...and it stays out of the everyday screens.
    const { data: view } = await ra
      .from("current_residents")
      .select("id")
      .eq("id", created.id);
    assert.equal(view?.length ?? 0, 0, "a past-term stay appeared in the view");

    await rd.from("occupancies").delete().eq("id", created.id);
  });
});

describe("privilege escalation", () => {
  // The `users` table decides who is RD, so it is the escalation target: an RA
  // who can write it grants themselves every RD-only power in the app.
  let raId;

  before(async () => {
    const { data } = await ra.auth.getUser();
    raId = data.user.id;
  });

  test("an RA cannot promote themselves to RD", async () => {
    const { data } = await ra
      .from("users")
      .update({ role: "rd" })
      .eq("id", raId)
      .select();
    assert.equal(data?.length ?? 0, 0, "an RA changed their own role");

    const { data: after } = await admin
      .from("users")
      .select("role")
      .eq("id", raId)
      .single();
    assert.equal(after.role, "ra", "RA is no longer an RA — privilege escalated");
  });

  test("an RA cannot promote anyone else", async () => {
    const { data } = await ra
      .from("users")
      .update({ role: "rd" })
      .eq("role", "ra")
      .select();
    assert.equal(data?.length ?? 0, 0, "an RA promoted staff accounts");
  });

  test("an RA cannot create a new RD account row", async () => {
    const { error } = await ra.from("users").insert({
      id: crypto.randomUUID(),
      name: "Backdoor",
      email: "backdoor@tudor.test",
      role: "rd",
    });
    assert.ok(error, "an RA inserted an RD row");
  });

  test("an RA cannot delete staff accounts", async () => {
    const { data } = await ra.from("users").delete().eq("role", "rd").select();
    assert.equal(data?.length ?? 0, 0, "an RA deleted staff");
  });

  test("an RA cannot grant themselves hallway coverage", async () => {
    const { error } = await ra
      .from("hallway_assignments")
      .insert({ user_id: raId, hallway_id: holiday1.id });
    assert.ok(error, "an RA assigned themselves a hallway");
  });
});
