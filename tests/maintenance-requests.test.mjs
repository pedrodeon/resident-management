// Maintenance requests: any staff member files one, but the queue itself is
// the RD's — only they read it and close or reopen a request. Status stays
// mutable by design (open → done → open); nothing is ever deletable.
//
// Filing goes through file_maintenance_request, the definer RPC the app uses,
// which writes the row and the RD's notification in one transaction. No email
// is involved any more.

import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import {
  adminClient,
  anonClient,
  staffClient,
  assertSeededDevDatabase,
  RA_EMAIL,
  RD_EMAIL,
} from "./helpers.mjs";

let admin, anon, ra, raId, rd, rdId, requestId;

before(async () => {
  await assertSeededDevDatabase();
  admin = adminClient();
  anon = anonClient();
  ({ client: ra, userId: raId } = await staffClient(RA_EMAIL));
  ({ client: rd, userId: rdId } = await staffClient(RD_EMAIL));
});

after(async () => {
  // No delete grant exists for anyone, service_role included — clean up by
  // marking the suite's request done so it leaves the open list.
  if (requestId) {
    await admin
      .from("maintenance_requests")
      .update({ status: "done", done_by: rdId, done_at: new Date().toISOString() })
      .eq("id", requestId);
  }
});

describe("filing", () => {
  test("an RA files a request through the RPC", async () => {
    const { data, error } = await ra.rpc("file_maintenance_request", {
      location: "Suite fixture — front stairwell",
      description: "Handrail loose (test suite row)",
      urgency: "normal",
    });
    assert.equal(error, null, error?.message);
    assert.ok(data, "the RPC returns the new id");
    requestId = data;

    // The RA cannot read it back, so verify through the service role.
    const { data: row } = await admin
      .from("maintenance_requests")
      .select("status, created_by")
      .eq("id", requestId)
      .single();
    assert.equal(row.status, "open", "a new request must start open");
    assert.equal(row.created_by, raId, "created_by is pinned to the caller");
  });

  test("filing writes an RD-addressed notification in the same transaction", async () => {
    const { data } = await admin
      .from("notifications")
      .select("type, audience, actor")
      .eq("target_id", requestId)
      .single();
    assert.equal(data.type, "maintenance_filed");
    assert.equal(data.audience, "rd");
    assert.equal(data.actor, raId);
  });

  test("blank location or description is refused", async () => {
    for (const args of [
      { location: "   ", description: "blank location", urgency: "low" },
      { location: "Somewhere", description: "   ", urgency: "low" },
    ]) {
      const { error } = await ra.rpc("file_maintenance_request", args);
      assert.ok(error, `blank field accepted: ${JSON.stringify(args)}`);
    }
  });

  test("an invalid urgency is refused", async () => {
    const { error } = await ra.rpc("file_maintenance_request", {
      location: "Somewhere",
      description: "Something",
      urgency: "immediately",
    });
    assert.ok(error, "an invalid urgency was accepted");
  });

  test("anon can neither file nor read", async () => {
    const { error: rpcErr } = await anon.rpc("file_maintenance_request", {
      location: "Anon",
      description: "no",
      urgency: "low",
    });
    assert.ok(rpcErr, "anon filed a request");

    const { data, error } = await anon
      .from("maintenance_requests")
      .select("id")
      .limit(1);
    assert.ok(error !== null || (data?.length ?? 0) === 0, "anon read requests");
  });
});

describe("the queue belongs to the RD", () => {
  test("an RA cannot read it — not even their own request", async () => {
    const { data, error } = await ra.from("maintenance_requests").select("id");
    assert.ok(
      error !== null || (data?.length ?? 0) === 0,
      "an RA read the maintenance queue",
    );
  });

  test("an RA cannot close a request", async () => {
    const { data } = await ra
      .from("maintenance_requests")
      .update({ status: "done", done_by: raId, done_at: new Date().toISOString() })
      .eq("id", requestId)
      .select();
    assert.equal(data?.length ?? 0, 0, "an RA closed a request");

    const { data: row } = await admin
      .from("maintenance_requests")
      .select("status")
      .eq("id", requestId)
      .single();
    assert.equal(row.status, "open", "the request must still be open");
  });

  test("the RD reads the queue", async () => {
    const { data, error } = await rd
      .from("maintenance_requests")
      .select("id, status")
      .eq("id", requestId)
      .single();
    assert.equal(error, null, error?.message);
    assert.equal(data.status, "open");
  });
});

describe("status lifecycle (RD only)", () => {
  test("the RD marks a request done", async () => {
    const { data, error } = await rd
      .from("maintenance_requests")
      .update({ status: "done", done_by: rdId, done_at: new Date().toISOString() })
      .eq("id", requestId)
      .select("status, done_by")
      .single();
    assert.equal(error, null, error?.message);
    assert.equal(data.status, "done");
    assert.equal(data.done_by, rdId);
  });

  test("a done request still needs its closing timestamp", async () => {
    // done_by may fall away when a staff member is removed (ON DELETE SET
    // NULL), so the check insists on done_at rather than on the person.
    const { error } = await rd
      .from("maintenance_requests")
      .update({ status: "done", done_at: null })
      .eq("id", requestId);
    assert.ok(error, "a done request without done_at was accepted");
  });

  test("open with done_* set is refused", async () => {
    const { error } = await rd
      .from("maintenance_requests")
      .update({ status: "open", done_by: rdId, done_at: new Date().toISOString() })
      .eq("id", requestId);
    assert.ok(error, "open with done_* fields set was accepted");
  });

  test("the RD reopens it", async () => {
    const { data, error } = await rd
      .from("maintenance_requests")
      .update({ status: "open", done_by: null, done_at: null })
      .eq("id", requestId)
      .select("status, done_by, done_at")
      .single();
    assert.equal(error, null, error?.message);
    assert.equal(data.status, "open");
    assert.equal(data.done_by, null);
    assert.equal(data.done_at, null);
  });
});

describe("nothing is deletable", () => {
  test("staff cannot delete — RA or RD", async () => {
    for (const [who, client] of [["RA", ra], ["RD", rd]]) {
      const { data } = await client
        .from("maintenance_requests")
        .delete()
        .eq("id", requestId)
        .select();
      assert.equal(data?.length ?? 0, 0, `${who} deleted a request`);
    }
  });

  test("even the service role cannot delete", async () => {
    const { error, data } = await admin
      .from("maintenance_requests")
      .delete()
      .eq("id", requestId)
      .select();
    assert.ok(
      error !== null || (data?.length ?? 0) === 0,
      "service_role deleted a request — the grant should not exist",
    );
  });
});
