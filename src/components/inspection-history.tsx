"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { InspectionType } from "@/lib/types";

export type HistoryEntry = {
  id: string;
  type: InspectionType;
  timestamp: string;
  inspector: string | null;
};

const TYPE_LABEL: Record<InspectionType, string> = {
  move_in: "Move-in",
  move_out: "Move-out",
  periodic: "Periodic",
};

export function InspectionHistory({
  roomId,
  inspections,
}: {
  roomId: string;
  inspections: HistoryEntry[];
}) {
  const router = useRouter();
  // Default the compare picker to the two most useful snapshots.
  const [a, setA] = useState(inspections[1]?.id ?? "");
  const [b, setB] = useState(inspections[0]?.id ?? "");

  function compare() {
    if (a && b && a !== b) {
      router.push(`/rooms/${roomId}/inspections/compare?a=${a}&b=${b}`);
    }
  }

  return (
    <div>
      {/* No create button here on purpose: the only inspection types are
          move-in and move-out, and each belongs to one resident, so they are
          started from that resident's screen as part of check-in / check-out.
          This section is history + compare. */}
      <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
        Inspections
      </h2>

      {inspections.length === 0 ? (
        <p className="mt-2 text-sm text-gray-500">
          No inspections yet. Move-in and move-out inspections are recorded from
          a resident&rsquo;s screen, as part of their check-in or check-out.
        </p>
      ) : (
        <ul className="mt-2 divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
          {inspections.map((insp) => (
            <li key={insp.id}>
              <Link
                href={`/inspections/${insp.id}`}
                className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-gray-50"
              >
                <span className="text-sm font-medium">
                  {TYPE_LABEL[insp.type]}
                </span>
                <span className="text-xs text-gray-500">
                  {new Date(insp.timestamp).toLocaleDateString()}
                  {insp.inspector ? ` · ${insp.inspector}` : ""}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {inspections.length >= 2 && (
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-xs text-gray-500">
            Compare
            <select
              value={a}
              onChange={(e) => setA(e.target.value)}
              className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
            >
              {inspections.map((i) => (
                <option key={i.id} value={i.id}>
                  {TYPE_LABEL[i.type]} · {new Date(i.timestamp).toLocaleDateString()}
                </option>
              ))}
            </select>
          </label>
          <span className="pb-2 text-xs text-gray-400">vs</span>
          <label className="flex flex-col gap-1 text-xs text-gray-500">
            &nbsp;
            <select
              value={b}
              onChange={(e) => setB(e.target.value)}
              className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
            >
              {inspections.map((i) => (
                <option key={i.id} value={i.id}>
                  {TYPE_LABEL[i.type]} · {new Date(i.timestamp).toLocaleDateString()}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={compare}
            disabled={!a || !b || a === b}
            className="rounded-md border border-navy px-3 py-1.5 text-sm font-medium text-navy transition-colors hover:bg-navy hover:text-white disabled:opacity-40"
          >
            Compare
          </button>
        </div>
      )}
    </div>
  );
}
