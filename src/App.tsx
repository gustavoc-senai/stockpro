import { lazy, Suspense } from "react";
import { Navigate, Outlet, Route, Routes, Link } from "react-router-dom";
import { useAuth } from "./features/auth/AuthContext";
import { useOrganization } from "./features/organizations/OrganizationContext";
import { Feedback, Loading } from "./components/feedback/Feedback";
const AuthPage = lazy(() => import("./features/auth/AuthPage"));
const PasswordPage = lazy(() => import("./features/auth/PasswordPage"));
const AppLayout = lazy(() => import("./components/layout/AppLayout"));
const Dashboard = lazy(() => import("./features/dashboard/Dashboard"));
const Onboarding = lazy(() => import("./features/organizations/Onboarding"));
const LocationsPage = lazy(() => import("./features/locations/LocationsPage"));
const PurchasesPage = lazy(() => import("./features/purchases/PurchasesPage"));
const PurchaseDetailsPage = lazy(
  () => import("./features/purchases/PurchaseDetailsPage"),
);
const CatalogDetailsPage = lazy(
  () => import("./features/catalog/CatalogDetailsPage"),
);
const CatalogPage = lazy(() => import("./features/catalog/CatalogPage"));
const StockPage = lazy(() => import("./features/stock/StockPage"));
const InventoryPage = lazy(() => import("./features/stock/InventoryPage"));
const ReportsPage = lazy(() => import("./features/stock/ReportsPage"));
const AccountPage = lazy(() =>
  import("./features/account/AccountPages").then((m) => ({
    default: m.AccountPage,
  })),
);
const SettingsPage = lazy(() =>
  import("./features/account/AccountPages").then((m) => ({
    default: m.SettingsPage,
  })),
);
const TeamPage = lazy(() => import("./features/team/TeamPage"));
const InvitationPage = lazy(() => import("./features/team/InvitationPage"));
const ImportsPage = lazy(() => import("./features/imports/ImportsPage"));
const AuditPage = lazy(() => import("./features/team/AuditPage"));
const HelpPage = lazy(() =>
  import("./features/account/AccountPages").then((m) => ({
    default: m.HelpPage,
  })),
);
function RequireAuth() {
  const { user, loading } = useAuth();
  return loading ? (
    <Loading />
  ) : user ? (
    <Outlet />
  ) : (
    <Navigate to="/login" replace />
  );
}
function RequireOrganization() {
  const org = useOrganization();
  if (org.loading) return <Loading />;
  if (org.error)
    return (
      <div className="p-8">
        <Feedback error={org.error} />
        <button onClick={() => org.refresh()}>Tentar novamente</button>
      </div>
    );
  return org.active ? (
    <AppLayout key={org.organizationId} />
  ) : (
    <Navigate to="/onboarding" replace />
  );
}
function NotFound() {
  return (
    <main className="mx-auto max-w-lg px-6 py-24">
      <p className="eyebrow">STOCKPRO / 404</p>
      <h1>Esta página não foi encontrada.</h1>
      <p className="mb-8 text-zinc-400">
        Confira o endereço ou retorne ao seu espaço de trabalho.
      </p>
      <Link className="primary inline-block" to="/app/dashboard">
        Ir para meu dashboard
      </Link>
    </main>
  );
}
export default function App() {
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route path="/" element={<Navigate to="/app/dashboard" replace />} />
        <Route path="/login" element={<AuthPage key="login" />} />
        <Route
          path="/signup"
          element={<AuthPage key="signup" mode="signup" />}
        />
        <Route path="/cadastro" element={<Navigate to="/signup" replace />} />
        <Route path="/help" element={<HelpPage />} />
        <Route path="/invite/:id" element={<InvitationPage />} />
        <Route path="/reset-password" element={<PasswordPage />} />
        <Route element={<RequireAuth />}>
          <Route path="/onboarding" element={<Onboarding />} />
          <Route path="/app" element={<RequireOrganization />}>
            <Route index element={<Navigate to="dashboard" replace />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route
              path="branches"
              element={<LocationsPage key="branches" kind="branches" />}
            />
            <Route
              path="warehouses"
              element={<LocationsPage key="warehouses" kind="warehouses" />}
            />
            <Route
              path="products"
              element={<CatalogPage key="products" kind="products" />}
            />
            <Route
              path="categories"
              element={<CatalogPage key="categories" kind="categories" />}
            />
            <Route
              path="suppliers"
              element={<CatalogPage key="suppliers" kind="suppliers" />}
            />
            <Route
              path="customers"
              element={<CatalogPage key="customers" kind="customers" />}
            />
            <Route
              path="brands"
              element={<CatalogPage key="brands" kind="brands" />}
            />
            <Route path="purchases" element={<PurchasesPage />} />
            <Route path="purchases/:id" element={<PurchaseDetailsPage />} />
            <Route
              path="products/:id"
              element={
                <CatalogDetailsPage key="product-details" kind="products" />
              }
            />
            <Route
              path="suppliers/:id"
              element={
                <CatalogDetailsPage key="supplier-details" kind="suppliers" />
              }
            />
            <Route path="stock" element={<StockPage key="stock" />} />
            <Route
              path="movements"
              element={<StockPage key="movements" movements />}
            />
            <Route path="inventory" element={<InventoryPage />} />
            <Route path="reports" element={<ReportsPage key="reports" />} />
            <Route
              path="alerts"
              element={<ReportsPage key="alerts" alerts />}
            />
            <Route path="account" element={<AccountPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="team" element={<TeamPage />} />
            <Route path="audit" element={<AuditPage />} />
            <Route path="imports" element={<ImportsPage />} />
            <Route path="help" element={<HelpPage />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}
