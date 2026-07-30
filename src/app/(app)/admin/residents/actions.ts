"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTerm } from "@/lib/current-term";

export type ActionResult = { ok: true } | { ok: false; error: string };

export type ResidentInput = {
  full_name: string;
  student_id: string;
  room_id: string;
  phone: string;
  emergency_contact: string;
};

/** What an upsert did, so the UI can say "existing person — new stay". */
export type AddResult =
  | { ok: true; reusedPerson: boolean; personName: string }
  | { ok: false; error: string };

function clean(input: ResidentInput) {
  return {
    full_name: input.full_name.trim(),
    student_id: input.student_id.trim(),
    room_id: input.room_id,
    phone: input.phone.trim() || null,
    emergency_contact: input.emergency_contact.trim() || null,
  };
}

function revalidateRoster() {
  revalidatePath("/admin/residents");
  revalidatePath("/desk");
  revalidatePath("/"); // dashboard counts
}

// All writes go through the RLS-scoped client — RLS enforces RD-only. The admin
// UI guard is defense-in-depth, not the security boundary.

/**
 * One form, matched on student ID: the person is created if new and reused if
 * we've housed them before, then a NEW occupancy is opened for the current
 * term. That reuse is the whole point of the split — a returning student keeps
 * their identity and their old stay stays exactly as it was recorded.
 */
export async function addResident(input: ResidentInput): Promise<AddResult> {
  const row = clean(input);
  if (!row.full_name || !row.student_id || !row.room_id) {
    return { ok: false, error: "Name, student ID, and room are required." };
  }

  const supabase = await createClient();
  const term = await getCurrentTerm();
  if (!term) {
    return {
      ok: false,
      error: "No current term is set. Set one under Admin → Residents first.",
    };
  }

  // Does this person already exist? Student ID is the identity key.
  const { data: existing, error: lookupError } = await supabase
    .from("people")
    .select("id, full_name")
    .eq("student_id", row.student_id)
    .maybeSingle();
  if (lookupError) return { ok: false, error: lookupError.message };

  let personId = existing?.id;
  if (personId) {
    // Refresh contact details on the existing person; never touch their history.
    const { error } = await supabase
      .from("people")
      .update({
        full_name: row.full_name,
        phone: row.phone,
        emergency_contact: row.emergency_contact,
      })
      .eq("id", personId);
    if (error) return { ok: false, error: error.message };
  } else {
    const { data: created, error } = await supabase
      .from("people")
      .insert({
        full_name: row.full_name,
        student_id: row.student_id,
        phone: row.phone,
        emergency_contact: row.emergency_contact,
      })
      .select("id")
      .single();
    if (error) return { ok: false, error: error.message };
    personId = created.id;
  }

  // New stay, always — an old occupancy is never reused or reset. The partial
  // unique index rejects a second ACTIVE stay for the same person.
  const { error: occError } = await supabase
    .from("occupancies")
    .insert({ person_id: personId, room_id: row.room_id, term });
  if (occError) {
    return {
      ok: false,
      error: occError.message.includes("occupancies_one_active_per_person")
        ? `${row.full_name} already has an active stay. Check them out or archive it before opening a new one.`
        : occError.message,
    };
  }

  revalidateRoster();
  return { ok: true, reusedPerson: !!existing, personName: row.full_name };
}

/**
 * Edit one stay: contact details belong to the person, the room to the
 * occupancy. The term and status are deliberately not editable here — status
 * moves only through record_occupancy, which holds the signature gate.
 */
export async function updateResident(
  occupancyId: string,
  personId: string,
  input: ResidentInput,
): Promise<ActionResult> {
  const row = clean(input);
  if (!row.full_name || !row.student_id || !row.room_id) {
    return { ok: false, error: "Name, student ID, and room are required." };
  }
  const supabase = await createClient();

  const { error: personError } = await supabase
    .from("people")
    .update({
      full_name: row.full_name,
      student_id: row.student_id,
      phone: row.phone,
      emergency_contact: row.emergency_contact,
    })
    .eq("id", personId);
  if (personError) return { ok: false, error: personError.message };

  // A room change recorded here is a correction, not a move: mid-term moves go
  // through reassign_room so they land in room_change_events.
  const { error: occError } = await supabase
    .from("occupancies")
    .update({ room_id: row.room_id })
    .eq("id", occupancyId);
  if (occError) return { ok: false, error: occError.message };

  revalidateRoster();
  revalidatePath(`/residents/${occupancyId}`);
  return { ok: true };
}

/**
 * Delete the STAY, not the person: their other occupancies and the history
 * attached to them survive. Prefer archiving — deletion cascades this stay's
 * events, so it's for roster mistakes only.
 */
export async function deleteOccupancy(occupancyId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("occupancies")
    .delete()
    .eq("id", occupancyId);
  if (error) return { ok: false, error: error.message };
  revalidateRoster();
  return { ok: true };
}

/**
 * Archive / unarchive a stay. Archived is hidden, never deleted: it drops off
 * every everyday screen (they read the current_residents view) while staying
 * queryable for dispute history.
 */
export async function setOccupancyArchived(
  occupancyId: string,
  archived: boolean,
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("occupancies")
    .update({ is_archived: archived })
    .eq("id", occupancyId);
  if (error) {
    return {
      ok: false,
      error: error.message.includes("occupancies_one_active_per_person")
        ? "That person already has another active stay — archive or check out that one first."
        : error.message,
    };
  }
  revalidateRoster();
  revalidatePath(`/residents/${occupancyId}`);
  return { ok: true };
}

/**
 * Set the current term. Everyday screens follow this immediately: last term's
 * occupancies stop appearing without anything being deleted.
 */
export async function setCurrentTerm(term: string): Promise<ActionResult> {
  const trimmed = term.trim();
  if (!trimmed) return { ok: false, error: "The term can't be blank." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("app_settings")
    .update({ current_term: trimmed })
    .eq("id", true);
  if (error) return { ok: false, error: error.message };
  revalidateRoster();
  revalidatePath("/hallways", "layout");
  return { ok: true };
}
