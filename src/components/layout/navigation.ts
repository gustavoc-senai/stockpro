import {
  FileSpreadsheet,
  History,
  ShoppingCart,
  BadgeCheck,
  UsersRound,
  BellRing,
  ChartNoAxesCombined,
  ArrowLeftRight,
  Boxes,
  Building2,
  ClipboardList,
  LayoutDashboard,
  Package,
  Settings,
  Tags,
  Truck,
  Users,
  Warehouse,
  type LucideIcon,
} from "lucide-react";
export const navigationGroups: {
  label: string;
  items: { label: string; path: string; icon: LucideIcon }[];
}[] = [
  {
    label: "Visão geral",
    items: [{ label: "Visão geral", path: "dashboard", icon: LayoutDashboard }],
  },
  {
    label: "Cadastros",
    items: [
      { label: "Produtos", path: "products", icon: Package },
      { label: "Categorias", path: "categories", icon: Tags },
      { label: "Marcas", path: "brands", icon: BadgeCheck },
      { label: "Fornecedores", path: "suppliers", icon: Truck },
      { label: "Clientes", path: "customers", icon: UsersRound },
    ],
  },
  {
    label: "Estoque",
    items: [
      { label: "Estoque", path: "stock", icon: Boxes },
      { label: "Movimentações", path: "movements", icon: ArrowLeftRight },
      { label: "Inventário", path: "inventory", icon: ClipboardList },
    ],
  },
  {
    label: "Compras",
    items: [
      { label: "Pedidos de compra", path: "purchases", icon: ShoppingCart },
    ],
  },
  {
    label: "Análises",
    items: [
      { label: "Relatórios", path: "reports", icon: ChartNoAxesCombined },
      { label: "Alertas de estoque", path: "alerts", icon: BellRing },
    ],
  },
  {
    label: "Administração",
    items: [
      { label: "Filiais", path: "branches", icon: Building2 },
      { label: "Depósitos", path: "warehouses", icon: Warehouse },
      { label: "Equipe", path: "team", icon: Users },
      { label: "Importar planilha", path: "imports", icon: FileSpreadsheet },
      { label: "Histórico de alterações", path: "audit", icon: History },
      { label: "Configurações", path: "settings", icon: Settings },
    ],
  },
];
export function matchesNavigation(label: string, search: string) {
  const normalize = (value: string) =>
    value.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("pt-BR");
  return normalize(label).includes(normalize(search));
}
