import { createClient } from "@/lib/supabase/server";
import { BackLink } from "@/components/back-link";
import { DeskConsole, type DeskResident } from "@/components/desk-console";
import type { OccupancyStatus } from "@/lib/types";

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
    .from("residents")
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
    .map((r) => {
      // Gate progress per flow, as "halves satisfied" out of 2. Move-in: the
      // two signature roles. Move-out: the RA signature, plus the resident
      // signature OR a recorded waiver. The record_occupancy RPC enforces the
      // same rules server-side.
      const best = (type: "move_in" | "move_out") =>
        r.inspections
          .filter((i) => i.type === type)
          .map((i) => {
            const roles = new Set(i.inspection_signatures.map((s) => s.role));
            const residentHalf =
              roles.has("resident") ||
              (type === "move_out" && i.inspection_signature_waivers !== null);
            return {
              inspectionId: i.id,
              signatures: (roles.has("ra") ? 1 : 0) + (residentHalf ? 1 : 0),
            };
          })
          .sort((a, b) => b.signatures - a.signatures)[0] ?? null;
      return {
        id: r.id,
        full_name: r.full_name,
        student_id: r.student_id,
        room_id: r.room_id,
        room_number: r.rooms!.room_number,
        hallway_id: r.rooms!.hallways!.id,
        hallway_name: r.rooms!.hallways!.name,
        occupancy_status: r.occupancy_status,
        move_in: best("move_in"),
        move_out: best("move_out"),
      };
    });

  return (
    <section>
      {/* Up one level: desk → dashboard. */}
      <div className="mb-3">
        <BackLink href="/" label="TUDOR HALL" />
      </div>

      <h1 className="text-2xl font-semibold text-navy">Move-in / Move-out</h1>
      <p className="mt-1 text-sm text-gray-500">
        Search any resident to record a check-in or check-out.
      </p>

      {error ? (
        <p className="mt-4 rounded-md border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
          Couldn’t load residents. Apply the schema and seed data — see
          docs/SETUP.md.
        </p>
      ) : (
        <div className="mt-6">
          <DeskConsole residents={residents} />
        </div>
      )}
    </section>
  );
}
