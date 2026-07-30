"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function createRoom(
  hallwayId: string,
  roomNumber: string,
  capacity: number,
): Promise<ActionResult> {
  if (!hallwayId || !roomNumber.trim()) {
    return { ok: false, error: "Hallway and room number are required." };
  }
  if (!Number.isInteger(capacity) || capacity < 1) {
    return { ok: false, error: "Capacity must be at least 1." };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("rooms")
    .insert({ hallway_id: hallwayId, room_number: roomNumber.trim(), capacity });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/rooms");
  return { ok: true };
}

export async function updateRoom(
  id: string,
  roomNumber: string,
  capacity: number,
): Promise<ActionResult> {
  if (!roomNumber.trim()) return { ok: false, error: "Room number is required." };
  if (!Number.isInteger(capacity) || capacity < 1) {
    return { ok: false, error: "Capacity must be at least 1." };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("rooms")
    .update({ room_number: roomNumber.trim(), capacity })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/rooms");
  return { ok: true };
}

export async function deleteRoom(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("rooms").delete().eq("id", id);
  // FK from occupancies.room_id blocks deleting a room with any stay attached,
  // including archived ones — surface it.
  if (error) {
    return {
      ok: false,
      error: error.message.includes("foreign key")
        ? "Can't delete a room that still has stays attached — including past or archived ones. Reassign the current residents first."
        : error.message,
    };
  }
  revalidatePath("/admin/rooms");
  return { ok: true };
}
