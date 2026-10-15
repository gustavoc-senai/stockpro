import { SetupChecklist } from "./SetupChecklist";
import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeftRight,
  ArrowUpRight,
  Building2,
  ChevronRight,
  Package,
  Plus,
  Warehouse,
  Tags,
  AlertCircle,
} from "lucide-react";
import { useOrganization } from "../organizations/OrganizationContext";
import { useAuth } from "../auth/AuthContext";
import { supabase } from "../../lib/supabase";
import { useMovements } from "../../services/stock";
import { Feedback } from "../../components/feedback/Feedback";
type Summary = {
  products: number;
  branches: number;
  warehouses: number;
  movements_today: number;
  low_stock: number;
  activity: {
    day: string;
    entries: number;
    exits: number;
    transfers: number;
  }[];
};
export default function Dashboard() {
  const [today] = useState(() => new Date());
  const { active, organizationId, canManage, role } = useOrganization();
  const { user } = useAuth();
  const recent = useMovements();
  const query = useQuery({
    queryKey: ["dashboard", user?.id, organizationId],
    enabled: !!organizationId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("stockpro_dashboard", {
        p_org: organizationId,
      });
      if (error) throw error;
      return data as Summary;
    },
  });
  const firstName =
    typeof user?.user_metadata.full_name === "string"
      ? user.user_metadata.full_name.split(" ")[0]
      : "bem-vindo";
  const metrics = [
    {
      label: "Produtos ativos",
      value: query.data?.products,
      icon: Package,
      note: "Catálogo da empresa",
      path: "products",
    },
    {
      label: "Movimentações hoje",
      value: query.data?.movements_today,
      icon: ArrowLeftRight,
      note: "Entradas, saídas e transferências",
      path: "movements",
    },
    {
      label: "Filiais ativas",
      value: query.data?.branches,
      icon: Building2,
      note: "Unidades em operação",
      path: "branches",
    },
    {
      label: "Depósitos ativos",
      value: query.data?.warehouses,
      icon: Warehouse,
      note: "Locais de armazenamento",
      path: "warehouses",
    },
  ];
  const max = Math.max(
    1,
    ...(query.data?.activity.flatMap((a) => [
      a.entries,
      a.exits,
      a.transfers,
    ]) ?? []),
  );
  return (
    <div className="space-y-6">
      <div className="page-heading">
        <div>
          <p className="eyebrow">SEU NEGÓCIO EM PERSPECTIVA</p>
          <h1>Visão geral</h1>
          <p className="text-xs text-zinc-500">
            Uma visão clara da operação, do catálogo ao depósito.
          </p>
        </div>
        <span className="rounded-lg border border-[#2c3444] bg-[#151a24] px-3 py-2.5 text-[10px] text-zinc-400">
          {today.toLocaleDateString("pt-BR", {
            timeZone: "America/Sao_Paulo",
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
        </span>
      </div>
      <section className="dashboard-hero">
        <img src="/images/warehouse-editorial.png" alt="" />
        <div className="dashboard-hero-content">
          <div className="hero-label">
            WORKSPACE / {active?.organizations.name.toUpperCase()}
          </div>
          <h1>
            Olá, {firstName}.<br />
            Sua operação começa com clareza.
          </h1>
          <p>
            Conecte seus produtos, organize seus depósitos
            <br className="hidden sm:block" /> e acompanhe cada movimentação da
            sua empresa.
          </p>
        </div>
      </section>
      <Feedback error={query.error || recent.error} />
      {query.error && (
        <button onClick={() => query.refetch()}>Tentar novamente</button>
      )}
      {query.isSuccess && canManage && (
        <SetupChecklist
          products={query.data.products}
          branches={query.data.branches}
          warehouses={query.data.warehouses}
          owner={role === "owner"}
        />
      )}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {metrics.map((m) => (
          <Link to={`/app/${m.path}`} className="metric-card" key={m.path}>
            <div className="metric-top">
              <span>{m.label}</span>
              <span className="metric-icon">
                <m.icon size={17} />
              </span>
            </div>
            <p className="metric-value">{m.value ?? "—"}</p>
            <p className="metric-note">{m.note}</p>
          </Link>
        ))}
      </div>
      <div className="grid gap-5 xl:grid-cols-[1.7fr_1fr]">
        <section className="panel">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="section-title">
                <ArrowLeftRight size={16} className="text-blue-400" />
                Atividade da operação
              </h2>
              <p className="section-subtitle">
                Quantidade de movimentações nos últimos 7 dias · horário de
                Brasília
              </p>
            </div>
            <span className="text-[9px] text-zinc-500">7 DIAS</span>
          </div>
          {query.isSuccess ? (
            <>
              <div
                className="activity-bars"
                role="img"
                aria-label={query.data.activity
                  .map(
                    (d) =>
                      `${d.day}: ${d.entries} entradas, ${d.exits} saídas, ${d.transfers} transferências`,
                  )
                  .join("; ")}
              >
                {query.data.activity.map((d) => (
                  <div
                    key={d.day}
                    className="activity-day"
                    title={`${d.entries} entradas · ${d.exits} saídas · ${d.transfers} transferências`}
                  >
                    <span
                      className="activity-bar"
                      style={{
                        height: `${(d.entries / max) * 100}%`,
                        minHeight: d.entries ? 4 : 0,
                      }}
                    />
                    <span
                      className="activity-bar out"
                      style={{
                        height: `${(d.exits / max) * 100}%`,
                        minHeight: d.exits ? 4 : 0,
                      }}
                    />
                    <span
                      className="activity-bar"
                      style={{
                        height: `${(d.transfers / max) * 100}%`,
                        background: "#64a7aa",
                        minHeight: d.transfers ? 4 : 0,
                      }}
                    />
                  </div>
                ))}
              </div>
              <div className="activity-axis">
                {query.data.activity.map((d) => (
                  <span key={d.day}>
                    {new Date(d.day + "T12:00:00")
                      .toLocaleDateString("pt-BR", { weekday: "short" })
                      .replace(".", "")}
                  </span>
                ))}
              </div>
              <div className="mt-6 flex flex-wrap justify-center gap-5 text-[9px] text-zinc-500">
                <span>● Entradas</span>
                <span>● Saídas</span>
                <span>● Transferências</span>
              </div>
              {!query.data.activity.some(
                (d) => d.entries + d.exits + d.transfers > 0,
              ) && (
                <p className="mt-4 text-center text-xs text-zinc-500">
                  Nenhuma movimentação registrada neste período.
                </p>
              )}
            </>
          ) : (
            <p className="py-16 text-center text-xs text-zinc-500">
              {query.isPending
                ? "Carregando atividade…"
                : "Atividade indisponível."}
            </p>
          )}
        </section>
        <section className="panel">
          <h2 className="section-title">
            Acesso rápido{" "}
            <ArrowUpRight size={14} className="ml-auto text-zinc-500" />
          </h2>
          <p className="section-subtitle">O próximo passo da sua operação.</p>
          {[
            {
              label: canManage ? "Gerenciar produtos" : "Consultar produtos",
              description: "Seu catálogo em um só lugar",
              path: "products",
              icon: Package,
            },
            {
              label: "Organizar categorias",
              description: "Mais clareza para seu catálogo",
              path: "categories",
              icon: Tags,
            },
            {
              label: "Consultar estoque",
              description: "Saldos por local de armazenamento",
              path: "stock",
              icon: Warehouse,
            },
          ].map((a) => (
            <Link key={a.path} className="quick-link" to={`/app/${a.path}`}>
              <a.icon size={16} />
              <div>
                <strong>{a.label}</strong>
                <p>{a.description}</p>
              </div>
              <ChevronRight size={14} className="text-zinc-600" />
            </Link>
          ))}
        </section>
      </div>
      <section className="panel">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h2 className="section-title">Últimas movimentações</h2>
            <p className="section-subtitle">
              Os registros mais recentes da empresa selecionada.
            </p>
          </div>
          <Link to="/app/movements" className="text-[10px] text-blue-400">
            Ver histórico ↗
          </Link>
        </div>
        {recent.data?.rows.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr>
                  <th>Produto</th>
                  <th>Operação</th>
                  <th>Quantidade</th>
                  <th>Data</th>
                </tr>
              </thead>
              <tbody>
                {recent.data.rows.slice(0, 5).map((r) => (
                  <tr key={r.id}>
                    <td>{r.product.name}</td>
                    <td>
                      <span className="status-badge active">
                        {
                          {
                            in: "Entrada",
                            out: "Saída",
                            transfer: "Transferência",
                          }[r.kind]
                        }
                      </span>
                    </td>
                    <td>
                      {Number(r.quantity).toLocaleString("pt-BR")}{" "}
                      {r.product.unit}
                    </td>
                    <td>{new Date(r.created_at).toLocaleString("pt-BR")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state" style={{ minHeight: 160 }}>
            <ArrowLeftRight size={23} />
            <h2>
              {recent.isPending
                ? "Carregando histórico…"
                : recent.error
                  ? "Histórico indisponível"
                  : "Pronto para sua primeira movimentação"}
            </h2>
            <p>As entradas e saídas confirmadas aparecerão aqui.</p>
            {canManage && (
              <Link
                to="/app/movements"
                className="mt-2 flex items-center gap-2 text-xs text-blue-400"
              >
                <Plus size={14} />
                Registrar movimentação
              </Link>
            )}
          </div>
        )}
      </section>
      {query.data && query.data.low_stock > 0 && (
        <div className="notice flex items-center gap-3">
          <AlertCircle size={20} />
          <p>
            {query.data.low_stock} produto(s) com saldo total abaixo do estoque
            mínimo definido.{" "}
            <Link className="underline" to="/app/products">
              Consultar produtos
            </Link>
          </p>
        </div>
      )}
    </div>
  );
}
