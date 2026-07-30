import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { PageTitle, SectionLabel } from "@/components/ui/typography";
import {
  MaintenanceList,
  type MaintenanceItem,
} from "@/components/maintenance-list";

export const metadata = { title: "Maintenance — Tudor Hall" };

type RequestRow = {
  id: string;
  location: string;
  description: string;
  urgency: "low" | "normal" | "high";
  status: "open" | "done";
  created_at: string;
  done_at: string | null;
  filed_by: { name: string } | null;
  closed_by: { name: string } | null;
};

export default async function MaintenancePage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("maintenance_requests")
    .select(
      `id, location, description, urgency, status, created_at, done_at,
       filed_by:created_by ( name ),
       closed_by:done_by ( name )`,
    )
    .order("created_at", { ascending: false })
    .overrideTypes<RequestRow[]>();

  const items: MaintenanceItem[] = (data ?? []).map((r) => ({
    id: r.id,
    location: r.location,
    description: r.description,
    urgency: r.urgency,
    status: r.status,
    created_at: r.created_at,
    done_at: r.done_at,
    filedBy: r.filed_by?.name ?? null,
    doneBy: r.closed_by?.name ?? null,
  }));

  return (
    <section>
      <PageHeader back={{ href: "/", label: "TUDOR HALL" }} />

      <PageTitle>Maintenance</PageTitle>
      <p className="mt-1 text-sm text-white/60">
        Anything broken, anywhere in the building. Requests email the
        maintenance contacts and stay here until fixed.
      </p>

      <Card variant="sheet" className="mt-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionLabel>Requests</SectionLabel>
          <LinkButton size="sm" href="/maintenance/new">
            New request
          </LinkButton>
        </div>
        <div className="mt-3">
          <MaintenanceList items={items} />
        </div>
      </Card>
    </section>
  );
}
