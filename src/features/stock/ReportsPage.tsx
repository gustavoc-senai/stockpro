import { DataTable } from "../../components/ui/DataTable";
import { PageHeader } from "../../components/ui/PageHeader";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Download,
  FileBarChart,
  Package,
  Search,
} from "lucide-react";
import { useOrganization } from "../organizations/OrganizationContext";
import { useAuth } from "../auth/AuthContext";
import { supabase } from "../../lib/supabase";
import { exportCsv } from "../../services/export";
import { Feedback, Loading } from "../../components/feedback/Feedback";
type Report = {
  rows: {
    id: string;
    name: string;
    sku: string;
    unit: string;
    minimum_stock: number;
    quantity: number;
    low_stock: boolean;
    is_active: boolean;
  }[];
  count: number;
  summary: { products: number; low_stock: number; out_of_stock: number };
};
export default function ReportsPage({ alerts = false }: { alerts?: boolean }) {
  const { organizationId, active } = useOrganization();
  const { user } = useAuth();
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [lowOnly, setLowOnly] = useState(alerts);
  const query = useQuery({
    queryKey: ["reports", user?.id, organizationId, page, search, lowOnly],
    enabled: !!organizationId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("stockpro_product_balances", {
        p_org: organizationId,
        p_page: page,
        p_search: search,
        p_low_only: lowOnly,
      });
      if (error) throw error;
      return data as Report;
    },
  });
  function download() {
    if (!query.data) return;
    exportCsv(
      "stockpro-saldos-pagina-" + (page + 1) + ".csv",
      [
        "Empresa",
        "Produto",
        "SKU",
        "Unidade",
        "Saldo total",
        "Estoque mínimo",
        "Situação",
      ],
      query.data.rows.map((r) => [
        active?.organizations.name ?? "",
        r.name,
        r.sku,
        r.unit,
        r.quantity,
        r.minimum_stock,
        r.low_stock ? "Abaixo do mínimo" : r.is_active ? "Regular" : "Inativo",
      ]),
    );
  }
  return (
    <div className="space-y-6">
      <PageHeader
        title={alerts ? "Alertas de estoque" : "Relatórios de estoque"}
        description={
          <>Saldos consolidados de todos os depósitos da empresa ativa.</>
        }
        eyebrow="INTELIGÊNCIA OPERACIONAL"
        actions={
          <>
            <button
              className="primary flex items-center gap-2"
              disabled={!query.data?.rows.length}
              onClick={download}
            >
              <Download size={16} />
              Exportar página CSV
            </button>
          </>
        }
      />
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          {
            label: "Produtos ativos",
            value: query.data?.summary.products,
            icon: Package,
          },
          {
            label: "Abaixo do estoque mínimo",
            value: query.data?.summary.low_stock,
            icon: AlertTriangle,
          },
          {
            label: "Produtos sem saldo",
            value: query.data?.summary.out_of_stock,
            icon: FileBarChart,
          },
        ].map((m) => (
          <div className="metric-card" key={m.label}>
            <div className="metric-top">
              <span>{m.label}</span>
              <span className="metric-icon">
                <m.icon size={17} />
              </span>
            </div>
            <p className="metric-value">{m.value ?? "—"}</p>
            <p className="metric-note">Produtos ativos da empresa</p>
          </div>
        ))}
      </div>
      <Feedback error={query.error} />
      {query.error && (
        <button onClick={() => query.refetch()}>Tentar novamente</button>
      )}
      <section className="panel">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-5">
          <label className="relative w-full sm:w-80">
            <span className="sr-only">Buscar produto ou SKU</span>
            <Search className="absolute left-3 top-5 text-zinc-500" size={16} />
            <input
              className="pl-10"
              type="search"
              maxLength={120}
              placeholder="Buscar produto ou SKU…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
            />
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              className="m-0 h-4 w-4"
              checked={lowOnly}
              onChange={(e) => {
                setLowOnly(e.target.checked);
                setPage(0);
              }}
            />
            Somente abaixo do mínimo
          </label>
        </div>
        {query.isPending ? (
          <Loading />
        ) : query.error ? null : !query.data.rows.length ? (
          <div className="empty-state">
            <FileBarChart size={28} />
            <h2>Nenhum produto nesta seleção</h2>
            <p>
              Cadastre produtos ou ajuste os filtros para consultar os saldos.
            </p>
          </div>
        ) : (
          <DataTable>
            <table className="w-full text-left">
              <thead>
                <tr>
                  <th>Produto</th>
                  <th>SKU</th>
                  <th>Saldo total</th>
                  <th>Mínimo</th>
                  <th>Situação</th>
                </tr>
              </thead>
              <tbody>
                {query.data.rows.map((r) => (
                  <tr key={r.id}>
                    <td>{r.name}</td>
                    <td>{r.sku}</td>
                    <td>
                      {Number(r.quantity).toLocaleString("pt-BR")} {r.unit}
                    </td>
                    <td>
                      {Number(r.minimum_stock).toLocaleString("pt-BR")} {r.unit}
                    </td>
                    <td>
                      <span
                        className={`status-badge ${r.low_stock ? "text-amber-300" : r.is_active ? "active" : ""}`}
                      >
                        {r.low_stock
                          ? "Abaixo do mínimo"
                          : r.is_active
                            ? "Regular"
                            : "Inativo"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DataTable>
        )}
        <div className="mt-5 flex items-center justify-end gap-4 text-xs text-zinc-400">
          <span>{query.data?.count ?? "—"} produtos</span>
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
      <p className="text-xs leading-6 text-zinc-500">
        Cada produto mantém sua própria unidade. A exportação inclui os
        registros da página atual. Saldo mínimo é avaliado pelo total da
        empresa, somando todos os depósitos, inclusive locais desativados que
        ainda contenham estoque.
      </p>
    </div>
  );
}
