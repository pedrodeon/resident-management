import { createClient } from "@/lib/supabase/server";
import { RoomsManager, type HallwayGroup } from "@/components/admin/rooms-manager";

type HallwayRow = {
  id: string;
  name: string;
  sort_order: number;
  rooms: { id: string; room_number: string; capacity: number; residents: { id: string }[] }[];
};

export default async function AdminRoomsPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("hallways")
    .select(
      `id, name, sort_order,
       rooms ( id, room_number, capacity, residents ( id ) )`,
    )
    .order("sort_order")
    .overrideTypes<HallwayRow[]>();

  const hallways: HallwayGroup[] = (data ?? []).map((h) => ({
    id: h.id,
    name: h.name,
    rooms: [...h.rooms]
      .sort((a, b) => a.room_number.localeCompare(b.room_number, undefined, { numeric: true }))
      .map((r) => ({
        id: r.id,
        room_number: r.room_number,
        capacity: r.capacity,
        occupants: r.residents.length,
      })),
  }));

  return (
    <section>
      <h1 className="text-2xl font-semibold text-navy">Rooms</h1>
      <div className="mt-6">
        <RoomsManager hallways={hallways} />
      </div>
    </section>
  );
}
