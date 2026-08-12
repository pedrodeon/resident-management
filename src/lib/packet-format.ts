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
