import { useState } from "react";
import {
  importDefinitions,
  type ImportKind,
  type ImportRow,
  type FieldKey,
} from "./model";

export function ImportEditor({
  kind,
  rows,
  disabled,
  changed,
  onEdit,
  onRestore,
}: {
  kind: ImportKind;
  rows: ImportRow[];
  disabled: boolean;
  changed: boolean;
  onEdit: (index: number, field: FieldKey, value: string) => void;
  onRestore: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(0);
  return (
    <section className="panel">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="section-title">Corrigir dados da importação</h2>
          <p className="mt-2 text-xs leading-6 text-zinc-400">
            Edite esta cópia temporária sem alterar o arquivo original. Depois
            de editar, confira os dados novamente.
          </p>
        </div>
        <button className="secondary" onClick={() => setOpen(!open)}>
          {open ? "Fechar edição" : "Editar dados"}
        </button>
      </div>
      {open && (
        <>
          <div className="my-5 flex items-center justify-between gap-4 text-xs text-zinc-400">
            <span>
              {rows.length} linhas ·{" "}
              {changed ? "Há alterações locais" : "Valores do arquivo"}
            </span>
            <button disabled={disabled || !changed} onClick={onRestore}>
              Restaurar valores do arquivo
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr>
                  <th>Linha</th>
                  {importDefinitions[kind].fields.map((f) => (
                    <th key={f.key}>{f.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(page * 20, page * 20 + 20).map((row, i) => (
                  <tr key={row.line}>
                    <td>{row.line}</td>
                    {importDefinitions[kind].fields.map((f) => (
                      <td className="min-w-44" key={f.key}>
                        <input
                          aria-label={`${f.label}, linha ${row.line}`}
                          value={String(row[f.key] ?? "")}
                          disabled={disabled}
                          onChange={(e) =>
                            onEdit(page * 20 + i, f.key, e.target.value)
                          }
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-5 flex justify-end gap-4 text-xs text-zinc-400">
            <button disabled={page === 0} onClick={() => setPage(page - 1)}>
              Anterior
            </button>
            <span>Página {page + 1}</span>
            <button
              disabled={(page + 1) * 20 >= rows.length}
              onClick={() => setPage(page + 1)}
            >
              Próxima
            </button>
          </div>
        </>
      )}
    </section>
  );
}
