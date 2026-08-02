import { NextResponse } from "next/server";
import { recipientsFromEnv, sendEmail } from "@/lib/email";
import {
  buildRaWeeklyReport,
  chicagoNow,
  currentChicagoWeekStart,
  FIRST_SCHEDULED_REPORT,
  reportEmailText,
  weekLabel,
} from "@/lib/ra-report";

/*
 * The scheduled trigger for the RA weekly report. Vercel Cron calls this on
 * the two UTC schedules in vercel.json (02:00 and 03:00 Sunday); the Chicago
 * hour gate below turns exactly one of them into the Saturday 9:00 PM send,
 * year-round across DST. On localhost nothing calls it — expected; the same
 * report is available on demand at /admin/reports.
 *
 * Protection: Vercel sends `Authorization: Bearer <CRON_SECRET>` on cron
 * invocations when that env var is set. Anything without the exact token
 * gets a 401 and no work happens.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const now = chicagoNow();

  // No automatic sends before the first scheduled report (Aug 22, 2026) —
  // move-in week's data would be noise.
  if (now.date < FIRST_SCHEDULED_REPORT) {
    return NextResponse.json({
      skipped: `before first scheduled report (${FIRST_SCHEDULED_REPORT})`,
      chicagoNow: now,
    });
  }

  // Both UTC schedules land here; only the one that is 9 PM in Chicago
  // sends. The other run is a deliberate no-op (DST handling).
  if (now.hour !== 21) {
    return NextResponse.json({
      skipped: `Chicago hour is ${now.hour}, not 21 (DST twin run)`,
      chicagoNow: now,
    });
  }

  const report = await buildRaWeeklyReport(currentChicagoWeekStart());
  const result = await sendEmail({
    to: recipientsFromEnv("RD_EMAIL"),
    subject: `RA weekly report — Tudor Hall — week of ${weekLabel(report)}`,
    text: reportEmailText(report),
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: `report built but email failed: ${result.error}` },
      { status: 500 },
    );
  }
  return NextResponse.json({ sent: true, week: report.weekStart });
}
