import type { ItemCondition } from "@/lib/types";

/**
 * Inspection item condition chip. Accent rule (CLAUDE.md): damaged/missing are
 * the states that need attention — orange background with dark text. good/fair
 * stay quiet so the exceptions stand out.
 */
export function ConditionChip({ condition }: { condition: ItemCondition }) {
  if (condition === "damaged" || condition === "missing") {
    return (
      <span className="inline-block rounded-full border-l-4 border-accent bg-accent-soft px-2.5 py-0.5 text-xs font-medium capitalize text-ink">
        {condition}
      </span>
    );
  }
  return (
    <span className="inline-block rounded-full border border-gray-200 px-2.5 py-0.5 text-xs font-medium capitalize text-gray-600">
      {condition}
    </span>
  );
}
