import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Boxes, ShieldCheck } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { useOrganization } from "../organizations/OrganizationContext";
import { supabase } from "../../lib/supabase";
import { Feedback, Loading } from "../../components/feedback/Feedback";
import { roleNames } from "./team";
export default function InvitationPage() {
  const { id } = useParams(),
    navigate = useNavigate(),
    auth = useAuth(),
    org = useOrganization();
  const [error, setError] = useState<unknown>(null);
  const next = `?next=${encodeURIComponent("/invite/" + id)}`;
  const query = useQuery({
    queryKey: ["invitation", id, auth.user?.id],
    enabled: !!auth.user && !!id,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("stockpro_invitation", {
        p_id: id,
      });
      if (error) throw error;
      return data as {
        organization_name: string;
        role: string;
        status: string;
        expires_at: string;
      };
    },
  });
  const mutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("stockpro_accept_invite", {
        p_id: id,
      });
      if (error) throw error;
      const result = await org.refresh();
      if (result.error) throw result.error;
      org.selectOrganization(data as string);
      navigate("/app/dashboard", { replace: true });
    },
  });
  return (
    <main className="onboarding-page">
      <div className="onboarding-card">
        <Link className="brand" to="/">
          <span className="brand-symbol">
            <Boxes size={23} />
          </span>
          stock<span className="text-blue-400">pro</span>
        </Link>
        <section className="panel">
          <ShieldCheck size={30} className="mb-5 text-blue-400" />
          <p className="eyebrow">CONVITE PARA A EQUIPE</p>
          <h1>Seu próximo espaço de trabalho.</h1>
          {auth.loading ? (
            <Loading />
          ) : !auth.user ? (
            <>
              <p className="my-6 text-sm leading-7 text-zinc-400">
                Entre ou crie sua conta com o e-mail que recebeu este convite. A
                aceitação exige que esse endereço esteja confirmado.
              </p>
              <div className="flex flex-wrap gap-4">
                <Link className="primary" to={"/login" + next}>
                  Entrar para continuar
                </Link>
                <Link className="primary" to={"/signup" + next}>
                  Criar minha conta
                </Link>
              </div>
            </>
          ) : query.isPending ? (
            <Loading />
          ) : query.error ? (
            <>
              <p className="my-5 text-sm leading-7 text-zinc-400">
                O convite não está disponível para esta conta. Confirme seu
                e-mail e confira se você entrou com o endereço convidado.
              </p>
              <Feedback error={query.error} />
              <button
                className="mt-4 text-xs text-blue-400"
                onClick={() => query.refetch()}
              >
                Verificar novamente
              </button>
            </>
          ) : (
            <>
              <p className="my-6 text-sm leading-7 text-zinc-400">
                Empresa:{" "}
                <strong className="text-zinc-100">
                  {query.data.organization_name}
                </strong>
                <br />
                Acesso: {roleNames[query.data.role] ?? query.data.role}
                <br />
                Validade:{" "}
                {new Date(query.data.expires_at).toLocaleDateString("pt-BR")}
              </p>
              {["pending", "accepted"].includes(query.data.status) ? (
                <button
                  className="primary"
                  disabled={mutation.isPending}
                  onClick={() => mutation.mutate()}
                >
                  {mutation.isPending
                    ? "Entrando…"
                    : query.data.status === "accepted"
                      ? "Abrir empresa"
                      : "Aceitar convite e entrar"}
                </button>
              ) : (
                <p className="notice">
                  Este convite está expirado ou foi revogado. Peça um novo link
                  ao administrador.
                </p>
              )}
            </>
          )}
          <Feedback error={mutation.error || error} />
          {auth.user && (
            <div className="mt-6 border-t border-white/10 pt-5 text-xs text-zinc-500">
              <p className="break-words">Conta atual: {auth.user.email}</p>
              <button
                className="mt-3 text-blue-400"
                disabled={mutation.isPending}
                onClick={() => {
                  void auth.signOut().catch(setError);
                }}
              >
                Sair e usar outra conta
              </button>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
