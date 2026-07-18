"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { InspectionType, ItemCondition } from "@/lib/types";

export type InspectionItemInput = {
  item_id: string;
  condition: ItemCondition;
  note: string;
};

export type CreateInspectionInput = {
  roomId: string;
  residentId: string | null;
  type: InspectionType;
  notes: string;
  items: InspectionItemInput[];
};

/**
 * Create an immutable inspection snapshot (header + all 12 items) via the
 * create_inspection RPC, which writes them atomically. On success, redirect to
 * the read-only snapshot.
 */
export async function createInspection(
  input: CreateInspectionInput,
): Promise<{ ok: false; error: string }> {
  const supabase = await createClient();
  const { data: inspectionId, error } = await supabase.rpc("create_inspection", {
    target_room: input.roomId,
    target_resident: input.residentId,
    inspection_type: input.type,
    inspection_notes: input.notes.trim() || null,
    items: input.items.map((i) => ({
      item_id: i.item_id,
      condition: i.condition,
      note: i.note,
    })),
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/rooms/${input.roomId}`);
  redirect(`/inspections/${inspectionId}`);
}
