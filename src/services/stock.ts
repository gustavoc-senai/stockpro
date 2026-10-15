import { useQuery } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { useOrganization } from "../features/organizations/OrganizationContext";
import { useAuth } from "../features/auth/AuthContext";
export type StockRow = {
  product_id: string;
  warehouse_id: string;
  quantity: number;
  product: { name: string; sku: string; unit: string; minimum_stock?: number };
  warehouse: { name: string };
};
export type MovementRow = {
  id: string;
  kind: "in" | "out" | "transfer";
  quantity: number;
  note: string;
  created_at: string;
  product: { name: string; sku: string; unit: string };
  origin: { name: string };
  destination: { name: string } | null;
};
export function useStock(page = 0, warehouse = "") {
  const { organizationId } = useOrganization();
  const { user } = useAuth();
  return useQuery({
    queryKey: ["stock", user?.id, organizationId, page, warehouse],
    enabled: !!organizationId,
    queryFn: async () => {
      let request = supabase
        .from("stock_balances")
        .select(
          "*, product:products(name,sku,unit,minimum_stock), warehouse:warehouses(name)",
          { count: "exact" },
        )
        .eq("organization_id", organizationId!)
        .order("product_id")
        .order("warehouse_id");
      if (warehouse) request = request.eq("warehouse_id", warehouse);
      const { data, count, error } = await request.range(
        page * 30,
        page * 30 + 29,
      );
      if (error) throw error;
      return { rows: data as unknown as StockRow[], count: count ?? 0 };
    },
  });
}
export function useMovements(page = 0, kind = "", productId = "") {
  const { organizationId } = useOrganization();
  const { user } = useAuth();
  return useQuery({
    queryKey: ["movements", user?.id, organizationId, page, kind, productId],
    enabled: !!organizationId,
    queryFn: async () => {
      let request = supabase
        .from("stock_movements")
        .select(
          "*, product:products!stockpro_movement_product_fk(name,sku,unit), origin:warehouses!stockpro_movement_origin_fk(name), destination:warehouses!stockpro_movement_destination_fk(name)",
          { count: "exact" },
        )
        .eq("organization_id", organizationId!)
        .order("created_at", { ascending: false })
        .order("id");
      if (kind) request = request.eq("kind", kind);
      if (productId) request = request.eq("product_id", productId);
      const { data, count, error } = await request.range(
        page * 30,
        page * 30 + 29,
      );
      if (error) throw error;
      return { rows: data as unknown as MovementRow[], count: count ?? 0 };
    },
  });
}
