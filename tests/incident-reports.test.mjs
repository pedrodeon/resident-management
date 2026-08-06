// Incident reports carry student-conduct narratives, so reading them is
// RD-only and the row is permanent. Maintenance requests became RD-only to
// read and close as well; any staff member still files both.

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

let admin, anon, ra, raId, rd, incidentId, requestId;

const today = new Date().toISOString().slice(0, 10);

before(async () => {
  await assertSeededDevDatabase();
  admin = adminClient();
  anon = anonClient();
  ({ client: ra, userId: raId } = await staffClient(RA_EMAIL));
  ({ client: rd } = await staffClient(RD_EMAIL));
});

after(async () => {
  // Nothing can delete an incident report — not even the service role — so the
  // suite's rows stay as history, like every other audit record.
});

describe("filing", () => {
  test("an RA files an incident report through the RPC", async () => {
    const { data, error } = await ra.rpc("file_incident_report", {
      occurred_on: today,
      occurred_at: "21:30",
      description: "Suite fixture — noise complaint (test suite row)",
      people_involved: "Fixture resident",
      actions_taken: "Spoke with the room",
    });
    assert.equal(error, null, error?.message);
    assert.ok(data, "the RPC returns the new id");
    incidentId = data;

    const { data: row } = await admin
      .from("incident_reports")
      .select("created_by, description")
      .eq("id", incidentId)
      .single();
    assert.equal(row.created_by, raId, "created_by is pinned to the caller");
  });

  test("filing writes an RD-addressed notification in the same transaction", async () => {
    const { data } = await admin
      .from("notifications")
      .select("type, audience, target_id, actor")
      .eq("target_id", incidentId)
      .single();
    assert.equal(data.type, "incident_filed");
    assert.equal(data.audience, "rd");
    assert.equal(data.actor, raId);
  });

  test("a blank description is refused", async () => {
    const { error } = await ra.rpc("file_incident_report", {
      occurred_on: today,
      occurred_at: "10:00",
      description: "   ",
    });
    assert.ok(error, "a blank incident report was accepted");
  });

  test("anon cannot file", async () => {
    const { error } = await anon.rpc("file_incident_report", {
      occurred_on: today,
      occurred_at: "10:00",
      description: "anon",
    });
    assert.ok(error, "anon filed an incident report");
  });
});

describe("reading is RD-only", () => {
  test("the RA who filed it cannot read it back", async () => {
    const { data, error } = await ra
      .from("incident_reports")
      .select("id, description");
    assert.ok(
      error !== null || (data?.length ?? 0) === 0,
      "an RA read incident reports",
    );
  });

  test("the RD reads them", async () => {
    const { data, error } = await rd
      .from("incident_reports")
      .select("id")
      .eq("id", incidentId);
    assert.equal(error, null, error?.message);
    assert.equal(data.length, 1);
  });

  test("anon reads nothing", async () => {
    const { data, error } = await anon.from("incident_reports").select("id").limit(1);
    assert.ok(error !== null || (data?.length ?? 0) === 0, "anon read reports");
  });
});

describe("incident reports are permanent", () => {
  test("nobody can edit one — RA or RD", async () => {
    for (const [who, client] of [["RA", ra], ["RD", rd]]) {
      const { data } = await client
        .from("incident_reports")
        .update({ description: "edited" })
        .eq("id", incidentId)
        .select();
      assert.equal(data?.length ?? 0, 0, `${who} edited an incident report`);
    }
  });

  test("nobody can delete one, service role included", async () => {
    const { data, error } = await admin
      .from("incident_reports")
      .delete()
      .eq("id", incidentId)
      .select();
    assert.ok(
      error !== null || (data?.length ?? 0) === 0,
      "an incident report was deleted",
    );
  });
});

describe("maintenance became RD-only", () => {
  test("an RA files a request", async () => {
    const { data, error } = await ra.rpc("file_maintenance_request", {
      location: "Suite fixture — stairwell",
      description: "Handrail loose (test suite row)",
      urgency: "normal",
    });
    assert.equal(error, null, error?.message);
    requestId = data;
  });

  test("the RA cannot read the queue", async () => {
    const { data, error } = await ra.from("maintenance_requests").select("id");
    assert.ok(
      error !== null || (data?.length ?? 0) === 0,
      "an RA read the maintenance queue",
    );
  });

  test("the RA cannot close a request", async () => {
    const { data } = await ra
      .from("maintenance_requests")
      .update({ status: "done", done_by: raId, done_at: new Date().toISOString() })
      .eq("id", requestId)
      .select();
    assert.equal(data?.length ?? 0, 0, "an RA closed a request");
  });

  test("the RD reads and closes it", async () => {
    const { data: read, error: readErr } = await rd
      .from("maintenance_requests")
      .select("id, status")
      .eq("id", requestId)
      .single();
    assert.equal(readErr, null, readErr?.message);
    assert.equal(read.status, "open");

    const { data: rdUser } = await admin
      .from("users")
      .select("id")
      .eq("email", RD_EMAIL)
      .single();
    const { error } = await rd
      .from("maintenance_requests")
      .update({ status: "done", done_by: rdUser.id, done_at: new Date().toISOString() })
      .eq("id", requestId);
    assert.equal(error, null, error?.message);
  });
});

describe("RD-addressed notifications stay with the RD", () => {
  test("an RA never sees them in the feed", async () => {
    const { data } = await ra
      .from("notifications")
      .select("id, type, audience")
      .in("type", ["incident_filed", "maintenance_filed"]);
    assert.equal(data?.length ?? 0, 0, "an RA saw RD-only notifications");
  });

  test("the RD does", async () => {
    const { data, error } = await rd
      .from("notifications")
      .select("id")
      .eq("target_id", incidentId);
    assert.equal(error, null, error?.message);
    assert.equal(data.length, 1);
  });
});
