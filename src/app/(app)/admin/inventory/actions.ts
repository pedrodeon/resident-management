"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function createItem(name: string, sortOrder: number): Promise<ActionResult> {
  if (!name.trim()) return { ok: false, error: "Name is required." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("inventory_items")
    .insert({ name: name.trim(), sort_order: sortOrder });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/inventory");
  return { ok: true };
}

export async function updateItem(id: string, name: string, sortOrder: number): Promise<ActionResult> {
  if (!name.trim()) return { ok: false, error: "Name is required." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("inventory_items")
    .update({ name: name.trim(), sort_order: sortOrder })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/inventory");
  return { ok: true };
}

export async function deleteItem(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("inventory_items").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/inventory");
  return { ok: true };
}
