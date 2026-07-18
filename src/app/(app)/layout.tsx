import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
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
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="flex min-h-screen flex-col">
      <header className="bg-navy text-white">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-5">
            <Link
              href="/"
              className="text-lg font-bold tracking-[0.2em] hover:text-white/80"
            >
              TUDOR HALL
            </Link>
            <Link
              href="/desk"
              className="text-sm text-white/80 transition-colors hover:text-white"
            >
              Move-in / out
            </Link>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-white/70 sm:inline">
              {user.email}
            </span>
            <form action={signOut}>
              <button
                type="submit"
                className="rounded-md border border-white/30 px-3 py-1.5 text-sm transition-colors hover:bg-navy-light"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6">
        {children}
      </main>
    </div>
  );
}
