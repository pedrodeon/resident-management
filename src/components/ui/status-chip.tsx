import { Badge } from "@/components/ui/badge";
import type { OccupancyStatus } from "@/lib/types";

/**
 * Resident status chip — the occupancy states mapped onto the Badge tones.
 * Accent rule (CLAUDE.md): orange marks ONLY the states that need attention
 * (away, expected); everything else stays quiet.
 */
export function StatusChip({
  status,
  isPresent,
}: {
  status: OccupancyStatus;
  isPresent: boolean;
}) {
  if (status === "checked_in" && !isPresent) {
    return <Badge tone="attention">Away</Badge>;
  }
  if (status === "expected") {
    return <Badge tone="attention">Expected</Badge>;
  }
  if (status === "checked_out") {
    return <Badge tone="quiet">Checked out</Badge>;
  }
  return <Badge tone="neutral">In building</Badge>;
}
