import { createClient } from "@/lib/supabase/server";
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
};

export const metadata = { title: "Move-in / Move-out — Tudor Hall" };

export default async function DeskPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("residents")
    .select(
      `id, full_name, student_id, room_id, occupancy_status,
       rooms ( room_number, hallways ( id, name ) )`,
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
    }));

  return (
    <section>
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
