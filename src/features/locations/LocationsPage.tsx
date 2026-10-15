import { PageHeader } from "../../components/ui/PageHeader";
import { DataTable } from "../../components/ui/DataTable";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { useUnsavedChanges } from "../../components/ui/useUnsavedChanges";
import { useState, useRef, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { useOrganization } from "../organizations/OrganizationContext";
import { useLocations, type Location } from "../../services/locations";
import { Feedback, Loading } from "../../components/feedback/Feedback";
export default function LocationsPage({
  kind,
}: {
  kind: "branches" | "warehouses";
}) {
  const { organizationId, canManage } = useOrganization();
  const cache = useQueryClient();
  const rows = useLocations(kind);
  const branches = useLocations("branches");
  const [editing, setEditing] = useState<Location | "new" | null>(null);
  const [dirty, setDirty] = useState(false);
  useUnsavedChanges(dirty && !!editing);
  const [filter, setFilter] = useState("");
  const [success, setSuccess] = useState("");
  const lock = useRef(false);
  const warehouse = kind === "warehouses";
  const mutation = useMutation({
    mutationFn: async (input: {
      id?: string;
      name?: string;
      branch_id?: string;
      is_active?: boolean;
    }) => {
      if (!canManage || !organizationId) throw new Error("Sem permissão");
      if (
        input.branch_id &&
        !branches.data?.some((b) => b.id === input.branch_id)
      )
        throw new Error("Filial inválida");
      const { id, ...values } = input;
      const request = id
        ? supabase
            .from(kind)
            .update(values)
            .eq("id", id)
            .eq("organization_id", organizationId)
        : supabase
            .from(kind)
            .insert({ ...values, organization_id: organizationId });
      const { data, error } = await request.select("id").single();
      if (error) throw error;
      if (!data) throw new Error("Registro não alterado");
    },
    onSuccess: async () => {
      void cache.invalidateQueries({ queryKey: ["reports"] });
      void cache.invalidateQueries({ queryKey: ["dashboard"] });
      await cache.invalidateQueries({
        queryKey: ["locations", kind, organizationId],
      });
      setDirty(false);
      setEditing(null);
      setSuccess("Registro salvo com sucesso.");
    },
  });
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (lock.current) return;
    const form = new FormData(e.currentTarget);
    const name = String(form.get("name")).trim();
    if (name.length < 2 || name.length > 120) {
      e.currentTarget
        .querySelector("input")
        ?.setCustomValidity("Informe de 2 a 120 caracteres.");
      e.currentTarget.reportValidity();
      return;
    }
    lock.current = true;
    try {
      await mutation.mutateAsync({
        ...(editing !== "new" && editing ? { id: editing.id } : {}),
        name,
        ...(warehouse ? { branch_id: String(form.get("branch")) } : {}),
      });
    } catch {
      /* Shown below. */
    } finally {
      lock.current = false;
    }
  }
  return (
    <div className="space-y-6">
      <PageHeader
        title={warehouse ? "Depósitos" : "Filiais"}
        description="Gerencie os locais da empresa selecionada."
        eyebrow="ESTRUTURA DA EMPRESA"
        actions={
          <>
            {" "}
            {canManage && (
              <button
                className="primary"
                onClick={() => {
                  mutation.reset();
                  setSuccess("");
                  setEditing("new");
                }}
              >
                Cadastrar {warehouse ? "depósito" : "filial"}
              </button>
            )}
          </>
        }
      />
      {success && (
        <p role="status" className="notice">
          {success}
        </p>
      )}
      <Feedback error={rows.error || branches.error || mutation.error} />
      {(rows.error || branches.error) && (
        <button
          onClick={() => {
            void rows.refetch();
            void branches.refetch();
          }}
        >
          Tentar novamente
        </button>
      )}
      {warehouse && (
        <label className="block max-w-sm">
          Filtrar por filial
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="">Todas as filiais</option>
            {branches.data?.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {editing && (
        <section className="panel">
          <h2 className="mb-4 text-lg font-semibold">
            {editing === "new" ? "Novo cadastro" : "Editar cadastro"}
          </h2>
          <form
            key={editing === "new" ? "new" : editing.id}
            onChange={() => setDirty(true)}
            onSubmit={submit}
            className="space-y-4"
          >
            <label>
              Nome
              <input
                autoFocus
                name="name"
                required
                minLength={2}
                maxLength={120}
                defaultValue={editing === "new" ? "" : editing.name}
                onInput={(e) => e.currentTarget.setCustomValidity("")}
              />
            </label>
            {warehouse && (
              <label>
                Filial
                <select
                  aria-label="Filial"
                  name="branch"
                  required
                  defaultValue={editing === "new" ? "" : editing.branch_id}
                >
                  <option value="" disabled>
                    Selecione uma filial
                  </option>
                  {branches.data?.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                      {!b.is_active ? " (inativa)" : ""}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <div className="form-actions">
              <button className="primary" disabled={mutation.isPending}>
                Salvar
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
                    setEditing(null);
                  }
                }}
              >
                Cancelar
              </button>
            </div>
          </form>
        </section>
      )}
      {rows.isPending ? (
        <Loading />
      ) : rows.isError ? null : (
        <section className="panel overflow-x-auto">
          {!rows.data?.length ? (
            <p className="py-12 text-center text-zinc-400">
              Nenhum registro cadastrado.{" "}
              {canManage
                ? "Comece adicionando seu primeiro local."
                : "Aguarde o cadastro pelo administrador."}
            </p>
          ) : (
            <DataTable>
              <table className="w-full text-left text-sm">
                <thead>
                  <tr>
                    <th>Nome</th>
                    {warehouse && <th>Filial</th>}
                    <th>Status</th>
                    <th>
                      <span className="sr-only">Ações</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.data
                    .filter((r) => !filter || r.branch_id === filter)
                    .map((row) => (
                      <tr key={row.id}>
                        <td>{row.name}</td>
                        {warehouse && (
                          <td>
                            {branches.data?.find((b) => b.id === row.branch_id)
                              ?.name ?? "—"}
                          </td>
                        )}
                        <td>
                          <StatusBadge active={row.is_active} />
                        </td>
                        <td>
                          {canManage && (
                            <div className="flex flex-wrap gap-4">
                              <button
                                disabled={mutation.isPending}
                                onClick={() => {
                                  mutation.reset();
                                  setSuccess("");
                                  setEditing(row);
                                }}
                              >
                                Editar
                              </button>
                              <button
                                disabled={mutation.isPending}
                                onClick={() =>
                                  mutation.mutate({
                                    id: row.id,
                                    is_active: !row.is_active,
                                  })
                                }
                              >
                                {row.is_active ? "Desativar" : "Ativar"}
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </DataTable>
          )}
        </section>
      )}
    </div>
  );
}
