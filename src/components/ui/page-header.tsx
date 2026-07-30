import { BackLink } from "@/components/back-link";
import { LocalDate } from "@/components/ui/local-date";

/**
 * The canvas-zone opener on every screen (design-mockups/move-in-out.png):
 * the glass back circle on the left — omitted on the dashboard, which has
 * nowhere up to go — and the brand eyebrow over the live local date/time on
 * the right. Page title and metadata follow it in the page body.
 */
export function PageHeader({
  back,
}: {
  back?: { href: string; label: string };
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      {back ? <BackLink href={back.href} label={back.label} /> : <span />}
      <div className="text-right">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/50">
          Tudor Hall
        </p>
        <LocalDate className="mt-0.5 block text-[10px] font-medium uppercase tracking-[0.12em] text-white/40" />
      </div>
    </div>
  );
}
