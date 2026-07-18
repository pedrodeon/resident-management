"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createInspection,
  type InspectionItemInput,
} from "@/app/(app)/rooms/[id]/inspections/new/actions";
import type {
  InspectionType,
  InventoryItem,
  ItemCondition,
} from "@/lib/types";

const CONDITIONS: ItemCondition[] = ["good", "fair", "damaged", "missing"];

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
    template.map((t) => ({ item_id: t.id, condition: "good", note: "" })),
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function setRow(itemId: string, patch: Partial<InspectionItemInput>) {
    setRows((prev) =>
      prev.map((r) => (r.item_id === itemId ? { ...r, ...patch } : r)),
    );
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await createInspection({
        roomId,
        residentId: residentId || null,
        type,
        notes,
        items: rows,
      });
      // Only returns on error; success redirects server-side.
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
          {isPending ? "Saving…" : "Save inspection"}
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
