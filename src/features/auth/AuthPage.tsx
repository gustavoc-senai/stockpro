import { useRef, useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate, useLocation } from "react-router-dom";
import {
  ArrowRight,
  Boxes,
  Eye,
  EyeOff,
  LockKeyhole,
  Check,
  Mail,
  UserRound,
} from "lucide-react";
import { safeAuthDestination } from "../../lib/authDestination";
import { useAuth } from "./AuthContext";
const currentYear = new Date().getFullYear();
import { Loading } from "../../components/feedback/Feedback";
export default function AuthPage({
  mode = "login",
}: {
  mode?: "login" | "signup";
}) {
  const { user, loading, signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const destination = safeAuthDestination(location.search);
  const authQuery =
    destination === "/app/dashboard"
      ? ""
      : "?next=" + encodeURIComponent(destination);
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const lock = useRef(false);
  if (loading) return <Loading />;
  if (user) return <Navigate to={destination} replace />;
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (lock.current) return;
    const form = new FormData(e.currentTarget);
    lock.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const email = String(form.get("email")).trim();
      const password = String(form.get("password"));
      if (mode === "login") {
        await signIn(email, password);
        navigate(destination, { replace: true });
      } else {
        const name = String(form.get("name")).trim();
        if (name.length < 2) {
          setError("Informe seu nome completo.");
          return;
        }
        const session = await signUp(name, email, password, destination);
        if (session)
          navigate(
            destination === "/app/dashboard" ? "/onboarding" : destination,
            { replace: true },
          );
        else
          setMessage(
            "Confira seu e-mail para confirmar o cadastro. Depois, entre na sua conta para configurar a empresa.",
          );
      }
    } catch (err) {
      const text = err instanceof Error ? err.message.toLowerCase() : "";
      setError(
        text.includes("invalid login")
          ? "E-mail ou senha incorretos."
          : text.includes("email not confirmed")
            ? "Confirme seu e-mail antes de entrar."
            : text.includes("rate limit")
              ? "Muitas tentativas. Aguarde alguns minutos."
              : "Não foi possível continuar. Verifique os dados e tente novamente.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <main className="auth-page">
      <section className="auth-visual">
        <img
          src="/images/warehouse-editorial.png"
          alt="Centro de distribuição moderno com corredores e prateleiras organizadas"
          className="auth-photo"
        />
        <div className="auth-overlay" />
        <Link to="/" className="brand auth-brand">
          <span className="brand-symbol">
            <Boxes size={23} />
          </span>
          <span>
            stock<span className="text-blue-400">pro</span>
            <span className="brand-dot">®</span>
          </span>
        </Link>
        <div className="auth-story">
          <span className="outline-pill">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-400" /> SUA
            OPERAÇÃO, CONECTADA.
          </span>
          <h1>
            Mais controle.
            <br />
            Menos limites.
          </h1>
          <p>
            A clareza que seu estoque precisa.
            <br />A estrutura que sua empresa merece.
          </p>
          <div className="auth-benefits">
            {[
              "Múltiplas empresas",
              "Saldos por depósito",
              "Histórico de movimentações",
            ].map((text) => (
              <span key={text}>
                <Check size={14} />
                {text}
              </span>
            ))}
          </div>
        </div>
        <div className="auth-caption">
          <span>STOCKPRO / GESTÃO DE ESTOQUE</span>
          <span>Organização em cada detalhe.</span>
        </div>
      </section>
      <section className="auth-content">
        <div className="auth-top">
          <Link to="/" className="brand lg:hidden">
            <Boxes className="text-blue-400" /> stockpro
          </Link>
          <span className="ml-auto flex items-center gap-2 text-xs text-zinc-400">
            <LockKeyhole size={13} /> Acesso seguro
          </span>
        </div>
        <div className="auth-form-wrap">
          <div className="auth-form-icon">
            <Boxes size={26} />
          </div>
          <p className="eyebrow">
            {mode === "login"
              ? "BEM-VINDO DE VOLTA"
              : "O PRÓXIMO PASSO DA SUA EMPRESA"}
          </p>
          <h2>
            {mode === "login"
              ? "Tudo sob controle."
              : "Seu negócio, organizado."}
          </h2>
          <p className="auth-description">
            {mode === "login"
              ? "Entre na sua conta e acompanhe sua operação."
              : "Crie sua conta para começar a organizar seu estoque."}
          </p>
          <div className="auth-tabs">
            <Link
              className={mode === "login" ? "selected" : ""}
              to={"/login" + authQuery}
            >
              Entrar
            </Link>
            <Link
              className={mode === "signup" ? "selected" : ""}
              to={"/signup" + authQuery}
            >
              Criar conta
            </Link>
          </div>
          <form onSubmit={submit} className="space-y-5">
            {mode === "signup" && (
              <label className="form-field">
                Nome completo
                <div className="input-icon">
                  <UserRound size={17} />
                  <input
                    name="name"
                    required
                    minLength={2}
                    maxLength={120}
                    autoComplete="name"
                    placeholder="Como podemos chamar você?"
                  />
                </div>
              </label>
            )}
            <label className="form-field">
              E-mail profissional
              <div className="input-icon">
                <Mail size={17} />
                <input
                  type="email"
                  name="email"
                  required
                  maxLength={254}
                  autoComplete="email"
                  placeholder="voce@empresa.com"
                />
              </div>
            </label>
            <label className="form-field">
              <span className="flex justify-between">
                Senha
                {mode === "login" && (
                  <Link className="text-xs text-blue-400" to="/reset-password">
                    Esqueceu a senha?
                  </Link>
                )}
              </span>
              <div className="input-icon">
                <LockKeyhole size={17} />
                <input
                  type={showPassword ? "text" : "password"}
                  name="password"
                  required
                  minLength={mode === "signup" ? 8 : 1}
                  autoComplete={
                    mode === "login" ? "current-password" : "new-password"
                  }
                  placeholder={
                    mode === "signup" ? "Mínimo de 8 caracteres" : "Sua senha"
                  }
                  className="pr-12"
                />
                <button
                  type="button"
                  aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                  onClick={() => setShowPassword((s) => !s)}
                >
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </label>
            {error && (
              <p role="alert" className="notice error">
                {error}
              </p>
            )}
            {message && (
              <p role="status" className="notice">
                {message}
              </p>
            )}
            <button className="primary auth-submit" disabled={busy}>
              {busy
                ? "Aguarde…"
                : mode === "login"
                  ? "Acessar minha operação"
                  : "Criar minha conta"}
              <ArrowRight size={17} />
            </button>
          </form>
          <p className="auth-switch">
            {mode === "login"
              ? "Ainda não tem uma conta?"
              : "Já faz parte do StockPro?"}{" "}
            <Link to={(mode === "login" ? "/signup" : "/login") + authQuery}>
              {mode === "login" ? "Comece por aqui" : "Acesse sua conta"}
            </Link>
          </p>
          <div className="auth-trust">
            <LockKeyhole size={14} />
            <span>
              Sua empresa tem um espaço exclusivo.
              <br />
              Seus dados acompanham suas permissões de acesso.
            </span>
          </div>
        </div>
        <footer className="auth-footer">
          <span>© {currentYear} StockPro</span>
          <Link to="/help">Central de ajuda ↗</Link>
        </footer>
      </section>
    </main>
  );
}
