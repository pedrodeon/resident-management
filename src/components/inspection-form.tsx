"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createInspection,
  type InspectionItemInput,
} from "@/app/(app)/rooms/[id]/inspections/new/actions";
import { createClient } from "@/lib/supabase/client";
import { downscalePhoto, PHOTO_BUCKET } from "@/lib/photos";
import type {
  InspectionType,
  InventoryItem,
  ItemCondition,
} from "@/lib/types";

const CONDITIONS: ItemCondition[] = ["good", "fair", "damaged", "missing"];

// A photo picked in the form but not yet uploaded. Uploads happen on save so
// an abandoned form leaves nothing in the bucket.
type PendingPhoto = { file: File; previewUrl: string };

export type FormResident = { id: string; full_name: string };

export function InspectionForm({
  roomId,
  roomNumber,
  residents,
  template,
  defaultType,
}: {
  roomId: string;
  roomNumber: string;
  residents: FormResident[];
  template: InventoryItem[];
  defaultType: InspectionType;
}) {
  const router = useRouter();
  const [type, setType] = useState<InspectionType>(defaultType);
  // move_in/out are tied to a resident; default to the first if there is one.
  const [residentId, setResidentId] = useState<string>(
    defaultType !== "periodic" && residents[0] ? residents[0].id : "",
  );
  const [notes, setNotes] = useState("");
  const [rows, setRows] = useState<InspectionItemInput[]>(
    template.map((t) => ({ item_id: t.id, condition: "good", note: "", photos: [] })),
  );
  const [pendingPhotos, setPendingPhotos] = useState<
    Record<string, PendingPhoto[]>
  >({});
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Release preview object URLs when the form unmounts.
  useEffect(() => {
    return () => {
      for (const photos of Object.values(pendingPhotos)) {
        for (const p of photos) URL.revokeObjectURL(p.previewUrl);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function setRow(itemId: string, patch: Partial<InspectionItemInput>) {
    setRows((prev) =>
      prev.map((r) => (r.item_id === itemId ? { ...r, ...patch } : r)),
    );
  }

  function addPhotos(itemId: string, files: FileList | null) {
    if (!files || files.length === 0) return;
    const added = [...files].map((file) => ({
      file,
      previewUrl: URL.createObjectURL(file),
    }));
    setPendingPhotos((prev) => ({
      ...prev,
      [itemId]: [...(prev[itemId] ?? []), ...added],
    }));
  }

  function removePhoto(itemId: string, previewUrl: string) {
    URL.revokeObjectURL(previewUrl);
    setPendingPhotos((prev) => ({
      ...prev,
      [itemId]: (prev[itemId] ?? []).filter((p) => p.previewUrl !== previewUrl),
    }));
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      // 1. Upload pending photos to the private bucket under one group id.
      //    Runs in the browser under the caller's session; storage RLS allows
      //    staff INSERT only. Photos become immutable the moment they land.
      const supabase = createClient();
      const groupId = crypto.randomUUID();
      const pathsByItem: Record<string, string[]> = {};
      const total = Object.values(pendingPhotos).reduce(
        (n, list) => n + list.length,
        0,
      );
      let done = 0;

      for (const [itemId, photos] of Object.entries(pendingPhotos)) {
        for (const photo of photos) {
          setUploadStatus(`Uploading photos… (${done + 1}/${total})`);
          const blob = await downscalePhoto(photo.file);
          const path = `${groupId}/${itemId}/${done}.jpg`;
          const { error: uploadError } = await supabase.storage
            .from(PHOTO_BUCKET)
            .upload(path, blob, { contentType: "image/jpeg" });
          if (uploadError) {
            setUploadStatus(null);
            setError(`Photo upload failed: ${uploadError.message}`);
            return; // nothing recorded — the RPC never ran
          }
          (pathsByItem[itemId] ??= []).push(path);
          done += 1;
        }
      }
      setUploadStatus(total > 0 ? "Saving inspection…" : null);

      // 2. Record the snapshot (items + photo paths) atomically via the RPC.
      const result = await createInspection({
        roomId,
        residentId: residentId || null,
        type,
        notes,
        items: rows.map((r) => ({
          ...r,
          photos: pathsByItem[r.item_id] ?? [],
        })),
      });
      // Only returns on error; success redirects server-side.
      setUploadStatus(null);
      if (result && !result.ok) setError(result.error);
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {error && (
        <p
          role="alert"
          className="rounded-md border-l-4 border-red-400 bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-4">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Type</span>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as InspectionType)}
            className="rounded-md border border-gray-300 px-3 py-2 text-base"
          >
            <option value="move_in">Move-in</option>
            <option value="move_out">Move-out</option>
            <option value="periodic">Periodic</option>
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">
            Resident{" "}
            <span className="font-normal text-gray-400">
              (for move-in / move-out)
            </span>
          </span>
          <select
            value={residentId}
            onChange={(e) => setResidentId(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-2 text-base"
          >
            <option value="">None (periodic)</option>
            {residents.map((r) => (
              <option key={r.id} value={r.id}>
                {r.full_name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
          Condition — Room {roomNumber}
        </h2>
        <ul className="mt-2 divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
          {template.map((item) => {
            const row = rows.find((r) => r.item_id === item.id)!;
            const flagged =
              row.condition === "damaged" || row.condition === "missing";
            return (
              <li
                key={item.id}
                className={`flex flex-wrap items-center gap-3 px-4 py-2.5 ${
                  flagged ? "border-l-4 border-accent bg-accent-soft" : ""
                }`}
              >
                <span className="w-48 text-sm font-medium">{item.name}</span>
                <select
                  value={row.condition}
                  onChange={(e) =>
                    setRow(item.id, {
                      condition: e.target.value as ItemCondition,
                    })
                  }
                  aria-label={`${item.name} condition`}
                  className="rounded-md border border-gray-300 px-2 py-1.5 text-sm capitalize"
                >
                  {CONDITIONS.map((c) => (
                    <option key={c} value={c} className="capitalize">
                      {c}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  value={row.note}
                  onChange={(e) => setRow(item.id, { note: e.target.value })}
                  placeholder="Note (optional)"
                  aria-label={`${item.name} note`}
                  className="min-w-40 flex-1 rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                />

                {/* Photos: camera on phones (capture), file picker at a desk. */}
                <label className="cursor-pointer rounded-md border border-gray-300 px-2 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100">
                  + Photo
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    multiple
                    className="hidden"
                    aria-label={`${item.name} photos`}
                    onChange={(e) => {
                      addPhotos(item.id, e.target.files);
                      e.target.value = "";
                    }}
                  />
                </label>

                {(pendingPhotos[item.id]?.length ?? 0) > 0 && (
                  <div className="flex w-full flex-wrap gap-2 pt-1">
                    {pendingPhotos[item.id].map((photo) => (
                      <span key={photo.previewUrl} className="relative">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={photo.previewUrl}
                          alt={`${item.name} photo preview`}
                          className="h-16 w-16 rounded-md border border-gray-200 object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => removePhoto(item.id, photo.previewUrl)}
                          aria-label="Remove photo"
                          className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-navy text-xs text-white hover:bg-navy-dark"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Overall notes</span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="rounded-md border border-gray-300 px-3 py-2 text-base"
        />
      </label>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={submit}
          disabled={isPending}
          className="rounded-md bg-navy px-4 py-2.5 font-semibold text-white transition-colors hover:bg-navy-dark disabled:opacity-60"
        >
          {isPending ? (uploadStatus ?? "Saving…") : "Save inspection"}
        </button>
        <button
          type="button"
          onClick={() => router.push(`/rooms/${roomId}`)}
          disabled={isPending}
          className="rounded-md border border-gray-300 px-4 py-2.5 font-medium text-gray-600 hover:bg-gray-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
