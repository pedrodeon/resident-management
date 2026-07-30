import { createClient } from "@/lib/supabase/server";
import { InventoryManager, type AdminItem } from "@/components/admin/inventory-manager";
import { PageTitle } from "@/components/ui/typography";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";

export default async function AdminInventoryPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("inventory_items")
    .select("id, name, sort_order")
    .order("sort_order")
    .overrideTypes<AdminItem[]>();

  return (
    <section>
      <PageHeader back={{ href: "/admin", label: "Admin" }} />

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
