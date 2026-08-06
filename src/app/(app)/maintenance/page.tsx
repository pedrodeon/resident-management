import { redirect } from "next/navigation";
import { getStaffContext } from "@/lib/auth";

/**
 * The maintenance queue moved into the RD's Admin area — reading requests and
 * closing them is RD-only now. Whoever lands here (old link, bookmark, muscle
 * memory) goes to what they can actually do: the RD to the queue, everyone
 * else to the form.
 */
export default async function MaintenancePage() {
  const staff = await getStaffContext();
  redirect(
    staff?.role === "rd"
      ? "/admin/submissions?tab=maintenance"
      : "/maintenance/new",
  );
}
