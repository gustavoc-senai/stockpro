import { CatalogSelect } from "../../components/ui/CatalogSelect";
import { useUnsavedChanges } from "../../components/ui/useUnsavedChanges";
import { Pagination } from "../../components/ui/Pagination";
import { DataTable } from "../../components/ui/DataTable";
import { PageHeader } from "../../components/ui/PageHeader";
import { useRef, useState, type FormEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ClipboardCheck, Plus } from "lucide-react";
import { useOrganization } from "../organizations/OrganizationContext";
import { useLocations } from "../../services/locations";
import { supabase } from "../../lib/supabase";
import { Feedback, Loading } from "../../components/feedback/Feedback";
type CountRow = {
  id: string;
  previous_quantity: number;
  counted_quantity: number;
  difference: number;
  reason: string;
  created_at: string;
  product: { name: string; unit: string };
  warehouse: { name: string };
};
export default function InventoryPage() {
  const { organizationId, canManage } = useOrganization();
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState(false);
  const [dirty, setDirty] = useState(false);
  useUnsavedChanges(dirty && open);
  const [errorText, setErrorText] = useState("");
  const [success, setSuccess] = useState(false);
  const warehouses = useLocations("warehouses");
  const branches = useLocations("branches");
  const lock = useRef(false);
  const pending = useRef<{ key: string; id: string } | null>(null);
  const cache = useQueryClient();
  const query = useQuery({
    queryKey: ["inventory", organizationId, page],
    enabled: !!organizationId,
    queryFn: async () => {
      const { data, count, error } = await supabase
        .from("stock_counts")
        .select("*, product:products(name,unit), warehouse:warehouses(name)", {
          count: "exact",
        })
        .eq("organization_id", organizationId!)
        .order("created_at", { ascending: false })
        .order("id")
        .range(page * 30, page * 30 + 29);
      if (error) throw error;
      return { rows: data as unknown as CountRow[], count: count ?? 0 };
    },
  });
  const mutation = useMutation({
    mutationFn: async (values: {
      product: string;
      warehouse: string;
      quantity: number;
      reason: string;
    }) => {
      if (!canManage || !organizationId) throw new Error("Sem permissão");
      const key = JSON.stringify(values);
      if (pending.current?.key !== key)
        pending.current = { key, id: crypto.randomUUID() };
      const { error } = await supabase.rpc("stockpro_count", {
        p_org: organizationId,
        p_product: values.product,
        p_warehouse: values.warehouse,
        p_counted: values.quantity,
        p_reason: values.reason,
        p_request_id: pending.current!.id,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      pending.current = null;
      await Promise.all(
        ["inventory", "stock", "movements", "reports", "dashboard"].map((key) =>
          cache.invalidateQueries({ queryKey: [key] }),
        ),
      );
      setDirty(false);
      setOpen(false);
      setSuccess(true);
    },
  });
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (lock.current) return;
    const form = new FormData(e.currentTarget);
    const values = {
      product: String(form.get("product")),
      warehouse: String(form.get("warehouse")),
      quantity: Number(form.get("quantity")),
      reason: String(form.get("reason")).trim(),
    };
    if (
      !values.product ||
      !values.warehouse ||
      !Number.isFinite(values.quantity) ||
      values.quantity < 0 ||
      values.reason.length < 3
    ) {
      setErrorText(
        "Selecione o produto e depósito, informe uma quantidade válida e justifique a contagem.",
      );
      return;
    }
    setErrorText("");
    lock.current = true;
    try {
      await mutation.mutateAsync(values);
    } catch {
      /* Error rendered below. */
    } finally {
      lock.current = false;
    }
  }
  return (
    <div className="space-y-6">
      <PageHeader
        title={"Inventário"}
        description={
          <>Registre contagens e ajuste os saldos com rastreabilidade.</>
        }
        eyebrow="CONFERÊNCIA FÍSICA"
        actions={
          <>
            {canManage && (
              <button
                className="primary flex items-center gap-2"
                onClick={() => {
                  setDirty(false);
                  setOpen(true);
                  setSuccess(false);
                  mutation.reset();
                  setErrorText("");
                }}
              >
                <Plus size={17} />
                Registrar contagem
              </button>
            )}
          </>
        }
      />
      <Feedback
        error={
          query.error || mutation.error || warehouses.error || branches.error
        }
      />
      {query.error && (
        <button onClick={() => query.refetch()}>Tentar novamente</button>
      )}
      {success && (
        <p role="status" className="notice">
          Contagem registrada e saldo conferido com sucesso.
        </p>
      )}
      {open && (
        <section className="panel">
          <h2 className="section-title mb-5">
            <ClipboardCheck size={19} />
            Nova contagem física
          </h2>
          <form
            onChange={() => setDirty(true)}
            onSubmit={submit}
            className="grid gap-5 sm:grid-cols-2"
          >
            <CatalogSelect
              kind="products"
              label="Produto"
              name="product"
              required
              disabled={mutation.isPending}
            />
            <label>
              Depósito
              <select
                aria-label="Depósito"
                name="warehouse"
                required
                defaultValue=""
              >
                <option value="" disabled>
                  Selecione o depósito
                </option>
                {warehouses.data
                  ?.filter(
                    (w) =>
                      w.is_active &&
                      branches.data?.some(
                        (b) => b.id === w.branch_id && b.is_active,
                      ),
                  )
                  .map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Quantidade contada
              <input
                type="number"
                name="quantity"
                required
                min="0"
                max="999999999999.999"
                step="0.001"
                placeholder="Quantidade física encontrada"
              />
            </label>
            <label className="sm:col-span-2">
              Justificativa
              <textarea
                name="reason"
                required
                minLength={3}
                maxLength={1000}
                rows={3}
                placeholder="Ex.: conferência mensal do depósito"
              />
            </label>
            <div className="notice sm:col-span-2">
              A confirmação define o saldo deste produto no depósito como a
              quantidade contada. O sistema compara com o saldo no momento da
              confirmação e registra a diferença como entrada ou saída no
              histórico.
            </div>
            <label className="flex items-start gap-3 sm:col-span-2">
              <input
                type="checkbox"
                required
                className="m-0 mt-0.5 h-4 w-4 shrink-0"
              />
              Conferi o produto, o depósito e a quantidade física antes de
              confirmar.
            </label>
            {errorText && (
              <p role="alert" className="notice error sm:col-span-2">
                {errorText}
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
                {mutation.isPending
                  ? "Confirmando…"
                  : "Confirmar contagem e ajustar saldo"}
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
        <h2 className="section-title mb-5">Histórico de contagens</h2>
        {query.isPending ? (
          <Loading />
        ) : query.error ? null : !query.data.rows.length ? (
          <div className="empty-state">
            <ClipboardCheck size={28} />
            <h2>Nenhuma contagem registrada</h2>
            <p>
              Comece conferindo um produto e um depósito. As diferenças ficam
              registradas para consulta.
            </p>
          </div>
        ) : (
          <DataTable>
            <table className="w-full text-left">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Produto</th>
                  <th>Depósito</th>
                  <th>Anterior</th>
                  <th>Contado</th>
                  <th>Diferença</th>
                  <th>Justificativa</th>
                </tr>
              </thead>
              <tbody>
                {query.data.rows.map((r) => (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap">
                      {new Date(r.created_at).toLocaleString("pt-BR")}
                    </td>
                    <td>{r.product.name}</td>
                    <td>{r.warehouse.name}</td>
                    <td>
                      {Number(r.previous_quantity).toLocaleString("pt-BR")}
                    </td>
                    <td>
                      {Number(r.counted_quantity).toLocaleString("pt-BR")}{" "}
                      {r.product.unit}
                    </td>
                    <td
                      className={
                        Number(r.difference) < 0
                          ? "text-amber-300"
                          : "text-blue-300"
                      }
                    >
                      {Number(r.difference) > 0 ? "+" : ""}
                      {Number(r.difference).toLocaleString("pt-BR")}
                    </td>
                    <td>{r.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DataTable>
        )}
        <Pagination
          page={page}
          count={query.data?.count ?? 0}
          pageSize={30}
          busy={query.isPending}
          onChange={setPage}
        />
      </section>
    </div>
  );
}
