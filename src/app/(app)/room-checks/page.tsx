import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { BackLink } from "@/components/back-link";
import { Card } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/button";
import { PageTitle, SectionLabel } from "@/components/ui/typography";

// The weekly room-check workflow's front door (linked from the dashboard
// tile): every room grouped by hallway, with its most recent check and a
// direct link to start this week's. Kept deliberately plain — no orange
// here, or on week one all 84 rooms would scream "never checked".

type HallwayRow = {
  id: string;
  name: string;
  sort_order: number;
  rooms: {
    id: string;
    room_number: string;
    room_checks: { timestamp: string }[];
  }[];
};

export const metadata = { title: "Room checks — Tudor Hall" };

export default async function RoomChecksIndexPage() {
  const supabase = await createClient();
  const { data: hallways, error } = await supabase
    .from("hallways")
    .select(
      `id, name, sort_order,
       rooms ( id, room_number, room_checks ( timestamp ) )`,
    )
    .order("sort_order")
    .overrideTypes<HallwayRow[]>();

  if (error || !hallways || hallways.length === 0) {
    return (
      <section>
        <PageTitle>Room checks</PageTitle>
        <Card as="p" variant="note" className="mt-4">
          No rooms found. Apply the schema and seed data first — see
          docs/SETUP.md.
        </Card>
      </section>
    );
  }

  return (
    <section>
      {/* Up one level: room-checks index → dashboard. */}
      <div className="mb-3">
        <BackLink href="/" label="TUDOR HALL" />
      </div>

      <PageTitle>Room checks</PageTitle>
      <p className="mt-1 text-sm text-gray-500">
        Weekly condition checks. Pick a room to record this week&rsquo;s.
      </p>

      {hallways.map((hallway) => (
        <div key={hallway.id} className="mt-8">
          <SectionLabel>
            <Link
              href={`/hallways/${hallway.id}`}
              className="hover:text-navy hover:underline"
            >
              {hallway.name}
            </Link>
          </SectionLabel>
          <Card as="ul" variant="list" className="mt-2">
            {[...hallway.rooms]
              .sort((a, b) =>
                a.room_number.localeCompare(b.room_number, undefined, {
                  numeric: true,
                }),
              )
              .map((room) => {
                const lastCheck = room.room_checks
                  .map((c) => c.timestamp)
                  .sort()
                  .at(-1);
                return (
                  <li
                    key={room.id}
                    className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5"
                  >
                    <div className="flex items-baseline gap-3">
                      <Link
                        href={`/rooms/${room.id}`}
                        className="text-sm font-medium hover:text-navy hover:underline"
                      >
                        Room {room.room_number}
                      </Link>
                      <span className="text-xs text-gray-500">
                        {lastCheck
                          ? `last checked ${new Date(lastCheck).toLocaleDateString()}`
                          : "never checked"}
                      </span>
                    </div>
                    <LinkButton
                      variant="outline"
                      size="sm"
                      href={`/rooms/${room.id}/checks/new`}
                    >
                      Room check
                    </LinkButton>
                  </li>
                );
              })}
          </Card>
        </div>
      ))}
    </section>
  );
}
