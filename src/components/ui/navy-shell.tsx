import type { ReactNode } from "react";

/**
 * Full-bleed navy-gradient region — the dashboard's dark canvas. Breaks out of
 * the white `<main>` padding so it sits flush under the shared navy header,
 * with page blocks stacked at the system's gap-5 rhythm.
 */
export function NavyShell({
  lead,
  children,
}: {
  /** The quiet line at the top (the dashboard's greeting). */
  lead: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="-mx-4 -my-8 min-h-[calc(100vh-3.5rem)] bg-gradient-to-b from-navy-dark to-navy px-4 pb-10 pt-6 sm:-mx-6 sm:px-6">
      <p className="text-sm text-white/70">{lead}</p>
      <div className="mt-4 flex flex-col gap-5">{children}</div>
    </div>
  );
}
