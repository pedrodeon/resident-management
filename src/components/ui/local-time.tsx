"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * A fixed timestamp formatted in the viewer's own timezone and locale.
 * Same trick as LocalDate: the server snapshot is null, so SSR emits a
 * placeholder and the real value hydrates in without a mismatch.
 *
 * Shows just the time ("7:04 AM") when the moment is today; older moments
 * keep their date so a screen reopened later doesn't claim a bare time.
 */
export function LocalTime({ iso, className }: { iso: string; className?: string }) {
  const stamp = useSyncExternalStore(
    subscribe,
    () => {
      const then = new Date(iso);
      const time = then.toLocaleTimeString(undefined, {
        hour: "numeric",
        minute: "2-digit",
      });
      return then.toDateString() === new Date().toDateString()
        ? time
        : `${then.toLocaleDateString(undefined, { day: "2-digit", month: "short" })} · ${time}`;
    },
    () => null,
  );
  return <span className={className}>{stamp ?? " "}</span>;
}
