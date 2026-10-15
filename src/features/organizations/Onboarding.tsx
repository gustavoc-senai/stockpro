import { useRef, useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Boxes, LogOut } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { supabase } from "../../lib/supabase";
import { useOrganization } from "./OrganizationContext";
import { Feedback, Loading } from "../../components/feedback/Feedback";
export default function Onboarding() {
  const org = useOrganization();
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const requestId = useRef(crypto.randomUUID());
  if (org.loading) return <Loading />;
  if (org.error)
    return (
      <>
        <Feedback error={org.error} />
        <button onClick={() => org.refresh()}>Tentar novamente</button>
      </>
    );
  if (org.active) return <Navigate to="/app/dashboard" replace />;
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (lock.current) return;
    const form = new FormData(e.currentTarget);
    const name = String(form.get("name")).trim(),
      branch = String(form.get("branch")).trim(),
      warehouse = String(form.get("warehouse")).trim();
    if (
      name.length < 2 ||
      (branch && branch.length < 2) ||
      (warehouse && (warehouse.length < 2 || !branch))
    ) {
      setError(new Error("Invalid location name"));
      return;
    }
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      const { data, error } = await supabase.rpc("stockpro_onboard", {
        p_name: String(form.get("name")).trim(),
        p_branch: String(form.get("branch")).trim(),
        p_warehouse: String(form.get("warehouse")).trim(),
        p_request_id: requestId.current,
      });
      if (error) throw error;
      const result = await org.refresh();
      if (result.error) throw result.error;
      org.selectOrganization(data as string);
      navigate("/app/dashboard", { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <main className="onboarding-page">
      <div className="onboarding-card">
        <div className="brand">
          <span className="brand-symbol">
            <Boxes size={23} />
          </span>
          <span>
            stock<span className="text-blue-400">pro</span>
          </span>
        </div>
        <p className="text-blue-400">STOCKPRO · PRIMEIROS PASSOS</p>
        <h1>Configure sua empresa</h1>
        <p className="mb-8 text-zinc-400">
          Organize sua operação em um espaço exclusivo para sua equipe.
        </p>
        <form className="panel space-y-5" onSubmit={submit}>
          <label>
            Nome da empresa
            <input
              name="name"
              required
              minLength={2}
              maxLength={120}
              autoFocus
            />
          </label>
          <label>
            Primeira filial (opcional)
            <input name="branch" maxLength={120} />
          </label>
          <label>
            Primeiro depósito (opcional)
            <input name="warehouse" maxLength={120} />
          </label>
          <p className="text-sm text-zinc-400">
            Para criar um depósito, informe também a filial.
          </p>
          <Feedback error={error} />
          <button className="primary" disabled={busy}>
            {busy ? "Criando…" : "Criar empresa"}
          </button>
        </form>
        <button
          className="mt-6 flex items-center gap-2 text-xs text-zinc-500"
          onClick={() => {
            void signOut().catch(setError);
          }}
        >
          <LogOut size={14} />
          Sair da conta
        </button>
      </div>
    </main>
  );
}
