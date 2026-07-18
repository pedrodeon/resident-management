import { createClient } from "@/lib/supabase/server";
import type { StaffRole } from "@/lib/types";

export type StaffContext = {
  id: string;
  email: string | null;
  name: string;
  role: StaffRole;
};

/**
 * The logged-in staff member with their role, or null if not signed in / not a
 * staff record. Used to gate RD-only UI (defense-in-depth on top of RLS).
 */
export async function getStaffContext(): Promise<StaffContext | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: staff } = await supabase
    .from("users")
    .select("id, name, role")
    .eq("id", user.id)
    .single();

  if (!staff) return null;
  return {
    id: staff.id,
    email: user.email ?? null,
    name: staff.name,
    role: staff.role as StaffRole,
  };
}
