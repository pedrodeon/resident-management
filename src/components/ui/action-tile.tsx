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
      className="flex flex-col items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-4 text-white transition-colors hover:bg-white/10"
    >
      <span className="text-white/90">{children}</span>
      <span className="text-xs font-medium">{label}</span>
    </Link>
  );
}
