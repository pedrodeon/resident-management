import "server-only";

import { createClient } from "@supabase/supabase-js";

/*
 * The RA weekly report: per-RA counts of room checks and front-desk shifts
 * for one calendar week (Monday–Sunday, America/Chicago — the building's
 * clock, same as desk_shift_start()). Staff names and counts ONLY; no
 * resident data ever enters this report.
 *
 * On-demand only. The RD opens Admin → Reports and picks a week; nothing is
 * sent, scheduled, or emailed anywhere.
 *
 * Reads use the service-role key, so the ONE caller — the reports page —
 * verifies role === 'rd' before rendering. This module is `server-only`, so
 * the key cannot leak into client bundles.
 */

export type RaReportRow = {
  name: string;
  roomChecks: number;
  deskShifts: number;
};

export type RaReport = {
  /** Monday, YYYY-MM-DD (Chicago calendar). */
  weekStart: string;
  /** Sunday, YYYY-MM-DD. */
  weekEnd: string;
  rows: RaReportRow[];
  totals: { roomChecks: number; deskShifts: number };
};

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

/** Normalize any date to its week's Monday (weekday of a date is TZ-free). */
export function weekStartOf(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  // getUTCDay(): 0 = Sunday … 6 = Saturday. Shift so Monday is 0 and Sunday
  // is 6, which puts Sunday at the END of its week rather than the start.
  const dayFromMonday = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
  return addDays(date, -dayFromMonday);
}

/** The current Chicago week's Monday — the default report week. */
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
