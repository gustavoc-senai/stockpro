import { supabase } from "../../lib/supabase";
import { useQuery } from "@tanstack/react-query";
import { useOrganization } from "../organizations/OrganizationContext";
import { useAuth } from "../auth/AuthContext";
export const roleNames: Record<string, string> = {
  owner: "Proprietário",
  admin: "Administrador",
  viewer: "Consulta e status",
};
export type TeamMember = {
  user_id: string;
  role: string;
  full_name: string;
  email: string | null;
};
export type Invitation = {
  id: string;
  email: string;
  role: string;
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
  accepted_at: string | null;
};
export function useTeam(page: number) {
  const { organizationId } = useOrganization();
  const { user } = useAuth();
  return useQuery({
    queryKey: ["team", user?.id, organizationId, page],
    enabled: !!organizationId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("stockpro_team", {
        p_org: organizationId,
        p_page: page,
      });
      if (error) throw error;
      return data as { members: TeamMember[]; count: number };
    },
  });
}
export function useInvitations(page: number) {
  const { organizationId, canManage } = useOrganization();
  return useQuery({
    queryKey: ["invitations", organizationId, page],
    enabled: !!organizationId && canManage,
    queryFn: async () => {
      const { data, count, error } = await supabase
        .from("organization_invitations")
        .select("*", { count: "exact" })
        .eq("organization_id", organizationId!)
        .order("created_at", { ascending: false })
        .order("id")
        .range(page * 20, page * 20 + 19);
      if (error) throw error;
      return { rows: data as Invitation[], count: count ?? 0 };
    },
  });
}
export function invitationStatus(inv: Invitation, now: number) {
  return inv.accepted_at
    ? "Aceito"
    : inv.revoked_at
      ? "Revogado"
      : new Date(inv.expires_at).getTime() <= now
        ? "Expirado"
        : "Pendente";
}
