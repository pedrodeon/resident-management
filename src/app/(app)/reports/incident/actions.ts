"use server";

import { revalidatePath } from "next/cache";
import { getStaffContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type IncidentInput = {
  /** Optional room id; the room the incident happened in, if any. */
  roomId: string | null;
  date: string; // yyyy-mm-dd from <input type="date">
  time: string; // hh:mm from <input type="time">
  description: string;
  peopleInvolved: string;
  actionsTaken: string;
};

export type IncidentResult = { ok: true } | { ok: false; error: string };

/**
 * File an incident report. STORED, not e-mailed: the report is a row in
 * incident_reports and the RD is told through the in-app bell. The RPC writes
 * the report and its notification in one transaction, so an alert exists iff
 * the report does.
 *
 * Reading is RD-only at the database level (incident narratives name
 * students). Reports are not tied to a resident record; anyone involved is
 * named in the free-text fields.
 */
export async function submitIncident(
  input: IncidentInput,
): Promise<IncidentResult> {
  const staff = await getStaffContext();
  if (!staff) return { ok: false, error: "You're not signed in as staff." };

  const description = input.description.trim();
  const date = input.date.trim();
  const time = input.time.trim();
  if (!date || !time) {
    return { ok: false, error: "Date and time are required." };
  }
  if (!description) {
    return { ok: false, error: "Describe what happened." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("file_incident_report", {
    occurred_on: date,
    occurred_at: time,
    description,
    people_involved: input.peopleInvolved.trim() || null,
    actions_taken: input.actionsTaken.trim() || null,
    room_id: input.roomId,
  });
  if (error) return { ok: false, error: error.message };

  // The RD's bell badge lives in the app shell.
  revalidatePath("/", "layout");
  return { ok: true };
}
