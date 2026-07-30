import type { ReactNode } from "react";

/*
 * Badges and chips. The accent rule (CLAUDE.md): light orange marks ONLY
 * status that needs attention, always as a background/border with dark text —
 * never as text color on white. Everything that doesn't need eyes on it stays
 * gray, so the orange keeps its meaning.
 */
const BADGE_TONE = {
  /** Needs attention — away, expected, prohibited items, awaiting signatures. */
  attention:
    "rounded-full border-l-4 border-accent bg-accent-soft px-2.5 py-0.5 text-xs font-medium text-ink",
  /** Settled state, deliberately quiet — e.g. checked out. */
  quiet: "rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-500",
  /** Present/normal — outlined, no fill. */
  neutral:
    "rounded-full border border-gray-200 px-2.5 py-0.5 text-xs font-medium text-gray-600",
} as const;

export type BadgeTone = keyof typeof BADGE_TONE;

export function Badge({
  tone,
  className,
  children,
}: {
  tone: BadgeTone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span className={className ? `${BADGE_TONE[tone]} ${className}` : BADGE_TONE[tone]}>
      {children}
    </span>
  );
}

/**
 * Inline attention highlight — a soft orange wash behind a few words in
 * running text (the dashboard's "2 away" inside a hallway subtitle). For a
 * freestanding label use <Badge tone="attention"> instead.
 */
export function HighlightMark({ children }: { children: ReactNode }) {
  return <span className="rounded bg-accent-soft px-1.5 py-0.5">{children}</span>;
}

/**
 * Navy identity square — the dashboard's hallway abbreviation tile (H1, L2…).
 */
export function SquareBadge({ children }: { children: ReactNode }) {
  return (
    <span className="flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-navy text-sm font-bold text-white">
      {children}
    </span>
  );
}
