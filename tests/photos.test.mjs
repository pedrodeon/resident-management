// Photo attachments (v2 feature #1). A move-in photo only ends a move-out
// argument if nobody could have altered it in between — so photos must be as
// immutable as the snapshot they belong to: staff can upload and view, and
// NOBODY (not even the uploader) can overwrite or delete.

import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import {
  adminClient,
  anonClient,
  staffClient,
  assertSeededDevDatabase,
  RA_EMAIL,
} from "./helpers.mjs";

const BUCKET = "inspection-photos";

// A real 1x1 JPEG so uploads and signed-URL fetches exercise actual bytes.
const TINY_JPEG = Buffer.from(
  "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRof" +
    "Hh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAAB" +
    "AAAAAAAAAAAAAAAAAAAACv/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q==",
  "base64",
);

let admin, ra, raClient, anon, groupPrefix, uploadedPath;

before(async () => {
  await assertSeededDevDatabase();
  admin = adminClient();
  anon = anonClient();
  ({ client: raClient } = await staffClient(RA_EMAIL));
  ra = raClient;
  groupPrefix = `test/${crypto.randomUUID()}`;
  uploadedPath = `${groupPrefix}/first.jpg`;
});

after(async () => {
  // Staff can't delete photos (that's the point) — but the service role
  // bypasses storage RLS, so the suite can remove its own test objects.
  // If this ever starts failing, test objects accumulate harmlessly under
  // the test/ prefix.
  const { data: objects } = await admin.storage
    .from(BUCKET)
    .list(groupPrefix.split("/")[0], { limit: 100 });
  const paths =
    objects?.flatMap((o) => (o.name ? [`test/${o.name}`] : [])) ?? [];
  // list() on a prefix returns folders one level down; remove recursively by
  // just attempting the known uploaded paths plus anything listed.
  await admin.storage
    .from(BUCKET)
    .remove([uploadedPath, `${groupPrefix}/second.jpg`, ...paths]);
});

describe("the photo bucket", () => {
  test("an RA can upload a photo", async () => {
    const { error } = await ra.storage
      .from(BUCKET)
      .upload(uploadedPath, TINY_JPEG, { contentType: "image/jpeg" });
    assert.equal(error, null, error?.message);
  });

  test("an RA can view it via a signed URL that serves real bytes", async () => {
    const { data, error } = await ra.storage
      .from(BUCKET)
      .createSignedUrl(uploadedPath, 60);
    assert.equal(error, null, error?.message);

    const res = await fetch(data.signedUrl);
    assert.equal(res.status, 200, `signed URL fetch returned ${res.status}`);
    const bytes = Buffer.from(await res.arrayBuffer());
    assert.equal(bytes.length, TINY_JPEG.length, "byte length mismatch");
  });

  test("the uploader cannot overwrite the photo", async () => {
    const { error } = await ra.storage
      .from(BUCKET)
      .upload(uploadedPath, Buffer.concat([TINY_JPEG, TINY_JPEG]), {
        contentType: "image/jpeg",
        upsert: true,
      });
    assert.ok(error, "overwrite succeeded — photos are not immutable");

    // And the original bytes are untouched.
    const { data } = await ra.storage.from(BUCKET).createSignedUrl(uploadedPath, 60);
    const res = await fetch(data.signedUrl);
    const bytes = Buffer.from(await res.arrayBuffer());
    assert.equal(bytes.length, TINY_JPEG.length, "photo bytes changed");
  });

  test("the uploader cannot delete the photo", async () => {
    // storage remove() reports deleted objects; RLS filtering yields none.
    const { data } = await ra.storage.from(BUCKET).remove([uploadedPath]);
    assert.equal(data?.length ?? 0, 0, "delete removed objects");

    const { data: still } = await ra.storage
      .from(BUCKET)
      .createSignedUrl(uploadedPath, 60);
    const res = await fetch(still.signedUrl);
    assert.equal(res.status, 200, "photo is gone after a staff delete attempt");
  });

  test("anon can neither upload, list, nor mint a signed URL", async () => {
    const { error: upErr } = await anon.storage
      .from(BUCKET)
      .upload(`${groupPrefix}/anon.jpg`, TINY_JPEG, { contentType: "image/jpeg" });
    assert.ok(upErr, "anon uploaded to the bucket");

    const { data: listed } = await anon.storage.from(BUCKET).list(groupPrefix);
    assert.equal(listed?.length ?? 0, 0, "anon listed bucket contents");

    const { error: signErr } = await anon.storage
      .from(BUCKET)
      .createSignedUrl(uploadedPath, 60);
    assert.ok(signErr, "anon minted a signed URL for a private photo");
  });
});

describe("create_inspection with photos", () => {
  let inspectionId;

  test("records photo rows atomically with the snapshot", async () => {
    const { data: room } = await admin.from("rooms").select("id").limit(1).single();
    const { data: items } = await admin
      .from("inventory_items")
      .select("id")
      .order("sort_order")
      .limit(2);

    const secondPath = `${groupPrefix}/second.jpg`;
    await ra.storage
      .from(BUCKET)
      .upload(secondPath, TINY_JPEG, { contentType: "image/jpeg" });

    const { data, error } = await ra.rpc("create_inspection", {
      target_room: room.id,
      target_occupancy: null,
      inspection_type: "periodic",
      inspection_notes: "photo test suite",
      items: [
        { item_id: items[0].id, condition: "damaged", note: "see photos", photos: [uploadedPath, secondPath] },
        { item_id: items[1].id, condition: "good", note: null, photos: [] },
      ],
    });
    assert.equal(error, null, error?.message);
    inspectionId = data;

    const { data: photoRows } = await admin
      .from("inspection_photos")
      .select("storage_path, inspection_item_id")
      .eq("inspection_id", inspectionId);
    assert.equal(photoRows.length, 2, `expected 2 photo rows, got ${photoRows.length}`);
    assert.deepEqual(
      photoRows.map((p) => p.storage_path).sort(),
      [uploadedPath, secondPath].sort(),
    );
    // Both rows hang off the same (damaged) item.
    assert.equal(new Set(photoRows.map((p) => p.inspection_item_id)).size, 1);
  });

  test("staff can read the photo rows", async () => {
    const { data, error } = await ra
      .from("inspection_photos")
      .select("id")
      .eq("inspection_id", inspectionId);
    assert.equal(error, null, error?.message);
    assert.equal(data.length, 2);
  });

  test("photo rows cannot be written directly", async () => {
    const { error } = await ra.from("inspection_photos").insert({
      inspection_id: inspectionId,
      inspection_item_id: crypto.randomUUID(),
      storage_path: `${groupPrefix}/forged.jpg`,
    });
    assert.ok(error, "direct insert into inspection_photos succeeded");
  });

  test("photo rows cannot be deleted or edited", async () => {
    const { data: deleted } = await ra
      .from("inspection_photos")
      .delete()
      .eq("inspection_id", inspectionId)
      .select();
    assert.equal(deleted?.length ?? 0, 0, "photo rows were deleted");

    const { data: updated } = await ra
      .from("inspection_photos")
      .update({ storage_path: "swapped.jpg" })
      .eq("inspection_id", inspectionId)
      .select();
    assert.equal(updated?.length ?? 0, 0, "photo rows were edited");
  });

  test("an inspection without photos still works (backward compat)", async () => {
    const { data: room } = await admin.from("rooms").select("id").limit(1).single();
    const { data: item } = await admin
      .from("inventory_items")
      .select("id")
      .order("sort_order")
      .limit(1)
      .single();

    // Old-style payload: no `photos` key at all.
    const { data, error } = await ra.rpc("create_inspection", {
      target_room: room.id,
      target_occupancy: null,
      inspection_type: "periodic",
      inspection_notes: "no-photos compat test",
      items: [{ item_id: item.id, condition: "good", note: null }],
    });
    assert.equal(error, null, error?.message);

    const { count } = await admin
      .from("inspection_photos")
      .select("*", { count: "exact", head: true })
      .eq("inspection_id", data);
    assert.equal(count, 0);
  });
});
