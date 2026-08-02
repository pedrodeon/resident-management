import { createClient } from "@/lib/supabase/server";
import { getStaffContext } from "@/lib/auth";
import { DeskShiftCalendar } from "@/components/desk-shift-calendar";
import {
  addMonths,
  monthParam,
  parseMonthParam,
  SHIFT_SLOTS,
} from "@/lib/desk-shifts";
import { Card } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { PageTitle, SectionLabel } from "@/components/ui/typography";

export const metadata = { title: "Front Desk — Tudor Hall" };

type ShiftRow = { shift_date: string; slot: number; claimed_by: string | null };
type StaffRow = { id: string; name: string; role: string };

const MONTH_NAME = [
  "January", "February", "March", "April", "May", "June", "July",
  "August", "September", "October", "November", "December",
];

export default async function FrontDeskPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const { month: monthQuery } = await searchParams;
  const now = new Date();
  const { year, month } =
    parseMonthParam(monthQuery) ?? {
      year: now.getFullYear(),
      month: now.getMonth() + 1,
    };

  const staffContext = await getStaffContext();
  const supabase = await createClient();
  const first = `${monthParam(year, month)}-01`;
  const last = `${monthParam(year, month)}-${new Date(year, month, 0).getDate()}`;

  const [{ data: shifts }, { data: staff }] = await Promise.all([
    supabase
      .from("desk_shifts")
      .select("shift_date, slot, claimed_by")
      .gte("shift_date", first)
      .lte("shift_date", last)
      .overrideTypes<ShiftRow[]>(),
    supabase
      .from("users")
      .select("id, name, role")
      .order("name")
      .overrideTypes<StaffRow[]>(),
  ]);

  const prev = addMonths(year, month, -1);
  const next = addMonths(year, month, 1);

  return (
    <section>
      <PageHeader back={{ href: "/", label: "TUDOR HALL" }} />

      <PageTitle>Front Desk</PageTitle>
      <p className="mt-1 text-sm text-white/60">
        Two shifts a night — {SHIFT_SLOTS[0].label} and {SHIFT_SLOTS[1].label}.
        Tap an open slot to claim it; shifts lock 24 hours before they start.
      </p>

      <Card variant="sheet" className="mt-6">
        <div className="flex flex-wrap items-center justify-between gap-3 px-1">
          <SectionLabel>
            {MONTH_NAME[month - 1]} {year}
          </SectionLabel>
          <div className="flex gap-2">
            <LinkButton
              variant="subtle"
              size="sm"
              href={`/front-desk?month=${monthParam(prev.year, prev.month)}`}
              aria-label="Previous month"
            >
              ‹ Prev
            </LinkButton>
            <LinkButton
              variant="subtle"
              size="sm"
              href={`/front-desk?month=${monthParam(next.year, next.month)}`}
              aria-label="Next month"
            >
              Next ›
            </LinkButton>
          </div>
        </div>

        <DeskShiftCalendar
          year={year}
          month={month}
          shifts={shifts ?? []}
          staff={staff ?? []}
          meId={staffContext?.id ?? null}
          isRd={staffContext?.role === "rd"}
        />
      </Card>
    </section>
  );
}
