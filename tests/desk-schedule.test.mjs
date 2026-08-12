// Which nights the desk is staffed. The rule lives in DESK_SCHEDULE and is
// read by both the calendar and the server actions, so these tests exercise
// the one function they both call rather than either caller.
//
// No database: this file runs even without the fixture project.
//
// Dates below are August 2026, whose weekdays are:
//   Mon 3 · Tue 4 · Wed 5 · Thu 6 · Fri 7 · Sat 8 · Sun 9

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  DESK_SCHEDULE,
  isShiftAllowed,
  scheduleRefusal,
  scheduleSummary,
  slotsOn,
  weekdayOf,
} from "../src/lib/desk-shifts.ts";

const MON = "2026-08-03";
const TUE = "2026-08-04";
const WED = "2026-08-05";
const THU = "2026-08-06";
const FRI = "2026-08-07";
const SAT = "2026-08-08";
const SUN = "2026-08-09";

describe("the dates these tests assume", () => {
  test("land on the weekdays they are named for", () => {
    for (const [date, day] of [
      [SUN, 0], [MON, 1], [TUE, 2], [WED, 3], [THU, 4], [FRI, 5], [SAT, 6],
    ]) {
      assert.equal(weekdayOf(date), day, `${date} is not weekday ${day}`);
    }
  });
});

describe("nights that are staffed", () => {
  test("Monday, Thursday and Friday run both shifts", () => {
    for (const date of [MON, THU, FRI]) {
      assert.ok(isShiftAllowed(date, 1), `${date} 6–8 should be claimable`);
      assert.ok(isShiftAllowed(date, 2), `${date} 8–10 should be claimable`);
    }
  });

  test("Tuesday runs the late shift only", () => {
    assert.ok(isShiftAllowed(TUE, 2), "Tue 8–10 should be claimable");
    assert.equal(isShiftAllowed(TUE, 1), false, "Tue 6–8 was accepted");
    assert.deepEqual([...slotsOn(TUE)], [2]);
  });
});

describe("nights that are not", () => {
  test("Wednesday, Saturday and Sunday have no claimable slots", () => {
    for (const date of [WED, SAT, SUN]) {
      assert.deepEqual([...slotsOn(date)], [], `${date} offered slots`);
      assert.equal(isShiftAllowed(date, 1), false, `${date} 6–8 was accepted`);
      assert.equal(isShiftAllowed(date, 2), false, `${date} 8–10 was accepted`);
    }
  });

  test("an unknown slot number is never allowed", () => {
    assert.equal(isShiftAllowed(MON, 3), false);
  });

  test("the refusal names the night and the schedule", () => {
    const message = scheduleRefusal(WED, 1);
    assert.match(message, /Wed/);
    assert.match(message, /6–8 PM/);
    assert.match(message, /no shifts Wed, Sat, Sun/);
  });
});

describe("the header sentence", () => {
  // The screen prints this rather than a hand-written line, so it cannot
  // drift from the config above.
  test("groups nights that share the same slots, Monday first", () => {
    assert.equal(
      scheduleSummary(),
      "Mon, Thu, Fri: 6–8 PM and 8–10 PM · Tue: 8–10 PM · no shifts Wed, Sat, Sun",
    );
  });
});

describe("the config itself", () => {
  test("covers all seven weekdays", () => {
    for (let day = 0; day < 7; day++) {
      assert.ok(
        Array.isArray(DESK_SCHEDULE[day]),
        `weekday ${day} is missing from DESK_SCHEDULE`,
      );
    }
  });

  test("names only real slots", () => {
    for (const slots of Object.values(DESK_SCHEDULE)) {
      for (const slot of slots) {
        assert.ok(slot === 1 || slot === 2, `unknown slot ${slot}`);
      }
    }
  });
});
