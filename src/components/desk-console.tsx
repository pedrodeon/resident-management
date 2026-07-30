"use client";

import { useCallback, useOptimistic, useState } from "react";
import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { Avatar, Badge } from "@/components/ui/badge";
import { OccupancyGate } from "@/components/occupancy-gate";
import { PillToggle } from "@/components/ui/pill-toggle";
import { SearchInput } from "@/components/ui/search-input";
import { SectionLabel } from "@/components/ui/typography";
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
  // "Not arrived" is the move-in-day chase view; "Everyone" covers check-outs
  // and lookups. A view filter only — no data changes when it flips.
  const [view, setView] = useState<"expected" | "everyone">("expected");

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
  // handles memoization.
  const query_ = query.trim().toLowerCase();
  const base = view === "expected" ? expected : optimistic;
  const visible = query_
    ? base.filter(
        (r) =>
          r.full_name.toLowerCase().includes(query_) ||
          r.student_id.toLowerCase().includes(query_),
      )
    : base;

  // The occupancy ladder itself lives in OccupancyGate, shared with the
  // resident screen so the two can\'t drift. The desk hands it the optimistic
  // setter so a recorded resident leaves the Not-arrived view immediately —
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
    <div className="flex flex-col gap-5">
      <div>
        <SectionLabel>Find a resident</SectionLabel>
        <SearchInput
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or student ID"
          autoComplete="off"
          className="mt-3"
        />
      </div>

      <div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionLabel>
            {view === "expected" ? "Not yet arrived" : "Everyone"}
          </SectionLabel>
          <PillToggle
            options={[
              { value: "expected", label: `Not arrived ${expected.length}` },
              { value: "everyone", label: `Everyone ${optimistic.length}` },
            ]}
            value={view}
            onChange={setView}
          />
        </div>

        {visible.length === 0 ? (
          <p className="mt-3 text-sm text-muted">
            {query_
              ? `No match for “${query}”.`
              : view === "expected"
                ? "Everyone has arrived."
                : "No residents on the roster yet."}
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {visible.map((resident) => (
              <li
                key={resident.id}
                className="flex flex-wrap items-center gap-3 rounded-[18px] border border-line bg-white px-3 py-[11px] shadow-[0_2px_6px_rgba(15,29,58,0.05)]"
              >
                <Avatar name={resident.full_name} />
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/residents/${resident.id}`}
                    className="block truncate text-sm font-semibold text-ink hover:text-navy hover:underline"
                  >
                    {resident.full_name}
                  </Link>
                  <p className="mt-0.5 truncate text-xs text-muted">
                    <Link
                      href={`/hallways/${resident.hallway_id}`}
                      className="hover:text-navy hover:underline"
                    >
                      {resident.hallway_name}
                    </Link>{" "}
                    · Room {resident.room_number} ·{" "}
                    <span className="font-mono">{resident.student_id}</span>
                  </p>
                </div>

                {/* Dynamic per stay: expected → the Check-in ladder,
                    checked_in → Check-out, checked_out → quiet chip. */}
                {resident.occupancy_status === "expected" ? (
                  gate(resident, "move_in")
                ) : resident.occupancy_status === "checked_in" ? (
                  gate(resident, "move_out")
                ) : (
                  <Badge tone="quiet">Checked out</Badge>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <Alert tone="info" icon>
        Check-in and check-out each require a signed inspection first —
        move-in needs both signatures; move-out needs the RA&rsquo;s plus the
        resident&rsquo;s, or a recorded &ldquo;unavailable / declined&rdquo;
        note.
      </Alert>
    </div>
  );
}
