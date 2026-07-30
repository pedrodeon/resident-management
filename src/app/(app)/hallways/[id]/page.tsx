import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BackLink } from "@/components/back-link";
import { HallwayRoster, type RosterEntry } from "@/components/hallway-roster";
import { CardLink } from "@/components/ui/card";
import { SquareBadge } from "@/components/ui/badge";
import { PageTitle, SectionLabel } from "@/components/ui/typography";
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
    current_residents: RosterResident[];
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
               current_residents ( id, full_name, occupancy_status, is_present ) )`,
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
  // `id` here is the occupancy id — what set_presence and the resident screen
  // both key on.
  const roster: RosterEntry[] = rooms
    .flatMap((room) =>
      room.current_residents.map((resident) => ({
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
      {/* Up one level: hallway → dashboard. */}
      <div className="mb-3">
        <BackLink href="/" label="TUDOR HALL" />
      </div>

      <nav className="text-sm text-gray-500">
        <Link href="/" className="hover:text-navy hover:underline">
          TUDOR HALL
        </Link>{" "}
        / {hallway.name}
      </nav>

      <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <PageTitle>{hallway.name}</PageTitle>
        <span className="text-sm capitalize text-gray-500">
          {hallway.wing} wing · floor {hallway.floor}
        </span>
        {coveredBy.length > 0 && (
          <span className="text-sm text-gray-500">
            Covered by: {coveredBy.join(", ")}
          </span>
        )}
      </div>

      <div className="mt-8">
        <SectionLabel>Rooms</SectionLabel>
      </div>
      {/* Row cards (the dashboard's hallway-row idiom) are wider than the old
          square tiles, so one fewer column at each break. */}
      <ul className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {rooms.map((room) => (
          <li key={room.id}>
            <CardLink variant="row" href={`/rooms/${room.id}`}>
              <SquareBadge>{room.room_number}</SquareBadge>
              <div className="min-w-0">
                <p className="font-bold text-ink">Room {room.room_number}</p>
                <p className="mt-0.5 truncate text-sm text-gray-500">
                  {room.current_residents.length} / {room.capacity} residents
                </p>
              </div>
            </CardLink>
          </li>
        ))}
      </ul>

      <div className="mt-8">
        <HallwayRoster hallwayId={hallway.id} residents={roster} />
      </div>
    </section>
  );
}
