"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ActionResult = { ok: true } | { ok: false; error: string };

export type ResidentInput = {
  full_name: string;
  student_id: string;
  room_id: string;
  phone: string;
  emergency_contact: string;
};

function clean(input: ResidentInput) {
  return {
    full_name: input.full_name.trim(),
    student_id: input.student_id.trim(),
    room_id: input.room_id,
    phone: input.phone.trim() || null,
    emergency_contact: input.emergency_contact.trim() || null,
  };
}

// All writes go through the RLS-scoped client — RLS enforces RD-only. The
// admin UI guard is defense-in-depth, not the security boundary.

export async function createResident(input: ResidentInput): Promise<ActionResult> {
  const row = clean(input);
  if (!row.full_name || !row.student_id || !row.room_id) {
    return { ok: false, error: "Name, student ID, and room are required." };
  }
  const supabase = await createClient();
  // New residents start `expected` (the default), pre-move-in.
  const { error } = await supabase.from("residents").insert(row);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/residents");
  revalidatePath("/");
  return { ok: true };
}

export async function updateResident(
  id: string,
  input: ResidentInput,
): Promise<ActionResult> {
  const row = clean(input);
  if (!row.full_name || !row.student_id || !row.room_id) {
    return { ok: false, error: "Name, student ID, and room are required." };
  }
  const supabase = await createClient();
  const { error } = await supabase.from("residents").update(row).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/residents");
  revalidatePath("/");
  return { ok: true };
}

export async function deleteResident(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("residents").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/residents");
  revalidatePath("/");
  return { ok: true };
}
