import type { OccupancyStatus } from "@/lib/types";

/**
 * Resident status chip. Accent rule (CLAUDE.md): light orange marks ONLY the
 * states that need attention — away and expected — always as a background
 * with dark text, never as text color on white. Everything else stays quiet.
 */
export function StatusChip({
  status,
  isPresent,
}: {
  status: OccupancyStatus;
  isPresent: boolean;
}) {
  if (status === "checked_in" && !isPresent) {
    return (
      <span className="rounded-full border-l-4 border-accent bg-accent-soft px-2.5 py-0.5 text-xs font-medium text-ink">
        Away
      </span>
    );
  }
  if (status === "expected") {
    return (
      <span className="rounded-full border-l-4 border-accent bg-accent-soft px-2.5 py-0.5 text-xs font-medium text-ink">
        Expected
      </span>
    );
  }
  if (status === "checked_out") {
    return (
      <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-500">
        Checked out
      </span>
    );
  }
  return (
    <span className="rounded-full border border-gray-200 px-2.5 py-0.5 text-xs font-medium text-gray-600">
      In building
    </span>
  );
}
