import { PageHeader } from "../../components/ui/PageHeader";
import { Button } from "../../components/ui/Button";
import { Pagination } from "../../components/ui/Pagination";
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Download, ShieldCheck, UploadCloud } from "lucide-react";
import { useOrganization } from "../organizations/OrganizationContext";
import { supabase } from "../../lib/supabase";
import { exportCsv } from "../../services/export";
import { Feedback, Loading } from "../../components/feedback/Feedback";
import {
  importDefinitions,
  MAX_BYTES,
  mapRows,
  suggestMappings,
  type ImportKind,
  type Sheet,
  type Mappings,
  type ImportPlan,
  type ImportResult,
} from "./model";
import { ImportEditor } from "./ImportEditor";
import { MappingTemplates } from "./MappingTemplates";
import { decimal, type FieldKey } from "./model";
import { spreadsheetTask } from "./spreadsheet";
type HistoryRow = {
  id: string;
  kind: ImportKind;
  created_count: number;
  skipped_count: number;
  total_count: number;
  created_at: string;
};
export default function ImportsPage() {
  const org = useOrganization(),
    cache = useQueryClient();
  const [stage, setStage] = useState(0);
  const [kind, setKind] = useState<ImportKind>("products"),
    [sheets, setSheets] = useState<Sheet[]>([]),
    [sheetIndex, setSheetIndex] = useState(0),
    [mapping, setMapping] = useState<Mappings>({});
  const [filename, setFilename] = useState(""),
    [processing, setProcessing] = useState(false),
    [localError, setLocalError] = useState(""),
    [plan, setPlan] = useState<ImportPlan | null>(null),
    [result, setResult] = useState<ImportResult | null>(null);
  const [requestId, setRequestId] = useState(() => crypto.randomUUID()),
    [page, setPage] = useState(0),
    [historyPage, setHistoryPage] = useState(0),
    [onlyErrors, setOnlyErrors] = useState(false),
    [confirmed, setConfirmed] = useState(false);
  const controller = useRef<AbortController | null>(null),
    lock = useRef(false);
  useEffect(() => () => controller.current?.abort(), []);
  const owner = org.role === "owner",
    sheet = sheets[sheetIndex];
  const [fileVersion, setFileVersion] = useState(0);
  const [edits, setEdits] = useState<
    Record<number, Partial<Record<FieldKey, string>>>
  >({});
  const basePayload = useMemo(
    () => (sheet ? mapRows(sheet, kind, mapping) : []),
    [sheet, kind, mapping],
  );
  const payload = useMemo(
    () =>
      basePayload.map((row, index) => {
        const updated = { ...row, ...edits[index] };
        if (kind === "products") {
          updated.minimum_stock = decimal(updated.minimum_stock ?? "0");
          updated.unit = String(updated.unit || "UN")
            .trim()
            .toUpperCase();
        }
        return updated;
      }),
    [basePayload, edits, kind],
  );
  const history = useQuery({
    queryKey: ["imports", org.organizationId, historyPage],
    enabled: !!org.organizationId && owner,
    queryFn: async () => {
      const { data, count, error } = await supabase
        .from("catalog_imports")
        .select("id,kind,created_count,skipped_count,total_count,created_at", {
          count: "exact",
        })
        .eq("organization_id", org.organizationId!)
        .order("created_at", { ascending: false })
        .order("id")
        .range(historyPage * 20, historyPage * 20 + 19);
      if (error) throw error;
      return { rows: data as HistoryRow[], count: count ?? 0 };
    },
  });
  const preview = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("stockpro_preview_import", {
        p_org: org.organizationId,
        p_kind: kind,
        p_rows: payload,
      });
      if (error) throw error;
      return data as ImportPlan;
    },
    onSuccess: (data) => {
      setPlan(data);
      setStage(2);
      setPage(0);
      setOnlyErrors(false);
      setConfirmed(false);
    },
  });
  const commit = useMutation({
    mutationFn: async () => {
      if (!owner || !plan || plan.errors || !confirmed)
        throw new Error("Conferência obrigatória");
      const { data, error } = await supabase.rpc("stockpro_commit_import", {
        p_org: org.organizationId,
        p_kind: kind,
        p_rows: payload,
        p_request_id: requestId,
      });
      if (error) throw error;
      return data as ImportResult;
    },
    onSuccess: async (data) => {
      setResult(data);
      await Promise.all(
        [
          "catalog",
          "catalog-reference",
          "catalog-reference-current",
          "catalog-details",
          "dashboard",
          "reports",
          "imports",
          "audit",
        ].map((key) => cache.invalidateQueries({ queryKey: [key] })),
      );
    },
  });
  const busy = processing || preview.isPending || commit.isPending;
  function resetReview(clearEdits = true) {
    if (clearEdits) setEdits({});
    setStage((previous) => (previous === 3 ? 2 : previous));
    setPlan(null);
    setResult(null);
    setPage(0);
    setConfirmed(false);
    setLocalError("");
    setRequestId(crypto.randomUUID());
    preview.reset();
    commit.reset();
  }
  async function chooseFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.currentTarget.files?.[0];
    e.currentTarget.value = "";
    if (!file || busy) return;
    resetReview();
    setStage(0);
    setSheets([]);
    setFilename("");
    if (file.size > MAX_BYTES) {
      setLocalError("Selecione um arquivo de até 5 MB.");
      return;
    }
    if (!/\.(xlsx|csv)$/i.test(file.name)) {
      setLocalError(
        "Use um arquivo Excel .xlsx ou CSV .csv. Arquivos .xls devem ser salvos como .xlsx.",
      );
      return;
    }
    setProcessing(true);
    controller.current?.abort();
    controller.current = new AbortController();
    try {
      const response = await spreadsheetTask(
        {
          operation: "read",
          filename: file.name,
          buffer: await file.arrayBuffer(),
        },
        controller.current.signal,
      );
      if (response.ok && response.operation === "read") {
        setFileVersion((version) => version + 1);
        setSheets(response.sheets);
        setSheetIndex(0);
        setMapping(suggestMappings(response.sheets[0], kind));
        setFilename(file.name);
        setStage(1);
      }
    } catch (error) {
      if (!controller.current.signal.aborted)
        setLocalError(
          error instanceof Error
            ? error.message
            : "Não foi possível ler o arquivo.",
        );
    } finally {
      setProcessing(false);
    }
  }
  async function template(format: "xlsx" | "csv") {
    if (busy) return;
    setLocalError("");
    if (format === "csv") {
      exportCsv(
        "modelo-stockpro-" + kind + ".csv",
        importDefinitions[kind].fields.map((f) => f.label),
        [],
      );
      return;
    }
    setProcessing(true);
    controller.current?.abort();
    controller.current = new AbortController();
    try {
      const response = await spreadsheetTask(
        { operation: "template", kind },
        controller.current.signal,
      );
      if (response.ok && response.operation === "template") {
        const url = URL.createObjectURL(
          new Blob([response.buffer], {
            type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          }),
        );
        const a = document.createElement("a");
        a.href = url;
        a.download = "modelo-stockpro-" + kind + ".xlsx";
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    } catch (error) {
      setLocalError(
        error instanceof Error
          ? error.message
          : "Não foi possível gerar o modelo.",
      );
    } finally {
      setProcessing(false);
    }
  }
  async function validate() {
    if (lock.current || busy) return;
    setLocalError("");
    const missing = importDefinitions[kind].fields.filter(
      (f) =>
        f.required && (mapping[f.key] === undefined || mapping[f.key]! < 0),
    );
    if (missing.length) {
      setLocalError(
        "Associe as colunas obrigatórias: " +
          missing.map((f) => f.label).join(", "),
      );
      return;
    }
    if (!payload.length) {
      setLocalError(
        "O arquivo precisa ter ao menos uma linha de dados além dos cabeçalhos.",
      );
      return;
    }
    lock.current = true;
    try {
      await preview.mutateAsync();
    } catch {
      /* Rendered below. */
    } finally {
      lock.current = false;
    }
  }
  async function save() {
    if (lock.current || busy || result) return;
    lock.current = true;
    try {
      await commit.mutateAsync();
    } catch {
      /* Rendered below. */
    } finally {
      lock.current = false;
    }
  }
  function report() {
    if (!plan) return;
    exportCsv(
      "conferencia-stockpro-" + kind + ".csv",
      ["Linha", "Nome", "SKU", "Situação", "Erros"],
      plan.rows.map((r) => [
        r.line,
        r.name,
        r.sku,
        {
          ready: "Novo cadastro",
          existing: "Já existe — preservar",
          error: "Corrigir",
        }[r.status],
        r.errors.join(" "),
      ]),
    );
  }
  if (!owner)
    return (
      <section className="panel">
        <ShieldCheck size={28} className="mb-5 text-blue-400" />
        <h1>Importação exclusiva do proprietário</h1>
        <p className="text-zinc-400">
          Somente o proprietário da empresa pode importar cadastros por
          planilha.
        </p>
      </section>
    );
  const rows =
    plan?.rows.filter((r) => !onlyErrors || r.status === "error") ?? [];
  return (
    <div className="space-y-6">
      <PageHeader
        title="Importar planilha"
        eyebrow="CADASTRO EM LOTE"
        description="Traga seus cadastros do Excel com conferência antes de salvar."
      />
      <ol className="import-steps" aria-label="Etapas da importação">
        {["Arquivo", "Colunas", "Correções", "Confirmação"].map(
          (label, index) => (
            <li key={label} aria-current={stage === index ? "step" : undefined}>
              <button
                disabled={
                  busy ||
                  (index > 0 && !sheet) ||
                  (index === 3 &&
                    (!plan || plan.errors > 0 || plan.ready === 0))
                }
                onClick={() => setStage(index)}
              >
                <span className="step-number">{index + 1}</span>
                {label}
              </button>
            </li>
          ),
        )}
      </ol>
      {sheet && stage > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-700/50 bg-blue-500/5 p-4">
          <div className="min-w-0">
            <p className="text-sm font-medium break-all">{filename}</p>
            <p className="mt-1 text-xs text-zinc-400">
              {importDefinitions[kind].label} · {sheet.rows.length} linhas ·{" "}
              {org.active?.organizations.name}
            </p>
          </div>
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => setStage(0)}
          >
            Alterar arquivo ou tipo
          </Button>
        </div>
      )}
      <section className="panel" hidden={stage !== 0}>
        <div className="grid gap-6 lg:grid-cols-[1fr_1.6fr]">
          <div>
            <label>
              O que deseja importar?
              <select
                aria-label="O que deseja importar?"
                value={kind}
                disabled={busy}
                onChange={(e) => {
                  const value = e.target.value as ImportKind;
                  setKind(value);
                  if (sheet) setMapping(suggestMappings(sheet, value));
                  resetReview();
                }}
              >
                {Object.entries(importDefinitions).map(
                  ([value, definition]) => (
                    <option key={value} value={value}>
                      {definition.label}
                    </option>
                  ),
                )}
              </select>
            </label>
            <p className="mt-4 text-xs leading-6 text-zinc-400">
              {importDefinitions[kind].note}
            </p>
            <div className="mt-5 flex flex-wrap gap-4">
              <button
                className="flex items-center gap-2 text-xs text-blue-400"
                disabled={busy}
                onClick={() => template("xlsx")}
              >
                <Download size={14} />
                Modelo Excel
              </button>
              <button
                className="flex items-center gap-2 text-xs text-blue-400"
                disabled={busy}
                onClick={() => template("csv")}
              >
                <Download size={14} />
                Modelo CSV
              </button>
            </div>
          </div>
          <label className={`import-upload ${busy ? "opacity-50" : ""}`}>
            <UploadCloud size={31} />
            <strong>
              {processing
                ? "Processando arquivo…"
                : "Selecionar arquivo Excel ou CSV"}
            </strong>
            <span>Até 5 MB · 1.000 linhas de dados · 50 colunas por aba</span>
            <input
              className="mt-4"
              aria-label="Arquivo para importar"
              type="file"
              accept=".xlsx,.csv"
              disabled={busy}
              onChange={chooseFile}
            />
          </label>
        </div>
        <p className="mt-5 text-xs leading-6 text-zinc-500">
          A leitura acontece no seu navegador. Enviamos os campos associados
          para validação; o arquivo original não é armazenado. Formate SKU,
          telefone e CPF/CNPJ como texto para preservar zeros à esquerda. Para
          Excel, use valores sem fórmulas.
        </p>
      </section>
      {localError && (
        <p role="alert" className="notice error">
          {localError}
        </p>
      )}
      <Feedback error={preview.error || commit.error} />
      {sheet && (
        <section className="panel" hidden={stage !== 1}>
          <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="section-title">Associar colunas</h2>
              <p className="mt-2 break-all text-xs text-zinc-500">
                {filename} · {sheet.rows.length} linhas de dados
              </p>
            </div>
            <label className="w-full sm:w-64">
              Aba da planilha
              <select
                aria-label="Aba da planilha"
                value={sheetIndex}
                disabled={busy}
                onChange={(e) => {
                  const index = Number(e.target.value);
                  setSheetIndex(index);
                  setMapping(suggestMappings(sheets[index], kind));
                  resetReview();
                }}
              >
                {sheets.map((s, i) => (
                  <option key={s.name} value={i}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {importDefinitions[kind].fields.map((field) => (
              <label key={field.key}>
                {field.label}
                {field.required ? " *" : ""}
                <select
                  aria-label={`Coluna ${field.label}`}
                  disabled={busy}
                  value={mapping[field.key] ?? -1}
                  onChange={(e) => {
                    setMapping((previous) => ({
                      ...previous,
                      [field.key]: Number(e.target.value),
                    }));
                    resetReview();
                  }}
                >
                  <option value={-1}>
                    {field.required
                      ? "Selecione a coluna"
                      : "Não importar esta informação"}
                  </option>
                  {sheet.headers.map((header, i) => (
                    <option key={i} value={i}>
                      {header} ·{" "}
                      {String(sheet.rows[0]?.cells[i] ?? "").slice(0, 35)}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <MappingTemplates
            key={`${kind}-${sheetIndex}-${fileVersion}`}
            orgId={org.organizationId!}
            kind={kind}
            sheet={sheet}
            mapping={mapping}
            disabled={busy}
            onApply={(value) => {
              setMapping(value);
              resetReview();
            }}
          />
          <div className="mt-6 flex flex-wrap items-center gap-5">
            <button
              className="primary"
              disabled={busy || !sheet.rows.length}
              onClick={validate}
            >
              {preview.isPending
                ? "Conferindo no banco…"
                : "Conferir dados antes de importar"}
            </button>
            <span className="text-xs text-zinc-500">
              * Campos obrigatórios. Nenhum registro é gravado nesta
              conferência.
            </span>
          </div>
        </section>
      )}
      {sheet && !result && (
        <div hidden={stage !== 2}>
          <ImportEditor
            key={`${kind}-${sheetIndex}-${fileVersion}`}
            kind={kind}
            rows={basePayload.map((row, index) => ({
              ...row,
              ...edits[index],
            }))}
            disabled={busy}
            changed={Object.keys(edits).length > 0}
            onRestore={() => resetReview()}
            onEdit={(index, field, value) => {
              setEdits((previous) => ({
                ...previous,
                [index]: { ...previous[index], [field]: value },
              }));
              resetReview(false);
            }}
          />
        </div>
      )}
      {stage === 2 && sheet && !plan && Object.keys(edits).length > 0 && (
        <p role="status" className="notice">
          Dados alterados. Clique em Conferir dados antes de importar para
          validar as correções.
        </p>
      )}
      {stage === 2 && sheet && (
        <div className="import-stage-actions">
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => setStage(1)}
          >
            Voltar às colunas
          </Button>
          <div className="flex flex-wrap gap-3">
            <Button variant="secondary" disabled={busy} onClick={validate}>
              {preview.isPending
                ? "Conferindo no banco…"
                : "Conferir dados antes de importar"}
            </Button>
            <Button
              disabled={
                busy || !plan || !!plan.errors || !plan.ready || !!result
              }
              onClick={() => setStage(3)}
            >
              Continuar para confirmação
            </Button>
          </div>
        </div>
      )}
      {plan && (stage === 2 || stage === 3) && (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              { title: "Novos cadastros", value: plan.ready },
              { title: "Já existentes", value: plan.existing },
              { title: "Linhas com erro", value: plan.errors },
            ].map((stat) => (
              <div key={stat.title} className="metric-card">
                <p className="metric-top">{stat.title}</p>
                <p className="metric-value">{stat.value}</p>
              </div>
            ))}
          </div>
          <section className="panel" hidden={stage !== 2}>
            <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
              <h2 className="section-title">Prévia da importação</h2>
              <div className="flex flex-wrap items-center gap-5">
                <label className="flex items-center gap-2">
                  <input
                    className="m-0 h-4 w-4"
                    type="checkbox"
                    checked={onlyErrors}
                    onChange={(e) => {
                      setOnlyErrors(e.target.checked);
                      setPage(0);
                    }}
                  />
                  Somente erros
                </label>
                <button
                  className="flex items-center gap-2 text-xs text-blue-400"
                  onClick={report}
                >
                  <Download size={14} />
                  Baixar relatório de conferência
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr>
                    <th>Linha</th>
                    <th>Nome</th>
                    {kind === "products" && <th>SKU</th>}
                    {importDefinitions[kind].fields
                      .filter((f) => f.key !== "name" && f.key !== "sku")
                      .map((f) => (
                        <th key={f.key}>{f.label}</th>
                      ))}
                    <th>Conferência</th>
                    <th>Observações</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(page * 20, page * 20 + 20).map((row) => (
                    <tr key={row.index}>
                      <td>{row.line}</td>
                      <td>{row.name || "—"}</td>
                      {kind === "products" && <td>{row.sku || "—"}</td>}
                      {importDefinitions[kind].fields
                        .filter((f) => f.key !== "name" && f.key !== "sku")
                        .map((f) => (
                          <td key={f.key}>
                            {f.key === "minimum_stock"
                              ? Number(
                                  row.data.minimum_stock ?? 0,
                                ).toLocaleString("pt-BR", {
                                  maximumFractionDigits: 3,
                                })
                              : String(
                                  (["category", "brand", "supplier"].includes(
                                    f.key,
                                  )
                                    ? payload[row.index - 1]?.[f.key]
                                    : row.data[f.key]) ?? "",
                                ) || "—"}
                          </td>
                        ))}
                      <td>
                        <span
                          className={`status-badge ${row.status === "ready" ? "active" : ""}`}
                        >
                          {
                            {
                              ready: "Novo cadastro",
                              existing: "Preservar existente",
                              error: "Corrigir",
                            }[row.status]
                          }
                        </span>
                      </td>
                      <td className="min-w-64">
                        {row.errors.join(" ") ||
                          (row.status === "existing"
                            ? "Nenhuma alteração será feita neste cadastro."
                            : "Pronto para cadastrar.")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!rows.length && (
              <p className="py-8 text-center text-xs text-zinc-500">
                Nenhuma linha nesta seleção.
              </p>
            )}
            <Pagination page={page} count={rows.length} onChange={setPage} />
          </section>
          {!result && (
            <section className="panel" hidden={stage !== 3}>
              <h2 className="section-title mb-4">
                Confirmar importação para {org.active?.organizations.name}
              </h2>
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => setStage(2)}
              >
                ← Voltar à conferência
              </Button>
              {plan.errors > 0 ? (
                <p className="notice error">
                  Corrija as {plan.errors} linha(s) na seção de edição acima e
                  confira novamente. Nenhuma linha será importada enquanto
                  houver erros.
                </p>
              ) : plan.ready === 0 ? (
                <p className="notice">
                  Todos os registros já existem. Não há novos cadastros para
                  importar.
                </p>
              ) : (
                <>
                  <p className="mb-5 text-sm leading-7 text-zinc-400">
                    Serão criados {plan.ready} cadastros de{" "}
                    {importDefinitions[kind].label.toLowerCase()}. Outros{" "}
                    {plan.existing} registros serão preservados. O banco confere
                    os dados novamente na confirmação; se houver erro, nenhuma
                    linha do lote será gravada.
                  </p>
                  <label className="mb-5 flex items-start gap-3">
                    <input
                      className="m-0 mt-0.5 h-4 w-4 shrink-0"
                      type="checkbox"
                      checked={confirmed}
                      disabled={busy}
                      onChange={(e) => setConfirmed(e.target.checked)}
                    />
                    Conferi os dados e a empresa selecionada e quero criar estes
                    cadastros.
                  </label>
                  <button
                    className="primary"
                    disabled={busy || !confirmed}
                    onClick={save}
                  >
                    {commit.isPending
                      ? "Importando…"
                      : `Confirmar importação de ${plan.ready} cadastros`}
                  </button>
                </>
              )}
            </section>
          )}
        </>
      )}
      {result && (
        <section className="notice" role="status">
          <h2 className="flex items-center gap-2 font-semibold">
            <CheckCircle2 size={19} />
            Importação concluída
          </h2>
          <p className="mt-2">
            {result.created} cadastros criados e {result.skipped} registros
            existentes preservados.
          </p>
        </section>
      )}
      <section className="panel">
        <h2 className="section-title mb-5">
          Histórico de importações da empresa
        </h2>
        <Feedback error={history.error} />
        {history.isPending ? (
          <Loading />
        ) : history.error ? (
          <button onClick={() => history.refetch()}>Tentar novamente</button>
        ) : !history.data.rows.length ? (
          <p className="py-7 text-sm text-zinc-500">
            Nenhuma importação concluída.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Tipo</th>
                  <th>Criados</th>
                  <th>Preservados</th>
                </tr>
              </thead>
              <tbody>
                {history.data.rows.map((row) => (
                  <tr key={row.id}>
                    <td className="whitespace-nowrap">
                      {new Date(row.created_at).toLocaleString("pt-BR")}
                    </td>
                    <td>{importDefinitions[row.kind].label}</td>
                    <td>{row.created_count}</td>
                    <td>{row.skipped_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination
          page={historyPage}
          count={history.data?.count ?? 0}
          busy={history.isPending}
          onChange={setHistoryPage}
        />
      </section>
    </div>
  );
}
