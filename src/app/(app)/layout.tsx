import Link from "next/link";
import { redirect } from "next/navigation";
import { getAccessState } from "@/lib/auth";
import { accessDecision } from "@/lib/access";
import { signOut } from "./actions";

/**
 * Protected shell for every staff-facing screen. The proxy already redirects
 * unauthenticated requests, but we re-check here as defense in depth — never
 * rely on a single layer for access control.
 */
export default async function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { authenticated, staff } = await getAccessState();
  switch (accessDecision({ authenticated, hasStaffRecord: staff !== null })) {
    case "redirect-login":
      redirect("/login");
    case "redirect-no-access":
      // Authenticated but no staff row — send them somewhere terminal instead
      // of bouncing to /login (which would send them right back here).
      redirect("/no-access");
  }
  // "allow": staff is guaranteed non-null; this also narrows it for TS.
  if (!staff) redirect("/no-access");
  const isRd = staff.role === "rd";

  const glassPill =
    "whitespace-nowrap rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-medium text-white/80 transition-colors hover:bg-white/20 hover:text-white sm:px-3.5 sm:text-sm";

  return (
    // canvas-v2 is the app-wide backdrop; overflow-x-clip: no element may ever
    // widen the page — wide content must scroll inside its own overflow-x-auto
    // container (the compare table does). header/main are `relative` so they
    // paint above the canvas glow orbs (positioned pseudo-elements).
    <div className="canvas-v2 flex min-h-screen flex-col overflow-x-clip">
      <header className="relative">
        {/* flex-wrap: on very narrow phones the Sign out group drops to a
            second line instead of forcing a horizontal page scroll. */}
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-x-2 gap-y-1 px-4 py-3 sm:gap-4 sm:px-6">
          <div className="flex items-center gap-2 sm:gap-5">
            <Link
              href="/"
              className="whitespace-nowrap text-[11px] font-bold uppercase tracking-[0.2em] text-white/80 transition-colors hover:text-white sm:text-xs"
            >
              Tudor Hall
            </Link>
            <Link href="/desk" className={glassPill}>
              Move-in / out
            </Link>
            {isRd && (
              <Link href="/admin" className={glassPill}>
                Admin
              </Link>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <span className="hidden text-sm text-white/50 sm:inline">
              {staff.email}
            </span>
            <form action={signOut}>
              <button type="submit" className={glassPill}>
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="relative mx-auto w-full max-w-5xl flex-1 px-4 pb-10 pt-4 sm:px-6">
        {children}
      </main>
    </div>
  );
}
