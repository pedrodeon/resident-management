import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getStaffContext } from "@/lib/auth";
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
  const { data: hallways, error } = await supabase
    .from("hallways")
    .select(
      `id, name, wing, floor, section, sort_order,
       rooms ( residents ( occupancy_status, is_present ) ),
       hallway_assignments ( users ( name ) )`,
    )
    .order("sort_order")
    .overrideTypes<HallwayWithCounts[]>();

  const firstName = staff?.name.trim().split(/\s+/)[0] ?? "there";

  if (error || !hallways || hallways.length === 0) {
    return (
      <DashboardShell greeting={`${greeting()}, ${firstName}`}>
        <p className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/70">
          No hallways found. Apply the schema and seed data first — see
          docs/SETUP.md.
        </p>
      </DashboardShell>
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
    <DashboardShell greeting={`${greeting()}, ${firstName}`}>
      {/* Hero stat */}
      <div className="rounded-2xl border border-white/10 bg-white/5 p-5 shadow-lg">
        <p className="text-xs font-semibold uppercase tracking-wider text-white/60">
          Checked in
        </p>
        <p className="mt-1 flex items-baseline gap-2">
          <span className="text-5xl font-bold tracking-tight text-white">
            {totals.checkedIn}
          </span>
          <span className="text-lg font-medium text-white/50">
            / {totals.total}
          </span>
        </p>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-gradient-to-r from-accent to-white"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="mt-2 text-sm text-white/60">
          {pct}% of the roster is in the building
        </p>
      </div>

      {/* Quick actions — real routes only (the /desk move-in/out flow) */}
      <div className="grid grid-cols-2 gap-3 sm:max-w-md">
        <ActionTile href="/desk" label="Check in">
          <CheckIcon />
        </ActionTile>
        <ActionTile href="/desk" label="Sign out">
          <SwapIcon />
        </ActionTile>
      </div>

      {/* Hallways card */}
      <div className="rounded-2xl bg-white p-4 shadow-xl sm:p-5">
        <h2 className="px-1 text-lg font-bold text-navy">Hallways</h2>
        <ul className="mt-3 flex flex-col gap-2.5">
          {hallways.map((hallway) => {
            const counts = countsFor(hallway);
            const coveredBy = hallway.hallway_assignments
              .map((a) => a.users?.name)
              .filter(Boolean);
            return (
              <li key={hallway.id}>
                <Link
                  href={`/hallways/${hallway.id}`}
                  className="flex items-center gap-3 rounded-xl border border-gray-100 bg-white p-3 shadow-sm transition-colors hover:border-navy/30 hover:bg-gray-50"
                >
                  <span className="flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-navy text-sm font-bold text-white">
                    {abbrev(hallway)}
                  </span>
                  <div className="min-w-0">
                    <p className="font-bold text-ink">{hallway.name}</p>
                    <p className="mt-0.5 truncate text-sm text-gray-500">
                      {counts.checkedIn} in · {counts.expected} expected
                      {counts.away > 0 && (
                        <span className="font-medium text-ink">
                          {" · "}
                          <span className="rounded bg-accent-soft px-1.5 py-0.5">
                            {counts.away} away
                          </span>
                        </span>
                      )}
                      {coveredBy.length > 0 && ` · ${coveredBy.join(", ")}`}
                    </p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </DashboardShell>
  );
}

/**
 * Navy-gradient dashboard region. Breaks out of the white `<main>` padding so
 * it sits flush under the shared navy header, matching the mockup's dark top.
 */
function DashboardShell({
  greeting,
  children,
}: {
  greeting: string;
  children: React.ReactNode;
}) {
  return (
    <div className="-mx-4 -my-8 min-h-[calc(100vh-3.5rem)] bg-gradient-to-b from-navy-dark to-navy px-4 pb-10 pt-6 sm:-mx-6 sm:px-6">
      <p className="text-sm text-white/70">{greeting}</p>
      <div className="mt-4 flex flex-col gap-5">{children}</div>
    </div>
  );
}

function ActionTile({
  href,
  label,
  children,
}: {
  href: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="flex flex-col items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-4 text-white transition-colors hover:bg-white/10"
    >
      <span className="text-white/90">{children}</span>
      <span className="text-xs font-medium">{label}</span>
    </Link>
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
