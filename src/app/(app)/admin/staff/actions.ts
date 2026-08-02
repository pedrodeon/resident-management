"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStaffContext } from "@/lib/auth";
import type { StaffRole } from "@/lib/types";

export type ActionResult = { ok: true } | { ok: false; error: string };
export type InviteResult =
  | { ok: true; tempPassword: string; email: string }
  | { ok: false; error: string };

/**
 * Invite a staff member. Creating an auth user needs the service-role admin
 * client, which bypasses RLS — so we verify the CALLER is the RD ourselves
 * before using it. Dev has no SMTP, so we set a generated temp password and
 * return it to show once. Production should switch to inviteUserByEmail once
 * an SMTP provider is configured in Supabase.
 */
export async function inviteStaff(
  name: string,
  email: string,
  role: StaffRole,
): Promise<InviteResult> {
  const caller = await getStaffContext();
  if (!caller || caller.role !== "rd") {
    return { ok: false, error: "Only the RD may invite staff." };
  }
  const cleanName = name.trim();
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanName || !cleanEmail) {
    return { ok: false, error: "Name and email are required." };
  }

  const admin = createAdminClient();
  const tempPassword = `Tudor-${randomUUID().slice(0, 8)}`;

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: cleanEmail,
    password: tempPassword,
    email_confirm: true,
  });
  if (createErr || !created?.user) {
    return { ok: false, error: createErr?.message ?? "Could not create the account." };
  }

  const { error: rowErr } = await admin
    .from("users")
    // must_change_password: the account starts on a relayed temp password,
    // so the app forces a personal one on first login — same rule as the
    // seed-ra-accounts script.
    .insert({
      id: created.user.id,
      name: cleanName,
      email: cleanEmail,
      role,
      must_change_password: true,
    });
  if (rowErr) {
    // Roll back the orphaned auth user so a retry can reuse the email.
    await admin.auth.admin.deleteUser(created.user.id);
    return { ok: false, error: rowErr.message };
  }

  revalidatePath("/admin/staff");
  return { ok: true, tempPassword, email: cleanEmail };
}

export async function removeStaff(userId: string): Promise<ActionResult> {
  const caller = await getStaffContext();
  if (!caller || caller.role !== "rd") {
    return { ok: false, error: "Only the RD may remove staff." };
  }
  if (userId === caller.id) {
    return { ok: false, error: "You can't remove your own account." };
  }

  const admin = createAdminClient();
  // Deleting the auth user cascades to the public.users row (FK on delete).
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/staff");
  return { ok: true };
}

// Hallway coverage is RD-managed metadata; the RLS-scoped client enforces RD.
export async function setAssignment(
  userId: string,
  hallwayId: string,
  assigned: boolean,
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = assigned
    ? await supabase
        .from("hallway_assignments")
        .upsert({ user_id: userId, hallway_id: hallwayId }, { onConflict: "user_id,hallway_id", ignoreDuplicates: true })
    : await supabase
        .from("hallway_assignments")
        .delete()
        .eq("user_id", userId)
        .eq("hallway_id", hallwayId);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/staff");
  revalidatePath("/");
  return { ok: true };
}
