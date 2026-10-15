import { Pagination } from "../../components/ui/Pagination";
import { DataTable } from "../../components/ui/DataTable";
import { PageHeader } from "../../components/ui/PageHeader";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Download, Plus, ShoppingCart } from "lucide-react";
import {
  usePurchases,
  money,
  purchaseStatus,
  purchaseTotal,
} from "../../services/purchases";
import { useOrganization } from "../organizations/OrganizationContext";
import { exportCsv } from "../../services/export";
import { Feedback, Loading } from "../../components/feedback/Feedback";
export default function PurchasesPage() {
  const [page, setPage] = useState(0),
    [status, setStatus] = useState("");
  const query = usePurchases(page, status);
  const { canManage } = useOrganization();
  function download() {
    if (!query.data) return;
    exportCsv(
      "stockpro-compras-pagina-" + (page + 1) + ".csv",
      ["Pedido", "Fornecedor", "Depósito", "Status", "Valor BRL", "Criado em"],
      query.data.rows.map((r) => [
        r.id,
        r.supplier.name,
        r.warehouse.name,
        purchaseStatus[r.status],
        purchaseTotal(r),
        new Date(r.created_at).toLocaleString("pt-BR"),
      ]),
    );
  }
  return (
    <div className="space-y-6">
      <PageHeader
        title={"Pedidos de compra"}
        description={
          <>Planeje as compras e acompanhe o recebimento no estoque.</>
        }
        eyebrow="ABASTECIMENTO"
        actions={
          <>
            {canManage && (
              <Link
                className="primary flex items-center gap-2"
                to="/app/purchases/new"
              >
                <Plus size={16} />
                Novo pedido
              </Link>
            )}
          </>
        }
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="metric-card">
          <p className="metric-top">Pedidos nesta seleção</p>
          <p className="metric-value">{query.data?.count ?? "—"}</p>
          <p className="metric-note">Conforme o filtro de status</p>
        </div>
        <div className="metric-card">
          <p className="metric-top">Valor dos pedidos desta página</p>
          <p className="metric-value text-xl">
            {query.data
              ? money(
                  query.data.rows
                    .filter((r) => r.status !== "cancelled")
                    .reduce((sum, r) => sum + purchaseTotal(r), 0),
                )
              : "—"}
          </p>
          <p className="metric-note">Sem incluir pedidos cancelados</p>
        </div>
        <div className="panel">
          <ShoppingCart size={21} className="mb-3 text-blue-400" />
          <h2 className="text-sm font-medium text-zinc-200">
            Do pedido ao depósito
          </h2>
          <p className="mt-2 text-xs leading-6 text-zinc-500">
            Rascunho → confirmação → recebimento. O estoque só muda quando o
            recebimento é concluído.
          </p>
        </div>
      </div>
      <Feedback error={query.error} />
      {query.error && (
        <button onClick={() => query.refetch()}>Tentar novamente</button>
      )}
      <section className="panel">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <label className="w-full sm:w-64">
            Status do pedido
            <select
              aria-label="Status do pedido"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(0);
              }}
            >
              <option value="">Todos os pedidos</option>
              {Object.entries(purchaseStatus).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <button
            className="flex items-center gap-2 text-xs text-zinc-400"
            onClick={download}
            disabled={!query.data?.rows.length}
          >
            <Download size={15} />
            Exportar página CSV
          </button>
        </div>
        {query.isPending ? (
          <Loading />
        ) : query.error ? null : !query.data.rows.length ? (
          <div className="empty-state">
            <ShoppingCart size={28} />
            <h2>Nenhum pedido nesta seleção</h2>
            <p>Crie um pedido para organizar a próxima compra da empresa.</p>
          </div>
        ) : (
          <DataTable>
            <table className="w-full text-left">
              <thead>
                <tr>
                  <th>Pedido</th>
                  <th>Fornecedor</th>
                  <th>Destino</th>
                  <th>Status</th>
                  <th>Total</th>
                  <th>Data</th>
                </tr>
              </thead>
              <tbody>
                {query.data.rows.map((order) => (
                  <tr key={order.id}>
                    <td>
                      <Link
                        to={`/app/purchases/${order.id}`}
                        className="text-blue-300 hover:underline"
                      >
                        PC-{order.id.slice(0, 8).toUpperCase()}
                      </Link>
                    </td>
                    <td>{order.supplier.name}</td>
                    <td>{order.warehouse.name}</td>
                    <td>
                      <span
                        className={`status-badge ${order.status === "received" ? "active" : ""}`}
                      >
                        {purchaseStatus[order.status]}
                      </span>
                    </td>
                    <td>{money(purchaseTotal(order))}</td>
                    <td>
                      {new Date(order.created_at).toLocaleDateString("pt-BR")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DataTable>
        )}
        <Pagination
          page={page}
          count={query.data?.count ?? 0}
          pageSize={20}
          busy={query.isPending}
          onChange={setPage}
        />
      </section>
    </div>
  );
}
