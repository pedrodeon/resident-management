"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type PresenceResult = { ok: true } | { ok: false; error: string };

/**
 * Flip one stay's presence. Goes through the set_presence RPC, which updates
 * is_present AND writes the audit event atomically (RAs can't UPDATE
 * occupancies directly). Revalidates the hallway and dashboard so their
 * away-counts refresh.
 */
export async function togglePresence(
  occupancyId: string,
  makePresent: boolean,
  hallwayId: string,
): Promise<PresenceResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_presence", {
    target_occupancy: occupancyId,
    make_present: makePresent,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/hallways/${hallwayId}`);
  revalidatePath("/");
  return { ok: true };
}

/**
 * Mark every checked-in resident in a hallway present or away in one call. The
 * RPC logs an event only where the value actually changed, and only touches
 * current-term, non-archived stays.
 */
export async function bulkSetPresence(
  hallwayId: string,
  makePresent: boolean,
): Promise<PresenceResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_presence_bulk", {
    target_hallway: hallwayId,
    make_present: makePresent,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/hallways/${hallwayId}`);
  revalidatePath("/");
  return { ok: true };
}
