"use server";

import { getStaffContext } from "@/lib/auth";
import { recipientsFromEnv, sendEmail } from "@/lib/email";
import {
  buildRaWeeklyReport,
  reportEmailText,
  weekLabel,
} from "@/lib/ra-report";

export type EmailReportResult = { ok: true } | { ok: false; error: string };

/**
 * The on-demand trigger: same build + same email text as the Saturday cron,
 * sent right now to RD_EMAIL. RD only — the shared builder reads with the
 * service key, so the gate lives here.
 */
export async function emailRaReport(
  weekStart: string,
): Promise<EmailReportResult> {
  const staff = await getStaffContext();
  if (!staff || staff.role !== "rd") {
    return { ok: false, error: "Only the RD can email reports." };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
    return { ok: false, error: "Pick a valid week." };
  }

  const report = await buildRaWeeklyReport(weekStart);
  return sendEmail({
    to: recipientsFromEnv("RD_EMAIL"),
    replyTo: staff.email ?? undefined,
    subject: `RA weekly report — Tudor Hall — week of ${weekLabel(report)}`,
    text: reportEmailText(report),
  });
}
