// Weekly room checks. The rules: any staff member can record a check but only
// as themselves (attribution can't be forged), ratings are 1-5, and a saved
// check is immutable — the same append-only posture as every condition record.
//
// Like the rest of the suite, these run only against a fixture database (the
// helpers' guard enforces it) — room checks are append-only, so running them
// anywhere else would leave permanent rows.

import { test, before, describe } from "node:test";
import assert from "node:assert/strict";
import {
  adminClient,
  anonClient,
  staffClient,
  assertSeededDevDatabase,
  RA_EMAIL,
  RD_EMAIL,
} from "./helpers.mjs";

let admin, anon, ra, raId, rdId, roomId, createdCheckId;

const BASE = { floor_cleanliness: 4, trash: 3, laundry: 5, overall: 4 };

before(async () => {
  await assertSeededDevDatabase();
  admin = adminClient();
  anon = anonClient();
  ({ client: ra, userId: raId } = await staffClient(RA_EMAIL));
  ({ userId: rdId } = await staffClient(RD_EMAIL));
  const { data: room } = await admin.from("rooms").select("id").limit(1).single();
  roomId = room.id;
});

describe("recording a room check", () => {
  test("an RA can record a check as themselves", async () => {
    const { data, error } = await ra
      .from("room_checks")
      .insert({
        room_id: roomId,
        checked_by: raId,
        ...BASE,
        notes: "suite check",
        prohibited_items: null,
      })
      .select("id")
      .single();
    assert.equal(error, null, error?.message);
    createdCheckId = data.id;
  });

  test("attribution cannot be forged (checked_by must be the caller)", async () => {
    const { error } = await ra.from("room_checks").insert({
      room_id: roomId,
      checked_by: rdId, // someone else
      ...BASE,
    });
    assert.ok(error, "an RA recorded a check as the RD");
  });

  test("ratings outside 1-5 are rejected", async () => {
    for (const bad of [0, 6]) {
      const { error } = await ra.from("room_checks").insert({
        room_id: roomId,
        checked_by: raId,
        ...BASE,
        overall: bad,
      });
      assert.ok(error, `rating ${bad} was accepted`);
    }
  });

  test("anon can neither insert nor read", async () => {
    const { error: insErr } = await anon.from("room_checks").insert({
      room_id: roomId,
      checked_by: raId,
      ...BASE,
    });
    assert.ok(insErr, "anon inserted a room check");

    const { data } = await anon.from("room_checks").select("id").limit(1);
    assert.equal(data?.length ?? 0, 0, "anon read room checks");
  });
});

describe("a saved check is immutable", () => {
  test("staff can read it back", async () => {
    const { data, error } = await ra
      .from("room_checks")
      .select("overall, users:checked_by ( name )")
      .eq("id", createdCheckId)
      .single();
    assert.equal(error, null, error?.message);
    assert.equal(data.overall, BASE.overall);
  });

  test("it cannot be edited", async () => {
    const { data } = await ra
      .from("room_checks")
      .update({ overall: 1 })
      .eq("id", createdCheckId)
      .select();
    assert.equal(data?.length ?? 0, 0, "a room check was edited");

    const { data: after } = await admin
      .from("room_checks")
      .select("overall")
      .eq("id", createdCheckId)
      .single();
    assert.equal(after.overall, BASE.overall, "the rating changed");
  });

  test("it cannot be deleted, even by the service role", async () => {
    const { data } = await ra
      .from("room_checks")
      .delete()
      .eq("id", createdCheckId)
      .select();
    assert.equal(data?.length ?? 0, 0, "staff deleted a room check");

    const { error: adminErr } = await admin
      .from("room_checks")
      .delete()
      .eq("id", createdCheckId);
    assert.ok(adminErr, "service_role deleted a room check");
  });
});
