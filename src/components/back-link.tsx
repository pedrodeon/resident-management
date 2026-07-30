import Link from "next/link";

/**
 * "Up one level" control for the canvas header zone: the v2 glass circle with
 * the destination as a visible label — it always says where it goes, never a
 * bare "Back". Never orange (the accent is for status, not navigation).
 */
export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="group inline-flex items-center gap-2.5 text-sm font-medium text-white/70 transition-colors hover:text-white"
    >
      <span className="flex h-11 w-11 flex-none items-center justify-center rounded-full border border-white/20 bg-gradient-to-br from-white/20 to-white/[0.04] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_8px_18px_rgba(4,10,26,0.45)] transition-colors group-hover:from-white/30 group-hover:to-white/10">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M14 6l-6 6 6 6"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      {label}
    </Link>
  );
}
