"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SignaturePad, type SignaturePadHandle } from "@/components/signature-pad";
import { addInspectionSignature } from "@/app/(app)/inspections/[id]/actions";
import { recordOccupancy } from "@/app/(app)/desk/actions";
import { createClient } from "@/lib/supabase/client";
import { PHOTO_BUCKET } from "@/lib/photos";
import type { SignatureRole } from "@/lib/types";

export type StoredSignature = {
  role: SignatureRole;
  url: string; // signed URL
  signed_at: string;
};

/**
 * The attestation step on a move-in inspection: the resident agrees the
 * recorded conditions are accurate, the RA confirms they conducted the
 * inspection. Each saves independently and permanently; check-in can only be
 * finalized once both exist (the record_occupancy RPC enforces the same rule
 * server-side).
 */
export function InspectionSignatures({
  inspectionId,
  residentId,
  residentName,
  staffName,
  hallwayId,
  residentStatus,
  stored,
}: {
  inspectionId: string;
  residentId: string;
  residentName: string;
  staffName: string;
  hallwayId: string | null;
  residentStatus: string;
  stored: StoredSignature[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [finalized, setFinalized] = useState(false);
  const [isPending, startTransition] = useTransition();

  const byRole = (role: SignatureRole) => stored.find((s) => s.role === role);
  const bothSigned = !!byRole("resident") && !!byRole("ra");

  function save(role: SignatureRole, pad: SignaturePadHandle | null) {
    setError(null);
    startTransition(async () => {
      const blob = await pad?.getBlob();
      if (!blob) {
        setError("Draw the signature before saving.");
        return;
      }
      // Upload the PNG to the private bucket (immutable once landed), then
      // record the row binding it to this exact inspection.
      const supabase = createClient();
      const path = `signatures/${inspectionId}/${role}-${Date.now()}.png`;
      const { error: uploadError } = await supabase.storage
        .from(PHOTO_BUCKET)
        .upload(path, blob, { contentType: "image/png" });
      if (uploadError) {
        setError(`Could not save the signature: ${uploadError.message}`);
        return;
      }
      const result = await addInspectionSignature(inspectionId, role, path);
      if (!result.ok) setError(result.error);
      else router.refresh();
    });
  }

  function finalize() {
    setError(null);
    startTransition(async () => {
      const result = await recordOccupancy(residentId, "check_in", hallwayId);
      if (!result.ok) setError(result.error);
      else {
        setFinalized(true);
        router.refresh();
      }
    });
  }

  return (
    <div className="mt-8">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
        Signatures
      </h2>

      {error && (
        <p
          role="alert"
          className="mt-2 rounded-md border-l-4 border-red-400 bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          {error}
        </p>
      )}

      <div className="mt-2 grid gap-4 sm:grid-cols-2">
        <SignatureBlock
          title={`Resident signature — ${residentName}`}
          attestation="I agree the recorded conditions are accurate."
          existing={byRole("resident")}
          disabled={isPending}
          onSave={(pad) => save("resident", pad)}
        />
        <SignatureBlock
          title={`RA signature — ${staffName}`}
          attestation="I confirm I conducted this inspection."
          existing={byRole("ra")}
          disabled={isPending}
          onSave={(pad) => save("ra", pad)}
        />
      </div>

      {/* Finalization: only meaningful while the resident is still expected. */}
      {residentStatus === "expected" && (
        <div className="mt-4">
          {bothSigned ? (
            <button
              type="button"
              onClick={finalize}
              disabled={isPending}
              className="rounded-md bg-navy px-4 py-2.5 font-semibold text-white transition-colors hover:bg-navy-dark disabled:opacity-50"
            >
              {isPending ? "Finalizing…" : `Finalize check-in for ${residentName}`}
            </button>
          ) : (
            <p className="rounded-md border-l-4 border-accent bg-accent-soft px-3 py-2 text-sm text-ink">
              Check-in stays incomplete until both signatures are captured.
            </p>
          )}
        </div>
      )}
      {(finalized || residentStatus === "checked_in") && (
        <p className="mt-4 text-sm text-gray-600">
          {residentName} is checked in.
        </p>
      )}
    </div>
  );
}

function SignatureBlock({
  title,
  attestation,
  existing,
  disabled,
  onSave,
}: {
  title: string;
  attestation: string;
  existing: StoredSignature | undefined;
  disabled: boolean;
  onSave: (pad: SignaturePadHandle | null) => void;
}) {
  const padRef = useRef<SignaturePadHandle>(null);
  const [dirty, setDirty] = useState(false);

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <p className="text-sm font-semibold">{title}</p>
      <p className="mt-0.5 text-xs text-gray-500">&ldquo;{attestation}&rdquo;</p>

      {existing ? (
        <div className="mt-3">
          {/* Stored, immutable; served via a short-lived signed URL. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={existing.url}
            alt={`${title} (signed)`}
            className="h-32 w-full rounded-md border border-gray-200 bg-white object-contain"
          />
          <p className="mt-1.5 text-xs text-gray-500">
            Signed {new Date(existing.signed_at).toLocaleString()}
          </p>
        </div>
      ) : (
        <div className="mt-3">
          <SignaturePad ref={padRef} onDirtyChange={setDirty} disabled={disabled} />
          <button
            type="button"
            onClick={() => onSave(padRef.current)}
            disabled={disabled || !dirty}
            className="mt-2 rounded-md bg-navy px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-navy-dark disabled:opacity-50"
          >
            Save signature
          </button>
        </div>
      )}
    </div>
  );
}
