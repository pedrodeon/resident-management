import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getStaffContext } from "@/lib/auth";
import { StatusChip } from "@/components/status-chip";
import { ReassignRoom, type RoomOption } from "@/components/reassign-room";
import type { OccupancyStatus } from "@/lib/types";

type ResidentDetail = {
  id: string;
  full_name: string;
  student_id: string;
  phone: string | null;
  emergency_contact: string | null;
  occupancy_status: OccupancyStatus;
  is_present: boolean;
  room_id: string;
  rooms: { id: string; room_number: string; hallways: { id: string; name: string } | null } | null;
};

type OccupancyRow = {
  id: string;
  type: string;
  timestamp: string;
  note: string | null;
  users: { name: string } | null;
};
type PresenceRow = {
  id: string;
  status: string;
  timestamp: string;
  note: string | null;
  users: { name: string } | null;
};
type RoomChangeRow = {
  id: string;
  timestamp: string;
  reason: string | null;
  from_room: { room_number: string } | null;
  to_room: { room_number: string } | null;
  users: { name: string } | null;
};

function fmt(ts: string) {
  return new Date(ts).toLocaleString();
}

export default async function ResidentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const staff = await getStaffContext();
  const isRd = staff?.role === "rd";

  const [
    { data: resident, error },
    { data: occupancy },
    { data: presence },
    { data: roomChanges },
    { data: rooms },
  ] = await Promise.all([
    supabase
      .from("residents")
      .select(
        `id, full_name, student_id, phone, emergency_contact,
         occupancy_status, is_present, room_id,
         rooms ( id, room_number, hallways ( id, name ) )`,
      )
      .eq("id", id)
      .single()
      .overrideTypes<ResidentDetail>(),
    supabase
      .from("occupancy_events")
      .select(`id, type, timestamp, note, users:recorded_by ( name )`)
      .eq("resident_id", id)
      .order("timestamp", { ascending: false })
      .overrideTypes<OccupancyRow[]>(),
    supabase
      .from("presence_events")
      .select(`id, status, timestamp, note, users:recorded_by ( name )`)
      .eq("resident_id", id)
      .order("timestamp", { ascending: false })
      .overrideTypes<PresenceRow[]>(),
    supabase
      .from("room_change_events")
      .select(
        `id, timestamp, reason,
         from_room:from_room_id ( room_number ),
         to_room:to_room_id ( room_number ),
         users:changed_by ( name )`,
      )
      .eq("resident_id", id)
      .order("timestamp", { ascending: false })
      .overrideTypes<RoomChangeRow[]>(),
    // Room list for reassignment (RD only needs it, but cheap to always load).
    isRd
      ? supabase
          .from("rooms")
          .select(`id, room_number, hallways ( name )`)
          .order("room_number")
      : Promise.resolve({ data: null }),
  ]);

  if (error || !resident || !resident.rooms) notFound();

  const room = resident.rooms;
  const roomOptions: RoomOption[] = (
    (rooms as { id: string; room_number: string; hallways: { name: string } | null }[] | null) ?? []
  ).map((r) => ({
    id: r.id,
    label: `${r.hallways?.name ?? "?"} · Room ${r.room_number}`,
  }));

  return (
    <section>
      <nav className="text-sm text-gray-500">
        <Link href="/" className="hover:text-navy hover:underline">
          TUDOR HALL
        </Link>{" "}
        /{" "}
        {room.hallways && (
          <>
            <Link href={`/hallways/${room.hallways.id}`} className="hover:text-navy hover:underline">
              {room.hallways.name}
            </Link>{" "}
            /{" "}
          </>
        )}
        <Link href={`/rooms/${room.id}`} className="hover:text-navy hover:underline">
          Room {room.room_number}
        </Link>{" "}
        / {resident.full_name}
      </nav>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
        <h1 className="text-2xl font-semibold text-navy">{resident.full_name}</h1>
        <StatusChip status={resident.occupancy_status} isPresent={resident.is_present} />
      </div>

      {/* Record */}
      <dl className="mt-4 grid grid-cols-1 gap-x-8 gap-y-2 rounded-lg border border-gray-200 bg-white p-4 text-sm sm:grid-cols-2">
        <div className="flex justify-between gap-4">
          <dt className="text-gray-500">Student ID</dt>
          <dd className="font-mono">{resident.student_id}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-gray-500">Room</dt>
          <dd>
            {room.hallways?.name} · {room.room_number}
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-gray-500">Phone</dt>
          <dd>{resident.phone ?? "—"}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-gray-500">Emergency contact</dt>
          <dd>{resident.emergency_contact ?? "—"}</dd>
        </div>
      </dl>

      {isRd && (
        <div className="mt-4">
          <ReassignRoom
            residentId={resident.id}
            currentRoomId={resident.room_id}
            rooms={roomOptions}
          />
        </div>
      )}

      {/* Histories */}
      <History
        title="Occupancy history"
        empty="No check-in / check-out yet."
        rows={(occupancy ?? []).map((e) => ({
          id: e.id,
          label: e.type === "check_in" ? "Checked in" : "Checked out",
          when: fmt(e.timestamp),
          by: e.users?.name ?? null,
          note: e.note,
        }))}
      />
      <History
        title="Presence history"
        empty="No presence changes recorded."
        rows={(presence ?? []).map((e) => ({
          id: e.id,
          label: e.status === "away" ? "Marked away" : "Marked returned",
          when: fmt(e.timestamp),
          by: e.users?.name ?? null,
          note: e.note,
        }))}
      />
      <History
        title="Room-change history"
        empty="No room changes."
        rows={(roomChanges ?? []).map((e) => ({
          id: e.id,
          label: `Moved ${e.from_room ? `from ${e.from_room.room_number} ` : ""}to ${e.to_room?.room_number}`,
          when: fmt(e.timestamp),
          by: e.users?.name ?? null,
          note: e.reason,
        }))}
      />
    </section>
  );
}

type HistoryRow = {
  id: string;
  label: string;
  when: string;
  by: string | null;
  note: string | null;
};

function History({
  title,
  empty,
  rows,
}: {
  title: string;
  empty: string;
  rows: HistoryRow[];
}) {
  return (
    <div className="mt-8">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
        {title}
      </h2>
      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-gray-500">{empty}</p>
      ) : (
        <ul className="mt-2 divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
          {rows.map((row) => (
            <li key={row.id} className="px-4 py-2.5">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="text-sm font-medium">{row.label}</span>
                <span className="text-xs text-gray-500">
                  {row.when}
                  {row.by ? ` · ${row.by}` : ""}
                </span>
              </div>
              {row.note && (
                <p className="mt-0.5 text-xs text-gray-500">{row.note}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
