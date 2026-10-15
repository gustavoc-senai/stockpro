import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Boxes,
  Check,
  LockKeyhole,
  Mail,
} from "lucide-react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "./AuthContext";
export default function PasswordPage() {
  const { user, loading } = useAuth();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const form = new FormData(e.currentTarget);
    if (user && form.get("password") !== form.get("confirm")) {
      setError("As senhas precisam ser iguais.");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = user
        ? await supabase.auth.updateUser({
            password: String(form.get("password")),
          })
        : await supabase.auth.resetPasswordForEmail(String(form.get("email")), {
            redirectTo: `${window.location.origin}/reset-password`,
          });
      if (result.error) {
        setError(
          "Não foi possível concluir. Verifique os dados e tente novamente.",
        );
      } else
        setMessage(
          user
            ? "Senha atualizada com sucesso."
            : "Se houver uma conta para esse e-mail, você receberá um link para redefinir sua senha.",
        );
    } catch {
      setError("Falha de conexão. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-page">
      <section className="auth-visual">
        <img
          className="auth-photo"
          src="/images/warehouse-editorial.png"
          alt="Centro de distribuição organizado"
        />
        <div className="auth-overlay" />
        <Link className="brand auth-brand" to="/">
          <span className="brand-symbol">
            <Boxes size={23} />
          </span>
          <span>
            stock<span className="text-blue-400">pro</span>
          </span>
        </Link>
        <div className="auth-story">
          <span className="outline-pill">
            <LockKeyhole size={12} />
            SEU ACESSO, PROTEGIDO.
          </span>
          <h1>
            O próximo passo
            <br />
            começa com você.
          </h1>
          <p>
            Recupere o acesso à sua conta
            <br />e retome o controle da sua operação.
          </p>
          <div className="auth-benefits">
            <span>
              <Check size={14} />
              Redefinição por e-mail
            </span>
            <span>
              <Check size={14} />
              Sua conta permanece a mesma
            </span>
          </div>
        </div>
        <div className="auth-caption">STOCKPRO / GESTÃO DE ESTOQUE</div>
      </section>
      <section className="auth-content">
        <div className="auth-top">
          <Link
            to="/login"
            className="flex items-center gap-2 text-xs text-zinc-400"
          >
            <ArrowLeft size={14} />
            Voltar ao acesso
          </Link>
        </div>
        <div className="auth-form-wrap">
          <div className="auth-form-icon">
            <LockKeyhole size={24} />
          </div>
          <p className="eyebrow">SEGURANÇA DA CONTA</p>
          <h2>{user ? "Uma nova senha." : "Vamos recuperar seu acesso."}</h2>
          <p className="auth-description">
            {user
              ? "Escolha uma senha exclusiva, com pelo menos 8 caracteres."
              : "Informe seu e-mail para receber as instruções de recuperação."}
          </p>
          <form onSubmit={submit} className="space-y-5">
            <label className="form-field">
              {user ? "Nova senha" : "E-mail da conta"}
              <div className="input-icon">
                {user ? <LockKeyhole size={17} /> : <Mail size={17} />}
                <input
                  name={user ? "password" : "email"}
                  type={user ? "password" : "email"}
                  autoComplete={user ? "new-password" : "email"}
                  minLength={user ? 8 : undefined}
                  required
                  placeholder={
                    user ? "Mínimo de 8 caracteres" : "voce@empresa.com"
                  }
                />
              </div>
            </label>
            {user && (
              <label className="form-field">
                Confirme a nova senha
                <div className="input-icon">
                  <LockKeyhole size={17} />
                  <input
                    name="confirm"
                    type="password"
                    autoComplete="new-password"
                    minLength={8}
                    required
                    placeholder="Digite novamente"
                  />
                </div>
              </label>
            )}
            {error && (
              <p className="notice error" role="alert">
                {error}
              </p>
            )}
            {message && (
              <p className="notice" role="status">
                {message}
              </p>
            )}
            <button className="primary auth-submit" disabled={busy || loading}>
              {busy
                ? "Aguarde…"
                : user
                  ? "Salvar nova senha"
                  : "Enviar link de recuperação"}
              <ArrowRight size={17} />
            </button>
          </form>
          <p className="auth-switch">
            <Link to={user ? "/app/account" : "/login"}>
              {user ? "Voltar à minha conta" : "Já lembrei minha senha"}
            </Link>
          </p>
        </div>
        <footer className="auth-footer">
          <span>StockPro · Acesso seguro</span>
          <Link to="/help">Central de ajuda ↗</Link>
        </footer>
      </section>
    </main>
  );
}
