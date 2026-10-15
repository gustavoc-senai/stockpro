import { CatalogSelect } from "../../components/ui/CatalogSelect";
import { useUnsavedChanges } from "../../components/ui/useUnsavedChanges";
import { useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, PackageCheck, Plus, Trash2 } from "lucide-react";
import { useOrganization } from "../organizations/OrganizationContext";
import { useLocations } from "../../services/locations";
import {
  usePurchases,
  money,
  purchaseTotal,
  purchaseStatus,
  type Purchase,
} from "../../services/purchases";
import { purchaseSchema } from "../../schemas/purchases";
import { supabase } from "../../lib/supabase";
import { Feedback, Loading } from "../../components/feedback/Feedback";
export default function PurchaseDetailsPage() {
  const { id } = useParams();
  const query = usePurchases(0, "", id);
  if (id === "new") return <PurchaseContent />;
  if (query.isPending) return <Loading />;
  if (query.error)
    return (
      <>
        <Feedback error={query.error} />
        <button onClick={() => query.refetch()}>Tentar novamente</button>
      </>
    );
  const order = query.data.rows[0];
  if (!order)
    return (
      <section className="panel">
        <h1>Pedido não encontrado</h1>
        <p className="mb-5 text-zinc-400">
          O pedido não está disponível nesta empresa.
        </p>
        <Link to="/app/purchases" className="text-blue-400">
          Voltar para compras →
        </Link>
      </section>
    );
  return (
    <PurchaseContent
      key={order.id + order.status + order.updated_at}
      order={order}
    />
  );
}
function PurchaseContent({ order }: { order?: Purchase }) {
  const { organizationId, canManage } = useOrganization();
  const navigate = useNavigate(),
    cache = useQueryClient();
  const warehouses = useLocations("warehouses"),
    branches = useLocations("branches");
  const [orderId] = useState(() => order?.id ?? crypto.randomUUID());
  const [items, setItems] = useState(
    () =>
      order?.items.map((i) => ({
        key: crypto.randomUUID(),
        product_id: i.product_id,
        quantity: String(i.quantity),
        unit_price: String(i.unit_price),
      })) ?? [
        {
          key: crypto.randomUUID(),
          product_id: "",
          quantity: "1",
          unit_price: "0",
        },
      ],
  );
  const [dirty, setDirty] = useState(false);
  function changeItems(
    next: typeof items | ((previous: typeof items) => typeof items),
  ) {
    setDirty(true);
    setItems(next);
  }
  const [validation, setValidation] = useState("");
  const [action, setAction] = useState<"order" | "receive" | "cancel" | null>(
    null,
  );
  const lock = useRef(false);
  const editable = canManage && (!order || order.status === "draft");
  const mutation = useMutation({
    mutationFn: async (input: {
      values?: ReturnType<typeof purchaseSchema.parse>;
      action?: string;
    }) => {
      if (!organizationId || !canManage) throw new Error("Sem permissão");
      const result = input.values
        ? await supabase.rpc("stockpro_save_purchase", {
            p_org: organizationId,
            p_id: orderId,
            p_supplier: input.values.supplier_id,
            p_warehouse: input.values.warehouse_id,
            p_notes: input.values.notes,
            p_items: input.values.items,
          })
        : await supabase.rpc("stockpro_purchase_action", {
            p_org: organizationId,
            p_id: orderId,
            p_action: input.action,
          });
      if (result.error) throw result.error;
    },
    onSuccess: async () => {
      await Promise.all(
        [
          "purchases",
          "stock",
          "movements",
          "dashboard",
          "reports",
          "catalog-details",
        ].map((key) => cache.invalidateQueries({ queryKey: [key] })),
      );
      setDirty(false);
      setAction(null);
      navigate("/app/purchases/" + orderId, { replace: true });
    },
  });
  useUnsavedChanges(dirty && !mutation.isPending);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (lock.current) return;
    const form = new FormData(e.currentTarget);
    const parsed = purchaseSchema.safeParse({
      supplier_id: form.get("supplier"),
      warehouse_id: form.get("warehouse"),
      notes: form.get("notes"),
      items: items.map(({ product_id, quantity, unit_price }) => ({
        product_id,
        quantity,
        unit_price,
      })),
    });
    if (!parsed.success) {
      setValidation(parsed.error.issues.map((i) => i.message).join(" "));
      return;
    }
    setValidation("");
    lock.current = true;
    try {
      await mutation.mutateAsync({ values: parsed.data });
    } catch {
      /* Rendered below. */
    } finally {
      lock.current = false;
    }
  }
  const total = items.reduce(
    (sum, i) => sum + (Number(i.quantity) || 0) * (Number(i.unit_price) || 0),
    0,
  );
  function update(
    key: string,
    field: "product_id" | "quantity" | "unit_price",
    value: string,
  ) {
    changeItems((previous) =>
      previous.map((i) => (i.key === key ? { ...i, [field]: value } : i)),
    );
  }
  return (
    <div className="space-y-6">
      <Link
        to="/app/purchases"
        className="inline-flex items-center gap-2 text-xs text-zinc-400"
      >
        <ArrowLeft size={14} />
        Todos os pedidos
      </Link>
      <div className="page-heading">
        <div>
          <p className="eyebrow">
            ABASTECIMENTO / {order ? "DETALHES DO PEDIDO" : "NOVO PEDIDO"}
          </p>
          <h1>
            {order
              ? "PC-" + order.id.slice(0, 8).toUpperCase()
              : "Novo pedido de compra"}
          </h1>
          <p className="text-zinc-400">
            {order
              ? `Criado em ${new Date(order.created_at).toLocaleString("pt-BR")}`
              : "Monte os itens e salve um rascunho para conferência."}
          </p>
        </div>
        {order && (
          <span
            className={`status-badge ${order.status === "received" ? "active" : ""}`}
          >
            {purchaseStatus[order.status]}
          </span>
        )}
      </div>
      <Feedback error={mutation.error || warehouses.error || branches.error} />
      {validation && (
        <p role="alert" className="notice error">
          {validation}
        </p>
      )}
      <form
        onChange={() => setDirty(true)}
        onSubmit={submit}
        className="space-y-6"
      >
        <section className="panel">
          <h2 className="section-title mb-5">Fornecedor e entrega</h2>
          <div className="grid gap-5 sm:grid-cols-2">
            <CatalogSelect
              kind="suppliers"
              label="Fornecedor"
              name="supplier"
              required
              disabled={!editable || mutation.isPending}
              defaultValue={order?.supplier_id ?? ""}
            />
            <label>
              Depósito de recebimento
              <select
                aria-label="Depósito de recebimento"
                name="warehouse"
                required
                disabled={!editable || mutation.isPending}
                defaultValue={order?.warehouse_id ?? ""}
              >
                <option value="" disabled>
                  Selecione o depósito
                </option>
                {warehouses.data
                  ?.filter(
                    (w) =>
                      (w.is_active &&
                        branches.data?.some(
                          (b) => b.id === w.branch_id && b.is_active,
                        )) ||
                      w.id === order?.warehouse_id,
                  )
                  .map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
              </select>
            </label>
            <label className="sm:col-span-2">
              Observações
              <textarea
                name="notes"
                maxLength={1000}
                rows={3}
                defaultValue={order?.notes}
                disabled={!editable || mutation.isPending}
              />
            </label>
          </div>
        </section>
        <section className="panel">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="section-title">Itens do pedido</h2>
            {editable && (
              <button
                className="flex items-center gap-2 text-xs text-blue-400"
                type="button"
                disabled={items.length >= 100 || mutation.isPending}
                onClick={() =>
                  changeItems((previous) => [
                    ...previous,
                    {
                      key: crypto.randomUUID(),
                      product_id: "",
                      quantity: "1",
                      unit_price: "0",
                    },
                  ])
                }
              >
                <Plus size={14} />
                Adicionar item
              </button>
            )}
          </div>
          <div className="space-y-4">
            {items.map((item, index) => (
              <div key={item.key} className="purchase-item">
                <CatalogSelect
                  kind="products"
                  label={`Produto ${index + 1}`}
                  value={item.product_id}
                  required
                  disabled={!editable || mutation.isPending}
                  onChange={(value) => update(item.key, "product_id", value)}
                />
                <label className="purchase-number">
                  Quantidade
                  <input
                    aria-label={`Quantidade ${index + 1}`}
                    type="number"
                    required
                    min="0.001"
                    max="999999999999.999"
                    step="0.001"
                    value={item.quantity}
                    disabled={!editable || mutation.isPending}
                    onChange={(e) =>
                      update(item.key, "quantity", e.target.value)
                    }
                  />
                </label>
                <label className="purchase-number">
                  Valor unitário (R$)
                  <input
                    aria-label={`Valor unitário ${index + 1}`}
                    type="number"
                    required
                    min="0"
                    max="999999999999.99"
                    step="0.01"
                    value={item.unit_price}
                    disabled={!editable || mutation.isPending}
                    onChange={(e) =>
                      update(item.key, "unit_price", e.target.value)
                    }
                  />
                </label>
                {editable && (
                  <button
                    className="p-2 text-zinc-500 hover:text-red-300"
                    type="button"
                    aria-label={`Remover item ${index + 1}`}
                    disabled={items.length === 1 || mutation.isPending}
                    onClick={() =>
                      changeItems((previous) =>
                        previous.filter((i) => i.key !== item.key),
                      )
                    }
                  >
                    <Trash2 size={17} />
                  </button>
                )}
              </div>
            ))}
          </div>
          <div className="mt-6 flex items-center justify-between border-t border-white/10 pt-5">
            <span className="text-xs text-zinc-400">
              {items.length} item(ns) · valores em reais
            </span>
            <strong className="text-xl text-white">
              {money(order && !editable ? purchaseTotal(order) : total)}
            </strong>
          </div>
        </section>
        {editable && (
          <button
            className="primary"
            disabled={
              mutation.isPending || warehouses.isPending || branches.isPending
            }
          >
            {mutation.isPending ? "Salvando…" : "Salvar rascunho"}
          </button>
        )}
      </form>
      {order && canManage && ["draft", "ordered"].includes(order.status) && (
        <section className="panel">
          <h2 className="section-title mb-3">Próxima etapa</h2>
          <p className="mb-5 text-sm leading-7 text-zinc-400">
            {order.status === "draft"
              ? "Confirme os dados salvos antes de seguir. A confirmação bloqueia a edição dos itens e não altera o estoque."
              : "Confirme o recebimento somente depois de conferir todos os itens. As entradas de estoque serão registradas juntas. Recebimento parcial não está disponível."}
          </p>
          {dirty && (
            <p className="notice mb-4">
              Salve as alterações do rascunho antes de confirmar o pedido.
            </p>
          )}
          <div className="flex flex-wrap gap-4">
            <button
              className="primary flex items-center gap-2"
              disabled={mutation.isPending || dirty}
              onClick={() =>
                setAction(order.status === "draft" ? "order" : "receive")
              }
            >
              {order.status === "draft" ? (
                <Check size={16} />
              ) : (
                <PackageCheck size={16} />
              )}
              {order.status === "draft"
                ? "Confirmar pedido"
                : "Receber todos os itens"}
            </button>
            <button
              className="text-xs text-zinc-400"
              disabled={mutation.isPending}
              onClick={() => setAction("cancel")}
            >
              Cancelar pedido
            </button>
          </div>
          {action && (
            <div className="notice mt-5">
              <p>
                {action === "receive"
                  ? "Todos os itens serão adicionados ao depósito informado. Confirma o recebimento integral?"
                  : action === "cancel"
                    ? "O pedido será cancelado e não poderá ser recebido. Confirma o cancelamento?"
                    : "O rascunho salvo será confirmado e seus itens não poderão mais ser editados. Deseja continuar?"}
              </p>
              <div className="mt-4 flex gap-4">
                <button
                  className="primary"
                  disabled={mutation.isPending}
                  onClick={() => mutation.mutate({ action })}
                >
                  {mutation.isPending ? "Processando…" : "Confirmar operação"}
                </button>
                <button
                  disabled={mutation.isPending}
                  onClick={() => setAction(null)}
                >
                  Voltar
                </button>
              </div>
            </div>
          )}
        </section>
      )}
      {order?.status === "received" && (
        <p role="status" className="notice">
          Compra recebida em{" "}
          {new Date(order.received_at!).toLocaleString("pt-BR")}. As entradas
          estão disponíveis no{" "}
          <Link to="/app/movements" className="underline">
            histórico de movimentações
          </Link>
          .
        </p>
      )}
    </div>
  );
}
