import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { PageTitle } from "@/components/ui/typography";
import { IncidentForm, type RoomOption } from "@/components/incident-form";

export const metadata = { title: "Incident report — Tudor Hall" };

type RoomRow = {
  id: string;
  room_number: string;
  hallways: { name: string; sort_order: number } | null;
};

export default async function IncidentReportPage() {
  const supabase = await createClient();
  const { data: rooms } = await supabase
    .from("rooms")
    .select(`id, room_number, hallways ( name, sort_order )`)
    .overrideTypes<RoomRow[]>();

  const roomOptions: RoomOption[] = (rooms ?? [])
    .sort(
      (a, b) =>
        (a.hallways?.sort_order ?? 0) - (b.hallways?.sort_order ?? 0) ||
        a.room_number.localeCompare(b.room_number, undefined, { numeric: true }),
    )
    .map((r) => ({
      id: r.id,
      label: `${r.hallways?.name ?? "?"} · Room ${r.room_number}`,
    }));

  return (
    <section>
      <PageHeader back={{ href: "/", label: "TUDOR HALL" }} />

      <PageTitle>Incident report</PageTitle>
      <p className="mt-1 text-sm text-white/60">
        Sent by email to the incident contacts — it is not stored in the app.
      </p>

      <Card variant="sheet" className="mt-6">
        <IncidentForm
          rooms={roomOptions}
          recipientsHint="the configured incident contacts"
        />
      </Card>
    </section>
  );
}
