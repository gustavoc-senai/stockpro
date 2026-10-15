import { PageHeader } from "../../components/ui/PageHeader";
import { useRef, useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Copy, Link2, Plus, ShieldCheck, Users } from "lucide-react";
import { z } from "zod";
import { useOrganization } from "../organizations/OrganizationContext";
import { useAuth } from "../auth/AuthContext";
import { supabase } from "../../lib/supabase";
import {
  useTeam,
  useInvitations,
  roleNames,
  invitationStatus,
  type TeamMember,
} from "./team";
import { Feedback, Loading } from "../../components/feedback/Feedback";
type Operation =
  | { kind: "invite"; email: string; role: string }
  | { kind: "revoke"; id: string }
  | {
      kind: "member";
      user_id: string;
      action: "remove" | "role";
      role?: string;
    };
export default function TeamPage() {
  const org = useOrganization(),
    { user } = useAuth(),
    cache = useQueryClient();
  const [page, setPage] = useState(0),
    [invitePage, setInvitePage] = useState(0),
    [open, setOpen] = useState(false);
  const [now] = useState(() => Date.now());
  const [notice, setNotice] = useState(""),
    [validation, setValidation] = useState(""),
    [link, setLink] = useState("");
  const [confirm, setConfirm] = useState<{
    member: TeamMember;
    action: "remove" | "role";
    role?: string;
  } | null>(null);
  const lock = useRef(false);
  const query = useTeam(page),
    invitations = useInvitations(invitePage);
  const owner = org.role === "owner";
  const mutation = useMutation({
    mutationFn: async (op: Operation) => {
      if (!org.organizationId || !org.canManage)
        throw new Error("Sem permissão");
      const result =
        op.kind === "invite"
          ? await supabase.rpc("stockpro_invite", {
              p_org: org.organizationId,
              p_email: op.email,
              p_role: op.role,
            })
          : op.kind === "revoke"
            ? await supabase.rpc("stockpro_revoke_invite", {
                p_org: org.organizationId,
                p_id: op.id,
              })
            : await supabase.rpc("stockpro_member_action", {
                p_org: org.organizationId,
                p_user: op.user_id,
                p_action: op.action,
                p_role: op.role ?? null,
              });
      if (result.error) throw result.error;
      if (op.kind === "invite")
        setLink(`${window.location.origin}/invite/${result.data as string}`);
    },
    onSuccess: async () => {
      await Promise.all([
        cache.invalidateQueries({ queryKey: ["team"] }),
        cache.invalidateQueries({ queryKey: ["invitations"] }),
        cache.invalidateQueries({ queryKey: ["audit"] }),
      ]);
      setConfirm(null);
      setNotice("Alteração concluída com sucesso.");
    },
  });
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (lock.current) return;
    const form = new FormData(e.currentTarget),
      email = z.email().safeParse(String(form.get("email")).trim());
    if (!email.success) {
      setValidation("Informe um e-mail válido.");
      return;
    }
    setValidation("");
    setLink("");
    setNotice("");
    lock.current = true;
    try {
      await mutation.mutateAsync({
        kind: "invite",
        email: email.data,
        role: String(form.get("role")),
      });
    } catch {
      /* Rendered below. */
    } finally {
      lock.current = false;
    }
  }
  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setNotice("Link copiado. Compartilhe com a pessoa convidada.");
    } catch {
      setNotice(
        "Não foi possível copiar automaticamente. Selecione e copie o link exibido.",
      );
    }
  }
  return (
    <div className="space-y-6">
      <PageHeader
        title={"Equipe"}
        description={<>Convide pessoas e controle o acesso à sua empresa.</>}
        eyebrow="PESSOAS E PERMISSÕES"
        actions={
          <>
            {org.canManage && (
              <button
                className="primary flex items-center gap-2"
                onClick={() => {
                  setOpen((s) => !s);
                  mutation.reset();
                  setValidation("");
                }}
              >
                <Plus size={16} />
                Gerar convite
              </button>
            )}
          </>
        }
      />
      <div className="grid gap-4 md:grid-cols-3">
        {[
          {
            title: "Proprietário",
            text: "Gerencia a empresa, administradores e membros.",
          },
          {
            title: "Administrador",
            text: "Gerencia a operação e convida pessoas com acesso de consulta.",
          },
          {
            title: "Consulta e status",
            text: "Consulta os dados e ativa ou desativa cadastros do catálogo, sem criar registros ou movimentar estoque.",
          },
        ].map((r) => (
          <section className="panel" key={r.title}>
            <h2 className="section-title">
              <ShieldCheck size={16} className="text-blue-400" />
              {r.title}
            </h2>
            <p className="mt-3 text-xs leading-6 text-zinc-400">{r.text}</p>
          </section>
        ))}
      </div>
      <Feedback
        error={
          query.error || mutation.error || (org.canManage && invitations.error)
        }
      />
      {(query.error || invitations.error) && (
        <button
          onClick={() => {
            void query.refetch();
            if (org.canManage) void invitations.refetch();
          }}
        >
          Tentar novamente
        </button>
      )}
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      {open && org.canManage && (
        <form className="panel space-y-5" onSubmit={submit}>
          <h2 className="section-title">
            <Link2 size={17} />
            Convidar uma pessoa
          </h2>
          <div className="grid gap-5 sm:grid-cols-2">
            <label>
              E-mail do convidado
              <input
                name="email"
                type="email"
                required
                maxLength={254}
                placeholder="pessoa@empresa.com"
              />
            </label>
            <label>
              Papel de acesso
              <select
                name="role"
                aria-label="Papel de acesso"
                defaultValue="viewer"
              >
                <option value="viewer">Consulta e alteração de status</option>
                {owner && <option value="admin">Administrador</option>}
              </select>
            </label>
          </div>
          <p className="text-xs leading-6 text-zinc-400">
            O convite vale por 7 dias e só pode ser aceito por uma conta com
            este e-mail confirmado. Um novo convite para o mesmo endereço
            substitui o anterior. Nenhum e-mail é enviado automaticamente.
          </p>
          {validation && (
            <p className="notice error" role="alert">
              {validation}
            </p>
          )}
          <button className="primary" disabled={mutation.isPending}>
            {mutation.isPending ? "Gerando…" : "Criar link de convite"}
          </button>
          {link && (
            <div className="notice">
              <label>
                Link para compartilhar
                <input
                  readOnly
                  value={link}
                  onFocus={(e) => e.target.select()}
                />
              </label>
              <button
                type="button"
                className="mt-4 flex items-center gap-2 text-xs"
                onClick={() => copy(link)}
              >
                <Copy size={14} />
                Copiar link
              </button>
            </div>
          )}
        </form>
      )}
      <section className="panel">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="section-title">
            <Users size={18} />
            Membros da empresa
          </h2>
          <span className="text-xs text-zinc-500">
            {query.data?.count ?? "—"} membros
          </span>
        </div>
        {query.isPending ? (
          <Loading />
        ) : query.error ? null : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr>
                  <th>Pessoa</th>
                  <th>Papel</th>
                  {org.canManage && <th>Ações</th>}
                </tr>
              </thead>
              <tbody>
                {query.data.members.map((member) => {
                  const manageable =
                    org.canManage &&
                    member.user_id !== user?.id &&
                    member.role !== "owner" &&
                    (owner || member.role === "viewer");
                  return (
                    <tr key={member.user_id}>
                      <td>
                        <p className="font-medium text-zinc-200">
                          {member.full_name}
                          {member.user_id === user?.id ? " (você)" : ""}
                        </p>
                        {member.email && (
                          <p className="mt-1 text-xs text-zinc-500">
                            {member.email}
                          </p>
                        )}
                      </td>
                      <td>{roleNames[member.role] ?? member.role}</td>
                      {org.canManage && (
                        <td>
                          {manageable && (
                            <div className="flex flex-wrap gap-4">
                              {owner && (
                                <button
                                  disabled={mutation.isPending}
                                  onClick={() =>
                                    setConfirm({
                                      member,
                                      action: "role",
                                      role:
                                        member.role === "admin"
                                          ? "viewer"
                                          : "admin",
                                    })
                                  }
                                >
                                  {member.role === "admin"
                                    ? "Mudar para consulta"
                                    : "Tornar administrador"}
                                </button>
                              )}
                              <button
                                disabled={mutation.isPending}
                                onClick={() =>
                                  setConfirm({ member, action: "remove" })
                                }
                              >
                                Remover acesso
                              </button>
                            </div>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-5 flex justify-end gap-4 text-xs text-zinc-400">
          <button
            disabled={page === 0 || query.isPending}
            onClick={() => setPage((p) => p - 1)}
          >
            Anterior
          </button>
          <span>Página {page + 1}</span>
          <button
            disabled={
              query.isPending || (page + 1) * 50 >= (query.data?.count ?? 0)
            }
            onClick={() => setPage((p) => p + 1)}
          >
            Próxima
          </button>
        </div>
      </section>
      {confirm && (
        <section className="panel border-amber-500/20">
          <h2 className="section-title">Confirmar alteração de acesso</h2>
          <p className="my-4 text-sm leading-7 text-zinc-400">
            {confirm.action === "remove"
              ? `Remover o acesso de ${confirm.member.full_name} a esta empresa? A conta pessoal não será excluída.`
              : `Alterar ${confirm.member.full_name} para ${roleNames[confirm.role!]}?`}
          </p>
          <div className="flex gap-4">
            <button
              className="primary"
              disabled={mutation.isPending}
              onClick={() =>
                mutation.mutate({
                  kind: "member",
                  user_id: confirm.member.user_id,
                  action: confirm.action,
                  role: confirm.role,
                })
              }
            >
              Confirmar alteração
            </button>
            <button
              disabled={mutation.isPending}
              onClick={() => setConfirm(null)}
            >
              Voltar
            </button>
          </div>
        </section>
      )}
      {org.canManage && (
        <section className="panel">
          <h2 className="section-title mb-5">Convites da empresa</h2>
          {invitations.isPending ? (
            <Loading />
          ) : invitations.error ? null : !invitations.data?.rows.length ? (
            <p className="py-8 text-sm text-zinc-500">Nenhum convite gerado.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr>
                    <th>E-mail</th>
                    <th>Papel</th>
                    <th>Status</th>
                    <th>Validade</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {invitations.data.rows.map((inv) => {
                    const status = invitationStatus(inv, now);
                    return (
                      <tr key={inv.id}>
                        <td>{inv.email}</td>
                        <td>{roleNames[inv.role]}</td>
                        <td>{status}</td>
                        <td>
                          {new Date(inv.expires_at).toLocaleDateString("pt-BR")}
                        </td>
                        <td>
                          {status === "Pendente" &&
                            (owner || inv.role === "viewer") && (
                              <div className="flex flex-wrap gap-4">
                                <button
                                  onClick={() =>
                                    copy(
                                      `${window.location.origin}/invite/${inv.id}`,
                                    )
                                  }
                                >
                                  Copiar link
                                </button>
                                <button
                                  disabled={mutation.isPending}
                                  onClick={() =>
                                    mutation.mutate({
                                      kind: "revoke",
                                      id: inv.id,
                                    })
                                  }
                                >
                                  Revogar
                                </button>
                              </div>
                            )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <div className="mt-5 flex justify-end gap-4 text-xs text-zinc-400">
            <button
              disabled={invitePage === 0 || invitations.isPending}
              onClick={() => setInvitePage((p) => p - 1)}
            >
              Anterior
            </button>
            <span>Página {invitePage + 1}</span>
            <button
              disabled={
                invitations.isPending ||
                (invitePage + 1) * 20 >= (invitations.data?.count ?? 0)
              }
              onClick={() => setInvitePage((p) => p + 1)}
            >
              Próxima
            </button>
          </div>
        </section>
      )}
      {org.canManage && (
        <Link className="inline-block text-xs text-blue-400" to="/app/audit">
          Consultar histórico de alterações →
        </Link>
      )}
    </div>
  );
}
