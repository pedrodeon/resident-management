import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Rating } from "@/lib/types";

type CheckDetail = {
  id: string;
  timestamp: string;
  floor_cleanliness: Rating;
  trash: Rating;
  laundry: Rating;
  overall: Rating;
  notes: string | null;
  prohibited_items: string | null;
  rooms: { id: string; room_number: string; hallways: { id: string; name: string } | null } | null;
  users: { name: string } | null;
};

const RATING_LABELS: [keyof Pick<CheckDetail, "floor_cleanliness" | "trash" | "laundry" | "overall">, string][] = [
  ["floor_cleanliness", "Floor cleanliness"],
  ["trash", "Trash"],
  ["laundry", "Laundry"],
  ["overall", "Overall"],
];

export default async function RoomCheckPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: check, error } = await supabase
    .from("room_checks")
    .select(
      `id, timestamp, floor_cleanliness, trash, laundry, overall, notes,
       prohibited_items,
       rooms ( id, room_number, hallways ( id, name ) ),
       users:checked_by ( name )`,
    )
    .eq("id", id)
    .single()
    .overrideTypes<CheckDetail>();

  if (error || !check || !check.rooms) notFound();
  const room = check.rooms;

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
        <Link href={`/rooms/${room.id}`} className="hover:text-navy hover:underline">
          Room {room.room_number}
        </Link>{" "}
        / Room check
      </nav>

      <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-2xl font-semibold text-navy">Room check</h1>
        <span className="text-sm text-gray-500">
          {new Date(check.timestamp).toLocaleString()}
        </span>
      </div>
      <p className="mt-1 text-sm text-gray-500">
        Room {room.room_number}
        {check.users ? ` · by ${check.users.name}` : ""}
      </p>

      <ul className="mt-6 divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
        {RATING_LABELS.map(([key, label]) => (
          <li key={key} className="flex items-center justify-between px-4 py-2.5">
            <span className="text-sm font-medium">{label}</span>
            <span className="text-sm font-semibold text-navy">
              {check[key]} / 5
            </span>
          </li>
        ))}
      </ul>

      {check.notes && (
        <div className="mt-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
            Notes
          </h2>
          <p className="mt-1 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm whitespace-pre-wrap">
            {check.notes}
          </p>
        </div>
      )}

      {check.prohibited_items && (
        <div className="mt-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
            Prohibited items
          </h2>
          <p className="mt-1 rounded-md border-l-4 border-accent bg-accent-soft px-3 py-2 text-sm text-ink whitespace-pre-wrap">
            {check.prohibited_items}
          </p>
        </div>
      )}
    </section>
  );
}
