import Link from "next/link";

/**
 * "Up one level" button for screen headers (room → hallway → dashboard).
 * Labeled with the destination, not a bare "Back", so it always says where it
 * goes. Navy secondary-button styling — never orange, which CLAUDE.md reserves
 * for status that needs attention.
 */
export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 rounded-md border border-navy px-2.5 py-1.5 text-xs font-semibold text-navy transition-colors hover:bg-navy hover:text-white"
    >
      <svg
        width="14"
        height="14"
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
      {label}
    </Link>
  );
}
