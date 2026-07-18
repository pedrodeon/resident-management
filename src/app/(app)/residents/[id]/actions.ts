"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ReassignResult = { ok: true } | { ok: false; error: string };

/**
 * Move a resident to another room via the reassign_room RPC (RD-only; the RPC
 * enforces it and writes the room_change_event atomically).
 */
export async function reassignRoom(
  residentId: string,
  toRoomId: string,
  reason: string,
): Promise<ReassignResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("reassign_room", {
    target_resident: residentId,
    to_room: toRoomId,
    reason: reason.trim() || null,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/residents/${residentId}`);
  revalidatePath("/"); // dashboard counts by hallway
  return { ok: true };
}
