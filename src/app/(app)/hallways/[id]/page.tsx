import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { HallwayRoster, type RosterEntry } from "@/components/hallway-roster";
import { Card } from "@/components/ui/card";
import { Avatar, SquareBadge, StatusDot } from "@/components/ui/badge";
import { PageTitle, SectionLabel } from "@/components/ui/typography";
import type { Hallway, OccupancyStatus } from "@/lib/types";
import { PageHeader } from "@/components/ui/page-header";

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
    .filter((n): n is string => Boolean(n));
  const totalBeds = rooms.reduce((sum, room) => sum + room.capacity, 0);
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
      {/* Canvas zone: back, context eyebrow, title, coverage. */}
      <PageHeader back={{ href: "/", label: "TUDOR HALL" }} />

      <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-white/40">
        Floor {hallway.floor} · {hallway.wing} wing
      </p>
      <PageTitle className="mt-1">{hallway.name}</PageTitle>
      {coveredBy.length > 0 && (
        <div className="mt-2 flex items-center gap-2">
          <Avatar name={coveredBy[0]} tone="glass" size="sm" />
          <p className="text-[12.5px] text-white/60">
            Covered by {coveredBy.join(", ")}
          </p>
        </div>
      )}

      {/* The content sheet — everything below the header floats on it. */}
      <Card variant="sheet" className="mt-6">
        <div className="flex flex-wrap items-center justify-between gap-3 px-1">
          <SectionLabel>Rooms</SectionLabel>
          <p className="text-xs text-muted">
            {rooms.length} rooms · {totalBeds} beds
          </p>
        </div>

        <ul className="mt-3 grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(96px,1fr))]">
          {rooms.map((room) => {
            const residentsIn = room.current_residents.filter(
              (r) => r.occupancy_status === "checked_in" && r.is_present,
            ).length;
            const hasAway = room.current_residents.some(
              (r) => r.occupancy_status === "checked_in" && !r.is_present,
            );
            return (
              <li key={room.id}>
                <Link
                  href={`/rooms/${room.id}`}
                  className={`flex flex-col gap-2 rounded-2xl border bg-white p-[11px] pb-2.5 shadow-[0_2px_6px_rgba(15,29,58,0.05)] transition-all hover:border-navy hover:shadow-[0_8px_20px_rgba(15,29,58,0.13)] ${
                    hasAway ? "border-accent-border" : "border-line"
                  }`}
                >
                  <span className="flex items-center justify-between gap-1.5">
                    <SquareBadge size="sm">{room.room_number}</SquareBadge>
                    <StatusDot
                      state={
                        hasAway
                          ? "attention"
                          : residentsIn > 0
                            ? "occupied"
                            : "empty"
                      }
                    />
                  </span>
                  <span>
                    <span className="block text-[13px] font-semibold text-ink">
                      {residentsIn}/{room.capacity}
                    </span>
                    <span className="mt-0.5 block text-[10px] font-medium uppercase tracking-wider text-faint">
                      Residents in
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>

        <div className="mt-6">
          <HallwayRoster hallwayId={hallway.id} residents={roster} />
        </div>
      </Card>
    </section>
  );
}
