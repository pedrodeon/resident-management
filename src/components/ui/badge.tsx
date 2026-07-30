import type { ReactNode } from "react";

/*
 * Badges, chips, and identity marks — v2. The accent rule (CLAUDE.md): light
 * orange marks ONLY status that needs attention, always as a background/border
 * with dark text — never as text color on white. Quiet states use the chip
 * fill so the orange keeps its meaning.
 */
const BADGE_TONE = {
  /** Needs attention — away, expected, prohibited items, awaiting signatures. */
  attention:
    "rounded-full border border-accent-border bg-accent-soft px-2.5 py-0.5 text-xs font-semibold text-ink",
  /** Settled state, deliberately quiet — e.g. checked out. */
  quiet: "rounded-full bg-chip px-2.5 py-0.5 text-xs font-semibold text-muted",
  /** Present/normal — outlined, no fill. */
  neutral:
    "rounded-full border border-line px-2.5 py-0.5 text-xs font-medium text-muted",
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
 * running text (the dashboard\'s "2 away" inside a hallway subtitle). For a
 * freestanding label use <Badge tone="attention"> instead.
 */
export function HighlightMark({ children }: { children: ReactNode }) {
  return <span className="rounded-md bg-accent-soft px-1.5 py-0.5">{children}</span>;
}

/* The v2 navy identity gradient — squircles and avatars share it. */
const IDENTITY =
  "flex flex-none items-center justify-center bg-gradient-to-br from-navy-light to-navy text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_5px_11px_rgba(15,29,58,0.26)]";

/**
 * Navy gradient squircle — hallway abbreviations (H1, L2…) and room numbers.
 * `size="sm"` is the room-tile 34px square.
 */
export function SquareBadge({
  size = "md",
  children,
}: {
  size?: "sm" | "md";
  children: ReactNode;
}) {
  const dims =
    size === "sm"
      ? "h-[34px] w-[34px] rounded-xl text-xs font-bold"
      : "h-11 w-11 rounded-xl text-sm font-bold";
  return <span className={`${IDENTITY} ${dims}`}>{children}</span>;
}

/**
 * Initials avatar. `tone="navy"` (roster rows) or `tone="glass"` (the
 * "Covered by …" line on the canvas). Pass the full name; initials derive.
 */
export function Avatar({
  name,
  tone = "navy",
  size = "md",
}: {
  name: string;
  tone?: "navy" | "glass";
  size?: "sm" | "md";
}) {
  const initials = name
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const dims =
    size === "sm"
      ? "h-[22px] w-[22px] text-[9px] font-bold"
      : "h-[38px] w-[38px] text-xs font-semibold";
  const skin =
    tone === "glass"
      ? "flex flex-none items-center justify-center border border-white/30 bg-gradient-to-br from-white/35 to-white/10 text-white"
      : IDENTITY;
  return (
    <span aria-hidden="true" className={`${skin} ${dims} rounded-full`}>
      {initials}
    </span>
  );
}

/**
 * Room status dot: accent = someone is away · navy = residents in · faint =
 * empty. Pure signal, always paired with visible text for meaning.
 */
export function StatusDot({
  state,
}: {
  state: "attention" | "occupied" | "empty";
}) {
  const fill =
    state === "attention"
      ? "bg-accent"
      : state === "occupied"
        ? "bg-navy"
        : "bg-line";
  return <span aria-hidden="true" className={`h-2 w-2 rounded-full ${fill}`} />;
}
