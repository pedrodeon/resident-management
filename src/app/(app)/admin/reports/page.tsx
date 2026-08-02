import { redirect } from "next/navigation";
import { getStaffContext } from "@/lib/auth";
import {
  addDays,
  buildRaWeeklyReport,
  currentChicagoWeekStart,
  FIRST_SCHEDULED_REPORT,
  weekLabel,
  weekStartOf,
} from "@/lib/ra-report";
import { EmailReportButton } from "@/components/admin/email-report-button";
import { Card } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { PageTitle, SectionLabel } from "@/components/ui/typography";

export const metadata = { title: "RA reports — Tudor Hall" };

/**
 * RD-only (the admin layout gates the whole area). On-demand view of the
 * same weekly report the Saturday cron emails — one shared builder, so what
 * you see here is exactly what the schedule will send.
 */
export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  // The admin layout hides this area from RAs, but this page reads with the
  // service key, so it gates itself too — the report must never even render
  // into the payload for a non-RD session.
  const staff = await getStaffContext();
  if (!staff || staff.role !== "rd") redirect("/");

  const { week } = await searchParams;
  const weekStart =
    week && /^\d{4}-\d{2}-\d{2}$/.test(week)
      ? weekStartOf(week)
      : currentChicagoWeekStart();

  const report = await buildRaWeeklyReport(weekStart);

  return (
    <section>
      <PageHeader back={{ href: "/admin", label: "Admin" }} />

      <PageTitle>RA weekly report</PageTitle>
      <p className="mt-1 text-sm text-white/60">
        Room checks and front-desk shifts per RA, Sunday–Saturday. Staff
        counts only — no resident data.
      </p>

      <Card variant="sheet" className="mt-6">
        <div className="flex flex-wrap items-center justify-between gap-3 px-1">
          <SectionLabel>Week of {weekLabel(report)}</SectionLabel>
          <div className="flex gap-2">
            <LinkButton
              variant="subtle"
              size="sm"
              href={`/admin/reports?week=${addDays(report.weekStart, -7)}`}
            >
              ‹ Prev
            </LinkButton>
            <LinkButton
              variant="subtle"
              size="sm"
              href={`/admin/reports?week=${addDays(report.weekStart, 7)}`}
            >
              Next ›
            </LinkButton>
          </div>
        </div>

        <Card as="div" variant="list" className="mt-4">
          <div className="flex items-center justify-between gap-3 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted">
            <span>RA</span>
            <span className="flex gap-6">
              <span className="w-24 text-right">Room checks</span>
              <span className="w-24 text-right">Desk shifts</span>
            </span>
          </div>
          {report.rows.length === 0 ? (
            <p className="px-4 py-3 text-sm text-gray-500">
              No RA accounts yet.
            </p>
          ) : (
            report.rows.map((row) => (
              <div
                key={row.name}
                className="flex items-center justify-between gap-3 px-4 py-2.5"
              >
                <span className="text-sm font-medium text-ink">{row.name}</span>
                <span className="flex gap-6 text-sm text-ink">
                  <span className="w-24 text-right">{row.roomChecks}</span>
                  <span className="w-24 text-right">{row.deskShifts}</span>
                </span>
              </div>
            ))
          )}
          <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-2.5">
            <span className="text-sm font-bold text-navy">Total</span>
            <span className="flex gap-6 text-sm font-bold text-navy">
              <span className="w-24 text-right">{report.totals.roomChecks}</span>
              <span className="w-24 text-right">{report.totals.deskShifts}</span>
            </span>
          </div>
        </Card>

        <div className="mt-4 px-1">
          <EmailReportButton weekStart={report.weekStart} />
          <p className="mt-3 text-xs text-muted">
            Once deployed, this report also sends itself every Saturday at
            9:00 PM (America/Chicago), starting {FIRST_SCHEDULED_REPORT} — no
            automatic sends before then.
          </p>
        </div>
      </Card>
    </section>
  );
}
