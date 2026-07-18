import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ConditionChip } from "@/components/condition-chip";
import type { InspectionType, ItemCondition } from "@/lib/types";

type SideInspection = {
  id: string;
  type: InspectionType;
  timestamp: string;
  room_id: string;
  inspection_items: {
    condition: ItemCondition;
    inventory_items: { id: string; name: string; sort_order: number } | null;
  }[];
};

const TYPE_LABEL: Record<InspectionType, string> = {
  move_in: "Move-in",
  move_out: "Move-out",
  periodic: "Periodic",
};

// Ordinal severity so we can tell a degradation (got worse) from a repair.
const SEVERITY: Record<ItemCondition, number> = {
  good: 0,
  fair: 1,
  damaged: 2,
  missing: 3,
};

const SELECT = `id, type, timestamp, room_id,
   inspection_items ( condition, inventory_items ( id, name, sort_order ) )`;

export default async function ComparePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ a?: string; b?: string }>;
}) {
  const { id: roomId } = await params;
  const { a, b } = await searchParams;
  if (!a || !b) notFound();

  const supabase = await createClient();
  const [{ data: left }, { data: right }] = await Promise.all([
    supabase.from("inspections").select(SELECT).eq("id", a).single().overrideTypes<SideInspection>(),
    supabase.from("inspections").select(SELECT).eq("id", b).single().overrideTypes<SideInspection>(),
  ]);

  // Both must exist and belong to this room (no cross-room compares via URL).
  if (
    !left ||
    !right ||
    left.room_id !== roomId ||
    right.room_id !== roomId
  ) {
    notFound();
  }

  // Union of items by sort_order (template could have changed between snapshots).
  const byId = new Map<
    string,
    { name: string; sort_order: number; left?: ItemCondition; right?: ItemCondition }
  >();
  for (const [side, insp] of [
    ["left", left],
    ["right", right],
  ] as const) {
    for (const item of insp.inspection_items) {
      const inv = item.inventory_items;
      if (!inv) continue;
      const entry = byId.get(inv.id) ?? { name: inv.name, sort_order: inv.sort_order };
      entry[side] = item.condition;
      byId.set(inv.id, entry);
    }
  }
  const rows = [...byId.values()].sort((x, y) => x.sort_order - y.sort_order);

  return (
    <section>
      <nav className="text-sm text-gray-500">
        <Link href="/" className="hover:text-navy hover:underline">
          TUDOR HALL
        </Link>{" "}
        /{" "}
        <Link href={`/rooms/${roomId}`} className="hover:text-navy hover:underline">
          Room
        </Link>{" "}
        / Compare
      </nav>

      <h1 className="mt-2 text-2xl font-semibold text-navy">Compare inspections</h1>

      <div className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[32rem] border-collapse text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
              <th className="px-3 py-2">Item</th>
              <th className="px-3 py-2">
                <Link href={`/inspections/${left.id}`} className="hover:text-navy hover:underline">
                  {TYPE_LABEL[left.type]}
                  <span className="block font-normal normal-case text-gray-400">
                    {new Date(left.timestamp).toLocaleDateString()}
                  </span>
                </Link>
              </th>
              <th className="px-3 py-2">
                <Link href={`/inspections/${right.id}`} className="hover:text-navy hover:underline">
                  {TYPE_LABEL[right.type]}
                  <span className="block font-normal normal-case text-gray-400">
                    {new Date(right.timestamp).toLocaleDateString()}
                  </span>
                </Link>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const differs = row.left !== row.right;
              // Highlight in orange when the second snapshot is worse — the
              // damage that appeared between the two inspections.
              const degraded =
                row.left !== undefined &&
                row.right !== undefined &&
                SEVERITY[row.right] > SEVERITY[row.left];
              return (
                <tr
                  key={row.name}
                  className={`border-t border-gray-100 ${
                    degraded
                      ? "border-l-4 border-l-accent bg-accent-soft"
                      : differs
                        ? "bg-gray-50"
                        : ""
                  }`}
                >
                  <td className="px-3 py-2 font-medium">{row.name}</td>
                  <td className="px-3 py-2">
                    {row.left ? <ConditionChip condition={row.left} /> : "—"}
                  </td>
                  <td className="px-3 py-2">
                    {row.right ? <ConditionChip condition={row.right} /> : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-xs text-gray-400">
        Rows highlighted orange got worse between the two snapshots — the damage
        to attribute.
      </p>
    </section>
  );
}
