import type { OccupancyStatus } from "@/lib/types";

/*
 * Resident search — the matching rules, in one place, used by all three
 * entry points (the Home overlay, the Roster overlay, and the inline filter
 * on Admin → Residents) so they can never disagree about what "matches".
 *
 * One input does both jobs: an all-digit query is a student ID prefix, and
 * anything else is a partial name. Student IDs here are all digits, so the
 * split is unambiguous — nobody's name starts with "1150".
 *
 * WHY MATCHING RUNS IN JS, NOT SQL. Postgres `ilike` is case-insensitive but
 * NOT accent-insensitive; "Otavio" would not find "Otávio" without the
 * `unaccent` extension, which would mean a migration to install. Tudor Hall
 * holds ~200 residents, so the current-term roster is a few kilobytes: the
 * server action reads it under the caller's RLS and folds accents here,
 * which is exact in both directions and needs no extension. If this building
 * ever held thousands, this is the thing to revisit — a generated
 * `unaccent(full_name)` column with a trigram index — and NOT before.
 */

/** Never return more than this; the UI offers to refine instead. */
export const SEARCH_LIMIT = 20;

/** One search hit — the occupancy, plus where they live. */
export type ResidentHit = {
  /** The OCCUPANCY id, which is what /residents/[id] routes on. */
  id: string;
  full_name: string;
  /**
   * A search KEY, never output. Nothing renders it, and `ResidentResult`
   * below drops it before results leave the server — an identifier that
   * isn't displayed has no reason to sit in a browser payload.
   */
  student_id: string;
  room_number: string | null;
  hallway_name: string | null;
  occupancy_status: OccupancyStatus;
  is_present: boolean;
};

/** What the client is given: a hit with the search key removed. */
export type ResidentResult = Omit<ResidentHit, "student_id">;

/** Drop the student ID on the way out of the server. */
export function withoutSearchKey(hit: ResidentHit): ResidentResult {
  return {
    id: hit.id,
    full_name: hit.full_name,
    room_number: hit.room_number,
    hallway_name: hit.hallway_name,
    occupancy_status: hit.occupancy_status,
    is_present: hit.is_present,
  };
}

/** Lowercase and strip diacritics, so "Otávio" and "Otavio" are one word. */
export function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

export type QueryKind = "empty" | "student_id" | "name";

/** Which of the two searches the typed text is asking for. */
export function classifyQuery(raw: string): { kind: QueryKind; value: string } {
  const trimmed = raw.trim();
  if (trimmed === "") return { kind: "empty", value: "" };
  if (/^\d+$/.test(trimmed)) return { kind: "student_id", value: trimmed };
  return { kind: "name", value: fold(trimmed) };
}

/** Just the digits of a student ID. Tudor Hall's are seven digits with
    nothing else, but the fixture roster writes them "S1000101", and a
    typed-in ID should find its holder under either convention. */
function idDigits(studentId: string): string {
  return studentId.replace(/\D/g, "");
}

/** Student ID matches on PREFIX; a name matches anywhere in the name. */
export function matchesResident(
  resident: Pick<ResidentHit, "full_name" | "student_id">,
  query: string,
): boolean {
  const { kind, value } = classifyQuery(query);
  if (kind === "empty") return false;
  if (kind === "student_id") return idDigits(resident.student_id).startsWith(value);
  return fold(resident.full_name).includes(value);
}

export type SearchOutcome<T> = {
  kind: QueryKind;
  /** At most SEARCH_LIMIT, alphabetical. */
  matches: T[];
  /** How many matched before the cap — drives the "refine" hint. */
  total: number;
};

/** Filter an already-loaded list. The server action and the Admin filter
    both end here, so "matches" means the same thing on every screen. */
export function searchIn<T extends Pick<ResidentHit, "full_name" | "student_id">>(
  residents: readonly T[],
  query: string,
): SearchOutcome<T> {
  const { kind } = classifyQuery(query);
  if (kind === "empty") return { kind, matches: [], total: 0 };

  const hits = residents
    .filter((r) => matchesResident(r, query))
    .sort((a, b) => a.full_name.localeCompare(b.full_name));

  return { kind, matches: hits.slice(0, SEARCH_LIMIT), total: hits.length };
}
