import { useUnsavedChanges } from "../../components/ui/useUnsavedChanges";
import { PageHeader } from "../../components/ui/PageHeader";
import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Building2, BookOpen, LockKeyhole, UserRound } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { useOrganization } from "../organizations/OrganizationContext";
import { supabase } from "../../lib/supabase";
import { Feedback } from "../../components/feedback/Feedback";
export function AccountPage() {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  useUnsavedChanges(dirty);
  const [error, setError] = useState<unknown>(null);
  const [message, setMessage] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const name = String(new FormData(e.currentTarget).get("name")).trim();
    if (name.length < 2) {
      setMessage("Informe ao menos dois caracteres.");
      return;
    }
    setBusy(true);
    setError(null);
    setMessage("");
    try {
      const { error } = await supabase.auth.updateUser({
        data: { full_name: name },
      });
      if (error) throw error;
      setDirty(false);
      setMessage("Nome atualizado com sucesso.");
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-6">
      <PageHeader
        title="Minha conta"
        eyebrow="PREFERÊNCIAS PESSOAIS"
        description="Gerencie como você aparece no StockPro."
      />
      <div className="account-layout">
        <form
          className="panel space-y-5"
          onChange={() => setDirty(true)}
          onSubmit={submit}
        >
          <h2 className="section-title">
            <UserRound size={18} />
            Informações pessoais
          </h2>
          <label className="block">
            Nome completo
            <input
              name="name"
              required
              minLength={2}
              maxLength={120}
              defaultValue={
                typeof user?.user_metadata.full_name === "string"
                  ? user.user_metadata.full_name
                  : ""
              }
            />
          </label>
          <label className="block">
            E-mail
            <input value={user?.email ?? ""} readOnly />
          </label>
          <p className="text-xs text-zinc-500">
            O e-mail identifica sua conta e os acessos às suas empresas.
          </p>
          <Feedback error={error} />
          {message && (
            <p role="status" className="notice">
              {message}
            </p>
          )}
          <button className="primary" disabled={busy}>
            Salvar alterações
          </button>
        </form>
        <section className="panel">
          <h2 className="section-title">
            <LockKeyhole size={18} />
            Segurança da conta
          </h2>
          <p className="my-5 text-sm leading-7 text-zinc-400">
            Use uma senha exclusiva e mantenha seus dados de acesso atualizados.
            Seu acesso aos dados de cada empresa depende da associação à equipe.
          </p>
          <Link to="/reset-password" className="primary inline-block">
            Alterar minha senha
          </Link>
        </section>
      </div>
    </div>
  );
}
export function SettingsPage() {
  const org = useOrganization();
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  useUnsavedChanges(dirty);
  const [error, setError] = useState<unknown>(null);
  const [success, setSuccess] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy || !org.canManage) return;
    const name = String(new FormData(e.currentTarget).get("name")).trim();
    if (name.length < 2) return;
    setBusy(true);
    setError(null);
    try {
      const { error } = await supabase
        .from("organizations")
        .update({ name })
        .eq("id", org.organizationId!)
        .select("id")
        .single();
      if (error) throw error;
      const result = await org.refresh();
      if (result.error) throw result.error;
      setDirty(false);
      setSuccess(true);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-6">
      <PageHeader
        title="Configurações da empresa"
        eyebrow="ORGANIZAÇÃO"
        description="Informações do espaço de trabalho selecionado."
      />
      <div className="account-layout">
        <form
          className="panel space-y-5"
          onChange={() => setDirty(true)}
          onSubmit={submit}
        >
          <h2 className="section-title">
            <Building2 size={18} />
            Dados da empresa
          </h2>
          <label className="block">
            Nome da empresa
            <input
              name="name"
              defaultValue={org.active?.organizations.name}
              required
              minLength={2}
              maxLength={120}
              disabled={!org.canManage}
            />
          </label>
          <p className="text-xs text-zinc-500">
            Seu papel nesta empresa: {org.role}
          </p>
          <Feedback error={error} />
          {success && (
            <p role="status" className="notice">
              Empresa atualizada.
            </p>
          )}
          {org.canManage && (
            <button className="primary" disabled={busy}>
              Salvar empresa
            </button>
          )}
        </form>
        <section className="panel">
          <h2 className="section-title">Estrutura operacional</h2>
          <p className="my-5 text-sm leading-7 text-zinc-400">
            Distribua sua operação entre filiais e depósitos. Cada produto,
            saldo e movimentação pertence à empresa ativa.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link className="primary" to="/app/branches">
              Gerenciar filiais
            </Link>
            <Link className="primary" to="/app/warehouses">
              Gerenciar depósitos
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
const guides = [
  {
    title: "Configure sua operação",
    text: "Cadastre uma filial e vincule um depósito a ela. Depois, organize categorias e fornecedores antes de adicionar os produtos.",
    to: "/app/branches",
    link: "Gerenciar filiais",
  },
  {
    title: "Construa seu catálogo",
    text: "Cada produto recebe um código SKU exclusivo na empresa. Defina a unidade, a categoria e o estoque mínimo para acompanhar sua operação.",
    to: "/app/products",
    link: "Abrir produtos",
  },
  {
    title: "Registre cada movimentação",
    text: "Entradas aumentam o saldo, saídas reduzem e transferências movem produtos entre depósitos. Operações confirmadas permanecem no histórico.",
    to: "/app/movements",
    link: "Ver movimentações",
  },
  {
    title: "Trabalhe com várias empresas",
    text: "Use o seletor no menu lateral para alternar entre as empresas de que você participa. Confira a empresa ativa antes de cadastrar ou movimentar produtos.",
    to: "/app/settings",
    link: "Ver empresa ativa",
  },
];
export function HelpPage() {
  return (
    <main className="mx-auto max-w-5xl space-y-7 p-6">
      <Link className="brand" to="/">
        stock<span className="text-blue-400">pro</span>
      </Link>
      <div>
        <p className="eyebrow">CENTRAL DE AJUDA</p>
        <h1>Clareza para o seu dia a dia.</h1>
        <p className="text-zinc-400">
          Um guia para começar a organizar sua operação.
        </p>
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        {guides.map((guide, i) => (
          <article className="panel" key={guide.title}>
            <span className="mb-5 inline-flex rounded-lg bg-blue-500/10 p-2 text-blue-400">
              <BookOpen size={20} />
            </span>
            <p className="eyebrow">PASSO 0{i + 1}</p>
            <h2 className="text-lg font-medium text-zinc-100">{guide.title}</h2>
            <p className="my-4 text-sm leading-7 text-zinc-400">{guide.text}</p>
            <Link className="text-xs text-blue-400" to={guide.to}>
              {guide.link} →
            </Link>
          </article>
        ))}
      </div>
      <Link to="/login" className="inline-block text-sm text-blue-400">
        Acessar minha conta →
      </Link>
    </main>
  );
}
