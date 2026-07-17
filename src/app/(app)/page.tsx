import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { Hallway } from "@/lib/types";

// Nested shape returned by the dashboard query below.
type HallwayWithCounts = Hallway & {
  rooms: { residents: { occupancy_status: string; is_present: boolean }[] }[];
  hallway_assignments: { users: { name: string } | null }[];
};

function countsFor(hallway: HallwayWithCounts) {
  const residents = hallway.rooms.flatMap((room) => room.residents);
  return {
    checkedIn: residents.filter((r) => r.occupancy_status === "checked_in")
      .length,
    expected: residents.filter((r) => r.occupancy_status === "expected").length,
    away: residents.filter(
      (r) => r.occupancy_status === "checked_in" && !r.is_present,
    ).length,
  };
}

export default async function Dashboard() {
  const supabase = await createClient();
  const { data: hallways, error } = await supabase
    .from("hallways")
    .select(
      `id, name, wing, floor, section, sort_order,
       rooms ( residents ( occupancy_status, is_present ) ),
       hallway_assignments ( users ( name ) )`,
    )
    .order("sort_order")
    .overrideTypes<HallwayWithCounts[]>();

  if (error || !hallways || hallways.length === 0) {
    return (
      <section>
        <h1 className="text-2xl font-semibold text-navy">TUDOR HALL</h1>
        <p className="mt-4 rounded-md border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
          No hallways found. Apply the schema and seed data first — see
          docs/SETUP.md.
        </p>
      </section>
    );
  }

  // sort_order already interleaves the wings floor by floor; group by floor
  // for display (CLAUDE.md: grouped by wing and floor in sort_order).
  const floors = [...new Set(hallways.map((h) => h.floor))].sort();

  return (
    <section>
      <h1 className="text-2xl font-semibold text-navy">TUDOR HALL</h1>

      {floors.map((floor) => (
        <div key={floor} className="mt-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
            Floor {floor}
          </h2>
          <ul className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {hallways
              .filter((h) => h.floor === floor)
              .map((hallway) => {
                const counts = countsFor(hallway);
                const raNames = hallway.hallway_assignments
                  .map((a) => a.users?.name)
                  .filter(Boolean);
                return (
                  <li key={hallway.id}>
                    <Link
                      href={`/hallways/${hallway.id}`}
                      className="block rounded-lg border border-gray-200 bg-white p-4 transition-colors hover:border-navy"
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="font-semibold text-navy">
                          {hallway.name}
                        </span>
                        <span className="text-xs capitalize text-gray-400">
                          {hallway.wing} wing
                        </span>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2 text-xs">
                        <span className="rounded-full border border-gray-200 px-2 py-0.5 text-gray-600">
                          {counts.checkedIn} checked in
                        </span>
                        {counts.expected > 0 && (
                          <span className="rounded-full border-l-4 border-accent bg-accent-soft px-2 py-0.5 font-medium text-ink">
                            {counts.expected} expected
                          </span>
                        )}
                        {counts.away > 0 && (
                          <span className="rounded-full border-l-4 border-accent bg-accent-soft px-2 py-0.5 font-medium text-ink">
                            {counts.away} away
                          </span>
                        )}
                      </div>

                      {raNames.length > 0 && (
                        <p className="mt-3 text-xs text-gray-500">
                          RA: {raNames.join(", ")}
                        </p>
                      )}
                    </Link>
                  </li>
                );
              })}
          </ul>
        </div>
      ))}
    </section>
  );
}
