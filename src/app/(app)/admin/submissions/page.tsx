import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getStaffContext } from "@/lib/auth";
import { MaintenanceStatusButton } from "@/components/admin/maintenance-status-button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { PageTitle, SectionLabel } from "@/components/ui/typography";
import { staffName } from "@/lib/staff-name";

export const metadata = { title: "Incidents & maintenance — Tudor Hall" };

type IncidentRow = {
  id: string;
  occurred_on: string;
  occurred_at: string;
  description: string;
  created_at: string;
  users: { name: string } | null;
  rooms: { room_number: string; hallways: { name: string } | null } | null;
};

type MaintenanceRow = {
  id: string;
  location: string;
  description: string;
  urgency: "low" | "normal" | "high";
  status: "open" | "done";
  created_at: string;
  users: { name: string } | null;
  done: { name: string } | null;
};

function fmt(ts: string) {
  return new Date(ts).toLocaleString("en-US", {
    timeZone: "America/Chicago",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/**
 * The RD's view of what staff filed: incident reports and maintenance
 * requests. RD-only twice over — the admin layout hides the area, and this
 * page checks the role itself because it renders student-conduct data. RLS is
 * the real boundary: an RA's session reads nothing from either table.
 */
export default async function SubmissionsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const staff = await getStaffContext();
  if (!staff || staff.role !== "rd") redirect("/");

  const { tab } = await searchParams;
  const showMaintenance = tab === "maintenance";

  const supabase = await createClient();
  const [{ data: incidents }, { data: requests }] = await Promise.all([
    supabase
      .from("incident_reports")
      .select(
        `id, occurred_on, occurred_at, description, created_at,
         users:created_by ( name ),
         rooms ( room_number, hallways ( name ) )`,
      )
      .order("created_at", { ascending: false })
      .overrideTypes<IncidentRow[]>(),
    supabase
      .from("maintenance_requests")
      .select(
        `id, location, description, urgency, status, created_at,
         users:created_by ( name ), done:done_by ( name )`,
      )
      .order("created_at", { ascending: false })
      .overrideTypes<MaintenanceRow[]>(),
  ]);

  const incidentList = incidents ?? [];
  const requestList = requests ?? [];
  const openCount = requestList.filter((r) => r.status === "open").length;

  const tabClass = (active: boolean) =>
    `rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
      active ? "bg-navy text-white" : "border border-line text-muted hover:bg-chip"
    }`;

  return (
    <section>
      <PageHeader back={{ href: "/admin", label: "Admin" }} />

      <PageTitle>Incidents &amp; maintenance</PageTitle>
      <p className="mt-1 text-sm text-white/60">
        What staff filed, newest first. Only you can see this — incident
        reports name students.
      </p>

      <Card variant="sheet" className="mt-6">
        <div className="flex flex-wrap items-center justify-between gap-3 px-1">
          <SectionLabel>
            {showMaintenance ? "Maintenance requests" : "Incident reports"}
          </SectionLabel>
          <div className="flex gap-2">
            <Link href="/admin/submissions" className={tabClass(!showMaintenance)}>
              Incidents {incidentList.length}
            </Link>
            <Link
              href="/admin/submissions?tab=maintenance"
              className={tabClass(showMaintenance)}
            >
              Maintenance {openCount} open
            </Link>
          </div>
        </div>

        {showMaintenance ? (
          requestList.length === 0 ? (
            <p className="mt-4 px-1 text-sm text-gray-500">
              No maintenance requests yet.
            </p>
          ) : (
            <Card as="ul" variant="list" className="mt-4">
              {requestList.map((r) => (
                <li key={r.id} id={r.id} className="px-4 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-ink">
                        {r.location}
                      </p>
                      <p className="mt-0.5 text-sm text-ink">{r.description}</p>
                      <p className="mt-1 text-xs text-gray-500">
                        {fmt(r.created_at)} · filed by {staffName(r.users)}
                        {r.status === "done"
                          ? ` · closed by ${staffName(r.done)}`
                          : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {r.urgency === "high" && (
                        <Badge tone="attention">high</Badge>
                      )}
                      {r.status === "done" && <Badge tone="quiet">done</Badge>}
                      <MaintenanceStatusButton id={r.id} status={r.status} />
                    </div>
                  </div>
                </li>
              ))}
            </Card>
          )
        ) : incidentList.length === 0 ? (
          <p className="mt-4 px-1 text-sm text-gray-500">
            No incident reports yet.
          </p>
        ) : (
          <Card as="ul" variant="list" className="mt-4">
            {incidentList.map((i) => (
              <li
                key={i.id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">
                    {i.description}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {i.occurred_on} at {i.occurred_at.slice(0, 5)}
                    {i.rooms
                      ? ` · ${i.rooms.hallways?.name ?? ""} Room ${i.rooms.room_number}`
                      : ""}{" "}
                    · filed by {staffName(i.users)}
                  </p>
                </div>
                <LinkButton
                  variant="subtle"
                  size="sm"
                  href={`/admin/submissions/incidents/${i.id}`}
                >
                  Open
                </LinkButton>
              </li>
            ))}
          </Card>
        )}
      </Card>
    </section>
  );
}
