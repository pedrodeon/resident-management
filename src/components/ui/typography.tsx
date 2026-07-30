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

/** Screen heading — navy, one per page. */
export function PageTitle({ className, children }: TextProps) {
  return <h1 className={cx("text-2xl font-semibold text-navy", className)}>{children}</h1>;
}

/** Heading inside a white card (the dashboard's "Hallways"). */
export function CardTitle({ className, children }: TextProps) {
  return <h2 className={cx("px-1 text-lg font-bold text-navy", className)}>{children}</h2>;
}

/** Uppercase label above a list or section on a white background. */
export function SectionLabel({ className, children }: TextProps) {
  return (
    <h2 className={cx("text-sm font-semibold uppercase tracking-wide text-gray-500", className)}>
      {children}
    </h2>
  );
}

/** Uppercase label on a navy surface (the dashboard hero's "Checked in"). */
export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-wider text-white/60">
      {children}
    </p>
  );
}
