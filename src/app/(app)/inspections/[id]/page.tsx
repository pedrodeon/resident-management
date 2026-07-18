import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ConditionChip } from "@/components/condition-chip";
import type { InspectionType, ItemCondition } from "@/lib/types";

type InspectionDetail = {
  id: string;
  type: InspectionType;
  timestamp: string;
  notes: string | null;
  rooms: { id: string; room_number: string; hallways: { id: string; name: string } | null } | null;
  residents: { full_name: string } | null;
  users: { name: string } | null;
  inspection_items: {
    id: string;
    condition: ItemCondition;
    note: string | null;
    inventory_items: { name: string; sort_order: number } | null;
  }[];
};

const TYPE_LABEL: Record<InspectionType, string> = {
  move_in: "Move-in",
  move_out: "Move-out",
  periodic: "Periodic",
};

export default async function InspectionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: inspection, error } = await supabase
    .from("inspections")
    .select(
      `id, type, timestamp, notes,
       rooms ( id, room_number, hallways ( id, name ) ),
       residents ( full_name ),
       users:inspected_by ( name ),
       inspection_items ( id, condition, note,
                          inventory_items ( name, sort_order ) )`,
    )
    .eq("id", id)
    .single()
    .overrideTypes<InspectionDetail>();

  if (error || !inspection || !inspection.rooms) notFound();

  const items = [...inspection.inspection_items].sort(
    (a, b) =>
      (a.inventory_items?.sort_order ?? 0) - (b.inventory_items?.sort_order ?? 0),
  );
  const date = new Date(inspection.timestamp).toLocaleString();
  const room = inspection.rooms;

  return (
    <section>
      <nav className="text-sm text-gray-500">
        <Link href="/" className="hover:text-navy hover:underline">
          TUDOR HALL
        </Link>{" "}
        /{" "}
        {room.hallways && (
          <>
            <Link
              href={`/hallways/${room.hallways.id}`}
              className="hover:text-navy hover:underline"
            >
              {room.hallways.name}
            </Link>{" "}
            /{" "}
          </>
        )}
        <Link
          href={`/rooms/${room.id}`}
          className="hover:text-navy hover:underline"
        >
          Room {room.room_number}
        </Link>{" "}
        / Inspection
      </nav>

      <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-2xl font-semibold text-navy">
          {TYPE_LABEL[inspection.type]} inspection
        </h1>
        <span className="text-sm text-gray-500">{date}</span>
      </div>
      <p className="mt-1 text-sm text-gray-500">
        Room {room.room_number}
        {inspection.residents ? ` · ${inspection.residents.full_name}` : ""}
        {inspection.users ? ` · by ${inspection.users.name}` : ""}
      </p>

      {inspection.notes && (
        <p className="mt-4 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm">
          {inspection.notes}
        </p>
      )}

      <ul className="mt-6 divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
        {items.map((item) => (
          <li
            key={item.id}
            className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5"
          >
            <div>
              <span className="text-sm font-medium">
                {item.inventory_items?.name}
              </span>
              {item.note && (
                <span className="ml-2 text-xs text-gray-500">{item.note}</span>
              )}
            </div>
            <ConditionChip condition={item.condition} />
          </li>
        ))}
      </ul>
    </section>
  );
}
