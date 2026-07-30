import type { ReactNode } from "react";

/*
 * Inline message boxes — the three verbatim patterns the app already used,
 * codified once. Red is deliberately NOT a school color: it exists only as the
 * functional tone for errors and destructive actions (see globals.css), so it
 * never competes with the accent's "needs attention" meaning.
 */
const ALERT_TONE = {
  /** Something failed — form errors, rejected actions. */
  error: "rounded-xl border border-red-300 bg-red-50 px-3.5 py-2.5 text-sm text-red-800",
  /** Needs eyes — warnings, gates not yet satisfied, non-current-term notes. */
  attention: "rounded-xl border border-accent-border bg-accent-soft px-3.5 py-2.5 text-sm text-ink",
  /** Neutral confirmation or context. */
  info: "rounded-xl border border-line bg-chip px-3.5 py-2.5 text-sm text-ink",
} as const;

export type AlertTone = keyof typeof ALERT_TONE;

export function Alert({
  tone,
  icon = false,
  className,
  children,
}: {
  tone: AlertTone;
  /** Lead with the amber "!" mark (the mockup's signature-reminder note). */
  icon?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const base = icon
    ? `flex items-start gap-2.5 ${ALERT_TONE[tone]}`
    : ALERT_TONE[tone];
  return (
    <p
      role={tone === "error" ? "alert" : undefined}
      className={className ? `${base} ${className}` : base}
    >
      {icon && (
        <span
          aria-hidden="true"
          className="mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full border border-accent-border bg-accent-soft text-[11px] font-bold text-accent-deep"
        >
          !
        </span>
      )}
      {icon ? <span className="min-w-0">{children}</span> : children}
    </p>
  );
}
