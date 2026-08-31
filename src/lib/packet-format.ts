/*
 * How a check-in packet is ordered and named. Pure string work, kept apart
 * from the packet builder so it carries no server-only imports and can be
 * tested directly.
 */

/** Room numbers are text ("101", "9"), so compare them as numbers when both
    are numeric and fall back to natural text order otherwise. */
export function byRoomNumber(a: string, b: string): number {
  const na = Number(a);
  const nb = Number(b);
  if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
  return a.localeCompare(b, undefined, { numeric: true });
}

/** "Holiday 2A" -> "holiday-2a", for the download filename. */
export function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** A room and the stays the packet query found in it. */
export type PackedRoom = {
  room_number: string;
  current_residents: { id: string; occupancy_status: string }[];
};

/**
 * The packet's membership rule, on its own so it can be exercised without a
 * database: of the current-term, non-archived stays a hallway's rooms hold,
 * take the ones that are `checked_in` right now, in room order.
 *
 * `expected` never arrived and `checked_out` has left — neither is living in
 * the hallway the packet describes. Because a person can hold at most one
 * ACTIVE stay (the partial unique index on occupancies), and `checked_in` is
 * active, this also means someone who moved between rooms in this hallway
 * comes back exactly once: under the room they are in now.
 */
export function checkedInInRoomOrder(
  rooms: readonly PackedRoom[],
): { room: string; occupancyId: string }[] {
  return rooms
    .flatMap((room) =>
      room.current_residents
        .filter((r) => r.occupancy_status === "checked_in")
        .map((r) => ({ room: room.room_number, occupancyId: r.id })),
    )
    .sort((a, b) => byRoomNumber(a.room, b.room));
}
