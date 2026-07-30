"use client";

import { useOptimistic, useState, useTransition } from "react";
import Link from "next/link";
import { StatusChip } from "@/components/ui/status-chip";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SectionLabel } from "@/components/ui/typography";
import { togglePresence, bulkSetPresence } from "@/app/(app)/hallways/[id]/actions";
import type { OccupancyStatus } from "@/lib/types";

export type RosterEntry = {
  id: string;
  full_name: string;
  room_number: string;
  occupancy_status: OccupancyStatus;
  is_present: boolean;
};

export function HallwayRoster({
  hallwayId,
  residents,
}: {
  hallwayId: string;
  residents: RosterEntry[];
}) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Optimistic overlay of is_present by resident id, so flips feel instant.
  const [optimistic, setOptimistic] = useOptimistic(
    residents,
    (state, update: { ids: string[]; isPresent: boolean }) =>
      state.map((r) =>
        update.ids.includes(r.id) ? { ...r, is_present: update.isPresent } : r,
      ),
  );

  const checkedIn = optimistic.filter((r) => r.occupancy_status === "checked_in");
  const awayCount = checkedIn.filter((r) => !r.is_present).length;

  function flip(id: string, makePresent: boolean) {
    setError(null);
    startTransition(async () => {
      setOptimistic({ ids: [id], isPresent: makePresent });
      const result = await togglePresence(id, makePresent, hallwayId);
      if (!result.ok) setError(result.error);
    });
  }

  function flipAll(makePresent: boolean) {
    setError(null);
    startTransition(async () => {
      setOptimistic({
        ids: checkedIn.map((r) => r.id),
        isPresent: makePresent,
      });
      const result = await bulkSetPresence(hallwayId, makePresent);
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionLabel>
          Roster
          {checkedIn.length > 0 && (
            <span className="ml-2 font-normal normal-case text-gray-400">
              {awayCount} away / {checkedIn.length} checked in
            </span>
          )}
        </SectionLabel>

        <div className="flex gap-2 print:hidden">
          <Button
            variant="outline"
            size="sm"
            onClick={() => flipAll(true)}
            disabled={isPending || checkedIn.length === 0}
          >
            Mark all present
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => flipAll(false)}
            disabled={isPending || checkedIn.length === 0}
          >
            Mark all away
          </Button>
          <Button variant="subtle" size="sm" onClick={() => window.print()}>
            Print
          </Button>
        </div>
      </div>

      {error && (
        <p
          role="alert"
          className="mt-2 rounded-md border-l-4 border-red-400 bg-red-50 px-3 py-2 text-sm text-red-800 print:hidden"
        >
          {error}
        </p>
      )}

      {optimistic.length === 0 ? (
        <p className="mt-2 text-sm text-gray-500">
          No residents in this hallway yet.
        </p>
      ) : (
        <Card as="ul" variant="list" className="mt-2">
          {optimistic.map((resident) => {
            const away =
              resident.occupancy_status === "checked_in" && !resident.is_present;
            return (
              <li
                key={resident.id}
                className={`flex items-center justify-between gap-3 px-4 py-2.5 ${
                  away ? "border-l-4 border-accent bg-accent-soft" : ""
                }`}
              >
                <div className="flex items-baseline gap-3">
                  <Link
                    href={`/residents/${resident.id}`}
                    className="text-sm font-medium hover:text-navy hover:underline"
                  >
                    {resident.full_name}
                  </Link>
                  <span className="text-xs text-gray-500">
                    Room {resident.room_number}
                  </span>
                </div>

                {resident.occupancy_status === "checked_in" ? (
                  <PresenceToggle
                    present={resident.is_present}
                    disabled={isPending}
                    onChange={(makePresent) => flip(resident.id, makePresent)}
                  />
                ) : (
                  <StatusChip
                    status={resident.occupancy_status}
                    isPresent={resident.is_present}
                  />
                )}
              </li>
            );
          })}
        </Card>
      )}
    </div>
  );
}

function PresenceToggle({
  present,
  disabled,
  onChange,
}: {
  present: boolean;
  disabled: boolean;
  onChange: (makePresent: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      {/* Text label prints and reads clearly; the switch is the control. */}
      <span
        className={`text-xs font-medium ${present ? "text-gray-600" : "text-ink"}`}
      >
        {present ? "In building" : "Away"}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={present}
        aria-label={present ? "Mark away" : "Mark present"}
        disabled={disabled}
        onClick={() => onChange(!present)}
        className={`relative inline-flex h-6 w-11 flex-none items-center rounded-full transition-colors disabled:opacity-50 print:hidden ${
          present ? "bg-navy" : "bg-accent"
        }`}
      >
        <span
          className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
            present ? "translate-x-5" : "translate-x-0.5"
          }`}
        />
      </button>
    </div>
  );
}
