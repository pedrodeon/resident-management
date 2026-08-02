import "server-only";

import { createClient } from "@supabase/supabase-js";

/*
 * The RA weekly report: per-RA counts of room checks and front-desk shifts
 * for one calendar week (Sunday–Saturday, America/Chicago — the building's
 * clock, same as desk_shift_start()). Staff names and counts ONLY; no
 * resident data ever enters this report.
 *
 * ONE build function, two triggers: the RD's on-demand Admin screen and the
 * scheduled cron route both call buildRaWeeklyReport + reportEmailText, so
 * the two can never drift apart.
 *
 * Reads use the service-role key: the cron has no user session, and the
 * on-demand server action verifies role === 'rd' before calling. This module
 * is `server-only`, so the key cannot leak into client bundles.
 */

export type RaReportRow = {
  name: string;
  roomChecks: number;
  deskShifts: number;
};

export type RaReport = {
  /** Sunday, YYYY-MM-DD (Chicago calendar). */
  weekStart: string;
  /** Saturday, YYYY-MM-DD. */
  weekEnd: string;
  rows: RaReportRow[];
  totals: { roomChecks: number; deskShifts: number };
};

/** No automatic report before this Saturday — move-in week data is noise. */
export const FIRST_SCHEDULED_REPORT = "2026-08-22";

const TZ = "America/Chicago";

// ---------------------------------------------------------------------------
// Chicago calendar math (no TZ library; Chicago is only ever UTC-5 or UTC-6)
// ---------------------------------------------------------------------------

/** Today's date/hour on the building's clock, wherever the server runs. */
export function chicagoNow(): { date: string; hour: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    hour: Number(get("hour")),
  };
}

/** Add days to a plain YYYY-MM-DD (pure calendar math, timezone-free). */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Normalize any date to its week's Sunday (weekday of a date is TZ-free). */
export function weekStartOf(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return addDays(date, -new Date(Date.UTC(y, m - 1, d)).getUTCDay());
}

/** The current Chicago week's Sunday — the default report week. */
export function currentChicagoWeekStart(): string {
  return weekStartOf(chicagoNow().date);
}

/**
 * Midnight Chicago on a given date, as a real instant. Tries both offsets
 * the zone can have and keeps the one that round-trips — DST-correct
 * without a timezone library.
 */
function chicagoMidnight(date: string): Date {
  for (const offset of ["-05:00", "-06:00"]) {
    const candidate = new Date(`${date}T00:00:00${offset}`);
    const hour = new Intl.DateTimeFormat("en-US", {
      timeZone: TZ,
      hour: "2-digit",
      hourCycle: "h23",
    }).format(candidate);
    if (hour === "00") return candidate;
  }
  // Unreachable for America/Chicago; fail loud rather than mis-window.
  throw new Error(`Could not resolve Chicago midnight for ${date}`);
}

// ---------------------------------------------------------------------------
// The report
// ---------------------------------------------------------------------------

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function buildRaWeeklyReport(weekStart: string): Promise<RaReport> {
  const start = weekStartOf(weekStart); // tolerate any day of the week
  const end = addDays(start, 6);
  const supabase = serviceClient();

  // Room checks are timestamptz — window on real Chicago instants.
  const fromInstant = chicagoMidnight(start).toISOString();
  const toInstant = chicagoMidnight(addDays(start, 7)).toISOString();

  const [ras, checks, shifts] = await Promise.all([
    supabase.from("users").select("id, name").eq("role", "ra").order("name"),
    supabase
      .from("room_checks")
      .select("checked_by")
      .gte("timestamp", fromInstant)
      .lt("timestamp", toInstant),
    supabase
      .from("desk_shifts")
      .select("claimed_by")
      .gte("shift_date", start)
      .lte("shift_date", end)
      .not("claimed_by", "is", null),
  ]);
  const firstError = ras.error ?? checks.error ?? shifts.error;
  if (firstError) throw new Error(`Report query failed: ${firstError.message}`);

  const countBy = (rows: Record<string, unknown>[], key: string) => {
    const counts = new Map<string, number>();
    for (const row of rows) {
      const id = row[key] as string | null;
      if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    return counts;
  };
  const checkCounts = countBy(checks.data ?? [], "checked_by");
  const shiftCounts = countBy(shifts.data ?? [], "claimed_by");

  // Every RA appears — zeros are the report's point as much as the numbers.
  const rows: RaReportRow[] = (ras.data ?? []).map((ra) => ({
    name: ra.name,
    roomChecks: checkCounts.get(ra.id) ?? 0,
    deskShifts: shiftCounts.get(ra.id) ?? 0,
  }));

  return {
    weekStart: start,
    weekEnd: end,
    rows,
    totals: {
      roomChecks: rows.reduce((n, r) => n + r.roomChecks, 0),
      deskShifts: rows.reduce((n, r) => n + r.deskShifts, 0),
    },
  };
}

/** "Aug 16 – Aug 22, 2026" */
export function weekLabel(report: Pick<RaReport, "weekStart" | "weekEnd">): string {
  const fmt = (date: string) => {
    const [y, m, d] = date.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
  };
  return `${fmt(report.weekStart)} – ${fmt(report.weekEnd)}, ${report.weekEnd.slice(0, 4)}`;
}

/** Plain text on purpose — reads identically in every mail client. */
export function reportEmailText(report: RaReport): string {
  const nameWidth = Math.max(...report.rows.map((r) => r.name.length), 5);
  const line = (name: string, checks: string | number, shifts: string | number) =>
    `${name.padEnd(nameWidth)}  ${String(checks).padStart(11)}  ${String(shifts).padStart(11)}`;

  return [
    `RA WEEKLY REPORT — Tudor Hall`,
    `Week of ${weekLabel(report)} (Sun–Sat)`,
    ``,
    line("RA", "Room checks", "Desk shifts"),
    line("-".repeat(nameWidth), "-".repeat(11), "-".repeat(11)),
    ...report.rows.map((r) => line(r.name, r.roomChecks, r.deskShifts)),
    line("-".repeat(nameWidth), "-".repeat(11), "-".repeat(11)),
    line("Total", report.totals.roomChecks, report.totals.deskShifts),
    ``,
    `Staff activity counts only — no resident data.`,
    `— Sent by the Tudor Hall app.`,
  ].join("\n");
}
