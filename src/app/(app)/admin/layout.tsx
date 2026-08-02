import Link from "next/link";
import { getStaffContext } from "@/lib/auth";

/**
 * RD-only area. RLS already gates every write to the RD; this is the UI guard
 * (defense-in-depth) so RAs never see admin controls at all.
 */
export default async function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const staff = await getStaffContext();

  if (!staff || staff.role !== "rd") {
    return (
      <section>
        <h1 className="text-3xl font-bold tracking-tight text-white">Admin</h1>
        <p className="mt-4 rounded-xl border border-accent-border bg-accent-soft px-3.5 py-2.5 text-sm text-ink">
          This area is for the Resident Director only.
        </p>
        <Link href="/" className="mt-4 inline-block text-sm text-white/70 hover:text-white hover:underline">
          ← Back to dashboard
        </Link>
      </section>
    );
  }

  // No sub-nav up here: the Admin index's cards are the navigation, and each
  // section's back circle returns to it.
  return <>{children}</>;
}
