"use client";

import { useMemo, useOptimistic, useState, useTransition } from "react";
import Link from "next/link";
import { StatusChip } from "@/components/status-chip";
import { recordOccupancy } from "@/app/(app)/desk/actions";
import type { OccupancyStatus } from "@/lib/types";

export type DeskResident = {
  id: string;
  full_name: string;
  student_id: string;
  room_id: string;
  room_number: string;
  hallway_id: string;
  hallway_name: string;
  occupancy_status: OccupancyStatus;
  /** Best move-in inspection: id + gate halves satisfied (0-2). */
  move_in: { inspectionId: string; signatures: number } | null;
  /** Best move-out inspection: RA signature + (resident signature or waiver). */
  move_out: { inspectionId: string; signatures: number } | null;
};

export function DeskConsole({ residents }: { residents: DeskResident[] }) {
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Optimistic status overlay keyed by resident id.
  const [optimistic, setOptimistic] = useOptimistic(
    residents,
    (state, update: { id: string; status: OccupancyStatus }) =>
      state.map((r) =>
        r.id === update.id ? { ...r, occupancy_status: update.status } : r,
      ),
  );

  const expected = optimistic.filter((r) => r.occupancy_status === "expected");

  // Local filter — the search term is resident data, so it never touches the
  // URL. ~200 rows filter instantly on every keystroke.
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return optimistic.filter(
      (r) =>
        r.full_name.toLowerCase().includes(q) ||
        r.student_id.toLowerCase().includes(q),
    );
  }, [query, optimistic]);

  function act(resident: DeskResident, type: "check_in" | "check_out") {
    setError(null);
    const nextStatus: OccupancyStatus =
      type === "check_in" ? "checked_in" : "checked_out";
    startTransition(async () => {
      setOptimistic({ id: resident.id, status: nextStatus });
      const result = await recordOccupancy(
        resident.id,
        type,
        resident.hallway_id,
      );
      if (!result.ok) setError(result.error);
    });
  }

  // The occupancy gates: where a resident is in the signed-inspection flow
  // decides what the desk offers — inspection, signatures, or the final
  // check-in/out. The record_occupancy RPC enforces the same rules
  // server-side, so this is presentation, not the boundary.
  function GateControl({
    resident,
    flow,
  }: {
    resident: DeskResident;
    flow: "move_in" | "move_out";
  }) {
    const progress = flow === "move_in" ? resident.move_in : resident.move_out;
    const labels =
      flow === "move_in"
        ? { start: "Move-in inspection", done: "Check in" }
        : { start: "Move-out inspection", done: "Check out" };

    if (!progress) {
      return (
        <Link
          href={`/rooms/${resident.room_id}/inspections/new?type=${flow}&resident=${resident.id}`}
          className="rounded-md bg-navy px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-navy-dark"
        >
          {labels.start}
        </Link>
      );
    }
    if (progress.signatures < 2) {
      return (
        <Link
          href={`/inspections/${progress.inspectionId}`}
          className="rounded-md border-l-4 border-accent bg-accent-soft px-3 py-1.5 text-xs font-semibold text-ink transition-colors hover:bg-accent"
        >
          Signatures ({progress.signatures}/2)
        </Link>
      );
    }
    return (
      <button
        type="button"
        onClick={() =>
          act(resident, flow === "move_in" ? "check_in" : "check_out")
        }
        disabled={isPending}
        className="rounded-md bg-navy px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-navy-dark disabled:opacity-50"
      >
        {labels.done}
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {error && (
        <p
          role="alert"
          className="rounded-md border-l-4 border-red-400 bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          {error}
        </p>
      )}

      {/* Expected panel — the move-in-day chase list. */}
      <section>
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
          Not yet arrived
          {expected.length > 0 && (
            <span className="rounded-full border-l-4 border-accent bg-accent-soft px-2 py-0.5 text-xs font-medium normal-case tracking-normal text-ink">
              {expected.length} expected
            </span>
          )}
        </h2>
        {expected.length === 0 ? (
          <p className="mt-2 text-sm text-gray-500">Everyone has arrived.</p>
        ) : (
          <ul className="mt-2 divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
            {expected.map((resident) => (
              <li
                key={resident.id}
                className="flex items-center justify-between gap-3 px-4 py-2.5"
              >
                <div>
                  <p className="text-sm font-medium">{resident.full_name}</p>
                  <p className="text-xs text-gray-500">
                    {resident.hallway_name} · Room {resident.room_number}
                  </p>
                </div>
                <GateControl resident={resident} flow="move_in" />
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Search + act on anyone building-wide. */}
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
          Find a resident
        </h2>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or student ID"
          className="mt-2 w-full rounded-md border border-gray-300 px-3 py-2 text-base outline-none focus:border-navy focus:ring-2 focus:ring-navy/30"
          autoComplete="off"
        />

        {query.trim() === "" ? (
          <p className="mt-2 text-xs text-gray-400">
            Check-in and check-out each require a signed inspection first —
            move-in needs both signatures; move-out needs the RA&rsquo;s plus
            the resident&rsquo;s or a recorded &ldquo;unavailable /
            declined&rdquo; note.
          </p>
        ) : results.length === 0 ? (
          <p className="mt-3 text-sm text-gray-500">No match for “{query}”.</p>
        ) : (
          <ul className="mt-3 divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
            {results.map((resident) => (
              <li
                key={resident.id}
                className="flex items-center justify-between gap-3 px-4 py-3"
              >
                <div>
                  <Link
                    href={`/residents/${resident.id}`}
                    className="text-sm font-medium hover:text-navy hover:underline"
                  >
                    {resident.full_name}
                  </Link>
                  <p className="mt-0.5 text-xs text-gray-500">
                    <span className="font-mono">{resident.student_id}</span> ·{" "}
                    <Link
                      href={`/hallways/${resident.hallway_id}`}
                      className="hover:text-navy hover:underline"
                    >
                      {resident.hallway_name}
                    </Link>{" "}
                    · Room {resident.room_number}
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <StatusChip
                    status={resident.occupancy_status}
                    isPresent={true}
                  />
                  {resident.occupancy_status === "expected" && (
                    <GateControl resident={resident} flow="move_in" />
                  )}
                  {resident.occupancy_status === "checked_in" && (
                    <GateControl resident={resident} flow="move_out" />
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
