import Link from "next/link";
import { getStaffContext } from "@/lib/auth";

const SECTIONS = [
  { href: "/admin/residents", label: "Residents" },
  { href: "/admin/rooms", label: "Rooms" },
  { href: "/admin/staff", label: "Staff" },
  { href: "/admin/inventory", label: "Inventory" },
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
        <h1 className="text-2xl font-semibold text-navy">Admin</h1>
        <p className="mt-4 rounded-md border-l-4 border-accent bg-accent-soft px-4 py-3 text-sm text-ink">
          This area is for the Resident Director only.
        </p>
        <Link href="/" className="mt-4 inline-block text-sm text-navy hover:underline">
          ← Back to dashboard
        </Link>
      </section>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2 border-b border-gray-200 pb-3">
        <Link href="/admin" className="text-sm font-semibold text-navy hover:underline">
          Admin
        </Link>
        {SECTIONS.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className="text-sm text-gray-600 hover:text-navy hover:underline"
          >
            · {s.label}
          </Link>
        ))}
      </div>
      <div className="mt-6">{children}</div>
    </div>
  );
}
