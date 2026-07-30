import type { ReactNode } from "react";

type TextProps = { className?: string; children: ReactNode };

function cx(base: string, className?: string) {
  return className ? `${base} ${className}` : base;
}

/*
 * Type roles — the pairings of size/weight/color that make screens read as one
 * app. The scale itself is Tailwind's; the ROLES are the system (documented in
 * globals.css alongside the color tokens).
 */

/** Screen heading — white on the canvas, one per page. */
export function PageTitle({ className, children }: TextProps) {
  return (
    <h1 className={cx("text-3xl font-bold tracking-tight text-white", className)}>
      {children}
    </h1>
  );
}

/** Heading inside the sheet or a card ("Rooms", "Roster", "Hallways"). */
export function CardTitle({ className, children }: TextProps) {
  return (
    <h2 className={cx("text-[17px] font-bold tracking-tight text-navy", className)}>
      {children}
    </h2>
  );
}

/** Section header inside the sheet — same voice as CardTitle. */
export function SectionLabel({ className, children }: TextProps) {
  return (
    <h2 className={cx("text-[17px] font-bold tracking-tight text-navy", className)}>
      {children}
    </h2>
  );
}

/** Wide-tracked uppercase label on the canvas (brand line, hero labels). */
export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/50">
      {children}
    </p>
  );
}
