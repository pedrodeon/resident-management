import { createClient } from "@/lib/supabase/server";
import type { StaffRole } from "@/lib/types";

export type StaffContext = {
  id: string;
  email: string | null;
  name: string;
  role: StaffRole;
  /** Seeded with a temporary password; must set their own before using the app. */
  mustChangePassword: boolean;
};

export type AccessState = {
  /** A valid Supabase auth session exists. */
  authenticated: boolean;
  /** The matching row in public.users, or null if there isn't one. */
  staff: StaffContext | null;
};

/**
 * Resolve the caller's auth + staff-record state in one place.
 *
 * `authenticated` and `staff` are tracked separately on purpose: an
 * authenticated user with no staff row is a real state (account removed or not
 * yet set up) that must be handled differently from "not signed in" — see
 * accessDecision in ./access. Collapsing them is what caused the /login loop.
 */
export async function getAccessState(): Promise<AccessState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { authenticated: false, staff: null };

  const { data: staff } = await supabase
    .from("users")
    .select("id, name, role, must_change_password")
    .eq("id", user.id)
    .single();

  return {
    authenticated: true,
    staff: staff
      ? {
          id: staff.id,
          email: user.email ?? null,
          name: staff.name,
          role: staff.role as StaffRole,
          mustChangePassword: staff.must_change_password === true,
        }
      : null,
  };
}

/**
 * The logged-in staff member with their role, or null if not signed in / not a
 * staff record. Used to gate RD-only UI (defense-in-depth on top of RLS).
 */
export async function getStaffContext(): Promise<StaffContext | null> {
  return (await getAccessState()).staff;
}
