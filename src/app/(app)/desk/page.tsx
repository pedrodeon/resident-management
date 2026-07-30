import { createClient } from "@/lib/supabase/server";
import { BackLink } from "@/components/back-link";
import { DeskConsole, type DeskResident } from "@/components/desk-console";
import { gateProgress } from "@/lib/occupancy-gate";
import type { OccupancyStatus } from "@/lib/types";
import { Card } from "@/components/ui/card";
import { PageTitle } from "@/components/ui/typography";

// A row of the current_residents view: `id` is the occupancy id, which is also
// what the inspections embed and every RPC key on.
type ResidentRow = {
  id: string;
  full_name: string;
  student_id: string;
  room_id: string;
  occupancy_status: OccupancyStatus;
  rooms: {
    room_number: string;
    hallways: { id: string; name: string } | null;
  } | null;
  inspections: {
    id: string;
    type: string;
    inspection_signatures: { role: string }[];
    inspection_signature_waivers: { id: string } | null;
  }[];
};

export const metadata = { title: "Move-in / Move-out — Tudor Hall" };

export default async function DeskPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("current_residents")
    .select(
      `id, full_name, student_id, room_id, occupancy_status,
       rooms ( room_number, hallways ( id, name ) ),
       inspections ( id, type, inspection_signatures ( role ),
                     inspection_signature_waivers ( id ) )`,
    )
    .order("full_name")
    .overrideTypes<ResidentRow[]>();

  const residents: DeskResident[] = (data ?? [])
    .filter((r) => r.rooms?.hallways)
    .map((r) => ({
      id: r.id,
      full_name: r.full_name,
      student_id: r.student_id,
      room_id: r.room_id,
      room_number: r.rooms!.room_number,
      hallway_id: r.rooms!.hallways!.id,
      hallway_name: r.rooms!.hallways!.name,
      occupancy_status: r.occupancy_status,
      // Shared with the resident screen — see src/lib/occupancy-gate.ts.
      move_in: gateProgress(r.inspections, "move_in"),
      move_out: gateProgress(r.inspections, "move_out"),
    }));

  return (
    <section>
      {/* Up one level: desk → dashboard. */}
      <div className="mb-3">
        <BackLink href="/" label="TUDOR HALL" />
      </div>

      <PageTitle>Move-in / Move-out</PageTitle>
      <p className="mt-1 text-sm text-gray-500">
        Search any resident to record a check-in or check-out.
      </p>

      {error ? (
        <Card as="p" variant="note" className="mt-4">
          Couldn’t load residents. Apply the schema and seed data — see
          docs/SETUP.md.
        </Card>
      ) : (
        <div className="mt-6">
          <DeskConsole residents={residents} />
        </div>
      )}
    </section>
  );
}
