/*
 * Postgres errors, said in English.
 *
 * A raw driver message on screen — "update or delete on table
 * \"occupancies\" violates foreign key constraint
 * \"inspections_occupancy_id_fkey\"" — tells the RD nothing about what to do
 * next, and leaks table names into a screen students' records live on.
 * Everything the admin screens surface goes through here first.
 *
 * The mapping is by error CODE plus the constraint named in the message,
 * never by matching prose: Postgres wording changes between versions, but
 * 23503 has meant "foreign key violation" for twenty years.
 */

export type DbErrorLike = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
};

/** Constraints the admin screens can actually run into, and what they mean
    to the person who hit them. */
const BY_CONSTRAINT: Record<string, string> = {
  inspections_occupancy_id_fkey:
    "This stay has inspection records attached, so it can't be deleted. Archive it instead — that keeps the history and hides the stay from everyday screens.",
  occupancies_one_active_per_person:
    "That person already has another active stay. Check that one out, or archive it, first.",
  people_student_id_key:
    "That student ID is already on record. Search for the student and open a new stay for them instead.",
};

const BY_CODE: Record<string, string> = {
  "23503":
    "Something else in the app still refers to this record, so it can't be deleted yet.",
  "23505": "That record already exists.",
  "23514": "Those values aren't allowed together.",
  "42501":
    "You don't have permission to do that. Some records are deliberately permanent — ask the RD if you think this is wrong.",
  PGRST116: "That record no longer exists — the list may be out of date.",
};

/**
 * A sentence for the RD. `fallback` is what to say when the error is one we
 * have never seen: deliberately vague about the database and specific about
 * what to do, rather than pasting the driver's text.
 */
export function humanDbError(
  error: DbErrorLike | null | undefined,
  fallback = "That didn't work. Refresh the page and try again.",
): string {
  if (!error) return fallback;

  const text = `${error.message ?? ""} ${error.details ?? ""}`;
  for (const [constraint, sentence] of Object.entries(BY_CONSTRAINT)) {
    if (text.includes(constraint)) return sentence;
  }
  if (error.code && BY_CODE[error.code]) return BY_CODE[error.code];
  return fallback;
}
