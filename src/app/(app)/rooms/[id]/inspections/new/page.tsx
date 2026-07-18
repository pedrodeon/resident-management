import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { InspectionForm } from "@/components/inspection-form";
import type { InspectionType, InventoryItem } from "@/lib/types";

type RoomRow = {
  id: string;
  room_number: string;
  hallways: { id: string; name: string } | null;
  residents: { id: string; full_name: string }[];
};

const VALID_TYPES: InspectionType[] = ["move_in", "move_out", "periodic"];

export default async function NewInspectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ type?: string }>;
}) {
  const { id } = await params;
  const { type } = await searchParams;
  const supabase = await createClient();

  const [{ data: room, error }, { data: template }] = await Promise.all([
    supabase
      .from("rooms")
      .select(
        `id, room_number,
         hallways ( id, name ),
         residents ( id, full_name )`,
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

  const defaultType: InspectionType =
    type && VALID_TYPES.includes(type as InspectionType)
      ? (type as InspectionType)
      : "periodic";

  return (
    <section>
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
        /{" "}
        <Link
          href={`/rooms/${room.id}`}
          className="hover:text-navy hover:underline"
        >
          Room {room.room_number}
        </Link>{" "}
        / New inspection
      </nav>

      <h1 className="mt-2 text-2xl font-semibold text-navy">New inspection</h1>
      <p className="mt-1 text-sm text-gray-500">
        A dated snapshot of Room {room.room_number}. Immutable once saved.
      </p>

      <div className="mt-6">
        <InspectionForm
          roomId={room.id}
          roomNumber={room.room_number}
          residents={room.residents}
          template={template ?? []}
          defaultType={defaultType}
        />
      </div>
    </section>
  );
}
