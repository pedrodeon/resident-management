"use client";

import { useSyncExternalStore } from "react";

/*
 * Formatted once per page load, cached so the snapshot is referentially
 * stable. The server snapshot is null, so SSR emits a placeholder and the
 * real value appears on the client without a hydration mismatch — in the
 * viewer's own timezone and locale.
 */
let cached: string | null = null;
function clientSnapshot() {
  if (cached === null) {
    const now = new Date();
    const date = now.toLocaleDateString(undefined, {
      weekday: "short",
      day: "2-digit",
      month: "short",
    });
    const time = now.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
    cached = `${date} · ${time}`;
  }
  return cached;
}

const subscribe = () => () => {};

/** The PageHeader's date/time caption ("THU 30 JUL · 6:55 AM"). */
export function LocalDate({ className }: { className?: string }) {
  const stamp = useSyncExternalStore(subscribe, clientSnapshot, () => null);
  return <span className={className}>{stamp ?? " "}</span>;
}
