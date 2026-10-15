import { CatalogSelect } from "../../components/ui/CatalogSelect";
import { useUnsavedChanges } from "../../components/ui/useUnsavedChanges";
import { Pagination } from "../../components/ui/Pagination";
import { DataTable } from "../../components/ui/DataTable";
import { PageHeader } from "../../components/ui/PageHeader";
import { useRef, useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowDownLeft, ArrowLeftRight, Plus, Boxes } from "lucide-react";
import { useOrganization } from "../organizations/OrganizationContext";
import { useLocations } from "../../services/locations";
import { useStock, useMovements } from "../../services/stock";
import { movementSchema } from "../../schemas/catalog";
import { supabase } from "../../lib/supabase";
import { Feedback, Loading } from "../../components/feedback/Feedback";
const labels = { in: "Entrada", out: "Saída", transfer: "Transferência" };
const quantity = (value: number) =>
  Number(value).toLocaleString("pt-BR", { maximumFractionDigits: 3 });
export default function StockPage({
  movements = false,
}: {
  movements?: boolean;
}) {
  const { organizationId, canManage } = useOrganization();
  const [page, setPage] = useState(0);
  const [filter, setFilter] = useState("");
  const [open, setOpen] = useState(false);
  const [dirty, setDirty] = useState(false);
  useUnsavedChanges(dirty && open);
  const [kind, setKind] = useState("in");
  const [validation, setValidation] = useState("");
  const [success, setSuccess] = useState(false);
  const warehouses = useLocations("warehouses");
  const branches = useLocations("branches");
  const balances = useStock(movements ? 0 : page, movements ? "" : filter);
  const ledger = useMovements(movements ? page : 0, movements ? filter : "");
  const cache = useQueryClient();
  const lock = useRef(false);
  const pendingRequest = useRef<{ fingerprint: string; id: string } | null>(
    null,
  );
  const mutation = useMutation({
    mutationFn: async (values: ReturnType<typeof movementSchema.parse>) => {
      if (!organizationId || !canManage) throw new Error("Sem permissão");
      const fingerprint = JSON.stringify(values);
      if (pendingRequest.current?.fingerprint !== fingerprint)
        pendingRequest.current = { fingerprint, id: crypto.randomUUID() };
      const { error } = await supabase.rpc("stockpro_move", {
        p_org: organizationId,
        p_product: values.product_id,
        p_warehouse: values.warehouse_id,
        p_destination:
          values.kind === "transfer" ? values.destination_id : null,
        p_kind: values.kind,
        p_quantity: values.quantity,
        p_note: values.note,
        p_request_id: pendingRequest.current!.id,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      void cache.invalidateQueries({ queryKey: ["reports"] });
      void cache.invalidateQueries({ queryKey: ["dashboard"] });
      pendingRequest.current = null;
      await Promise.all([
        cache.invalidateQueries({ queryKey: ["stock"] }),
        cache.invalidateQueries({ queryKey: ["movements"] }),
      ]);
      setDirty(false);
      setOpen(false);
      setSuccess(true);
    },
  });
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (lock.current) return;
    const values = Object.fromEntries(new FormData(e.currentTarget));
    if (kind !== "transfer") values.destination_id = "";
    const parsed = movementSchema.safeParse(values);
    if (!parsed.success) {
      setValidation(parsed.error.issues.map((i) => i.message).join(" "));
      return;
    }
    lock.current = true;
    setValidation("");
    try {
      await mutation.mutateAsync(parsed.data);
    } catch {
      /* Render mutation error. */
    } finally {
      lock.current = false;
    }
  }
  const available =
    warehouses.data?.filter(
      (w) =>
        w.is_active &&
        branches.data?.some((b) => b.id === w.branch_id && b.is_active),
    ) ?? [];
  const current = movements ? ledger : balances;
  const count = current.data?.count ?? 0;
  return (
    <div className="space-y-6">
      <PageHeader
        title={movements ? "Movimentações" : "Estoque por depósito"}
        description={
          <>
            {movements
              ? "Histórico de entradas, saídas e transferências da empresa."
              : "Consulte os saldos registrados em cada local de armazenamento."}
          </>
        }
        eyebrow="CONTROLE OPERACIONAL"
        actions={
          <>
            {canManage && (
              <button
                className="primary inline-flex items-center gap-2"
                onClick={() => {
                  setDirty(false);
                  setOpen(true);
                  setSuccess(false);
                  mutation.reset();
                  setValidation("");
                }}
              >
                <Plus size={17} />
                Registrar movimentação
              </button>
            )}
          </>
        }
      />
      <Feedback
        error={
          current.error || warehouses.error || branches.error || mutation.error
        }
      />
      {current.error && (
        <button onClick={() => current.refetch()}>Tentar novamente</button>
      )}
      {success && (
        <p className="notice" role="status">
          Movimentação registrada com sucesso.
        </p>
      )}
      {open && (
        <section className="panel">
          <h2 className="mb-5 text-lg font-semibold">Nova movimentação</h2>
          <form
            onChange={() => setDirty(true)}
            onSubmit={submit}
            className="grid gap-5 sm:grid-cols-2"
          >
            <label>
              Operação
              <select
                name="kind"
                value={kind}
                onChange={(e) => setKind(e.target.value)}
              >
                {Object.entries(labels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <CatalogSelect
              kind="products"
              label="Produto"
              name="product_id"
              required
              disabled={mutation.isPending}
            />
            <label>
              {kind === "in" ? "Depósito de entrada" : "Depósito de origem"}
              <select
                aria-label={
                  kind === "in" ? "Depósito de entrada" : "Depósito de origem"
                }
                name="warehouse_id"
                required
                defaultValue=""
              >
                <option value="" disabled>
                  Selecione o depósito
                </option>
                {available.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </label>
            {kind === "transfer" && (
              <label>
                Depósito de destino
                <select
                  aria-label="Depósito de destino"
                  name="destination_id"
                  required
                  defaultValue=""
                >
                  <option value="" disabled>
                    Selecione o destino
                  </option>
                  {available.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label>
              Quantidade
              <input
                name="quantity"
                type="number"
                required
                min="0.001"
                step="0.001"
              />
            </label>
            <label className="sm:col-span-2">
              Observação
              <textarea name="note" rows={2} maxLength={1000} />
            </label>
            <p className="text-sm text-zinc-400 sm:col-span-2">
              O registro altera o saldo e permanece no histórico. Confira os
              dados antes de confirmar. Para corrigir, registre uma operação
              inversa com a justificativa.
            </p>
            {validation && (
              <p role="alert" className="notice error sm:col-span-2">
                {validation}
              </p>
            )}
            <div className="form-actions">
              <button
                className="primary"
                disabled={
                  mutation.isPending ||
                  warehouses.isPending ||
                  branches.isPending
                }
              >
                {mutation.isPending ? "Registrando…" : "Confirmar movimentação"}
              </button>
              <button
                type="button"
                disabled={mutation.isPending}
                onClick={() => {
                  if (
                    !dirty ||
                    window.confirm("Descartar as alterações não salvas?")
                  ) {
                    setDirty(false);
                    setOpen(false);
                  }
                }}
              >
                Cancelar
              </button>
            </div>
          </form>
        </section>
      )}
      <section className="panel">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-zinc-400">
            {movements ? <ArrowLeftRight size={18} /> : <Boxes size={18} />}
            <span>{count} registros</span>
          </div>
          <label className="w-full sm:w-64">
            <span className="sr-only">
              {movements ? "Filtrar operação" : "Filtrar depósito"}
            </span>
            <select
              value={filter}
              onChange={(e) => {
                setPage(0);
                setFilter(e.target.value);
              }}
            >
              <option value="">
                {movements ? "Todas as operações" : "Todos os depósitos"}
              </option>
              {movements
                ? Object.entries(labels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))
                : warehouses.data?.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
            </select>
          </label>
        </div>
        {current.isPending ? (
          <Loading />
        ) : current.error ? null : !count ? (
          <div className="empty-state">
            <ArrowDownLeft size={32} />
            <h2>Nenhum registro encontrado</h2>
            <p>
              As movimentações confirmadas aparecerão aqui com os saldos reais.
            </p>
          </div>
        ) : (
          <DataTable>
            <table className="w-full text-left text-sm">
              <thead>
                {movements ? (
                  <tr>
                    <th>Data</th>
                    <th>Produto</th>
                    <th>Operação</th>
                    <th>Depósitos</th>
                    <th>Quantidade</th>
                    <th>Observação</th>
                  </tr>
                ) : (
                  <tr>
                    <th>Produto</th>
                    <th>SKU</th>
                    <th>Depósito</th>
                    <th>Saldo</th>
                  </tr>
                )}
              </thead>
              <tbody>
                {movements
                  ? ledger.data?.rows.map((item) => (
                      <tr key={item.id}>
                        <td className="whitespace-nowrap">
                          {new Date(item.created_at).toLocaleString("pt-BR")}
                        </td>
                        <td>{item.product.name}</td>
                        <td>{labels[item.kind]}</td>
                        <td>
                          {item.origin.name}
                          {item.destination && ` → ${item.destination.name}`}
                        </td>
                        <td>
                          {quantity(item.quantity)} {item.product.unit}
                        </td>
                        <td>{item.note || "—"}</td>
                      </tr>
                    ))
                  : balances.data?.rows.map((item) => (
                      <tr key={`${item.product_id}:${item.warehouse_id}`}>
                        <td>{item.product.name}</td>
                        <td>{item.product.sku}</td>
                        <td>{item.warehouse.name}</td>
                        <td className="font-semibold text-blue-300">
                          {quantity(item.quantity)} {item.product.unit}
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </DataTable>
        )}
        <Pagination
          page={page}
          count={count}
          pageSize={30}
          busy={current.isPending}
          onChange={setPage}
        />
      </section>
    </div>
  );
}
