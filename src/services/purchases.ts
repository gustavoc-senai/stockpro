import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../features/auth/AuthContext";
import { useOrganization } from "../features/organizations/OrganizationContext";
import { supabase } from "../lib/supabase";
export type PurchaseItem = {
  id?: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  product?: { name: string; sku: string; unit: string };
};
export type Purchase = {
  id: string;
  organization_id: string;
  supplier_id: string;
  warehouse_id: string;
  status: "draft" | "ordered" | "received" | "cancelled";
  notes: string;
  created_at: string;
  updated_at: string;
  received_at: string | null;
  supplier: { name: string };
  warehouse: { name: string };
  items: PurchaseItem[];
};
export const purchaseStatus = {
  draft: "Rascunho",
  ordered: "Confirmado",
  received: "Recebido",
  cancelled: "Cancelado",
};
export const money = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export const purchaseTotal = (order: Pick<Purchase, "items">) =>
  order.items.reduce(
    (sum, item) => sum + Number(item.quantity) * Number(item.unit_price),
    0,
  );
export function usePurchases(
  page = 0,
  status = "",
  id?: string,
  supplierId = "",
) {
  const { organizationId } = useOrganization();
  const { user } = useAuth();
  return useQuery({
    queryKey: [
      "purchases",
      user?.id,
      organizationId,
      page,
      status,
      id,
      supplierId,
    ],
    enabled: !!organizationId && id !== "new",
    queryFn: async () => {
      let request = supabase
        .from("purchase_orders")
        .select(
          "*, supplier:suppliers!stockpro_purchase_supplier_fk(name), warehouse:warehouses!stockpro_purchase_warehouse_fk(name), items:purchase_order_items(id,product_id,quantity,unit_price,product:products!stockpro_purchase_item_product_fk(name,sku,unit))",
          { count: "exact" },
        )
        .eq("organization_id", organizationId!)
        .order("created_at", { ascending: false })
        .order("id");
      if (status) request = request.eq("status", status);
      if (id) request = request.eq("id", id);
      if (supplierId) request = request.eq("supplier_id", supplierId);
      const { data, count, error } = await request.range(
        page * 20,
        page * 20 + 19,
      );
      if (error) throw error;
      return { rows: data as unknown as Purchase[], count: count ?? 0 };
    },
  });
}
