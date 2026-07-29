"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getStaffContext } from "@/lib/auth";
import type { Rating } from "@/lib/types";

export type RoomCheckInput = {
  roomId: string;
  floor_cleanliness: Rating;
  trash: Rating;
  laundry: Rating;
  overall: Rating;
  notes: string;
  prohibited_items: string;
};

const RATINGS = ["floor_cleanliness", "trash", "laundry", "overall"] as const;

/**
 * Record a weekly room check. Direct insert under the caller's RLS — the
 * policy requires checked_by = auth.uid(), so a check is always attributed to
 * whoever actually submitted it.
 */
export async function createRoomCheck(
  input: RoomCheckInput,
): Promise<{ ok: false; error: string }> {
  for (const field of RATINGS) {
    const value = input[field];
    if (!Number.isInteger(value) || value < 1 || value > 5) {
      return { ok: false, error: "Every rating must be between 1 and 5." };
    }
  }

  const staff = await getStaffContext();
  if (!staff) return { ok: false, error: "Not signed in as staff." };

  const supabase = await createClient();
  const { data: check, error } = await supabase
    .from("room_checks")
    .insert({
      room_id: input.roomId,
      checked_by: staff.id,
      floor_cleanliness: input.floor_cleanliness,
      trash: input.trash,
      laundry: input.laundry,
      overall: input.overall,
      notes: input.notes.trim() || null,
      prohibited_items: input.prohibited_items.trim() || null,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/rooms/${input.roomId}`);
  redirect(`/room-checks/${check.id}`);
}
