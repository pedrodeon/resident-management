import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BackLink } from "@/components/back-link";
import { RoomCheckForm } from "@/components/room-check-form";

type RoomRow = {
  id: string;
  room_number: string;
  hallways: { id: string; name: string } | null;
};

export default async function NewRoomCheckPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: room, error } = await supabase
    .from("rooms")
    .select(`id, room_number, hallways ( id, name )`)
    .eq("id", id)
    .single()
    .overrideTypes<RoomRow>();

  if (error || !room || !room.hallways) notFound();

  return (
    <section>
      {/* Up one level: new-check form → its room. */}
      <div className="mb-3">
        <BackLink href={`/rooms/${room.id}`} label={`Room ${room.room_number}`} />
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
        /{" "}
        <Link
          href={`/rooms/${room.id}`}
          className="hover:text-navy hover:underline"
        >
          Room {room.room_number}
        </Link>{" "}
        / Room check
      </nav>

      <h1 className="mt-2 text-2xl font-semibold text-navy">Room check</h1>
      <p className="mt-1 text-sm text-gray-500">
        Weekly condition check for Room {room.room_number}. Permanent once
        saved.
      </p>

      <div className="mt-6">
        <RoomCheckForm roomId={room.id} roomNumber={room.room_number} />
      </div>
    </section>
  );
}
