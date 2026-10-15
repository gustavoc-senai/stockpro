import { createContext, useContext, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../auth/AuthContext";
import { supabase } from "../../lib/supabase";

export type Membership = {
  organization_id: string;
  role: string;
  organizations: { id: string; name: string };
};
function useOrganizationState() {
  const { user } = useAuth();
  const cache = useQueryClient();
  const key = `stockpro:organization:${user?.id}`;
  const [chosen, setChosen] = useState<{ userId: string; id: string } | null>(
    null,
  );
  const query = useQuery({
    queryKey: ["organizations", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organization_members")
        .select("organization_id, role, organizations!inner(id, name)")
        .eq("user_id", user!.id);
      if (error) throw error;
      return data as unknown as Membership[];
    },
  });
  const memberships = user ? (query.data ?? []) : [];
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(key);
  } catch {
    /* Storage may be disabled. */
  }
  const preferred = chosen?.userId === user?.id ? chosen?.id : stored;
  const active =
    memberships.find((item) => item.organization_id === preferred) ??
    memberships[0] ??
    null;
  function selectOrganization(id: string) {
    const authorized = user
      ? (cache.getQueryData<Membership[]>(["organizations", user.id]) ??
        memberships)
      : [];
    if (!user || !authorized.some((item) => item.organization_id === id))
      return;
    cache.removeQueries({ predicate: (q) => q.queryKey[0] === "locations" });
    setChosen({ userId: user.id, id });
    try {
      localStorage.setItem(key, id);
    } catch {
      /* Preference is optional. */
    }
  }
  return {
    memberships,
    active,
    organizationId: active?.organization_id ?? null,
    role: active?.role ?? null,
    canChangeCatalogStatus: !!active,
    canManage: active?.role === "owner" || active?.role === "admin",
    loading: !!user && query.isPending,
    error: query.error,
    refresh: query.refetch,
    selectOrganization,
  };
}
const Context = createContext<ReturnType<typeof useOrganizationState> | null>(
  null,
);
export function OrganizationProvider({ children }: { children: ReactNode }) {
  return (
    <Context.Provider value={useOrganizationState()}>
      {children}
    </Context.Provider>
  );
}
export function useOrganization() {
  const value = useContext(Context);
  if (!value) throw new Error("OrganizationProvider ausente.");
  return value;
}
