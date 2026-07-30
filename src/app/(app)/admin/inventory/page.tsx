import { createClient } from "@/lib/supabase/server";
import { BackLink } from "@/components/back-link";
import { InventoryManager, type AdminItem } from "@/components/admin/inventory-manager";
import { PageTitle } from "@/components/ui/typography";
import { Card } from "@/components/ui/card";

export default async function AdminInventoryPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("inventory_items")
    .select("id, name, sort_order")
    .order("sort_order")
    .overrideTypes<AdminItem[]>();

  return (
    <section>
      {/* Up one level: section → admin index. */}
      <div className="mb-3">
        <BackLink href="/admin" label="Admin" />
      </div>

      <PageTitle>Inventory template</PageTitle>
      <p className="mt-1 text-sm text-gray-500">
        The checklist used for every room inspection. Changes apply to new
        inspections; past snapshots keep the items they were taken with.
      </p>
      <Card variant="sheet" className="mt-6">
      <div>
        <InventoryManager items={data ?? []} />
      </div>
      </Card>
    </section>
  );
}
