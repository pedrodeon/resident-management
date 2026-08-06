import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getStaffContext } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { PageTitle, SectionLabel } from "@/components/ui/typography";
import { staffName } from "@/lib/staff-name";

export const metadata = { title: "Incident report — Tudor Hall" };

type Row = {
  id: string;
  occurred_on: string;
  occurred_at: string;
  description: string;
  people_involved: string | null;
  actions_taken: string | null;
  created_at: string;
  users: { name: string } | null;
  rooms: { room_number: string; hallways: { name: string } | null } | null;
};

/**
 * One incident report, read-only. RD-only twice: the page checks the role
 * before reading, and RLS refuses the row to anyone else — so a direct URL
 * from an RA renders nothing, not even in the payload.
 */
export default async function IncidentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const staff = await getStaffContext();
  if (!staff || staff.role !== "rd") redirect("/");

  const { id } = await params;
  const supabase = await createClient();
  const { data: incident, error } = await supabase
    .from("incident_reports")
    .select(
      `id, occurred_on, occurred_at, description, people_involved,
       actions_taken, created_at,
       users:created_by ( name ),
       rooms ( room_number, hallways ( name ) )`,
    )
    .eq("id", id)
    .single()
    .overrideTypes<Row>();

  if (error || !incident) notFound();

  const filedAt = new Date(incident.created_at).toLocaleString("en-US", {
    timeZone: "America/Chicago",
    dateStyle: "medium",
    timeStyle: "short",
  });

  return (
    <section>
      <PageHeader back={{ href: "/admin/submissions", label: "Submissions" }} />

      <PageTitle>Incident report</PageTitle>
      <p className="mt-1 text-sm text-white/60">
        Filed by {staffName(incident.users)} · {filedAt}
      </p>

      <Card variant="sheet" className="mt-6">
        <Card as="dl" variant="box" className="grid grid-cols-1 gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
          <div className="flex justify-between gap-4">
            <dt className="text-gray-500">When it happened</dt>
            <dd className="font-medium">
              {incident.occurred_on} at {incident.occurred_at.slice(0, 5)}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-gray-500">Room</dt>
            <dd>
              {incident.rooms
                ? `${incident.rooms.hallways?.name ?? ""} · Room ${incident.rooms.room_number}`
                : "—"}
            </dd>
          </div>
        </Card>

        <div className="mt-6">
          <SectionLabel>What happened</SectionLabel>
          <p className="mt-2 whitespace-pre-wrap text-sm text-ink">
            {incident.description}
          </p>
        </div>

        <div className="mt-6">
          <SectionLabel>People involved</SectionLabel>
          <p className="mt-2 whitespace-pre-wrap text-sm text-ink">
            {incident.people_involved ?? "—"}
          </p>
        </div>

        <div className="mt-6">
          <SectionLabel>Actions taken</SectionLabel>
          <p className="mt-2 whitespace-pre-wrap text-sm text-ink">
            {incident.actions_taken ?? "—"}
          </p>
        </div>
      </Card>
    </section>
  );
}
