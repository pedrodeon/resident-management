import Link from "next/link";
import type { ComponentProps, ElementType } from "react";

/*
 * Surfaces — v2. Values match design-mockups/hallway-v2.html exactly: the
 * floating content sheet, soft-shadowed white cards on it, and gradient glass
 * on the canvas.
 */
const CARD_VARIANT = {
  /**
   * The page content sheet: one per screen, floating on the canvas. White
   * fading to --color-sheet, heavy drop shadow, white lip highlight above.
   */
  sheet:
    "rounded-[30px] bg-gradient-to-b from-white to-sheet p-4 text-ink shadow-[0_-6px_0_rgba(255,255,255,0.10),0_22px_50px_rgba(4,10,26,0.45)] sm:p-5",
  /** Standalone white content card on the canvas (login, dashboard panels). */
  panel:
    "rounded-[26px] bg-gradient-to-b from-white to-sheet p-4 text-ink shadow-[0_22px_50px_rgba(4,10,26,0.45)] sm:p-5",
  /** Gradient glass card on the canvas (the dashboard hero). */
  glass:
    "rounded-2xl border border-white/20 bg-gradient-to-br from-white/20 to-white/[0.04] p-5 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_8px_18px_rgba(4,10,26,0.45)]",
  /** Quieter glass for empty/error states on the canvas. */
  glassQuiet:
    "rounded-2xl border border-white/20 bg-gradient-to-br from-white/15 to-white/[0.04] px-4 py-3 text-white",
  /** A tappable row card inside the sheet (roster rows, hallway rows). */
  row: "flex items-center gap-3 rounded-[18px] border border-line bg-white p-3 shadow-[0_2px_6px_rgba(15,29,58,0.05)] transition-all hover:border-navy/40 hover:shadow-[0_8px_20px_rgba(15,29,58,0.13)]",
  /** Dense divided list (histories, admin lists) on the card surface. */
  list: "divide-y divide-line rounded-[18px] border border-line bg-white shadow-[0_2px_6px_rgba(15,29,58,0.05)]",
  /** Quiet white content box inside the sheet (forms, record cards). */
  box: "rounded-2xl border border-line bg-white p-4 shadow-[0_2px_6px_rgba(15,29,58,0.05)]",
  /** Chip-gray informational box — notes, quotes, gentle empty states. */
  note: "rounded-xl border border-line bg-chip px-4 py-3 text-sm text-muted",
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
