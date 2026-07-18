import { createClient } from "@/lib/supabase/server";
import { InventoryManager, type AdminItem } from "@/components/admin/inventory-manager";

export default async function AdminInventoryPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("inventory_items")
    .select("id, name, sort_order")
    .order("sort_order")
    .overrideTypes<AdminItem[]>();

  return (
    <section>
      <h1 className="text-2xl font-semibold text-navy">Inventory template</h1>
      <p className="mt-1 text-sm text-gray-500">
        The checklist used for every room inspection. Changes apply to new
        inspections; past snapshots keep the items they were taken with.
      </p>
      <div className="mt-6">
        <InventoryManager items={data ?? []} />
      </div>
    </section>
  );
}
