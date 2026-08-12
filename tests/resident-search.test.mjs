// Resident search. Two halves:
//
//   1. The matcher itself — pure, no database, runs anywhere.
//   2. What a real session can actually reach — the part that matters for
//      FERPA. Search must return exactly what the roster returns, so these
//      run the search query as an RA and compare it against the roster's own
//      view rather than against a hand-written expectation.
//
// The second half needs the fixture project (see docs/SETUP.md).

import { test, before, describe } from "node:test";
import assert from "node:assert/strict";
import {
  classifyQuery,
  matchesResident,
  searchIn,
  SEARCH_LIMIT,
} from "../src/lib/resident-search.ts";
import {
  adminClient,
  staffClient,
  assertSeededDevDatabase,
  currentTerm,
  RA_EMAIL,
} from "./helpers.mjs";

const PEOPLE = [
  { full_name: "Otávio Marini", student_id: "S1000101" },
  { full_name: "Sample Suzuki", student_id: "S1000103" },
  { full_name: "Testy McTestface", student_id: "1154098" },
];

describe("what the query means", () => {
  test("all digits is a student ID; anything else is a name", () => {
    assert.equal(classifyQuery("1154").kind, "student_id");
    assert.equal(classifyQuery("  1154  ").kind, "student_id");
    assert.equal(classifyQuery("marini").kind, "name");
    assert.equal(classifyQuery("S1000").kind, "name");
    assert.equal(classifyQuery("   ").kind, "empty");
  });

  test("an empty query matches nobody — not everybody", () => {
    assert.deepEqual(searchIn(PEOPLE, "").matches, []);
    assert.equal(matchesResident(PEOPLE[0], ""), false);
  });
});

describe("matching a name", () => {
  test("a partial matches anywhere in the name", () => {
    assert.ok(matchesResident(PEOPLE[1], "suzu"));
    assert.ok(matchesResident(PEOPLE[1], "Sample"));
  });

  test("case doesn't matter", () => {
    for (const q of ["SUZUKI", "suzuki", "SuZuKi"]) {
      assert.ok(matchesResident(PEOPLE[1], q), `"${q}" missed`);
    }
  });

  test("accents don't matter, in either direction", () => {
    // Typed without the accent, stored with it…
    assert.ok(matchesResident(PEOPLE[0], "otavio"));
    // …and typed with the accent against a name stored without one.
    assert.ok(matchesResident({ full_name: "Otavio Marini", student_id: "x" }, "Otávio"));
  });

  test("a name that isn't there doesn't match", () => {
    assert.equal(matchesResident(PEOPLE[1], "marini"), false);
  });
});

describe("matching a student ID", () => {
  test("a digit query matches on prefix", () => {
    assert.ok(matchesResident(PEOPLE[2], "115"));
    assert.ok(matchesResident(PEOPLE[2], "1154098"));
  });

  test("it is a PREFIX, not a substring", () => {
    assert.equal(matchesResident(PEOPLE[2], "4098"), false);
  });

  test("the digits match whether or not the ID carries a letter", () => {
    // Production IDs are bare digits; the fixture roster writes "S1000101".
    assert.ok(matchesResident(PEOPLE[0], "1000101"));
    assert.ok(matchesResident(PEOPLE[0], "10001"));
  });

  test("a digit query never falls through to names", () => {
    assert.equal(
      matchesResident({ full_name: "Room 1154", student_id: "9999999" }, "1154"),
      false,
    );
  });
});

describe("the result cap", () => {
  test("stops at SEARCH_LIMIT but reports the true total", () => {
    const many = Array.from({ length: SEARCH_LIMIT + 7 }, (_, i) => ({
      full_name: `Sample Person ${i}`,
      student_id: String(1000000 + i),
    }));
    const outcome = searchIn(many, "sample");
    assert.equal(outcome.matches.length, SEARCH_LIMIT);
    assert.equal(outcome.total, SEARCH_LIMIT + 7);
  });

  test("results come back alphabetically", () => {
    const outcome = searchIn(
      [
        { full_name: "Zed Zebra", student_id: "1" },
        { full_name: "Amy Apple", student_id: "2" },
      ],
      "a",
    );
    assert.deepEqual(
      outcome.matches.map((m) => m.full_name),
      ["Amy Apple", "Zed Zebra"],
    );
  });
});

// ---------------------------------------------------------------------------
// Against a live database, as a real RA session.
//
// The setup hook lives inside the describe below, not at the top of the file:
// a top-level `before` that throws cancels every test in the file, and the
// matcher tests above have no business needing a database to run.
// ---------------------------------------------------------------------------

let admin, ra, term;

/** Exactly the read src/app/(app)/search/actions.ts performs. */
async function searchAs(client) {
  const { data } = await client.from("rooms").select(
    `room_number, hallways ( name ),
     current_residents ( id, full_name, student_id, occupancy_status, is_present )`,
  );
  return (data ?? []).flatMap((room) =>
    room.current_residents.map((r) => ({
      ...r,
      room_number: room.room_number,
      hallway_name: room.hallways?.name ?? null,
    })),
  );
}

describe("against a live database", () => {
  before(async () => {
    await assertSeededDevDatabase();
    admin = adminClient();
    ({ client: ra } = await staffClient(RA_EMAIL));
    term = await currentTerm();
  });

describe("only this term's residents are searchable", () => {
  test("a stay in another term is not reachable by search", async () => {
    const { data: person } = await admin
      .from("people")
      .select("id, full_name, student_id")
      .eq("student_id", "S1000104")
      .single();

    // Park this person's stay in a term that isn't the current one, which is
    // what an old semester looks like.
    const { data: stay } = await admin
      .from("occupancies")
      .select("id, term")
      .eq("person_id", person.id)
      .eq("term", term)
      .single();

    await admin
      .from("occupancies")
      .update({ term: `${term} ARCHIVE-PROBE` })
      .eq("id", stay.id);
    try {
      const found = searchIn(await searchAs(ra), person.full_name);
      assert.equal(
        found.matches.some((m) => m.id === stay.id),
        false,
        "a stay outside the current term turned up in search",
      );
    } finally {
      await admin
        .from("occupancies")
        .update({ term: stay.term })
        .eq("id", stay.id);
    }

    // …and it comes back once the stay is in the current term again.
    const back = searchIn(await searchAs(ra), person.full_name);
    assert.ok(
      back.matches.some((m) => m.id === stay.id),
      "restoring the term did not make the resident searchable again",
    );
  });

  test("an archived stay is not reachable either", async () => {
    const { data: stay } = await admin
      .from("occupancies")
      .select("id, person_id, is_archived, people ( full_name )")
      .eq("term", term)
      .eq("is_archived", false)
      .limit(1)
      .single();

    await admin
      .from("occupancies")
      .update({ is_archived: true })
      .eq("id", stay.id);
    try {
      const found = searchIn(await searchAs(ra), stay.people.full_name);
      assert.equal(
        found.matches.some((m) => m.id === stay.id),
        false,
        "an archived stay turned up in search",
      );
    } finally {
      await admin
        .from("occupancies")
        .update({ is_archived: false })
        .eq("id", stay.id);
    }
  });
});

describe("search sees exactly what the roster sees — no more", () => {
  // The point of this file. Search adds no view, function or policy, so an
  // RA's results must equal the roster's own rows for the same session. If a
  // future change widens search, these two sets diverge and this fails.
  test("an RA's search set equals the RA's current_residents set", async () => {
    const searchable = await searchAs(ra);
    const { data: roster } = await ra.from("current_residents").select("id");

    assert.deepEqual(
      searchable.map((r) => r.id).sort(),
      (roster ?? []).map((r) => r.id).sort(),
      "search reaches a different set of residents than the roster does",
    );
  });

  test("an RA and the RD reach the same residents — access is not scoped by role", async () => {
    // Documented in CLAUDE.md: role gates WRITES to the roster, never reads,
    // and there is no hallway scoping. If that ever changes, search must
    // change with it — this test is the tripwire.
    const { client: rd } = await staffClient("rd@tudor.test");
    const asRa = (await searchAs(ra)).map((r) => r.id).sort();
    const asRd = (await searchAs(rd)).map((r) => r.id).sort();
    assert.deepEqual(asRa, asRd);
  });

  test("the search read is refused without a session", async () => {
    const { anonClient } = await import("./helpers.mjs");
    const rows = await searchAs(anonClient());
    assert.equal(rows.length, 0, "anon reached resident rows through search");
  });
});

});
