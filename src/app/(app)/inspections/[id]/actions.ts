"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getStaffContext } from "@/lib/auth";
import type { SignatureRole } from "@/lib/types";

export type SignatureResult = { ok: true } | { ok: false; error: string };

/**
 * Record one attestation signature (image already uploaded to storage) against
 * a move-in inspection. RLS enforces the rest: staff only, captured_by must be
 * the caller, the inspection must be a move-in with a resident, and the
 * unique (inspection_id, role) key makes a signature unrepeatable.
 */
export async function addInspectionSignature(
  inspectionId: string,
  role: SignatureRole,
  storagePath: string,
): Promise<SignatureResult> {
  const staff = await getStaffContext();
  if (!staff) return { ok: false, error: "Not signed in as staff." };

  const supabase = await createClient();
  const { error } = await supabase.from("inspection_signatures").insert({
    inspection_id: inspectionId,
    role,
    storage_path: storagePath,
    captured_by: staff.id,
  });

  if (error) {
    return {
      ok: false,
      error: error.message.includes("duplicate")
        ? "This signature has already been recorded — signatures are permanent."
        : error.message,
    };
  }

  revalidatePath(`/inspections/${inspectionId}`);
  revalidatePath("/desk");
  return { ok: true };
}
