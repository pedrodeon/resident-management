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
  /** Best move-in inspection: id + how many of the two signatures exist. */
  move_in: { inspectionId: string; signatures: number } | null;
};

// After a check-out, prompt the paired move-out inspection. (Move-in is the
// other way around now: the signed inspection comes FIRST and gates check-in.)
type JustActed = {
  residentName: string;
  roomId: string;
};

export function DeskConsole({ residents }: { residents: DeskResident[] }) {
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [justActed, setJustActed] = useState<JustActed | null>(null);
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
    setJustActed(null);
    const nextStatus: OccupancyStatus =
      type === "check_in" ? "checked_in" : "checked_out";
    startTransition(async () => {
      setOptimistic({ id: resident.id, status: nextStatus });
      const result = await recordOccupancy(
        resident.id,
        type,
        resident.hallway_id,
      );
      if (!result.ok) {
        setError(result.error);
      } else if (type === "check_out") {
        setJustActed({
          residentName: resident.full_name,
          roomId: resident.room_id,
        });
      }
    });
  }

  // The move-in gate: where an expected resident is in the signed-inspection
  // flow decides what the desk offers. The record_occupancy RPC enforces the
  // same rule server-side, so this is presentation, not the boundary.
  function CheckInControl({ resident }: { resident: DeskResident }) {
    if (!resident.move_in) {
      return (
        <Link
          href={`/rooms/${resident.room_id}/inspections/new?type=move_in&resident=${resident.id}`}
          className="rounded-md bg-navy px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-navy-dark"
        >
          Move-in inspection
        </Link>
      );
    }
    if (resident.move_in.signatures < 2) {
      return (
        <Link
          href={`/inspections/${resident.move_in.inspectionId}`}
          className="rounded-md border-l-4 border-accent bg-accent-soft px-3 py-1.5 text-xs font-semibold text-ink transition-colors hover:bg-accent"
        >
          Signatures ({resident.move_in.signatures}/2)
        </Link>
      );
    }
    return (
      <button
        type="button"
        onClick={() => act(resident, "check_in")}
        disabled={isPending}
        className="rounded-md bg-navy px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-navy-dark disabled:opacity-50"
      >
        Check in
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

      {justActed && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-navy/20 bg-navy/5 px-3 py-2 text-sm">
          <span>
            Checked out <strong>{justActed.residentName}</strong>. Start the
            paired move-out inspection?
          </span>
          <Link
            href={`/rooms/${justActed.roomId}/inspections/new?type=move_out`}
            className="rounded-md bg-navy px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-navy-dark"
          >
            Move-out inspection
          </Link>
        </div>
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
                <CheckInControl resident={resident} />
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
            Check-in requires a move-in inspection signed by the resident and
            the RA; the paired move-out inspection is offered after check-out.
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
                    <CheckInControl resident={resident} />
                  )}
                  {resident.occupancy_status === "checked_in" && (
                    <button
                      type="button"
                      onClick={() => act(resident, "check_out")}
                      disabled={isPending}
                      className="rounded-md border border-navy px-3 py-1.5 text-xs font-semibold text-navy transition-colors hover:bg-navy hover:text-white disabled:opacity-50"
                    >
                      Check out
                    </button>
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
