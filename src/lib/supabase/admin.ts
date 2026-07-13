import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Privileged Supabase client that uses the service role key and BYPASSES RLS.
 *
 * Server-only — the `server-only` import makes the build fail if this is ever
 * imported into client code. Use sparingly, for admin tasks that genuinely
 * need elevated rights (e.g. inviting a staff user via the Auth admin API).
 * For normal reads/writes use the RLS-scoped client in `./server`.
 */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
