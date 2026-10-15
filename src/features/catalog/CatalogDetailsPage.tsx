import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowUpRight,
  Building2,
  Package,
  Truck,
} from "lucide-react";
import { useOrganization } from "../organizations/OrganizationContext";
import { useAuth } from "../auth/AuthContext";
import { supabase } from "../../lib/supabase";
import { useMovements } from "../../services/stock";
import {
  usePurchases,
  purchaseStatus,
  money,
  purchaseTotal,
} from "../../services/purchases";
import type { CatalogRecord } from "../../services/catalog";
import { Feedback, Loading } from "../../components/feedback/Feedback";
type DetailRecord = CatalogRecord & {
  category?: { name: string } | null;
  brand?: { name: string } | null;
  supplier?: { name: string } | null;
};
export default function CatalogDetailsPage({
  kind,
}: {
  kind: "products" | "suppliers";
}) {
  const { id } = useParams();
  const { organizationId } = useOrganization();
  const { user } = useAuth();
  const query = useQuery({
    queryKey: ["catalog-details", user?.id, organizationId, kind, id],
    enabled: !!organizationId && !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from(kind)
        .select(
          kind === "products"
            ? "*, category:categories(name),brand:brands!stockpro_product_brand_fk(name),supplier:suppliers(name)"
            : "*",
        )
        .eq("organization_id", organizationId!)
        .eq("id", id!)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as DetailRecord | null;
    },
  });
  if (query.isPending) return <Loading />;
  if (query.error)
    return (
      <>
        <Feedback error={query.error} />
        <button onClick={() => query.refetch()}>Tentar novamente</button>
      </>
    );
  const row = query.data;
  if (!row)
    return (
      <section className="panel">
        <h1>Cadastro não encontrado</h1>
        <p className="mb-5 text-zinc-400">
          Este registro não está disponível na empresa ativa.
        </p>
        <Link className="text-blue-400" to={"/app/" + kind}>
          Voltar ao catálogo →
        </Link>
      </section>
    );
  return (
    <div className="space-y-6">
      <Link
        className="inline-flex items-center gap-2 text-xs text-zinc-400"
        to={"/app/" + kind}
      >
        <ArrowLeft size={14} />
        Voltar para {kind === "products" ? "produtos" : "fornecedores"}
      </Link>
      <div className="page-heading">
        <div>
          <p className="eyebrow">
            {kind === "products" ? "FICHA DO PRODUTO" : "PERFIL DO FORNECEDOR"}
          </p>
          <h1>{row.name}</h1>
          <p className="text-zinc-400">
            {kind === "products"
              ? `SKU ${row.sku} · Unidade ${row.unit}`
              : "Informações e vínculos comerciais da empresa."}
          </p>
        </div>
        <span className={`status-badge ${row.is_active ? "active" : ""}`}>
          {row.is_active ? "Ativo" : "Inativo"}
        </span>
      </div>
      {kind === "products" ? (
        <ProductDetails key={row.id} row={row} />
      ) : (
        <SupplierDetails key={row.id} row={row} />
      )}
    </div>
  );
}
function ProductDetails({ row }: { row: DetailRecord }) {
  const { organizationId } = useOrganization();
  const [page, setPage] = useState(0),
    [historyPage, setHistoryPage] = useState(0);
  const history = useMovements(historyPage, "", row.id);
  const stock = useQuery({
    queryKey: ["catalog-details", "balances", organizationId, row.id, page],
    queryFn: async () => {
      const { data, count, error } = await supabase
        .from("stock_balances")
        .select("warehouse_id,quantity,warehouse:warehouses(name)", {
          count: "exact",
        })
        .eq("organization_id", organizationId!)
        .eq("product_id", row.id)
        .order("warehouse_id")
        .range(page * 20, page * 20 + 19);
      if (error) throw error;
      return {
        rows: data as unknown as {
          warehouse_id: string;
          quantity: number;
          warehouse: { name: string };
        }[],
        count: count ?? 0,
      };
    },
  });
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          {
            label: "Categoria",
            value: row.category?.name ?? "Sem categoria",
            icon: Package,
          },
          {
            label: "Marca",
            value: row.brand?.name ?? "Sem marca",
            icon: Building2,
          },
          {
            label: "Estoque mínimo total",
            value: `${Number(row.minimum_stock ?? 0).toLocaleString("pt-BR")} ${row.unit}`,
            icon: Package,
          },
        ].map((item) => (
          <div className="metric-card" key={item.label}>
            <div className="metric-top">
              <span>{item.label}</span>
              <item.icon size={17} className="text-blue-400" />
            </div>
            <p className="mt-5 text-lg font-medium text-zinc-200">
              {item.value}
            </p>
          </div>
        ))}
      </div>
      <section className="panel">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="section-title">Fornecedor principal</h2>
            <p className="mt-3 text-sm text-zinc-400">
              {row.supplier?.name ?? "Nenhum fornecedor vinculado"}
            </p>
          </div>
          {row.supplier_id && (
            <Link
              className="inline-flex items-center gap-2 text-xs text-blue-400"
              to={"/app/suppliers/" + row.supplier_id}
            >
              Ver fornecedor <ArrowUpRight size={14} />
            </Link>
          )}
        </div>
      </section>
      <Feedback error={stock.error || history.error} />
      <section className="panel">
        <h2 className="section-title mb-5">Saldos por depósito</h2>
        {stock.isPending ? (
          <Loading />
        ) : stock.error ? (
          <button onClick={() => stock.refetch()}>Tentar novamente</button>
        ) : !stock.data.rows.length ? (
          <p className="py-8 text-sm text-zinc-500">
            Nenhum saldo registrado para este produto.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr>
                  <th>Depósito</th>
                  <th>Saldo disponível</th>
                </tr>
              </thead>
              <tbody>
                {stock.data.rows.map((item) => (
                  <tr key={item.warehouse_id}>
                    <td>{item.warehouse.name}</td>
                    <td>
                      {Number(item.quantity).toLocaleString("pt-BR")} {row.unit}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pager
          page={page}
          count={stock.data?.count ?? 0}
          size={20}
          pending={stock.isPending}
          setPage={setPage}
        />
      </section>
      <section className="panel">
        <h2 className="section-title mb-5">Histórico deste produto</h2>
        {history.isPending ? (
          <Loading />
        ) : history.error ? (
          <button onClick={() => history.refetch()}>Tentar novamente</button>
        ) : !history.data.rows.length ? (
          <p className="py-8 text-sm text-zinc-500">
            Nenhuma movimentação registrada para este produto.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Operação</th>
                  <th>Local</th>
                  <th>Quantidade</th>
                  <th>Observação</th>
                </tr>
              </thead>
              <tbody>
                {history.data.rows.map((item) => (
                  <tr key={item.id}>
                    <td className="whitespace-nowrap">
                      {new Date(item.created_at).toLocaleString("pt-BR")}
                    </td>
                    <td>
                      {
                        {
                          in: "Entrada",
                          out: "Saída",
                          transfer: "Transferência",
                        }[item.kind]
                      }
                    </td>
                    <td>
                      {item.origin.name}
                      {item.destination && ` → ${item.destination.name}`}
                    </td>
                    <td>
                      {Number(item.quantity).toLocaleString("pt-BR")} {row.unit}
                    </td>
                    <td>{item.note || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pager
          page={historyPage}
          count={history.data?.count ?? 0}
          size={30}
          pending={history.isPending}
          setPage={setHistoryPage}
        />
      </section>
    </>
  );
}
function SupplierDetails({ row }: { row: DetailRecord }) {
  const { organizationId } = useOrganization();
  const [page, setPage] = useState(0),
    [orderPage, setOrderPage] = useState(0);
  const products = useQuery({
    queryKey: [
      "catalog-details",
      "supplier-products",
      organizationId,
      row.id,
      page,
    ],
    queryFn: async () => {
      const { data, count, error } = await supabase
        .from("products")
        .select("id,name,sku,is_active", { count: "exact" })
        .eq("organization_id", organizationId!)
        .eq("supplier_id", row.id)
        .order("name")
        .order("id")
        .range(page * 20, page * 20 + 19);
      if (error) throw error;
      return { rows: data as CatalogRecord[], count: count ?? 0 };
    },
  });
  const orders = usePurchases(orderPage, "", undefined, row.id);
  return (
    <>
      <section className="panel">
        <h2 className="section-title mb-5">
          <Truck size={17} />
          Informações de contato
        </h2>
        <dl className="grid gap-6 sm:grid-cols-3">
          {[
            { label: "E-mail", value: row.email },
            { label: "Telefone", value: row.phone },
            { label: "CPF / CNPJ", value: row.document },
          ].map((item) => (
            <div key={item.label}>
              <dt className="text-xs text-zinc-500">{item.label}</dt>
              <dd className="mt-2 break-words text-sm text-zinc-200">
                {item.value || "Não informado"}
              </dd>
            </div>
          ))}
        </dl>
      </section>
      <Feedback error={products.error || orders.error} />
      <section className="panel">
        <h2 className="section-title mb-5">Produtos vinculados</h2>
        {products.isPending ? (
          <Loading />
        ) : products.error ? (
          <button onClick={() => products.refetch()}>Tentar novamente</button>
        ) : !products.data.rows.length ? (
          <p className="py-8 text-sm text-zinc-500">
            Nenhum produto vinculado a este fornecedor.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr>
                  <th>Produto</th>
                  <th>SKU</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {products.data.rows.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <Link
                        className="text-blue-300 hover:underline"
                        to={"/app/products/" + p.id}
                      >
                        {p.name}
                      </Link>
                    </td>
                    <td>{p.sku}</td>
                    <td>{p.is_active ? "Ativo" : "Inativo"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pager
          page={page}
          count={products.data?.count ?? 0}
          size={20}
          pending={products.isPending}
          setPage={setPage}
        />
      </section>
      <section className="panel">
        <div className="mb-5 flex items-center justify-between gap-4">
          <h2 className="section-title">Pedidos deste fornecedor</h2>
          <Link to="/app/purchases" className="text-xs text-blue-400">
            Ver compras →
          </Link>
        </div>
        {orders.isPending ? (
          <Loading />
        ) : orders.error ? (
          <button onClick={() => orders.refetch()}>Tentar novamente</button>
        ) : !orders.data.rows.length ? (
          <p className="py-8 text-sm text-zinc-500">
            Nenhum pedido registrado para este fornecedor.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr>
                  <th>Pedido</th>
                  <th>Status</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {orders.data.rows.map((o) => (
                  <tr key={o.id}>
                    <td>
                      <Link
                        to={"/app/purchases/" + o.id}
                        className="text-blue-300 hover:underline"
                      >
                        PC-{o.id.slice(0, 8).toUpperCase()}
                      </Link>
                    </td>
                    <td>{purchaseStatus[o.status]}</td>
                    <td>{money(purchaseTotal(o))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pager
          page={orderPage}
          count={orders.data?.count ?? 0}
          size={20}
          pending={orders.isPending}
          setPage={setOrderPage}
        />
      </section>
    </>
  );
}
function Pager({
  page,
  count,
  size,
  pending,
  setPage,
}: {
  page: number;
  count: number;
  size: number;
  pending: boolean;
  setPage: (value: number) => void;
}) {
  return (
    <div className="mt-5 flex justify-end gap-4 text-xs text-zinc-400">
      <button
        disabled={page === 0 || pending}
        onClick={() => setPage(page - 1)}
      >
        Anterior
      </button>
      <span>Página {page + 1}</span>
      <button
        disabled={pending || (page + 1) * size >= count}
        onClick={() => setPage(page + 1)}
      >
        Próxima
      </button>
    </div>
  );
}
