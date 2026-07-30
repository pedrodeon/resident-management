import Link from "next/link";
import type { ReactNode } from "react";

/** Glass quick-action tile on a navy surface — icon over a short label. */
export function ActionTile({
  href,
  label,
  children,
}: {
  href: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="flex flex-col items-center gap-2 rounded-2xl border border-white/20 bg-gradient-to-br from-white/15 to-white/[0.04] px-3 py-4 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] transition-colors hover:from-white/25 hover:to-white/10"
    >
      <span className="text-white/90">{children}</span>
      <span className="text-xs font-medium">{label}</span>
    </Link>
  );
}
