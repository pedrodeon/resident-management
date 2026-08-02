import { BackLink } from "@/components/back-link";

/**
 * The canvas-zone opener: the glass back circle, when the screen has
 * somewhere up to go. Screens without one (dashboard, tab roots) render
 * nothing here — the page title is the anchor.
 */
export function PageHeader({
  back,
}: {
  back?: { href: string; label: string };
}) {
  if (!back) return null;
  return (
    <div className="mb-4 flex items-start">
      <BackLink href={back.href} label={back.label} />
    </div>
  );
}
