import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BackLink } from "@/components/back-link";
import { StatusChip } from "@/components/ui/status-chip";
import {
  InspectionHistory,
  type HistoryEntry,
} from "@/components/inspection-history";
import type { InspectionType, OccupancyStatus } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/button";
import { PageTitle, SectionLabel } from "@/components/ui/typography";

type RoomDetail = {
  id: string;
  room_number: string;
  capacity: number;
  hallways: { id: string; name: string } | null;
  /** Current-term, non-archived stays only; `id` is the occupancy id. */
  current_residents: {
    id: string;
    full_name: string;
    student_id: string;
    occupancy_status: OccupancyStatus;
    is_present: boolean;
  }[];
};

type InspectionRow = {
  id: string;
  type: InspectionType;
  timestamp: string;
  users: { name: string } | null;
};

type RoomCheckRow = {
  id: string;
  timestamp: string;
  overall: number;
  prohibited_items: string | null;
  users: { name: string } | null;
};

export default async function RoomPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: room, error }, { data: inspectionRows }, { data: checkRows }] =
    await Promise.all([
      supabase
        .from("rooms")
        .select(
          `id, room_number, capacity,
           hallways ( id, name ),
           current_residents ( id, full_name, student_id, occupancy_status, is_present )`,
        )
        .eq("id", id)
        .single()
        .overrideTypes<RoomDetail>(),
      supabase
        .from("inspections")
        .select(`id, type, timestamp, users:inspected_by ( name )`)
        .eq("room_id", id)
        .order("timestamp", { ascending: false })
        .overrideTypes<InspectionRow[]>(),
      supabase
        .from("room_checks")
        .select(`id, timestamp, overall, prohibited_items, users:checked_by ( name )`)
        .eq("room_id", id)
        .order("timestamp", { ascending: false })
        .overrideTypes<RoomCheckRow[]>(),
    ]);

  if (error || !room || !room.hallways) notFound();

  const inspections: HistoryEntry[] = (inspectionRows ?? []).map((r) => ({
    id: r.id,
    type: r.type,
    timestamp: r.timestamp,
    inspector: r.users?.name ?? null,
  }));

  return (
    <section>
      {/* Up one level: room → its hallway. */}
      <div className="mb-3">
        <BackLink
          href={`/hallways/${room.hallways.id}`}
          label={room.hallways.name}
        />
      </div>

      <nav className="text-sm text-gray-500">
        <Link href="/" className="hover:text-navy hover:underline">
          TUDOR HALL
        </Link>{" "}
        /{" "}
        <Link
          href={`/hallways/${room.hallways.id}`}
          className="hover:text-navy hover:underline"
        >
          {room.hallways.name}
        </Link>{" "}
        / Room {room.room_number}
      </nav>

      <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <PageTitle>Room {room.room_number}</PageTitle>
        <span className="text-sm text-gray-500">
          {room.current_residents.length} / {room.capacity} residents
        </span>
      </div>

      <SectionLabel className="mt-8">Residents</SectionLabel>
      {room.current_residents.length === 0 ? (
        <p className="mt-2 text-sm text-gray-500">This room is empty.</p>
      ) : (
        <Card as="ul" variant="list" className="mt-2">
          {/* Whole row is the tap target — check-in/out lives on the
              resident's own screen. */}
          {room.current_residents.map((resident) => (
            <li key={resident.id}>
              <Link
                href={`/residents/${resident.id}`}
                className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-gray-50"
              >
                <div>
                  <p className="text-sm font-medium text-ink">
                    {resident.full_name}
                  </p>
                  <p className="mt-0.5 font-mono text-xs text-gray-500">
                    {resident.student_id}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusChip
                    status={resident.occupancy_status}
                    isPresent={resident.is_present}
                  />
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    aria-hidden="true"
                    className="flex-none text-gray-400"
                  >
                    <path
                      d="M10 6l6 6-6 6"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
              </Link>
            </li>
          ))}
        </Card>
      )}

      <div className="mt-8">
        <InspectionHistory roomId={room.id} inspections={inspections} />
      </div>

      {/* Weekly room checks (RA condition ratings). */}
      <div className="mt-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionLabel>Room checks</SectionLabel>
          <LinkButton size="sm" href={`/rooms/${room.id}/checks/new`}>
            Room check
          </LinkButton>
        </div>
        {(checkRows ?? []).length === 0 ? (
          <p className="mt-2 text-sm text-gray-500">No room checks yet.</p>
        ) : (
          <Card as="ul" variant="list" className="mt-2">
            {(checkRows ?? []).map((check) => (
              <li key={check.id}>
                <Link
                  href={`/room-checks/${check.id}`}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 hover:bg-gray-50"
                >
                  <span className="flex items-center gap-2 text-sm">
                    <span className="font-medium">
                      Overall {check.overall} / 5
                    </span>
                    {check.prohibited_items && (
                      <Badge tone="attention">prohibited items</Badge>
                    )}
                  </span>
                  <span className="text-xs text-gray-500">
                    {new Date(check.timestamp).toLocaleDateString()}
                    {check.users ? ` · ${check.users.name}` : ""}
                  </span>
                </Link>
              </li>
            ))}
          </Card>
        )}
      </div>
    </section>
  );
}
