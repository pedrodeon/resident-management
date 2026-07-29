import { createClient } from "@/lib/supabase/server";
import { BackLink } from "@/components/back-link";
import {
  ResidentsManager,
  type AdminResident,
  type RoomChoice,
} from "@/components/admin/residents-manager";

type ResidentRow = {
  id: string;
  full_name: string;
  student_id: string;
  phone: string | null;
  emergency_contact: string | null;
  room_id: string;
  rooms: { room_number: string; hallways: { name: string } | null } | null;
};

type RoomRow = {
  id: string;
  room_number: string;
  hallways: { name: string } | null;
};

export default async function AdminResidentsPage() {
  const supabase = await createClient();
  const [{ data: residents }, { data: rooms }] = await Promise.all([
    supabase
      .from("residents")
      .select(
        `id, full_name, student_id, phone, emergency_contact, room_id,
         rooms ( room_number, hallways ( name ) )`,
      )
      .order("full_name")
      .overrideTypes<ResidentRow[]>(),
    supabase
      .from("rooms")
      .select(`id, room_number, hallways ( name )`)
      .order("room_number")
      .overrideTypes<RoomRow[]>(),
  ]);

  const roomChoices: RoomChoice[] = (rooms ?? []).map((r) => ({
    id: r.id,
    label: `${r.hallways?.name ?? "?"} · Room ${r.room_number}`,
  }));

  const adminResidents: AdminResident[] = (residents ?? []).map((r) => ({
    id: r.id,
    full_name: r.full_name,
    student_id: r.student_id,
    room_id: r.room_id,
    phone: r.phone ?? "",
    emergency_contact: r.emergency_contact ?? "",
    room_label: `${r.rooms?.hallways?.name ?? "?"} · Room ${r.rooms?.room_number ?? "?"}`,
  }));

  return (
    <section>
      {/* Up one level: section → admin index. */}
      <div className="mb-3">
        <BackLink href="/admin" label="Admin" />
      </div>

      <h1 className="text-2xl font-semibold text-navy">Residents</h1>
      <div className="mt-6">
        <ResidentsManager residents={adminResidents} rooms={roomChoices} />
      </div>
    </section>
  );
}
