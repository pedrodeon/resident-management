"use server";

import { createClient } from "@/lib/supabase/server";
import {
  classifyQuery,
  searchIn,
  withoutSearchKey,
  type ResidentHit,
  type ResidentResult,
  type SearchOutcome,
} from "@/lib/resident-search";

/*
 * The one query behind resident search.
 *
 * PERMISSIONS: this reads `rooms` embedded with `current_residents` through
 * the CALLER'S client — the same tables, the same view, the same session the
 * hallway and room screens already use. `current_residents` is
 * security_invoker, so the caller's RLS applies unchanged. No new view, no
 * definer function, no policy: search can therefore return exactly what the
 * roster would, and can't widen anyone's reach by construction.
 *
 * The view also carries the current-term and not-archived filters, which is
 * why search only ever finds this term's residents.
 */

export async function searchResidents(
  query: string,
): Promise<SearchOutcome<ResidentResult>> {
  const { kind } = classifyQuery(query);
  if (kind === "empty") return { kind, matches: [], total: 0 };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("rooms")
    .select(
      `room_number,
       hallways ( name ),
       current_residents ( id, full_name, student_id, occupancy_status, is_present )`,
    )
    .overrideTypes<
      {
        room_number: string;
        hallways: { name: string } | null;
        current_residents: Omit<
          ResidentHit,
          "room_number" | "hallway_name"
        >[];
      }[]
    >();

  if (error || !data) return { kind, matches: [], total: 0 };

  // Read by room so each resident arrives with their room and hallway
  // already attached — the same shape room detail renders from.
  const residents: ResidentHit[] = data.flatMap((room) =>
    room.current_residents.map((r) => ({
      ...r,
      room_number: room.room_number,
      hallway_name: room.hallways?.name ?? null,
    })),
  );

  // Matching happens here, on the server, so the student ID never has to
  // travel to the browser to do its job.
  const outcome = searchIn(residents, query);
  return { ...outcome, matches: outcome.matches.map(withoutSearchKey) };
}
