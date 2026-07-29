import { createClient } from "@/lib/supabase/server";
import { getStaffContext } from "@/lib/auth";
import { BackLink } from "@/components/back-link";
import {
  StaffManager,
  type AdminStaff,
  type HallwayChoice,
} from "@/components/admin/staff-manager";
import type { StaffRole } from "@/lib/types";

type StaffRow = {
  id: string;
  name: string;
  email: string;
  role: StaffRole;
  hallway_assignments: { hallway_id: string }[];
};

export default async function AdminStaffPage() {
  const supabase = await createClient();
  const caller = await getStaffContext();
  const [{ data: staff }, { data: hallways }] = await Promise.all([
    supabase
      .from("users")
      .select(`id, name, email, role, hallway_assignments ( hallway_id )`)
      .order("role")
      .order("name")
      .overrideTypes<StaffRow[]>(),
    supabase.from("hallways").select("id, name").order("sort_order"),
  ]);

  const staffList: AdminStaff[] = (staff ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    email: s.email,
    role: s.role,
    hallwayIds: s.hallway_assignments.map((a) => a.hallway_id),
  }));
  const hallwayChoices: HallwayChoice[] = (hallways ?? []) as HallwayChoice[];

  return (
    <section>
      {/* Up one level: section → admin index. */}
      <div className="mb-3">
        <BackLink href="/admin" label="Admin" />
      </div>

      <h1 className="text-2xl font-semibold text-navy">Staff</h1>
      <p className="mt-1 text-sm text-gray-500">
        Hallway coverage is metadata only — every staff member can access every
        hallway regardless.
      </p>
      <div className="mt-6">
        <StaffManager
          staff={staffList}
          hallways={hallwayChoices}
          currentUserId={caller?.id ?? ""}
        />
      </div>
    </section>
  );
}
