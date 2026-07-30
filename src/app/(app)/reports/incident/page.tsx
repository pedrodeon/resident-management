import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { PageTitle } from "@/components/ui/typography";
import {
  IncidentForm,
  type IncidentResident,
  type RoomOption,
} from "@/components/incident-form";

export const metadata = { title: "Incident report — Tudor Hall" };

type ResidentRow = {
  id: string;
  full_name: string;
  student_id: string;
  room_id: string;
  rooms: { room_number: string; hallways: { name: string } | null } | null;
};

type RoomRow = {
  id: string;
  room_number: string;
  hallways: { name: string; sort_order: number } | null;
};

export default async function IncidentReportPage() {
  const supabase = await createClient();
  const [{ data: residents }, { data: rooms }] = await Promise.all([
    supabase
      .from("current_residents")
      .select(
        `id, full_name, student_id, room_id,
         rooms ( room_number, hallways ( name ) )`,
      )
      .order("full_name")
      .overrideTypes<ResidentRow[]>(),
    supabase
      .from("rooms")
      .select(`id, room_number, hallways ( name, sort_order )`)
      .overrideTypes<RoomRow[]>(),
  ]);

  const residentOptions: IncidentResident[] = (residents ?? []).map((r) => ({
    id: r.id,
    full_name: r.full_name,
    student_id: r.student_id,
    room_id: r.room_id,
    room_label: `${r.rooms?.hallways?.name ?? "?"} · Room ${r.rooms?.room_number ?? "?"}`,
  }));

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
          residents={residentOptions}
          rooms={roomOptions}
          recipientsHint="the configured incident contacts"
        />
      </Card>
    </section>
  );
}
