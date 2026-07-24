// Inspections (step 6). Damage attribution depends on comparing a room's
// condition at move-in against move-out, so a snapshot must be immutable and
// written whole — a half-written or editable snapshot destroys the "before"
// state the whole feature rests on.

import { test, before, describe } from "node:test";
import assert from "node:assert/strict";
import {
  adminClient,
  staffClient,
  assertSeededDevDatabase,
  RA_EMAIL,
  RD_EMAIL,
} from "./helpers.mjs";

let ra, raId, rd, admin, template, roomId;

before(async () => {
  await assertSeededDevDatabase();
  admin = adminClient();
  ({ client: ra, userId: raId } = await staffClient(RA_EMAIL));
  ({ client: rd } = await staffClient(RD_EMAIL));

  const { data: items } = await admin
    .from("inventory_items")
    .select("id, name, sort_order")
    .order("sort_order");
  template = items;

  const { data: room } = await admin.from("rooms").select("id").limit(1).single();
  roomId = room.id;
});

describe("the inventory template", () => {
  test("has the 12 seeded items in order", async () => {
    const seeded = template.filter((i) => i.sort_order <= 12);
    assert.equal(seeded.length, 12, `found ${seeded.length} template items`);
    assert.equal(seeded[0].name, "Air vents");
    assert.equal(seeded[11].name, "Windows");
  });

  test("is readable by any staff member", async () => {
    const { data, error } = await ra.from("inventory_items").select("id");
    assert.equal(error, null);
    assert.ok(data.length >= 12);
  });
});

describe("create_inspection", () => {
  let inspectionId;

  test("an RA can create a snapshot", async () => {
    const items = template.slice(0, 12).map((item, i) => ({
      item_id: item.id,
      condition: i === 5 ? "damaged" : "good",
      note: i === 5 ? "test note" : null,
    }));

    const { data, error } = await ra.rpc("create_inspection", {
      target_room: roomId,
      target_resident: null,
      inspection_type: "periodic",
      inspection_notes: "created by the test suite",
      items,
    });
    assert.equal(error, null, error?.message);
    assert.ok(data, "no inspection id returned");
    inspectionId = data;
  });

  test("the header records who inspected", async () => {
    const { data } = await admin
      .from("inspections")
      .select("inspected_by, type")
      .eq("id", inspectionId)
      .single();
    assert.equal(data.inspected_by, raId);
    assert.equal(data.type, "periodic");
  });

  test("all 12 item rows are written atomically", async () => {
    const { count } = await admin
      .from("inspection_items")
      .select("*", { count: "exact", head: true })
      .eq("inspection_id", inspectionId);
    assert.equal(count, 12, `snapshot has ${count} items, expected 12`);
  });

  test("conditions and notes are preserved", async () => {
    const { data } = await admin
      .from("inspection_items")
      .select("condition, note")
      .eq("inspection_id", inspectionId)
      .eq("condition", "damaged");
    assert.equal(data.length, 1);
    assert.equal(data[0].note, "test note");
  });

  test("a snapshot cannot be edited", async () => {
    const { data } = await ra
      .from("inspections")
      .update({ notes: "tampered" })
      .eq("id", inspectionId)
      .select();
    assert.equal(data?.length ?? 0, 0, "an inspection was edited");

    const { data: after } = await admin
      .from("inspections")
      .select("notes")
      .eq("id", inspectionId)
      .single();
    assert.notEqual(after.notes, "tampered");
  });

  test("a snapshot cannot be deleted", async () => {
    const { data } = await ra.from("inspections").delete().eq("id", inspectionId).select();
    assert.equal(data?.length ?? 0, 0, "an inspection was deleted");
  });

  test("individual item rows cannot be edited", async () => {
    const { data } = await ra
      .from("inspection_items")
      .update({ condition: "good" })
      .eq("inspection_id", inspectionId)
      .select();
    assert.equal(data?.length ?? 0, 0, "an inspection item was edited");
  });

  test("inspections cannot be written directly, only through the RPC", async () => {
    const { error } = await ra
      .from("inspections")
      .insert({ room_id: roomId, type: "periodic" });
    assert.ok(error, "direct insert into inspections succeeded");
  });
});

describe("template editing is RD-only", () => {
  test("an RA cannot add, rename, or remove items", async () => {
    const { error: insErr } = await ra
      .from("inventory_items")
      .insert({ name: "RA item", sort_order: 910 });
    assert.ok(insErr, "RA added a template item");

    const { data: updated } = await ra
      .from("inventory_items")
      .update({ name: "Renamed" })
      .eq("sort_order", 1)
      .select();
    assert.equal(updated?.length ?? 0, 0, "RA renamed a template item");

    const { data: deleted } = await ra
      .from("inventory_items")
      .delete()
      .eq("sort_order", 1)
      .select();
    assert.equal(deleted?.length ?? 0, 0, "RA deleted a template item");
  });

  test("the RD can add and remove items", async () => {
    const { data: created, error } = await rd
      .from("inventory_items")
      .insert({ name: "Suite template item", sort_order: 911 })
      .select()
      .single();
    assert.equal(error, null, error?.message);

    const { error: delErr } = await rd.from("inventory_items").delete().eq("id", created.id);
    assert.equal(delErr, null, delErr?.message);
  });
});
