import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { StatusChip } from "@/components/status-chip";
import type { OccupancyStatus } from "@/lib/types";

type RoomDetail = {
  id: string;
  room_number: string;
  capacity: number;
  hallways: { id: string; name: string } | null;
  residents: {
    id: string;
    full_name: string;
    student_id: string;
    occupancy_status: OccupancyStatus;
    is_present: boolean;
  }[];
};

export default async function RoomPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: room, error } = await supabase
    .from("rooms")
    .select(
      `id, room_number, capacity,
       hallways ( id, name ),
       residents ( id, full_name, student_id, occupancy_status, is_present )`,
    )
    .eq("id", id)
    .single()
    .overrideTypes<RoomDetail>();

  if (error || !room || !room.hallways) notFound();

  return (
    <section>
      <nav className="text-sm text-gray-500">
        <Link href="/" className="hover:text-navy hover:underline">
          TUDOR HALL
        </Link>{" "}
        /{" "}
        <Link
          href={`/hallways/${room.hallways.id}`}
          className="hover:text-navy hover:underline"
        >
          {room.hallways.name}
        </Link>{" "}
        / Room {room.room_number}
      </nav>

      <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h1 className="text-2xl font-semibold text-navy">
          Room {room.room_number}
        </h1>
        <span className="text-sm text-gray-500">
          {room.residents.length} / {room.capacity} residents
        </span>
      </div>

      <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-gray-500">
        Residents
      </h2>
      {room.residents.length === 0 ? (
        <p className="mt-2 text-sm text-gray-500">This room is empty.</p>
      ) : (
        <ul className="mt-2 divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
          {room.residents.map((resident) => (
            <li
              key={resident.id}
              className="flex items-center justify-between gap-3 px-4 py-3"
            >
              <div>
                <p className="text-sm font-medium">{resident.full_name}</p>
                <p className="mt-0.5 font-mono text-xs text-gray-500">
                  {resident.student_id}
                </p>
              </div>
              <StatusChip
                status={resident.occupancy_status}
                isPresent={resident.is_present}
              />
            </li>
          ))}
        </ul>
      )}

      {/* Step 6 adds the inspection history + create-inspection flow here. */}
      <p className="mt-8 text-xs text-gray-400">
        Inspections for this room will appear here (build step 6).
      </p>
    </section>
  );
}
