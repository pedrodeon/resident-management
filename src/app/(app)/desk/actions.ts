"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { OccupancyEventType } from "@/lib/types";

export type OccupancyResult = { ok: true } | { ok: false; error: string };

/**
 * Record a check-in or check-out for one stay. Goes through the
 * record_occupancy RPC, which appends the event AND advances the occupancy
 * cache (occupancy_status + is_present) atomically — so any staff (not just the
 * RD) can do it without a direct occupancies UPDATE. The RPC also enforces the
 * signed-inspection gate.
 */
export async function recordOccupancy(
  occupancyId: string,
  type: OccupancyEventType,
  hallwayId: string | null,
): Promise<OccupancyResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("record_occupancy", {
    target_occupancy: occupancyId,
    event_type: type,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/desk");
  revalidatePath("/"); // dashboard checked-in / expected counts
  if (hallwayId) revalidatePath(`/hallways/${hallwayId}`);
  return { ok: true };
}
