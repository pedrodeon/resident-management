import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { HallwayRoster, type RosterEntry } from "@/components/hallway-roster";
import type { Hallway, OccupancyStatus } from "@/lib/types";

type RosterResident = {
  id: string;
  full_name: string;
  occupancy_status: OccupancyStatus;
  is_present: boolean;
};

type HallwayDetail = Hallway & {
  hallway_assignments: { users: { name: string } | null }[];
  rooms: {
    id: string;
    room_number: string;
    capacity: number;
    residents: RosterResident[];
  }[];
};

export default async function HallwayPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: hallway, error } = await supabase
    .from("hallways")
    .select(
      `id, name, wing, floor, section, sort_order,
       hallway_assignments ( users ( name ) ),
       rooms ( id, room_number, capacity,
               residents ( id, full_name, occupancy_status, is_present ) )`,
    )
    .eq("id", id)
    .single()
    .overrideTypes<HallwayDetail>();

  // .single() errors on zero rows; a malformed uuid also lands here.
  if (error || !hallway) notFound();

  const rooms = [...hallway.rooms].sort((a, b) =>
    a.room_number.localeCompare(b.room_number, undefined, { numeric: true }),
  );
  // Coverage isn't 1:1 and the RD covers some hallways — "covered by", not "RA".
  const coveredBy = hallway.hallway_assignments
    .map((a) => a.users?.name)
    .filter(Boolean);
  const roster: RosterEntry[] = rooms
    .flatMap((room) =>
      room.residents.map((resident) => ({
        id: resident.id,
        full_name: resident.full_name,
        room_number: room.room_number,
        occupancy_status: resident.occupancy_status,
        is_present: resident.is_present,
      })),
    )
    .sort((a, b) => a.full_name.localeCompare(b.full_name));

  return (
    <section>
      <nav className="text-sm text-gray-500">
        <Link href="/" className="hover:text-navy hover:underline">
          TUDOR HALL
        </Link>{" "}
        / {hallway.name}
      </nav>

      <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h1 className="text-2xl font-semibold text-navy">{hallway.name}</h1>
        <span className="text-sm capitalize text-gray-500">
          {hallway.wing} wing · floor {hallway.floor}
        </span>
        {coveredBy.length > 0 && (
          <span className="text-sm text-gray-500">
            Covered by: {coveredBy.join(", ")}
          </span>
        )}
      </div>

      <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-gray-500">
        Rooms
      </h2>
      <ul className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {rooms.map((room) => (
          <li key={room.id}>
            <Link
              href={`/rooms/${room.id}`}
              className="block rounded-lg border border-gray-200 bg-white p-4 transition-colors hover:border-navy"
            >
              <span className="text-lg font-semibold text-navy">
                {room.room_number}
              </span>
              <p className="mt-1 text-xs text-gray-500">
                {room.residents.length} / {room.capacity} residents
              </p>
            </Link>
          </li>
        ))}
      </ul>

      <div className="mt-8">
        <HallwayRoster hallwayId={hallway.id} residents={roster} />
      </div>
    </section>
  );
}
