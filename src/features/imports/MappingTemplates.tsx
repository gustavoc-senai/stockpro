import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { Feedback } from "../../components/feedback/Feedback";
import {
  restoreMapping,
  type ImportKind,
  type Mappings,
  type Sheet,
} from "./model";

type Template = {
  id: string;
  name: string;
  headers: string[];
  mapping: Mappings;
};
export function MappingTemplates({
  orgId,
  kind,
  sheet,
  mapping,
  disabled,
  onApply,
}: {
  orgId: string;
  kind: ImportKind;
  sheet: Sheet;
  mapping: Mappings;
  disabled: boolean;
  onApply: (mapping: Mappings) => void;
}) {
  const [name, setName] = useState("");
  const [selected, setSelected] = useState("");
  const [notice, setNotice] = useState("");
  const cache = useQueryClient();
  const key = ["import-mappings", orgId, kind];
  const templates = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("catalog_import_mappings")
        .select("id,name,headers,mapping")
        .eq("organization_id", orgId)
        .eq("kind", kind)
        .order("name");
      if (error) throw error;
      return data as Template[];
    },
  });
  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("catalog_import_mappings").insert({
        organization_id: orgId,
        kind,
        name: name.trim(),
        headers: sheet.headers,
        mapping,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      setName("");
      setNotice("Modelo salvo para esta empresa.");
      await cache.invalidateQueries({ queryKey: key });
    },
  });
  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("catalog_import_mappings")
        .delete()
        .eq("organization_id", orgId)
        .eq("id", selected);
      if (error) throw error;
    },
    onSuccess: async () => {
      setSelected("");
      setNotice("Modelo excluído.");
      await cache.invalidateQueries({ queryKey: key });
    },
  });
  const busy = disabled || save.isPending || remove.isPending;
  return (
    <div className="mt-6 rounded-xl border border-zinc-800 p-5">
      <h3 className="section-title">Modelos de colunas da empresa</h3>
      <p className="my-3 text-xs leading-6 text-zinc-400">
        Reutilize a associação em outros arquivos. As colunas são reconhecidas
        pelo cabeçalho, mesmo em outra ordem. Os dados da planilha não são
        salvos no modelo.
      </p>
      <Feedback error={templates.error || save.error || remove.error} />
      <div className="grid items-end gap-4 md:grid-cols-2">
        <label>
          Modelo salvo
          <select
            aria-label="Modelo de colunas salvo"
            value={selected}
            disabled={busy}
            onChange={(e) => {
              setSelected(e.target.value);
              setNotice("");
            }}
          >
            <option value="">Selecione um modelo</option>
            {templates.data?.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <div className="flex gap-4 text-xs">
          <button
            disabled={busy || !selected}
            onClick={() => {
              const t = templates.data?.find((t) => t.id === selected);
              if (!t) return;
              const restored = restoreMapping(
                t.headers,
                t.mapping,
                sheet.headers,
                kind,
              );
              onApply(restored.mapping);
              setNotice(
                restored.missing
                  ? "Modelo aplicado parcialmente. Confira as colunas ausentes ou repetidas antes de continuar."
                  : "Modelo aplicado. Confira os dados antes de importar.",
              );
            }}
          >
            Aplicar modelo
          </button>
          <button disabled={busy || !selected} onClick={() => remove.mutate()}>
            Excluir modelo
          </button>
        </div>
        <label>
          Nome do novo modelo
          <input
            aria-label="Nome do modelo de colunas"
            maxLength={80}
            placeholder="Ex.: Planilha do fornecedor"
            value={name}
            disabled={busy}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <button
          className="secondary"
          disabled={busy || name.trim().length < 2 || templates.isError}
          onClick={() => save.mutate()}
        >
          Salvar associação atual
        </button>
      </div>
      {notice && (
        <p role="status" className="mt-4 text-xs text-blue-400">
          {notice}
        </p>
      )}
    </div>
  );
}
