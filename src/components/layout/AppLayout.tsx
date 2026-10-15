import { usePreference } from "../ui/usePreference";
import { validGroups } from "../../lib/preferences";
import { navigationGroups as groups, matchesNavigation } from "./navigation";
import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import {
  Boxes,
  ChevronDown,
  ChevronRight,
  HelpCircle,
  LogOut,
  Menu,
  X,
  UserRound,
} from "lucide-react";
import { useAuth } from "../../features/auth/AuthContext";
import { useOrganization } from "../../features/organizations/OrganizationContext";

export default function AppLayout() {
  const [mobile, setMobile] = useState(false);
  const [navSearch, setNavSearch] = useState("");

  const aside = useRef<HTMLElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!mobile) return;
    const previous = document.body.style.overflow;
    const returnFocus = menuButton.current;
    document.body.style.overflow = "hidden";
    const targets = () =>
      Array.from(
        aside.current?.querySelectorAll<HTMLElement>(
          "a[href],button:not(:disabled),input,select",
        ) ?? [],
      ).filter((el) => el.getClientRects().length);
    targets()[0]?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobile(false);
      if (e.key !== "Tab") return;
      const elements = targets(),
        first = elements[0],
        last = elements.at(-1);
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", key);
      returnFocus?.focus();
    };
  }, [mobile]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { user, signOut } = useAuth();
  const org = useOrganization();
  const [collapsed, setCollapsed] = usePreference<string[]>(
    `stockpro:preferences:v1:${user?.id}:${org.organizationId}:menu`,
    [],
    validGroups,
  );
  const location = useLocation();
  const current =
    groups
      .flatMap((g) => g.items)
      .find(
        (i) =>
          location.pathname === `/app/${i.path}` ||
          location.pathname.startsWith(`/app/${i.path}/`),
      )?.label ??
    (location.pathname.endsWith("account")
      ? "Minha conta"
      : "Central de ajuda");
  const name =
    typeof user?.user_metadata.full_name === "string"
      ? user.user_metadata.full_name
      : "Minha conta";
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((s: string) => s[0])
    .join("")
    .toUpperCase();
  async function logout() {
    if (busy) return;
    if (
      !window.dispatchEvent(
        new Event("stockpro:before-navigation", { cancelable: true }),
      )
    )
      return;
    setBusy(true);
    try {
      await signOut();
    } catch {
      setError("Não foi possível sair. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="workspace">
      <a className="skip-link" href="#main-content">
        Pular para o conteúdo
      </a>
      {mobile && (
        <button
          className="sidebar-backdrop"
          aria-label="Fechar menu"
          onClick={() => setMobile(false)}
        />
      )}
      <aside
        ref={aside}
        aria-label="Navegação da empresa"
        className={`workspace-sidebar ${mobile ? "is-open" : ""}`}
      >
        <div className="sidebar-brand-row">
          <Link to="/app/dashboard" className="brand">
            <span className="brand-symbol">
              <Boxes size={23} />
            </span>
            <span>
              stock<span className="text-blue-400">pro</span>
              <span className="brand-dot">®</span>
            </span>
          </Link>
          <button
            className="lg:hidden"
            aria-label="Fechar menu"
            onClick={() => setMobile(false)}
          >
            <X size={19} />
          </button>
        </div>
        <div className="organization-picker">
          <span className="organization-avatar">
            {org.active?.organizations.name.slice(0, 1).toUpperCase()}
          </span>
          <label>
            <span>EMPRESA ATIVA</span>
            <select
              aria-label="Empresa ativa"
              value={org.organizationId ?? ""}
              onChange={(e) => {
                if (
                  !window.dispatchEvent(
                    new Event("stockpro:before-navigation", {
                      cancelable: true,
                    }),
                  )
                )
                  return;
                org.selectOrganization(e.target.value);
                setMobile(false);
              }}
            >
              {org.memberships.map((m) => (
                <option key={m.organization_id} value={m.organization_id}>
                  {m.organizations.name}
                </option>
              ))}
            </select>
          </label>
          <ChevronDown size={14} />
        </div>
        <label className="sidebar-search">
          <span className="sr-only">Buscar página no menu</span>
          <input
            type="search"
            placeholder="Encontrar página…"
            value={navSearch}
            onChange={(e) => setNavSearch(e.target.value)}
          />
        </label>
        <nav className="workspace-nav" aria-label="Menu principal">
          {groups
            .filter((g) =>
              g.items.some(
                (item) =>
                  (item.path !== "audit" || org.canManage) &&
                  (item.path !== "imports" || org.role === "owner") &&
                  matchesNavigation(item.label, navSearch),
              ),
            )
            .map((g, index) => (
              <div className="nav-group" key={g.label}>
                <button
                  className="nav-group-heading"
                  aria-expanded={!!navSearch || !collapsed.includes(g.label)}
                  aria-controls={"nav-group-" + index}
                  onClick={() =>
                    setCollapsed((previous) =>
                      previous.includes(g.label)
                        ? previous.filter((label) => label !== g.label)
                        : [...previous, g.label],
                    )
                  }
                >
                  {g.label}
                  <ChevronDown
                    size={13}
                    style={{
                      transform:
                        collapsed.includes(g.label) && !navSearch
                          ? "rotate(-90deg)"
                          : undefined,
                    }}
                  />
                </button>
                <div
                  id={"nav-group-" + index}
                  hidden={!navSearch && collapsed.includes(g.label)}
                >
                  {g.items
                    .filter(
                      (item) =>
                        (item.path !== "audit" || org.canManage) &&
                        (item.path !== "imports" || org.role === "owner") &&
                        matchesNavigation(item.label, navSearch),
                    )
                    .map((item) => (
                      <NavLink
                        key={item.path}
                        to={`/app/${item.path}`}
                        onClick={() => {
                          setMobile(false);
                          setNavSearch("");
                        }}
                        className={({ isActive }) =>
                          `nav-item ${isActive ? "selected" : ""}`
                        }
                      >
                        <item.icon size={18} />
                        <span>{item.label}</span>
                        <ChevronRight size={13} className="nav-arrow" />
                      </NavLink>
                    ))}
                </div>
              </div>
            ))}
        </nav>
        <div className="sidebar-bottom">
          <Link
            className="nav-item"
            to="/app/help"
            onClick={() => setMobile(false)}
          >
            <HelpCircle size={18} />
            <span>Central de ajuda</span>
            <span className="text-xs">↗</span>
          </Link>
          <div className="sidebar-user">
            <Link
              className="user-avatar"
              aria-label="Minha conta"
              to="/app/account"
            >
              {initials}
            </Link>
            <Link className="min-w-0 flex-1" to="/app/account">
              <strong className="block truncate text-xs">{name}</strong>
              <span className="block truncate text-[11px] text-zinc-500">
                {user?.email}
              </span>
            </Link>
            <button
              aria-label="Sair da conta"
              title="Sair da conta"
              disabled={busy}
              onClick={logout}
            >
              <LogOut size={16} />
            </button>
          </div>
          {error && (
            <p role="alert" className="text-xs text-red-300">
              {error}
            </p>
          )}
        </div>
      </aside>
      <div className="workspace-body">
        <header className="workspace-header">
          <div className="flex items-center gap-3">
            <button
              className="lg:hidden"
              aria-label="Abrir menu"
              ref={menuButton}
              aria-expanded={mobile}
              onClick={() => setMobile(true)}
            >
              <Menu size={20} />
            </button>
            <nav className="breadcrumb" aria-label="Caminho da página">
              <Link to="/app/dashboard" aria-label="Ir para visão geral">
                Início
              </Link>
              <ChevronRight size={13} />
              <span aria-current="page">
                {current}
                {location.pathname.split("/").filter(Boolean).length > 2
                  ? " / Detalhes"
                  : ""}
              </span>
            </nav>
          </div>
          <div className="flex items-center gap-4">
            <span className="hidden text-xs text-zinc-500 md:block">
              {org.active?.organizations.name}
            </span>
            <span className="header-divider" />
            <Link
              to="/app/help"
              aria-label="Central de ajuda"
              className="text-zinc-400"
            >
              <HelpCircle size={18} />
            </Link>
            <Link
              to="/app/account"
              aria-label="Minha conta"
              className="header-avatar"
            >
              <UserRound size={17} />
            </Link>
          </div>
        </header>
        <main id="main-content" tabIndex={-1} className="workspace-main">
          <Outlet />
        </main>
        <footer className="workspace-footer">
          <span>StockPro · Sua operação, conectada.</span>
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-400" /> Empresa:{" "}
            {org.active?.organizations.name}
          </span>
        </footer>
      </div>
    </div>
  );
}
