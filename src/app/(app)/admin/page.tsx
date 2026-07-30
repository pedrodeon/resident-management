import Link from "next/link";
import { BackLink } from "@/components/back-link";

const CARDS = [
  { href: "/admin/residents", label: "Residents", desc: "Open stays for new and returning students; edit, archive, and set the term." },
  { href: "/admin/rooms", label: "Rooms", desc: "Manage rooms within each hallway." },
  { href: "/admin/staff", label: "Staff", desc: "Invite and remove RAs; assign hallway coverage." },
  { href: "/admin/inventory", label: "Inventory template", desc: "Edit the room-inspection checklist." },
];

export default function AdminIndex() {
  return (
    <section>
      {/* Up one level: admin → dashboard. */}
      <div className="mb-3">
        <BackLink href="/" label="TUDOR HALL" />
      </div>

      <h1 className="text-2xl font-semibold text-navy">Admin</h1>
      <ul className="mt-6 grid gap-3 sm:grid-cols-2">
        {CARDS.map((c) => (
          <li key={c.href}>
            <Link
              href={c.href}
              className="block rounded-lg border border-gray-200 bg-white p-4 transition-colors hover:border-navy"
            >
              <span className="font-semibold text-navy">{c.label}</span>
              <p className="mt-1 text-sm text-gray-500">{c.desc}</p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
