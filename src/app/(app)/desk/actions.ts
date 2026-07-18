"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { OccupancyEventType } from "@/lib/types";

export type OccupancyResult = { ok: true } | { ok: false; error: string };

/**
 * Record a check-in or check-out for any resident. Goes through the
 * record_occupancy RPC, which appends the event AND advances the
 * residents cache (occupancy_status + is_present) atomically — so any staff
 * (not just the RD) can do it without a direct residents UPDATE.
 */
export async function recordOccupancy(
  residentId: string,
  type: OccupancyEventType,
  hallwayId: string | null,
): Promise<OccupancyResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("record_occupancy", {
    target_resident: residentId,
    event_type: type,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/desk");
  revalidatePath("/"); // dashboard checked-in / expected counts
  if (hallwayId) revalidatePath(`/hallways/${hallwayId}`);
  return { ok: true };
}
