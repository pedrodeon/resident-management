import "server-only";
import { createClient } from "@/lib/supabase/server";

/**
 * The term new occupancies are created in, and the one every everyday screen is
 * scoped to. It lives in the `app_settings` row rather than an env var so the
 * `current_residents` view and the bulk-presence RPC filter on the same value
 * the app writes with — one source of truth, changeable by the RD without a
 * deploy.
 *
 * Returns null only if the settings row is missing or unreadable, which the
 * caller should surface rather than paper over: guessing a term would attach a
 * new stay to the wrong semester.
 */
export async function getCurrentTerm(): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("app_settings")
    .select("current_term")
    .single();
  return data?.current_term ?? null;
}
