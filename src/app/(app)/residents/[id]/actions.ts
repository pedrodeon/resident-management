"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ReassignResult = { ok: true } | { ok: false; error: string };

/**
 * Move a stay to another room via the reassign_room RPC (RD-only; the RPC
 * enforces it and writes the room_change_event atomically). The stay itself
 * continues — a room move mid-term is a change to one occupancy, not a new one.
 */
export async function reassignRoom(
  occupancyId: string,
  toRoomId: string,
  reason: string,
): Promise<ReassignResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("reassign_room", {
    target_occupancy: occupancyId,
    to_room: toRoomId,
    reason: reason.trim() || null,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/residents/${occupancyId}`);
  revalidatePath("/"); // dashboard counts by hallway
  return { ok: true };
}
