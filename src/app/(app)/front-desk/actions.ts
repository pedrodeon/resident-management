"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ShiftSlot } from "@/lib/desk-shifts";

export type ShiftResult = { ok: true } | { ok: false; error: string };

/*
 * Thin wrappers over the desk-shift RPCs. All the rules — staff-only, the
 * 24-hour lock, ownership, RD-only override — live in the database
 * (claim_desk_shift / set_desk_shift), so these just relay and revalidate.
 */

async function callRpc(
  fn:
    | "claim_desk_shift"
    | "set_desk_shift"
    | "request_shift_coverage"
    | "accept_shift_coverage",
  args: Record<string, unknown>,
): Promise<ShiftResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc(fn, args);
  if (error) return { ok: false, error: error.message };
  // Layout-wide: every shift mutation writes a notification, and the header
  // bell count renders in the layout.
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Claim an open shift for yourself (≥24 h before it starts). */
export async function claimShift(
  date: string,
  slot: ShiftSlot,
): Promise<ShiftResult> {
  return callRpc("claim_desk_shift", {
    target_date: date,
    target_slot: slot,
    claiming: true,
  });
}

/** Release a shift you claimed (≥24 h before it starts). */
export async function releaseShift(
  date: string,
  slot: ShiftSlot,
): Promise<ShiftResult> {
  return callRpc("claim_desk_shift", {
    target_date: date,
    target_slot: slot,
    claiming: false,
  });
}

/** RD only: assign any staff member (or null to clear), any time. */
export async function assignShift(
  date: string,
  slot: ShiftSlot,
  userId: string | null,
): Promise<ShiftResult> {
  return callRpc("set_desk_shift", {
    target_date: date,
    target_slot: slot,
    target_user: userId,
  });
}

/** Flag your own shift as needing cover — allowed any time before it starts. */
export async function requestCoverage(
  date: string,
  slot: ShiftSlot,
): Promise<ShiftResult> {
  return callRpc("request_shift_coverage", {
    target_date: date,
    target_slot: slot,
    requesting: true,
  });
}

/** Withdraw your own open coverage request (you stay assigned). */
export async function withdrawCoverage(
  date: string,
  slot: ShiftSlot,
): Promise<ShiftResult> {
  return callRpc("request_shift_coverage", {
    target_date: date,
    target_slot: slot,
    requesting: false,
  });
}

/** Take over a shift that needs cover — first come, first served. */
export async function acceptCoverage(
  date: string,
  slot: ShiftSlot,
): Promise<ShiftResult> {
  return callRpc("accept_shift_coverage", {
    target_date: date,
    target_slot: slot,
  });
}
