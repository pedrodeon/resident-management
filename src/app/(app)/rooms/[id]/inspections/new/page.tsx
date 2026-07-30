import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BackLink } from "@/components/back-link";
import { InspectionForm } from "@/components/inspection-form";
import type { CreatableInspectionType, InventoryItem } from "@/lib/types";
import { PageTitle } from "@/components/ui/typography";
import { Card } from "@/components/ui/card";

type RoomRow = {
  id: string;
  room_number: string;
  hallways: { id: string; name: string } | null;
  /** `id` is the occupancy id — the stay this snapshot will be bound to. */
  current_residents: { id: string; full_name: string }[];
};

// Periodic is no longer creatable — routine weekly checks are room_checks.
const VALID_TYPES: CreatableInspectionType[] = ["move_in", "move_out"];

export default async function NewInspectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ type?: string; resident?: string }>;
}) {
  const { id } = await params;
  const { type, resident } = await searchParams;
  const supabase = await createClient();

  const [{ data: room, error }, { data: template }] = await Promise.all([
    supabase
      .from("rooms")
      .select(
        `id, room_number,
         hallways ( id, name ),
         current_residents ( id, full_name )`,
      )
      .eq("id", id)
      .single()
      .overrideTypes<RoomRow>(),
    supabase
      .from("inventory_items")
      .select("id, name, sort_order")
      .order("sort_order")
      .overrideTypes<InventoryItem[]>(),
  ]);

  if (error || !room || !room.hallways) notFound();

  // Every real entry point passes an explicit type; a missing or stale one
  // (e.g. an old ?type=periodic link) falls back to move-in.
  const defaultType: CreatableInspectionType =
    type && VALID_TYPES.includes(type as CreatableInspectionType)
      ? (type as CreatableInspectionType)
      : "move_in";

  // Preselect a resident when the desk sent us here — only if that stay really
  // belongs to this room.
  const defaultResidentId = room.current_residents.some((r) => r.id === resident)
    ? resident
    : undefined;

  return (
    <section>
      {/* Up one level: new-inspection form → its room. */}
      <div className="mb-3">
        <BackLink href={`/rooms/${room.id}`} label={`Room ${room.room_number}`} />
      </div>

      <nav className="text-sm text-white/50">
        <Link href="/" className="hover:text-white hover:underline">
          TUDOR HALL
        </Link>{" "}
        /{" "}
        <Link
          href={`/hallways/${room.hallways.id}`}
          className="hover:text-white hover:underline"
        >
          {room.hallways.name}
        </Link>{" "}
        /{" "}
        <Link
          href={`/rooms/${room.id}`}
          className="hover:text-white hover:underline"
        >
          Room {room.room_number}
        </Link>{" "}
        / New inspection
      </nav>

      <PageTitle className="mt-2">New inspection</PageTitle>
      <p className="mt-1 text-sm text-white/60">
        A dated snapshot of Room {room.room_number}. Immutable once saved.
      </p>

      <Card variant="sheet" className="mt-6">
      <div>
        <InspectionForm
          roomId={room.id}
          roomNumber={room.room_number}
          residents={room.current_residents}
          template={template ?? []}
          defaultType={defaultType}
          defaultResidentId={defaultResidentId}
        />
      </div>
      </Card>
    </section>
  );
}
