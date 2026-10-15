import { useQuery } from "@tanstack/react-query";
import { useOrganization } from "../features/organizations/OrganizationContext";
import { supabase } from "../lib/supabase";
export type Location = {
  id: string;
  name: string;
  organization_id: string;
  is_active: boolean;
  branch_id?: string;
};
export function useLocations(table: "branches" | "warehouses") {
  const { organizationId } = useOrganization();
  return useQuery({
    queryKey: ["locations", table, organizationId],
    enabled: !!organizationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from(table)
        .select("*")
        .eq("organization_id", organizationId!)
        .order("name");
      if (error) throw error;
      return data as Location[];
    },
  });
}
