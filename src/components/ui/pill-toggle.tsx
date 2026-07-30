"use client";

/**
 * Segmented pill toggle — the mockup's "Not arrived / Everyone" control, also
 * the roster's All/Away filter. Active option fills navy; the rest sit on the
 * chip fill. A view control, not a form input: switching must never change
 * data, only what's shown.
 */
export function PillToggle<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div className={className ? `flex gap-1.5 ${className}` : "flex gap-1.5"}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
          // touch-action-manipulation + select-none: keep mobile Safari's
          // double-tap-zoom and long-press text selection from swallowing
          // taps on these small controls.
          className={`select-none rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors [touch-action:manipulation] ${
            option.value === value
              ? "bg-navy text-white"
              : "bg-chip text-muted hover:bg-line"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
