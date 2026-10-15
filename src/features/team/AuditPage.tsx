import { PageHeader } from "../../components/ui/PageHeader";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { History, ShieldCheck } from "lucide-react";
import { useOrganization } from "../organizations/OrganizationContext";
import { supabase } from "../../lib/supabase";
import { Feedback, Loading } from "../../components/feedback/Feedback";
const entities: Record<string, string> = {
  catalog_import: "Importações de catálogo",
  organizations: "Empresa",
  branches: "Filiais",
  warehouses: "Depósitos",
  products: "Produtos",
  categories: "Categorias",
  suppliers: "Fornecedores",
  customers: "Clientes",
  brands: "Marcas",
  purchase_orders: "Pedidos de compra",
  stock_movements: "Movimentações",
  stock_counts: "Inventário",
  invitation: "Convites",
  membership: "Equipe",
};
const actions: Record<string, string> = {
  status_changed: "Status alterado",
  import_completed: "Importação concluída",
  insert: "Cadastro criado",
  update: "Cadastro alterado",
  invite_created: "Convite gerado",
  invite_revoked: "Convite revogado",
  invite_accepted: "Convite aceito",
  member_removed: "Acesso removido",
  role_changed: "Permissão alterada",
};
type Event = {
  id: string;
  actor_id: string | null;
  entity_type: string;
  entity_id: string;
  action: string;
  created_at: string;
};
export default function AuditPage() {
  const org = useOrganization();
  const [page, setPage] = useState(0),
    [entity, setEntity] = useState("");
  const query = useQuery({
    queryKey: ["audit", org.organizationId, page, entity],
    enabled: !!org.organizationId && org.canManage,
    queryFn: async () => {
      let request = supabase
        .from("audit_events")
        .select("id,actor_id,entity_type,entity_id,action,created_at", {
          count: "exact",
        })
        .eq("organization_id", org.organizationId!)
        .order("created_at", { ascending: false })
        .order("id");
      if (entity) request = request.eq("entity_type", entity);
      const { data, count, error } = await request.range(
        page * 30,
        page * 30 + 29,
      );
      if (error) throw error;
      return { rows: data as Event[], count: count ?? 0 };
    },
  });
  if (!org.canManage)
    return (
      <section className="panel">
        <ShieldCheck className="mb-4 text-blue-400" />
        <h1>Acesso restrito</h1>
        <p className="text-zinc-400">
          O histórico de alterações está disponível para proprietários e
          administradores.
        </p>
      </section>
    );
  return (
    <div className="space-y-6">
      <PageHeader
        title={"Histórico de alterações"}
        description={
          <>Acompanhe cadastros, operações e mudanças de acesso da empresa.</>
        }
        eyebrow="SEGURANÇA E RASTREABILIDADE"
        actions={
          <>
            <History size={24} className="text-blue-400" />
          </>
        }
      />
      <p className="notice">
        O histórico registra as alterações feitas após a ativação deste recurso.
        Os códigos dos responsáveis permitem relacionar as operações aos
        usuários sem copiar informações pessoais.
      </p>
      <Feedback error={query.error} />
      {query.error && (
        <button onClick={() => query.refetch()}>Tentar novamente</button>
      )}
      <section className="panel">
        <label className="mb-6 block max-w-xs">
          Filtrar por área
          <select
            value={entity}
            aria-label="Filtrar por área"
            onChange={(e) => {
              setEntity(e.target.value);
              setPage(0);
            }}
          >
            <option value="">Todas as áreas</option>
            {Object.entries(entities).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        {query.isPending ? (
          <Loading />
        ) : query.error ? null : !query.data.rows.length ? (
          <div className="empty-state">
            <History size={28} />
            <h2>Nenhuma alteração nesta seleção</h2>
            <p>As próximas operações registradas aparecerão aqui.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Área</th>
                  <th>Ação</th>
                  <th>Responsável</th>
                  <th>Registro</th>
                </tr>
              </thead>
              <tbody>
                {query.data.rows.map((event) => (
                  <tr key={event.id}>
                    <td className="whitespace-nowrap">
                      {new Date(event.created_at).toLocaleString("pt-BR")}
                    </td>
                    <td>{entities[event.entity_type] ?? "Operação"}</td>
                    <td>{actions[event.action] ?? "Alteração"}</td>
                    <td title={event.actor_id ?? ""}>
                      {event.actor_id ?? "Sistema"}
                    </td>
                    <td title={event.entity_id}>{event.entity_id}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-5 flex justify-end gap-4 text-xs text-zinc-400">
          <button
            disabled={page === 0 || query.isPending}
            onClick={() => setPage((p) => p - 1)}
          >
            Anterior
          </button>
          <span>Página {page + 1}</span>
          <button
            disabled={
              query.isPending || (page + 1) * 30 >= (query.data?.count ?? 0)
            }
            onClick={() => setPage((p) => p + 1)}
          >
            Próxima
          </button>
        </div>
      </section>
    </div>
  );
}
