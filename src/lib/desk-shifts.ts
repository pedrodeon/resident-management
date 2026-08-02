/*
 * Front-desk shift slots — the app-side mirror of desk_shift_start() in the
 * database (supabase/migrations/20260802164833_desk_shifts.sql). Two fixed
 * evening shifts, one RA each. If these windows ever change, change both
 * places together.
 */

export type ShiftSlot = 1 | 2;

export const SHIFT_SLOTS = [
  { slot: 1 as ShiftSlot, label: "6–8 PM", short: "6–8", startHour: 18 },
  { slot: 2 as ShiftSlot, label: "8–10 PM", short: "8–10", startHour: 20 },
] as const;

/** "2026-08" → { year, month } (month 1–12), or null if malformed. */
export function parseMonthParam(
  value: string | undefined,
): { year: number; month: number } | null {
  if (!value || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return null;
  const [year, month] = value.split("-").map(Number);
  return { year, month };
}

export function monthParam(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

/** Shift a { year, month } by +1 / -1 months. */
export function addMonths(year: number, month: number, delta: 1 | -1) {
  const d = new Date(year, month - 1 + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

/** Local date key "YYYY-MM-DD" — string math only, no timezone conversion. */
export function dateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

const MONTH_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/**
 * "2026-08-20" + slot → "Aug 20 · 8–10 PM". String parsing on purpose:
 * `new Date("2026-08-20")` is UTC midnight and shifts a day in Chicago.
 */
export function shiftLabel(date: string, slot: number): string {
  const [, m, d] = date.split("-").map(Number);
  const slotLabel = SHIFT_SLOTS.find((s) => s.slot === slot)?.label ?? `slot ${slot}`;
  return `${MONTH_SHORT[m - 1]} ${d} · ${slotLabel}`;
}
