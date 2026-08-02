import { PageTitle } from "@/components/ui/typography";
import { Card, CardLink } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";

const CARDS = [
  { href: "/admin/residents", label: "Residents", desc: "Open stays for new and returning students; edit, archive, and set the term." },
  { href: "/admin/rooms", label: "Rooms", desc: "Manage rooms within each hallway." },
  { href: "/admin/staff", label: "Staff", desc: "Invite and remove RAs; assign hallway coverage." },
  { href: "/admin/inventory", label: "Inventory template", desc: "Edit the room-inspection checklist." },
  { href: "/admin/reports", label: "Reports", desc: "Weekly RA activity — room checks and front desk shifts." },
];

export default function AdminIndex() {
  return (
    <section>
      <PageHeader back={{ href: "/", label: "TUDOR HALL" }} />

      <PageTitle>Admin</PageTitle>
      <Card variant="sheet" className="mt-6">
      {/* Five cards: single column on phones; two columns from sm:, with the
          odd last card stretching full width so no cell sits empty. */}
      <ul className="grid gap-3 sm:grid-cols-2">
        {CARDS.map((c, i) => (
          <li
            key={c.href}
            className={i === CARDS.length - 1 && CARDS.length % 2 === 1 ? "sm:col-span-2" : undefined}
          >
            <CardLink variant="row" href={c.href}>
              <div>
                <span className="font-semibold text-navy">{c.label}</span>
                <p className="mt-1 text-sm text-gray-500">{c.desc}</p>
              </div>
            </CardLink>
          </li>
        ))}
      </ul>
      </Card>
    </section>
  );
}
