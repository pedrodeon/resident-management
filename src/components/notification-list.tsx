"use client";

import { useEffect } from "react";
import { markNotificationsSeen } from "@/app/(app)/notifications/actions";
import { shiftLabel } from "@/lib/desk-shifts";
import { Card } from "@/components/ui/card";
import { LocalTime } from "@/components/ui/local-time";

export type NotificationRow = {
  id: string;
  type:
    | "claimed"
    | "released"
    | "coverage_requested"
    | "coverage_withdrawn"
    | "coverage_accepted"
    | "assigned";
  shift_date: string;
  slot: number;
  created_at: string;
  actor: { name: string } | null;
  other: { name: string } | null;
};

/** One sentence per event — the wording lives here, the data is structured. */
function sentence(n: NotificationRow): string {
  const actor = n.actor?.name ?? "Someone";
  const other = n.other?.name ?? "someone";
  const shift = shiftLabel(n.shift_date, n.slot);
  switch (n.type) {
    case "claimed":
      return `${actor} claimed the ${shift} shift`;
    case "released":
      return `${actor} released the ${shift} shift — it's open again`;
    case "coverage_requested":
      return `${actor} needs coverage for the ${shift} shift`;
    case "coverage_withdrawn":
      return `${actor} withdrew their coverage request for ${shift}`;
    case "coverage_accepted":
      return `${actor} accepted coverage for ${shift} from ${other}`;
    case "assigned":
      return n.other
        ? `${actor} assigned the ${shift} shift to ${other}`
        : `${actor} cleared the ${shift} shift`;
  }
}

/**
 * The feed. Rendering it counts as reading it: on mount the seen-watermark
 * moves to now, which clears the header bell badge. Rows newer than the
 * previous watermark keep the quiet chip highlight so you can still see
 * what was new when you opened the page.
 */
export function NotificationList({
  rows,
  seenAt,
}: {
  rows: NotificationRow[];
  seenAt: string | null;
}) {
  useEffect(() => {
    void markNotificationsSeen();
  }, []);

  if (rows.length === 0) {
    return (
      <p className="text-sm text-gray-500">
        Nothing yet — schedule changes on the Front Desk calendar will show up
        here.
      </p>
    );
  }

  return (
    <Card as="ul" variant="list">
      {rows.map((n) => {
        const isNew = seenAt === null || n.created_at > seenAt;
        return (
          <li
            key={n.id}
            className={`flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-2.5 ${
              isNew ? "bg-chip" : ""
            }`}
          >
            <p className="text-sm text-ink">{sentence(n)}</p>
            <LocalTime
              iso={n.created_at}
              className="text-xs whitespace-nowrap text-gray-500"
            />
          </li>
        );
      })}
    </Card>
  );
}
