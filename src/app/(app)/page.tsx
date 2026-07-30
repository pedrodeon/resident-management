import { createClient } from "@/lib/supabase/server";
import { getStaffContext } from "@/lib/auth";
import { NavyShell } from "@/components/ui/navy-shell";
import { StatCard } from "@/components/ui/stat-card";
import { ActionTile } from "@/components/ui/action-tile";
import { Card, CardLink } from "@/components/ui/card";
import { CardTitle } from "@/components/ui/typography";
import { HighlightMark, SquareBadge } from "@/components/ui/badge";
import type { Hallway } from "@/lib/types";

// Nested shape returned by the dashboard query below.
type HallwayWithCounts = Hallway & {
  rooms: {
    current_residents: { occupancy_status: string; is_present: boolean }[];
  }[];
  hallway_assignments: { users: { name: string } | null }[];
};

function countsFor(hallway: HallwayWithCounts) {
  const residents = hallway.rooms.flatMap((room) => room.current_residents);
  return {
    checkedIn: residents.filter((r) => r.occupancy_status === "checked_in")
      .length,
    expected: residents.filter((r) => r.occupancy_status === "expected").length,
    away: residents.filter(
      (r) => r.occupancy_status === "checked_in" && !r.is_present,
    ).length,
    total: residents.length,
  };
}

// H1, L1, H2A… — the badge label, derived from the hallway's own fields.
function abbrev(hallway: Hallway) {
  return `${hallway.wing[0].toUpperCase()}${hallway.floor}${hallway.section ?? ""}`;
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export default async function Dashboard() {
  const supabase = await createClient();
  const staff = await getStaffContext();
  // current_residents, not occupancies: the view already limits this to the
  // current term's non-archived stays, so past semesters can't inflate a count.
  const { data: hallways, error } = await supabase
    .from("hallways")
    .select(
      `id, name, wing, floor, section, sort_order,
       rooms ( current_residents ( occupancy_status, is_present ) ),
       hallway_assignments ( users ( name ) )`,
    )
    .order("sort_order")
    .overrideTypes<HallwayWithCounts[]>();

  const firstName = staff?.name.trim().split(/\s+/)[0] ?? "there";

  if (error || !hallways || hallways.length === 0) {
    return (
      <NavyShell lead={`${greeting()}, ${firstName}`}>
        <Card variant="glassQuiet" className="text-sm text-white/70">
          No hallways found. Apply the schema and seed data first — see
          docs/SETUP.md.
        </Card>
      </NavyShell>
    );
  }

  // Building-wide totals for the hero stat — aggregated from the rows already
  // fetched, no extra query.
  const totals = hallways.reduce(
    (acc, h) => {
      const c = countsFor(h);
      acc.checkedIn += c.checkedIn;
      acc.total += c.total;
      return acc;
    },
    { checkedIn: 0, total: 0 },
  );
  const pct =
    totals.total > 0 ? Math.round((totals.checkedIn / totals.total) * 100) : 0;

  return (
    <NavyShell lead={`${greeting()}, ${firstName}`}>
      {/* Hero stat */}
      <StatCard
        label="Checked in"
        value={totals.checkedIn}
        max={totals.total}
        pct={pct}
        caption={<>{pct}% of the roster is in the building</>}
      />

      {/* Quick actions — real routes only */}
      <div className="grid grid-cols-3 gap-3 sm:max-w-lg">
        <ActionTile href="/desk" label="Check in">
          <CheckIcon />
        </ActionTile>
        <ActionTile href="/desk" label="Sign out">
          <SwapIcon />
        </ActionTile>
        <ActionTile href="/room-checks" label="Room checks">
          <ChecklistIcon />
        </ActionTile>
      </div>

      {/* Hallways card */}
      <Card variant="panel">
        <CardTitle>Hallways</CardTitle>
        <ul className="mt-3 flex flex-col gap-2.5">
          {hallways.map((hallway) => {
            const counts = countsFor(hallway);
            const coveredBy = hallway.hallway_assignments
              .map((a) => a.users?.name)
              .filter(Boolean);
            return (
              <li key={hallway.id}>
                <CardLink variant="row" href={`/hallways/${hallway.id}`}>
                  <SquareBadge>{abbrev(hallway)}</SquareBadge>
                  <div className="min-w-0">
                    <p className="font-bold text-ink">{hallway.name}</p>
                    <p className="mt-0.5 truncate text-sm text-gray-500">
                      {counts.checkedIn} in · {counts.expected} expected
                      {counts.away > 0 && (
                        <span className="font-medium text-ink">
                          {" · "}
                          <HighlightMark>{counts.away} away</HighlightMark>
                        </span>
                      )}
                      {coveredBy.length > 0 && ` · ${coveredBy.join(", ")}`}
                    </p>
                  </div>
                </CardLink>
              </li>
            );
          })}
        </ul>
      </Card>
    </NavyShell>
  );
}

function CheckIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M5 13l4 4L19 7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SwapIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 8h13l-3-3m6 11H7l3 3"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChecklistIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 6h1.5M4 12h1.5M4 18h1.5M9 6h11M9 12h11M9 18h11"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
