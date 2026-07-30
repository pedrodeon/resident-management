import type { ComponentProps } from "react";

/**
 * The pill search field with its leading glyph (the mockup's "Search by name
 * or student ID"). All input props pass through; `className` styles the
 * wrapper. type defaults to "search".
 */
export function SearchInput({
  className,
  type = "search",
  ...props
}: ComponentProps<"input">) {
  return (
    <div className={className ? `relative ${className}` : "relative"}>
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
        className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-faint"
      >
        <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
        <path
          d="M16.5 16.5L21 21"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
      <input
        type={type}
        {...props}
        className="w-full rounded-full border border-line bg-white py-2.5 pl-11 pr-4 text-base text-ink outline-none placeholder:text-faint focus:border-navy focus:ring-2 focus:ring-navy/25"
      />
    </div>
  );
}
