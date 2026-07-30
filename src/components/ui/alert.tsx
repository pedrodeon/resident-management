import type { ReactNode } from "react";

/*
 * Inline message boxes — the three verbatim patterns the app already used,
 * codified once. Red is deliberately NOT a school color: it exists only as the
 * functional tone for errors and destructive actions (see globals.css), so it
 * never competes with the accent's "needs attention" meaning.
 */
const ALERT_TONE = {
  /** Something failed — form errors, rejected actions. */
  error: "rounded-md border-l-4 border-red-400 bg-red-50 px-3 py-2 text-sm text-red-800",
  /** Needs eyes — warnings, gates not yet satisfied, non-current-term notes. */
  attention: "rounded-md border-l-4 border-accent bg-accent-soft px-3 py-2 text-sm text-ink",
  /** Neutral confirmation or context. */
  info: "rounded-md border-l-4 border-navy bg-gray-50 px-3 py-2 text-sm text-ink",
} as const;

export type AlertTone = keyof typeof ALERT_TONE;

export function Alert({
  tone,
  className,
  children,
}: {
  tone: AlertTone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <p
      role={tone === "error" ? "alert" : undefined}
      className={className ? `${ALERT_TONE[tone]} ${className}` : ALERT_TONE[tone]}
    >
      {children}
    </p>
  );
}
