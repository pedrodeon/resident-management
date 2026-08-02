import Link from "next/link";
import { getStaffContext } from "@/lib/auth";

const SECTIONS = [
  { href: "/admin/residents", label: "Residents" },
  { href: "/admin/rooms", label: "Rooms" },
  { href: "/admin/staff", label: "Staff" },
  { href: "/admin/inventory", label: "Inventory" },
  { href: "/admin/reports", label: "Reports" },
];

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

  return (
    <div>
      <div className="flex flex-wrap gap-2 border-b border-white/10 pb-3">
        <Link href="/admin" className="text-sm font-semibold text-white hover:underline">
          Admin
        </Link>
        {SECTIONS.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className="text-sm text-white/60 hover:text-white hover:underline"
          >
            · {s.label}
          </Link>
        ))}
      </div>
      <div className="mt-6">{children}</div>
    </div>
  );
}
