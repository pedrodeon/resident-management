import Link from "next/link";
import type { ComponentProps, ElementType } from "react";

/*
 * Surfaces. Class strings are copied byte-for-byte from the redesigned
 * dashboard — the source of truth for the app's look — so adopting a Card
 * elsewhere reproduces it exactly.
 */
const CARD_VARIANT = {
  /** White content card on a navy or gray background. */
  panel: "rounded-2xl bg-white p-4 shadow-xl sm:p-5",
  /** Translucent "glass" card on a navy surface (the dashboard hero). */
  glass: "rounded-2xl border border-white/10 bg-white/5 p-5 shadow-lg",
  /** Quieter glass panel for empty/error states on navy. */
  glassQuiet: "rounded-2xl border border-white/10 bg-white/5 px-4 py-3",
  /** A tappable row inside a panel (the dashboard's hallway rows). */
  row: "flex items-center gap-3 rounded-xl border border-gray-100 bg-white p-3 shadow-sm transition-colors hover:border-navy/30 hover:bg-gray-50",
  /** Dense divided list (rosters, histories) on the row-card surface. */
  list: "divide-y divide-gray-100 rounded-xl border border-gray-100 bg-white shadow-sm",
} as const;

export type CardVariant = keyof typeof CARD_VARIANT;

function cx(variant: CardVariant, className?: string) {
  return className ? `${CARD_VARIANT[variant]} ${className}` : CARD_VARIANT[variant];
}

export function Card({
  variant,
  className,
  as,
  ...props
}: {
  variant: CardVariant;
  className?: string;
  /** Element to render — lists want `as="ul"`; defaults to a div. */
  as?: ElementType;
} & ComponentProps<"div">) {
  const Tag: ElementType = as ?? "div";
  return <Tag className={cx(variant, className)} {...props} />;
}

/** Card-shaped link — same surfaces, for navigable rows and tiles. */
export function CardLink({
  variant,
  className,
  ...props
}: { variant: CardVariant; className?: string } & ComponentProps<typeof Link>) {
  return <Link className={cx(variant, className)} {...props} />;
}
