import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LinkButton } from "@/components/ui/button";
import { LocalTime } from "@/components/ui/local-time";

type CheckedInRow = {
  id: string;
  occupancy_status: string;
  people: { full_name: string } | null;
  rooms: { room_number: string; hallways: { id: string } | null } | null;
  occupancy_events: { type: string; timestamp: string }[];
};

export const metadata = { title: "Checked in — Tudor Hall" };

/**
 * The confirmation after a check-in is fully finalized. Reaching
 * `checked_in` is only possible through record_occupancy, which refuses the
 * event without a fully-signed move-in inspection — so status + the check_in
 * event ARE the "inspection done, both signatures captured" guard. Anyone
 * arriving mid-flow (or for a stay that was never checked in) is bounced to
 * the stay's own screen, which shows where the ladder actually stands.
 */
export default async function CheckedInPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: stay } = await supabase
    .from("occupancies")
    .select(
      `id, occupancy_status,
       people ( full_name ),
       rooms ( room_number, hallways ( id ) ),
       occupancy_events ( type, timestamp )`,
    )
    .eq("id", id)
    .single()
    .overrideTypes<CheckedInRow>();

  const checkIn = stay?.occupancy_events
    .filter((e) => e.type === "check_in")
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0];

  if (!stay || stay.occupancy_status !== "checked_in" || !checkIn) {
    redirect(`/residents/${id}`);
  }

  return (
    <section className="flex min-h-[70vh] flex-col items-center justify-center py-10 text-center">
      <div className="flex h-28 w-28 items-center justify-center rounded-full bg-success">
        <svg width="52" height="52" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M5 13l4.5 4.5L19 7"
            stroke="white"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      <h1 className="mt-8 text-3xl font-bold tracking-tight text-white">
        Resident Checked In
      </h1>
      <p className="mt-2 text-white/60">
        {stay.people?.full_name}
        {stay.rooms ? ` · Room ${stay.rooms.room_number}` : ""}
      </p>

      <p className="mt-5 inline-flex items-center gap-2 rounded-full border border-success/40 bg-success/15 px-4 py-1.5 text-sm font-semibold text-success-bright">
        <span className="h-2 w-2 rounded-full bg-success-bright" aria-hidden="true" />
        In building · <LocalTime iso={checkIn.timestamp} />
      </p>

      <div className="mt-9 flex w-full max-w-sm flex-col gap-3">
        <LinkButton
          variant="light"
          size="lg"
          href={stay.rooms?.hallways ? `/hallways/${stay.rooms.hallways.id}` : "/"}
        >
          View hallway roster
        </LinkButton>
        <LinkButton variant="ghost" size="lg" href="/desk">
          Check in someone else
        </LinkButton>
      </div>
    </section>
  );
}
