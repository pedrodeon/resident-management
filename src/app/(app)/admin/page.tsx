import { BackLink } from "@/components/back-link";
import { PageTitle } from "@/components/ui/typography";
import { CardLink } from "@/components/ui/card";

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

      <PageTitle>Admin</PageTitle>
      <ul className="mt-6 grid gap-3 sm:grid-cols-2">
        {CARDS.map((c) => (
          <li key={c.href}>
            <CardLink variant="row" href={c.href}>
              <div>
                <span className="font-semibold text-navy">{c.label}</span>
                <p className="mt-1 text-sm text-gray-500">{c.desc}</p>
              </div>
            </CardLink>
          </li>
        ))}
      </ul>
    </section>
  );
}
