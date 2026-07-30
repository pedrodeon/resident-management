"use server";

import { getStaffContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { recipientsFromEnv, sendEmail } from "@/lib/email";

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
 * File an incident report. EMAIL ONLY, by design: incident narratives can
 * concern named students, so nothing is written to the database — the report
 * goes to the incident recipients (INCIDENT_EMAIL_TO), cc the filer, reply-to
 * the filer. The filer is the logged-in staff member, never a form field.
 * Reports are not tied to a resident record; anyone involved is named in the
 * free-text fields.
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

  // Resolve the optional room server-side under the caller's RLS, so the
  // email names a real room rather than trusting a client-sent label.
  let roomLine = "—";
  if (input.roomId) {
    const supabase = await createClient();
    const { data: room } = await supabase
      .from("rooms")
      .select(`room_number, hallways ( name )`)
      .eq("id", input.roomId)
      .single()
      .overrideTypes<{
        room_number: string;
        hallways: { name: string } | null;
      }>();
    if (room) {
      roomLine = `${room.hallways?.name ?? "?"} · Room ${room.room_number}`;
    }
  }

  const filerLine = staff.email
    ? `${staff.name} (${staff.role.toUpperCase()}, ${staff.email})`
    : `${staff.name} (${staff.role.toUpperCase()})`;

  const text = [
    `INCIDENT REPORT — Tudor Hall`,
    ``,
    `Filed by:        ${filerLine}`,
    `Date of incident: ${date} at ${time}`,
    `Room:            ${roomLine}`,
    ``,
    `What happened:`,
    description,
    ``,
    `People involved:`,
    input.peopleInvolved.trim() || "—",
    ``,
    `Actions taken:`,
    input.actionsTaken.trim() || "—",
    ``,
    `— Filed through the Tudor Hall app. Reply goes to the filer.`,
  ].join("\n");

  return sendEmail({
    to: recipientsFromEnv("INCIDENT_EMAIL_TO"),
    cc: staff.email ? [staff.email] : undefined,
    replyTo: staff.email ?? undefined,
    subject: `Incident report — Tudor Hall — ${date}`,
    text,
  });
}
