import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { Eyebrow } from "@/components/ui/typography";

/**
 * Hero statistic on a navy surface: big number, denominator, accent progress
 * meter, caption. The dashboard's "Checked in 1 / 2" card.
 *
 * `value`, `max`, and `caption` are ReactNodes so callers keep their own
 * interpolation (e.g. `{pct}% of the roster…`).
 */
export function StatCard({
  label,
  value,
  max,
  pct,
  caption,
}: {
  label: ReactNode;
  value: ReactNode;
  max: ReactNode;
  /** 0–100; width of the meter fill. */
  pct: number;
  caption: ReactNode;
}) {
  return (
    <Card variant="glass">
      <Eyebrow>{label}</Eyebrow>
      <p className="mt-1 flex items-baseline gap-2">
        <span className="text-5xl font-bold tracking-tight text-white">
          {value}
        </span>
        <span className="text-lg font-medium text-white/50">/ {max}</span>
      </p>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-gradient-to-r from-accent to-white"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-2 text-sm text-white/60">{caption}</p>
    </Card>
  );
}
