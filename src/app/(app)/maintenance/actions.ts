"use server";

import { revalidatePath } from "next/cache";
import { getStaffContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { recipientsFromEnv, sendEmail } from "@/lib/email";

export type Urgency = "low" | "normal" | "high";

export type MaintenanceInput = {
  location: string;
  date: string; // yyyy-mm-dd
  description: string;
  urgency: Urgency;
};

export type MaintenanceResult =
  | { ok: true; emailWarning: string | null }
  | { ok: false; error: string };

/**
 * File a maintenance request: the DB row first, then the email. In that order
 * on purpose — if the email fails (unconfigured key, provider outage), the
 * request still exists on the list and the filer is told exactly that, instead
 * of the report vanishing.
 */
export async function submitMaintenance(
  input: MaintenanceInput,
): Promise<MaintenanceResult> {
  const staff = await getStaffContext();
  if (!staff) return { ok: false, error: "You're not signed in as staff." };

  const location = input.location.trim();
  const description = input.description.trim();
  const date = input.date.trim();
  if (!location) return { ok: false, error: "Say where the problem is." };
  if (!description) return { ok: false, error: "Describe what's broken." };
  if (!["low", "normal", "high"].includes(input.urgency)) {
    return { ok: false, error: "Pick an urgency." };
  }

  // RLS pins created_by to the caller; forging another id is rejected there.
  const supabase = await createClient();
  const { error: insertError } = await supabase
    .from("maintenance_requests")
    .insert({
      location,
      description,
      urgency: input.urgency,
      created_by: staff.id,
    });
  if (insertError) return { ok: false, error: insertError.message };

  revalidatePath("/maintenance");

  const filerLine = staff.email
    ? `${staff.name} (${staff.role.toUpperCase()}, ${staff.email})`
    : `${staff.name} (${staff.role.toUpperCase()})`;
  const text = [
    `MAINTENANCE REQUEST — Tudor Hall`,
    ``,
    `Filed by:  ${filerLine}`,
    `Date:      ${date || "today"}`,
    `Location:  ${location}`,
    `Urgency:   ${input.urgency.toUpperCase()}`,
    ``,
    `What's broken:`,
    description,
    ``,
    `— Filed through the Tudor Hall app; tracked on its maintenance list.`,
  ].join("\n");

  const email = await sendEmail({
    to: recipientsFromEnv("RD_EMAIL"),
    cc: staff.email ? [staff.email] : undefined,
    replyTo: staff.email ?? undefined,
    subject: `Maintenance request — Tudor Hall — ${location}`,
    text,
  });

  // Saved either way; be precise about what did and didn't happen.
  return { ok: true, emailWarning: email.ok ? null : email.error };
}

/** Close or reopen a request. Any staff member — whoever fixed it marks it. */
export async function setMaintenanceStatus(
  id: string,
  status: "open" | "done",
): Promise<{ ok: true } | { ok: false; error: string }> {
  const staff = await getStaffContext();
  if (!staff) return { ok: false, error: "You're not signed in as staff." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("maintenance_requests")
    .update(
      status === "done"
        ? { status, done_by: staff.id, done_at: new Date().toISOString() }
        : { status, done_by: null, done_at: null },
    )
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/maintenance");
  return { ok: true };
}
