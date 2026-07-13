import { createBrowserClient } from "@supabase/ssr";

/**
 * Supabase client for use in Client Components (runs in the browser).
 * Uses the public anon key; all access is still gated by Postgres RLS.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
