import { usePreference } from "../../components/ui/usePreference";
import {
  validStatus,
  validSort,
  validSearch,
  validColumns,
} from "../../lib/preferences";
import { useAuth } from "../auth/AuthContext";
import { CatalogSelect } from "../../components/ui/CatalogSelect";
import { Button } from "../../components/ui/Button";
import { PageHeader } from "../../components/ui/PageHeader";
import { Pagination } from "../../components/ui/Pagination";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { ConfirmationDialog } from "../../components/ui/ConfirmationDialog";
import { FormSection } from "../../components/ui/FormSection";
import { FieldError } from "../../components/ui/FieldError";
import { useUnsavedChanges } from "../../components/ui/useUnsavedChanges";
import { Link } from "react-router-dom";
import { useRef, useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  UsersRound,
  BadgeCheck,
  Download,
  Package,
  Tags,
  Truck,
  Plus,
  Search,
  Pencil,
  MoreHorizontal,
  SlidersHorizontal,
} from "lucide-react";
import { exportCsv } from "../../services/export";
import { useOrganization } from "../organizations/OrganizationContext";
import {
  useCatalog,
  saveCatalog,
  setCatalogStatus,
  type CatalogKind,
  type CatalogRecord,
} from "../../services/catalog";
import {
  productSchema,
  categorySchema,
  supplierSchema,
} from "../../schemas/catalog";
import { Feedback, Loading } from "../../components/feedback/Feedback";
const definitions = {
  brands: {
    title: "Marcas",
    singular: "marca",
    description: "Organize as marcas associadas ao seu catálogo.",
    icon: BadgeCheck,
  },
  customers: {
    title: "Clientes",
    singular: "cliente",
    description: "Mantenha os contatos comerciais da empresa organizados.",
    icon: UsersRound,
  },
  products: {
    title: "Produtos",
    singular: "produto",
    description: "Seu catálogo, organizado para crescer.",
    icon: Package,
  },
  categories: {
    title: "Categorias",
    singular: "categoria",
    description: "Agrupe produtos e facilite a organização do catálogo.",
    icon: Tags,
  },
  suppliers: {
    title: "Fornecedores",
    singular: "fornecedor",
    description: "Mantenha os contatos de seus parceiros em um só lugar.",
    icon: Truck,
  },
};
export default function CatalogPage({ kind }: { kind: CatalogKind }) {
  const config = definitions[kind];
  const Icon = config.icon;
  const { organizationId, canManage, canChangeCatalogStatus, role } =
    useOrganization();
  const cache = useQueryClient();
  const { user } = useAuth();
  const preferenceKey = `stockpro:preferences:v1:${user?.id}:${organizationId}:${kind}`;
  const [page, setPage] = useState(0);
  const [search, setSearch] = usePreference(
    preferenceKey + ":search",
    "",
    validSearch,
  );
  const [editing, setEditing] = useState<CatalogRecord | "new" | null>(null);
  const [validation, setValidation] = useState("");
  const [success, setSuccess] = useState("");
  const lock = useRef(false);
  const [status, setStatus] = usePreference<"all" | "active" | "inactive">(
    preferenceKey + ":status",
    "all",
    validStatus,
  );
  const [sort, setSort] = usePreference<"name" | "name_desc" | "sku">(
    preferenceKey + ":sort",
    "name",
    validSort,
  );
  const [hiddenColumns, setHiddenColumns] = usePreference<string[]>(
    preferenceKey + ":columns",
    [],
    validColumns,
  );
  const [dirty, setDirty] = useState(false);
  const [discard, setDiscard] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<CatalogRecord | null>(
    null,
  );
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  useUnsavedChanges(dirty && !!editing);
  const query = useCatalog(kind, page, search, false, { status, sort });
  const mutation = useMutation({
    mutationFn: async (input: {
      id?: string;
      values: Record<string, unknown>;
    }) => {
      if (!organizationId) throw new Error("Sem permissão");
      if (
        input.id &&
        Object.keys(input.values).length === 1 &&
        typeof input.values.is_active === "boolean"
      ) {
        if (!canChangeCatalogStatus) throw new Error("Sem permissão");
        await setCatalogStatus(
          organizationId,
          kind,
          input.id,
          input.values.is_active,
        );
        return;
      }
      if (!canManage) throw new Error("Sem permissão");
      await saveCatalog(kind, organizationId, input.values, input.id);
    },
    onSuccess: async (_data, input) => {
      void cache.invalidateQueries({ queryKey: ["catalog-reference"] });
      void cache.invalidateQueries({ queryKey: ["catalog-reference-current"] });
      void cache.invalidateQueries({ queryKey: ["catalog-details"] });
      void cache.invalidateQueries({ queryKey: ["reports"] });
      void cache.invalidateQueries({ queryKey: ["dashboard"] });
      await cache.invalidateQueries({ queryKey: ["catalog"] });
      const statusOnly =
        Object.keys(input.values).length === 1 &&
        typeof input.values.is_active === "boolean";
      setPendingStatus(null);
      if (!statusOnly) {
        setDirty(false);
        setEditing(null);
      }
      setSuccess(
        statusOnly
          ? "Status atualizado com sucesso."
          : "Cadastro salvo com sucesso.",
      );
    },
  });
  function open(row: CatalogRecord | "new") {
    mutation.reset();
    setValidation("");
    setSuccess("");
    if (dirty && !window.confirm("Descartar as alterações não salvas?")) return;
    setDirty(false);
    setFieldErrors({});
    setEditing(row);
  }
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (lock.current) return;
    const input = Object.fromEntries(new FormData(e.currentTarget));
    const schema =
      kind === "products"
        ? productSchema
        : kind === "categories" || kind === "brands"
          ? categorySchema
          : supplierSchema;
    const parsed = schema.safeParse(input);
    if (!parsed.success) {
      setFieldErrors(
        Object.fromEntries(
          parsed.error.issues.map((i) => [String(i.path[0]), i.message]),
        ),
      );
      setValidation("Confira os campos destacados antes de salvar.");
      return;
    }
    setValidation("");
    setFieldErrors({});
    lock.current = true;
    try {
      await mutation.mutateAsync({
        id: editing && editing !== "new" ? editing.id : undefined,
        values: parsed.data,
      });
    } catch {
      /* Mutation error rendered below. */
    } finally {
      lock.current = false;
    }
  }
  function download() {
    if (!query.data) return;
    const filename = "stockpro-" + kind + "-pagina-" + (page + 1) + ".csv";
    if (kind === "products")
      exportCsv(
        filename,
        ["Produto", "SKU", "Unidade", "Estoque mínimo", "Situação"],
        query.data.rows.map((r) => [
          r.name,
          r.sku ?? "",
          r.unit ?? "",
          r.minimum_stock ?? 0,
          r.is_active ? "Ativo" : "Inativo",
        ]),
      );
    else if (kind === "suppliers" || kind === "customers")
      exportCsv(
        filename,
        [
          kind === "customers" ? "Cliente" : "Fornecedor",
          "E-mail",
          "Telefone",
          "Documento",
          "Situação",
        ],
        query.data.rows.map((r) => [
          r.name,
          r.email ?? "",
          r.phone ?? "",
          r.document ?? "",
          r.is_active ? "Ativo" : "Inativo",
        ]),
      );
    else
      exportCsv(
        filename,
        [kind === "brands" ? "Marca" : "Categoria", "Descrição", "Situação"],
        query.data.rows.map((r) => [
          r.name,
          r.description ?? "",
          r.is_active ? "Ativo" : "Inativo",
        ]),
      );
  }
  const row = editing && editing !== "new" ? editing : null;
  return (
    <div className="space-y-6">
      <PageHeader
        title={config.title}
        description={config.description}
        eyebrow="CATÁLOGO DA EMPRESA"
        actions={
          canManage && (
            <Button onClick={() => open("new")}>
              <Plus size={17} />
              Cadastrar {config.singular}
            </Button>
          )
        }
      />
      {role === "owner" && (
        <Link
          className="inline-flex items-center gap-2 text-xs text-blue-400"
          to="/app/imports"
        >
          Importar cadastros por planilha →
        </Link>
      )}
      <Feedback error={query.error || mutation.error} />
      {query.error && (
        <button onClick={() => query.refetch()}>Tentar novamente</button>
      )}
      {success && (
        <p role="status" className="notice">
          {success}
        </p>
      )}
      {editing && (
        <section className="panel">
          <div className="mb-5 flex items-center gap-3">
            <Icon size={20} className="text-blue-400" />
            <h2 className="text-lg font-semibold">
              {row ? "Editar" : "Cadastrar"} {config.singular}
            </h2>
          </div>
          <form
            key={row?.id ?? "new"}
            onSubmit={submit}
            onChange={() => setDirty(true)}
            className="grid gap-5 sm:grid-cols-2"
          >
            <label className="sm:col-span-2">
              Nome
              <input
                autoFocus
                name="name"
                aria-invalid={!!fieldErrors.name}
                aria-describedby={fieldErrors.name ? "error-name" : undefined}
                required
                minLength={2}
                maxLength={120}
                defaultValue={row?.name}
              />
              <FieldError name="name" message={fieldErrors.name} />
            </label>
            {kind === "products" && (
              <FormSection
                title="Organização e estoque"
                description="Identifique o produto e defina como ele será acompanhado no estoque."
              >
                <label>
                  SKU / Código interno
                  <input
                    name="sku"
                    aria-invalid={!!fieldErrors.sku}
                    aria-describedby={fieldErrors.sku ? "error-sku" : undefined}
                    required
                    maxLength={60}
                    defaultValue={row?.sku}
                  />
                  <FieldError name="sku" message={fieldErrors.sku} />
                </label>
                <label>
                  Unidade
                  <select
                    name="unit"
                    aria-invalid={!!fieldErrors.unit}
                    aria-describedby={
                      fieldErrors.unit ? "error-unit" : undefined
                    }
                    defaultValue={row?.unit ?? "UN"}
                  >
                    {["UN", "KG", "G", "L", "ML", "M", "CX"].map((unit) => (
                      <option key={unit}>{unit}</option>
                    ))}
                  </select>
                  <FieldError name="unit" message={fieldErrors.unit} />
                </label>
                <CatalogSelect
                  kind="categories"
                  label="Categoria"
                  name="category_id"
                  defaultValue={row?.category_id ?? ""}
                  error={fieldErrors.category_id}
                  disabled={mutation.isPending}
                />
                <CatalogSelect
                  kind="suppliers"
                  label="Fornecedor"
                  name="supplier_id"
                  defaultValue={row?.supplier_id ?? ""}
                  error={fieldErrors.supplier_id}
                  disabled={mutation.isPending}
                />
                <CatalogSelect
                  kind="brands"
                  label="Marca"
                  name="brand_id"
                  defaultValue={row?.brand_id ?? ""}
                  error={fieldErrors.brand_id}
                  disabled={mutation.isPending}
                />
                <label>
                  Estoque mínimo (total da empresa)
                  <input
                    type="number"
                    name="minimum_stock"
                    aria-invalid={!!fieldErrors.minimum_stock}
                    aria-describedby={
                      fieldErrors.minimum_stock
                        ? "error-minimum_stock"
                        : undefined
                    }
                    min="0"
                    step="0.001"
                    required
                    defaultValue={row?.minimum_stock ?? 0}
                  />
                  <FieldError
                    name="minimum_stock"
                    message={fieldErrors.minimum_stock}
                  />
                </label>
              </FormSection>
            )}
            {(kind === "categories" || kind === "brands") && (
              <label className="sm:col-span-2">
                Descrição
                <textarea
                  name="description"
                  aria-invalid={!!fieldErrors.description}
                  aria-describedby={
                    fieldErrors.description ? "error-description" : undefined
                  }
                  maxLength={1000}
                  defaultValue={row?.description}
                  rows={3}
                />
                <FieldError
                  name="description"
                  message={fieldErrors.description}
                />
              </label>
            )}
            {(kind === "suppliers" || kind === "customers") && (
              <FormSection
                title="Informações de contato"
                description="Dados opcionais para facilitar o relacionamento comercial."
              >
                <label>
                  E-mail
                  <input
                    name="email"
                    aria-invalid={!!fieldErrors.email}
                    aria-describedby={
                      fieldErrors.email ? "error-email" : undefined
                    }
                    type="email"
                    maxLength={254}
                    defaultValue={row?.email}
                  />
                  <FieldError name="email" message={fieldErrors.email} />
                </label>
                <label>
                  Telefone
                  <input
                    name="phone"
                    aria-invalid={!!fieldErrors.phone}
                    aria-describedby={
                      fieldErrors.phone ? "error-phone" : undefined
                    }
                    type="tel"
                    maxLength={40}
                    defaultValue={row?.phone}
                  />
                  <FieldError name="phone" message={fieldErrors.phone} />
                </label>
                <label>
                  CPF / CNPJ (opcional)
                  <input
                    name="document"
                    aria-invalid={!!fieldErrors.document}
                    aria-describedby={
                      fieldErrors.document ? "error-document" : undefined
                    }
                    maxLength={30}
                    defaultValue={row?.document}
                  />
                  <FieldError name="document" message={fieldErrors.document} />
                </label>
              </FormSection>
            )}
            {validation && (
              <p className="notice error sm:col-span-2" role="alert">
                {validation}
              </p>
            )}
            <div className="form-actions">
              <button className="primary" disabled={mutation.isPending}>
                {mutation.isPending ? "Salvando…" : "Salvar cadastro"}
              </button>
              <button
                type="button"
                disabled={mutation.isPending}
                onClick={() => (dirty ? setDiscard(true) : setEditing(null))}
              >
                Cancelar
              </button>
            </div>
          </form>
        </section>
      )}
      <section className="panel">
        <div className="catalog-tools">
          <Button
            variant="ghost"
            onClick={() => {
              setSearch("");
              setStatus("all");
              setSort("name");
              setHiddenColumns([]);
              setPage(0);
            }}
          >
            Restaurar preferências
          </Button>
          <span className="text-sm text-zinc-400">
            {query.data?.count ?? "—"} registros encontrados
          </span>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="secondary"
              disabled={!query.data?.rows.length}
              onClick={download}
            >
              <Download size={14} />
              Exportar página
            </Button>
            <details className="column-picker">
              <summary className="secondary">
                <SlidersHorizontal size={15} />
                Colunas
              </summary>
              <div className="column-options">
                {(kind === "products"
                  ? ["SKU", "Unidade", "Status"]
                  : kind === "suppliers" || kind === "customers"
                    ? ["Contato", "Status"]
                    : ["Status"]
                ).map((column) => (
                  <label key={column}>
                    <input
                      type="checkbox"
                      checked={!hiddenColumns.includes(column)}
                      onChange={(e) =>
                        setHiddenColumns((previous) =>
                          e.target.checked
                            ? previous.filter((c) => c !== column)
                            : [...previous, column],
                        )
                      }
                    />
                    {column}
                  </label>
                ))}
              </div>
            </details>
          </div>
        </div>
        <div className="catalog-toolbar">
          <label className="relative catalog-search">
            <span className="sr-only">
              {kind === "products"
                ? "Buscar por nome ou SKU"
                : "Buscar por nome"}
            </span>
            <Search size={16} className="absolute left-3 top-5 text-zinc-500" />
            <input
              className="pl-10"
              type="search"
              maxLength={120}
              placeholder={
                kind === "products" ? "Buscar nome ou SKU…" : "Buscar por nome…"
              }
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
            />
          </label>
          <label>
            Situação
            <select
              aria-label="Filtrar situação"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value as typeof status);
                setPage(0);
              }}
            >
              <option value="all">Todos os cadastros</option>
              <option value="active">Somente ativos</option>
              <option value="inactive">Somente inativos</option>
            </select>
          </label>
          <label>
            Ordenar por
            <select
              aria-label="Ordenar catálogo"
              value={sort}
              onChange={(e) => {
                setSort(e.target.value as typeof sort);
                setPage(0);
              }}
            >
              <option value="name">Nome: A–Z</option>
              <option value="name_desc">Nome: Z–A</option>
              {kind === "products" && (
                <option value="sku">SKU: crescente</option>
              )}
            </select>
          </label>
        </div>
        {query.isPending ? (
          <Loading />
        ) : query.isError ? null : !query.data.rows.length ? (
          <div className="empty-state">
            <Icon size={32} />
            <h2>
              {search || status !== "all"
                ? "Nenhum resultado encontrado"
                : `Seu primeiro ${config.singular} começa aqui`}
            </h2>
            <p>
              {search || status !== "all"
                ? "Ajuste a busca ou a situação para ver outros cadastros."
                : `Use o botão de cadastro para adicionar ${config.singular} à sua empresa.`}
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto catalog-desktop">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr>
                    <th>Nome</th>
                    {kind === "products" && (
                      <>
                        {!hiddenColumns.includes("SKU") && <th>SKU</th>}
                        {!hiddenColumns.includes("Unidade") && <th>Unidade</th>}
                      </>
                    )}
                    {(kind === "suppliers" || kind === "customers") &&
                      !hiddenColumns.includes("Contato") && <th>Contato</th>}
                    {!hiddenColumns.includes("Status") && <th>Status</th>}
                    {canChangeCatalogStatus && <th>Ações</th>}
                  </tr>
                </thead>
                <tbody>
                  {query.data.rows.map((item) => (
                    <tr key={item.id}>
                      <td className="font-medium text-zinc-200">
                        {kind === "products" || kind === "suppliers" ? (
                          <Link
                            className="text-blue-300 hover:underline"
                            to={`/app/${kind}/${item.id}`}
                          >
                            {item.name}
                          </Link>
                        ) : (
                          item.name
                        )}
                      </td>
                      {kind === "products" && (
                        <>
                          {!hiddenColumns.includes("SKU") && (
                            <td>{item.sku}</td>
                          )}
                          {!hiddenColumns.includes("Unidade") && (
                            <td>{item.unit}</td>
                          )}
                        </>
                      )}
                      {(kind === "suppliers" || kind === "customers") &&
                        !hiddenColumns.includes("Contato") && (
                          <td>{item.email || item.phone || "—"}</td>
                        )}
                      {!hiddenColumns.includes("Status") && (
                        <td>
                          <StatusBadge active={item.is_active} />
                        </td>
                      )}
                      {canChangeCatalogStatus && (
                        <td>
                          <details className="row-actions">
                            <summary aria-label={"Ações de " + item.name}>
                              <MoreHorizontal size={18} />
                            </summary>
                            <div className="row-action-items">
                              {canManage && (
                                <button
                                  aria-label={`Editar ${item.name}`}
                                  disabled={mutation.isPending}
                                  onClick={(e) => {
                                    e.currentTarget
                                      .closest("details")
                                      ?.removeAttribute("open");
                                    open(item);
                                  }}
                                >
                                  <Pencil size={14} className="mr-2 inline" />
                                  Editar
                                </button>
                              )}
                              <button
                                disabled={mutation.isPending}
                                onClick={(e) => {
                                  e.currentTarget
                                    .closest("details")
                                    ?.removeAttribute("open");
                                  setPendingStatus(item);
                                }}
                              >
                                {item.is_active ? "Desativar" : "Ativar"}
                              </button>
                            </div>
                          </details>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="catalog-mobile">
              {query.data.rows.map((item) => (
                <article key={item.id} className="catalog-card">
                  <div className="catalog-card-heading">
                    <h3>
                      {kind === "products" || kind === "suppliers" ? (
                        <Link to={"/app/" + kind + "/" + item.id}>
                          {item.name}
                        </Link>
                      ) : (
                        item.name
                      )}
                    </h3>
                    <StatusBadge active={item.is_active} />
                  </div>
                  <dl>
                    {kind === "products" && (
                      <>
                        <div>
                          <dt>SKU</dt>
                          <dd>{item.sku}</dd>
                        </div>
                        <div>
                          <dt>Unidade</dt>
                          <dd>{item.unit}</dd>
                        </div>
                      </>
                    )}
                    {(kind === "suppliers" || kind === "customers") && (
                      <>
                        <div>
                          <dt>E-mail</dt>
                          <dd>{item.email || "—"}</dd>
                        </div>
                        <div>
                          <dt>Telefone</dt>
                          <dd>{item.phone || "—"}</dd>
                        </div>
                      </>
                    )}
                    {(kind === "categories" || kind === "brands") && (
                      <div className="col-span-2">
                        <dt>Descrição</dt>
                        <dd>{item.description || "Sem descrição"}</dd>
                      </div>
                    )}
                  </dl>
                  {canChangeCatalogStatus && (
                    <div className="catalog-card-actions">
                      {canManage && (
                        <button onClick={() => open(item)}>
                          Editar {config.singular}
                        </button>
                      )}
                      <button
                        disabled={mutation.isPending}
                        onClick={() => setPendingStatus(item)}
                      >
                        {item.is_active ? "Desativar" : "Ativar"}
                      </button>
                    </div>
                  )}
                </article>
              ))}
            </div>
          </>
        )}
        <Pagination
          page={page}
          count={query.data?.count ?? 0}
          busy={query.isPending}
          onChange={setPage}
        />
      </section>
      <ConfirmationDialog
        open={discard}
        title="Descartar alterações?"
        confirmLabel="Descartar"
        danger
        onClose={() => setDiscard(false)}
        onConfirm={() => {
          setDirty(false);
          setEditing(null);
          setDiscard(false);
        }}
      >
        As alterações deste formulário ainda não foram salvas.
      </ConfirmationDialog>
      <ConfirmationDialog
        open={!!pendingStatus}
        title={
          pendingStatus?.is_active ? "Desativar cadastro?" : "Ativar cadastro?"
        }
        confirmLabel={pendingStatus?.is_active ? "Desativar" : "Ativar"}
        busy={mutation.isPending}
        onClose={() => setPendingStatus(null)}
        onConfirm={() => {
          if (pendingStatus)
            mutation.mutate({
              id: pendingStatus.id,
              values: { is_active: !pendingStatus.is_active },
            });
        }}
      >
        <p>{pendingStatus?.name}</p>
        <p>O histórico do cadastro será preservado.</p>
        <Feedback error={mutation.error} />
      </ConfirmationDialog>
    </div>
  );
}
