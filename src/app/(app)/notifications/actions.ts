"use server";

import { revalidatePath } from "next/cache";
import { getStaffContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/**
 * Move the caller's seen-watermark to now — the bell badge counts
 * notifications newer than it. RLS pins the row to the caller.
 */
export async function markNotificationsSeen(): Promise<void> {
  const staff = await getStaffContext();
  if (!staff) return;

  const supabase = await createClient();
  await supabase
    .from("notification_seen")
    .upsert({ user_id: staff.id, seen_at: new Date().toISOString() });

  revalidatePath("/", "layout"); // the badge lives in the app shell
}
