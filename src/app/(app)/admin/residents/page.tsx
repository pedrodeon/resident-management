import { createClient } from "@/lib/supabase/server";
import { BackLink } from "@/components/back-link";
import {
  ResidentsManager,
  type AdminOccupancy,
  type RoomChoice,
} from "@/components/admin/residents-manager";
import { getCurrentTerm } from "@/lib/current-term";
import type { OccupancyStatus } from "@/lib/types";
import { PageTitle } from "@/components/ui/typography";

// Reads `occupancies` directly, not the current_residents view: this is the one
// screen that must show archived and past-term stays, since it's where they get
// archived and un-archived.
type OccupancyRow = {
  id: string;
  term: string;
  occupancy_status: OccupancyStatus;
  is_archived: boolean;
  room_id: string;
  people: {
    id: string;
    full_name: string;
    student_id: string;
    phone: string | null;
    emergency_contact: string | null;
  } | null;
  rooms: { room_number: string; hallways: { name: string } | null } | null;
};

type RoomRow = {
  id: string;
  room_number: string;
  hallways: { name: string } | null;
};

export default async function AdminResidentsPage() {
  const supabase = await createClient();
  const [{ data: occupancies }, { data: rooms }, term] = await Promise.all([
    supabase
      .from("occupancies")
      .select(
        `id, term, occupancy_status, is_archived, room_id,
         people ( id, full_name, student_id, phone, emergency_contact ),
         rooms ( room_number, hallways ( name ) )`,
      )
      .order("term", { ascending: false })
      .overrideTypes<OccupancyRow[]>(),
    supabase
      .from("rooms")
      .select(`id, room_number, hallways ( name )`)
      .order("room_number")
      .overrideTypes<RoomRow[]>(),
    getCurrentTerm(),
  ]);

  const roomChoices: RoomChoice[] = (rooms ?? []).map((r) => ({
    id: r.id,
    label: `${r.hallways?.name ?? "?"} · Room ${r.room_number}`,
  }));

  const stays: AdminOccupancy[] = (occupancies ?? [])
    .filter((o) => o.people !== null)
    .map((o) => ({
      id: o.id,
      person_id: o.people!.id,
      full_name: o.people!.full_name,
      student_id: o.people!.student_id,
      room_id: o.room_id,
      phone: o.people!.phone ?? "",
      emergency_contact: o.people!.emergency_contact ?? "",
      term: o.term,
      occupancy_status: o.occupancy_status,
      is_archived: o.is_archived,
      room_label: `${o.rooms?.hallways?.name ?? "?"} · Room ${o.rooms?.room_number ?? "?"}`,
    }))
    .sort(
      (a, b) =>
        b.term.localeCompare(a.term) || a.full_name.localeCompare(b.full_name),
    );

  return (
    <section>
      {/* Up one level: section → admin index. */}
      <div className="mb-3">
        <BackLink href="/admin" label="Admin" />
      </div>

      <PageTitle>Residents</PageTitle>
      <p className="mt-1 text-sm text-gray-500">
        A resident is a <strong>person</strong> plus a <strong>stay</strong>. A
        returning student keeps their person record and gets a new stay — their
        old one is never reused or reset.
      </p>
      <div className="mt-6">
        <ResidentsManager
          stays={stays}
          rooms={roomChoices}
          currentTerm={term ?? ""}
        />
      </div>
    </section>
  );
}
