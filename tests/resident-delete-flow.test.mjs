// Deleting a stay from Admin -> Residents.
//
// Four tables reference occupancies. Three cascade; `inspections` does not,
// on purpose — a signed inspection is what a damage dispute is settled from,
// and it has to outlive a careless click on the roster screen. That FK is the
// real guarantee. What is under test here is that the app knows about it
// BEFORE the click, so the RD reads a sentence about archiving instead of a
// constraint name.
//
// The message layer is pure and runs anywhere; the rules need the fixture
// project.

import { test, before, describe } from "node:test";
import assert from "node:assert/strict";
import { humanDbError } from "../src/lib/db-errors.ts";
import {
  adminClient,
  staffClient,
  assertSeededDevDatabase,
  occupancyByStudentId,
  RA_EMAIL,
  RD_EMAIL,
} from "./helpers.mjs";

describe("database errors are said in English", () => {
  test("the FK that blocks a delete explains what to do instead", () => {
    const message = humanDbError({
      code: "23503",
      message:
        'update or delete on table "occupancies" violates foreign key constraint "inspections_occupancy_id_fkey" on table "inspections"',
    });
    assert.match(message, /inspection records/);
    assert.match(message, /Archive/);
    assert.doesNotMatch(message, /constraint|fkey|occupancies/);
  });

  test("nothing leaks a table or constraint name", () => {
    const samples = [
      { code: "23505", message: 'duplicate key value violates unique constraint "people_student_id_key"' },
      { code: "42501", message: "permission denied for table inspections" },
      { code: "23514", message: 'new row for relation "desk_shifts" violates check constraint "desk_shifts_check"' },
      { code: "XX000", message: "something nobody has seen before" },
    ];
    for (const sample of samples) {
      const message = humanDbError(sample);
      assert.doesNotMatch(
        message,
        /violates|constraint|relation "|for table|_fkey|_key\b/,
        `raw text survived: ${message}`,
      );
      assert.ok(message.length > 10, "the message says nothing useful");
    }
  });

  test("an unknown error still tells the user what to do", () => {
    assert.equal(
      humanDbError({ code: "XX000", message: "boom" }),
      "That didn't work. Refresh the page and try again.",
    );
  });
});

describe("against a live database", () => {
  let admin, ra, rd;

  before(async () => {
    await assertSeededDevDatabase();
    admin = adminClient();
    ({ client: ra } = await staffClient(RA_EMAIL));
    ({ client: rd } = await staffClient(RD_EMAIL));
  });

  /** The pre-check the delete action runs. */
  async function dependentInspections(client, occupancyId) {
    const { count } = await client
      .from("inspections")
      .select("id", { count: "exact", head: true })
      .eq("occupancy_id", occupancyId);
    return count ?? 0;
  }

  test("a stay with an inspection cannot be deleted, but can be archived", async () => {
    const stay = await occupancyByStudentId("S1000101");
    assert.ok(
      (await dependentInspections(rd, stay.id)) > 0,
      "the fixture stay has no inspection, so this proves nothing",
    );

    // The database refuses it — this is the guarantee the UI mirrors.
    const { error } = await rd.from("occupancies").delete().eq("id", stay.id);
    assert.ok(error, "a stay with an inspection was deleted");
    assert.equal(error.code, "23503");
    assert.match(humanDbError(error), /Archive/);

    // Archiving is the way out, and it works.
    const { error: archiveError } = await rd
      .from("occupancies")
      .update({ is_archived: true })
      .eq("id", stay.id);
    assert.equal(archiveError, null, archiveError?.message);
    await admin
      .from("occupancies")
      .update({ is_archived: false })
      .eq("id", stay.id);
  });

  test("a stay with no dependents deletes as before", async () => {
    const { data: person } = await admin
      .from("people")
      .insert({
        full_name: "Delete Probe",
        student_id: `S9${Date.now().toString().slice(-6)}`,
      })
      .select("id")
      .single();
    const { data: room } = await admin.from("rooms").select("id").limit(1).single();
    const { data: stay } = await admin
      .from("occupancies")
      .insert({ person_id: person.id, room_id: room.id, term: "Delete Probe Term" })
      .select("id")
      .single();

    assert.equal(await dependentInspections(rd, stay.id), 0);
    const { error } = await rd.from("occupancies").delete().eq("id", stay.id);
    assert.equal(error, null, error?.message);

    const { data: gone } = await admin
      .from("occupancies")
      .select("id")
      .eq("id", stay.id)
      .maybeSingle();
    assert.equal(gone, null, "the stay survived its own delete");
    await admin.from("people").delete().eq("id", person.id);
  });

  test("an RA cannot delete a stay at all", async () => {
    const stay = await occupancyByStudentId("S1000102");
    const { data } = await ra
      .from("occupancies")
      .delete()
      .eq("id", stay.id)
      .select();
    assert.equal(data?.length ?? 0, 0, "an RA deleted a stay");

    const { data: alive } = await admin
      .from("occupancies")
      .select("id")
      .eq("id", stay.id)
      .maybeSingle();
    assert.ok(alive, "the stay is gone");
  });
});

describe("inspections are permanent for everyone", () => {
  // The two-step "delete the inspection, then the stay" flow cannot exist
  // today: `inspections` has no DELETE policy and no DELETE grant, for any
  // role including service_role. Building that flow means a migration adding
  // both, which would reverse the append-only rule in CLAUDE.md. These tests
  // pin the current guarantee so that reversal has to be deliberate.
  let admin, ra, rd;

  before(async () => {
    await assertSeededDevDatabase();
    admin = adminClient();
    ({ client: ra } = await staffClient(RA_EMAIL));
    ({ client: rd } = await staffClient(RD_EMAIL));
  });

  test("no staff member can delete an inspection — RA or RD", async () => {
    const { data: inspection } = await admin
      .from("inspections")
      .select("id")
      .limit(1)
      .single();

    for (const [who, client] of [["RA", ra], ["RD", rd]]) {
      const { data } = await client
        .from("inspections")
        .delete()
        .eq("id", inspection.id)
        .select();
      assert.equal(data?.length ?? 0, 0, `${who} deleted an inspection`);
    }

    const { data: alive } = await admin
      .from("inspections")
      .select("id")
      .eq("id", inspection.id)
      .maybeSingle();
    assert.ok(alive, "the inspection is gone");
  });

  test("not even the service role can — the grant does not exist", async () => {
    const { data: inspection } = await admin
      .from("inspections")
      .select("id")
      .limit(1)
      .single();
    const { error, data } = await admin
      .from("inspections")
      .delete()
      .eq("id", inspection.id)
      .select();
    assert.ok(
      error !== null || (data?.length ?? 0) === 0,
      "service_role deleted an inspection",
    );
  });
});
