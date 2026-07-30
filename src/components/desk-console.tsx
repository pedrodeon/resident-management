"use client";

import { useCallback, useOptimistic, useState } from "react";
import Link from "next/link";
import { StatusChip } from "@/components/ui/status-chip";
import { OccupancyGate } from "@/components/occupancy-gate";
import type { GateProgress } from "@/lib/occupancy-gate";
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
  move_in: GateProgress | null;
  /** Best move-out inspection: RA signature + (resident signature or waiver). */
  move_out: GateProgress | null;
};

export function DeskConsole({ residents }: { residents: DeskResident[] }) {
  const [query, setQuery] = useState("");

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
  // URL. ~200 rows filter instantly on every keystroke; the React Compiler
  // handles memoization (a manual useMemo here only made it skip the whole
  // component, and its deps change on exactly the renders that recompute).
  const query_ = query.trim().toLowerCase();
  const results = query_
    ? optimistic.filter(
        (r) =>
          r.full_name.toLowerCase().includes(query_) ||
          r.student_id.toLowerCase().includes(query_),
      )
    : [];

  // The occupancy ladder itself lives in OccupancyGate, shared with the
  // resident screen so the two can't drift. The desk hands it the optimistic
  // setter so a recorded resident leaves the expected panel immediately —
  // move-in day runs ~200 of these.
  const applyOptimistic = useCallback(
    (id: string, status: OccupancyStatus) => setOptimistic({ id, status }),
    [setOptimistic],
  );

  const gate = (resident: DeskResident, flow: "move_in" | "move_out") => (
    <OccupancyGate
      variant="inline"
      flow={flow}
      progress={flow === "move_in" ? resident.move_in : resident.move_out}
      resident={{
        id: resident.id,
        full_name: resident.full_name,
        room_id: resident.room_id,
        hallway_id: resident.hallway_id,
      }}
      onOptimistic={applyOptimistic}
    />
  );

  return (
    <div className="flex flex-col gap-8">

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
                {gate(resident, "move_in")}
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
                  {resident.occupancy_status === "expected" &&
                    gate(resident, "move_in")}
                  {resident.occupancy_status === "checked_in" &&
                    gate(resident, "move_out")}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
