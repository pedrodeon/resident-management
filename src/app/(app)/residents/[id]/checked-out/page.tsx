import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LinkButton } from "@/components/ui/button";
import { LocalTime } from "@/components/ui/local-time";

type CheckedOutRow = {
  id: string;
  occupancy_status: string;
  people: { full_name: string } | null;
  rooms: { room_number: string; hallways: { id: string } | null } | null;
  occupancy_events: { type: string; timestamp: string }[];
  inspections: {
    type: string;
    inspection_signature_waivers: { reason: string } | null;
  }[];
};

export const metadata = { title: "Checked out — Tudor Hall" };

/**
 * The confirmation after a check-out is fully finalized — the mirror of
 * ./checked-in. Reaching `checked_out` is only possible through
 * record_occupancy, which refuses without a move-out inspection carrying the
 * RA signature AND the resident signature or a recorded waiver — so status +
 * the check_out event ARE the gate. Anyone arriving mid-flow bounces to the
 * stay's own screen.
 *
 * Deliberately NOT green: the palette reserves green for the check-in
 * confirmation alone. This screen is the glass/navy variant, with the orange
 * accent only on the waiver note (a status that deserves attention).
 */
export default async function CheckedOutPage({
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
       occupancy_events ( type, timestamp ),
       inspections ( type, inspection_signature_waivers ( reason ) )`,
    )
    .eq("id", id)
    .single()
    .overrideTypes<CheckedOutRow>();

  const checkOut = stay?.occupancy_events
    .filter((e) => e.type === "check_out")
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0];

  if (!stay || stay.occupancy_status !== "checked_out" || !checkOut) {
    redirect(`/residents/${id}`);
  }

  // The escape hatch: the resident half was satisfied by a recorded waiver
  // instead of a signature — say so on the confirmation.
  const waiver =
    stay.inspections.find(
      (i) => i.type === "move_out" && i.inspection_signature_waivers !== null,
    )?.inspection_signature_waivers ?? null;

  return (
    <section className="flex min-h-[70vh] flex-col items-center justify-center py-10 text-center">
      <div className="flex h-28 w-28 items-center justify-center rounded-full border border-white/25 bg-gradient-to-br from-white/25 to-white/5">
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
        Resident Checked Out
      </h1>
      <p className="mt-2 text-white/60">
        {stay.people?.full_name}
        {stay.rooms ? ` · Room ${stay.rooms.room_number}` : ""}
      </p>

      <p className="mt-5 inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-4 py-1.5 text-sm font-semibold text-white/80">
        <span className="h-2 w-2 rounded-full bg-white/70" aria-hidden="true" />
        Checked out · <LocalTime iso={checkOut.timestamp} />
      </p>

      {waiver && (
        <p className="mt-4 max-w-sm rounded-xl border border-accent-border bg-accent-soft px-4 py-2 text-sm text-ink">
          The resident didn&rsquo;t sign — recorded as unavailable/declined:
          &ldquo;{waiver.reason}&rdquo;
        </p>
      )}

      <div className="mt-9 flex w-full max-w-sm flex-col gap-3">
        <LinkButton
          variant="light"
          size="lg"
          href={stay.rooms?.hallways ? `/hallways/${stay.rooms.hallways.id}` : "/"}
        >
          View hallway roster
        </LinkButton>
        <LinkButton variant="ghost" size="lg" href="/desk">
          Check out someone else
        </LinkButton>
      </div>
    </section>
  );
}
