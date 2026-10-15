import { useQuery } from "@tanstack/react-query";
import { useOrganization } from "../features/organizations/OrganizationContext";
import { useAuth } from "../features/auth/AuthContext";
import { supabase } from "../lib/supabase";
export type CatalogKind =
  "products" | "categories" | "suppliers" | "customers" | "brands";
export type CatalogRecord = {
  id: string;
  organization_id: string;
  name: string;
  is_active: boolean;
  sku?: string;
  unit?: string;
  category_id?: string;
  brand_id?: string;
  supplier_id?: string;
  minimum_stock?: number;
  description?: string;
  email?: string;
  phone?: string;
  document?: string;
};
export function useCatalog(
  kind: CatalogKind,
  page = 0,
  search = "",
  reference = false,
  options: {
    status?: "all" | "active" | "inactive";
    sort?: "name" | "name_desc" | "sku";
  } = {},
) {
  const { organizationId } = useOrganization();
  const { user } = useAuth();
  return useQuery({
    queryKey: [
      "catalog",
      user?.id,
      organizationId,
      kind,
      page,
      search,
      reference,
      options.status ?? "all",
      options.sort ?? "name",
    ],
    enabled: !!organizationId,
    queryFn: async () => {
      let request = supabase
        .from(kind)
        .select("*", { count: "exact" })
        .eq("organization_id", organizationId!)
        .order(options.sort === "sku" && kind === "products" ? "sku" : "name", {
          ascending: options.sort !== "name_desc",
        })
        .order("id");
      if (options.status === "active" || options.status === "inactive")
        request = request.eq("is_active", options.status === "active");
      if (search.trim()) {
        const term = search
          .trim()
          .slice(0, 120)
          .replace(/[\\%_]/g, (char) => "\\" + char);
        if (kind === "products") {
          const pattern = '"%' + term.replaceAll('"', '\\"') + '%"';
          request = request.or(
            "name.ilike." + pattern + ",sku.ilike." + pattern,
          );
        } else request = request.ilike("name", "%" + term + "%");
      }
      const limit = reference ? 1000 : 20;
      const { data, count, error } = await request.range(
        page * limit,
        (page + 1) * limit - 1,
      );
      if (error) throw error;
      return { rows: data as CatalogRecord[], count: count ?? 0 };
    },
  });
}
export async function saveCatalog(
  kind: CatalogKind,
  organizationId: string,
  values: Record<string, unknown>,
  id?: string,
) {
  const request = id
    ? supabase
        .from(kind)
        .update(values)
        .eq("organization_id", organizationId)
        .eq("id", id)
    : supabase
        .from(kind)
        .insert({ ...values, organization_id: organizationId });
  const { error } = await request.select("id").single();
  if (error) throw error;
}
export async function setCatalogStatus(
  organizationId: string,
  kind: CatalogKind,
  id: string,
  active: boolean,
) {
  const { error } = await supabase.rpc("stockpro_set_catalog_status", {
    p_org: organizationId,
    p_kind: kind,
    p_id: id,
    p_active: active,
  });
  if (error) throw error;
}
