import type { CatalogKind } from "../../services/catalog";
export type ImportKind = CatalogKind;
export type FieldKey =
  | "name"
  | "description"
  | "sku"
  | "unit"
  | "category"
  | "brand"
  | "supplier"
  | "minimum_stock"
  | "email"
  | "phone"
  | "document";
export type Field = {
  key: FieldKey;
  label: string;
  required?: boolean;
  aliases: string[];
};
const name: Field = {
  key: "name",
  label: "Nome",
  required: true,
  aliases: [
    "nome",
    "name",
    "nome do produto",
    "descricao do produto",
    "razao social",
  ],
};
function named(...aliases: string[]): Field {
  return { ...name, aliases: [...name.aliases, ...aliases] };
}
const description: Field = {
  key: "description",
  label: "Descrição",
  aliases: ["descricao", "description", "observacao", "observacoes"],
};
const contact: Field[] = [
  named("cliente", "customer", "fornecedor", "supplier"),
  {
    key: "email",
    label: "E-mail",
    aliases: ["email", "e mail", "contato email"],
  },
  {
    key: "phone",
    label: "Telefone",
    aliases: ["telefone", "phone", "celular", "whatsapp"],
  },
  {
    key: "document",
    label: "CPF / CNPJ",
    aliases: ["documento", "cpf cnpj", "cnpj", "cpf", "document"],
  },
];
export const importDefinitions: Record<
  ImportKind,
  { label: string; fields: Field[]; note: string }
> = {
  products: {
    label: "Produtos",
    note: "Importe as categorias, marcas e fornecedores antes dos produtos. O arquivo cadastra o catálogo; saldos são registrados em movimentações ou inventário.",
    fields: [
      named("produto", "product", "descricao"),
      {
        key: "sku",
        label: "SKU",
        required: true,
        aliases: [
          "sku",
          "codigo",
          "codigo interno",
          "codigo produto",
          "referencia",
          "product code",
        ],
      },
      {
        key: "unit",
        label: "Unidade",
        aliases: ["unidade", "unit", "un", "und"],
      },
      {
        key: "category",
        label: "Categoria",
        aliases: ["categoria", "category", "grupo"],
      },
      { key: "brand", label: "Marca", aliases: ["marca", "brand"] },
      {
        key: "supplier",
        label: "Fornecedor",
        aliases: ["fornecedor", "supplier"],
      },
      {
        key: "minimum_stock",
        label: "Estoque mínimo",
        aliases: ["estoque minimo", "minimum stock", "minimum_stock", "minimo"],
      },
    ],
  },
  categories: {
    label: "Categorias",
    note: "Categorias existentes com o mesmo nome são preservadas. Depois, use esses nomes na coluna Categoria da planilha de produtos.",
    fields: [named("categoria", "category"), description],
  },
  brands: {
    label: "Marcas",
    note: "Marcas existentes com o mesmo nome são preservadas.",
    fields: [name, description],
  },
  suppliers: {
    label: "Fornecedores",
    note: "Contatos existentes com o mesmo nome são preservados. Não são criados pedidos de compra.",
    fields: contact,
  },
  customers: {
    label: "Clientes",
    note: "Contatos existentes com o mesmo nome são preservados. Não são criados pedidos de venda.",
    fields: contact,
  },
};
export type Cell = string | number | boolean | null;
export type Sheet = {
  name: string;
  headers: string[];
  rows: { line: number; cells: Cell[] }[];
};
export type Mappings = Partial<Record<FieldKey, number>>;
export type ImportRow = {
  line: number;
  name: string;
  [key: string]: string | number;
};
export type PlanRow = {
  index: number;
  line: number;
  name: string;
  sku: string;
  status: "ready" | "existing" | "error";
  errors: string[];
  data: Record<string, unknown>;
};
export type ImportPlan = {
  rows: PlanRow[];
  ready: number;
  existing: number;
  errors: number;
  total: number;
};
export type ImportResult = {
  id: string;
  created: number;
  skipped: number;
  total: number;
  replayed: boolean;
};
export const MAX_ROWS = 1000,
  MAX_COLUMNS = 50,
  MAX_BYTES = 5 * 1024 * 1024;
export function normalizeHeader(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[_\W]+/g, " ")
    .trim();
}
export function suggestMappings(sheet: Sheet, kind: ImportKind): Mappings {
  const result: Mappings = {};
  for (const field of importDefinitions[kind].fields) {
    const candidates = sheet.headers
      .map((h, i) => (field.aliases.includes(normalizeHeader(h)) ? i : -1))
      .filter((i) => i >= 0);
    if (candidates.length === 1) result[field.key] = candidates[0];
  }
  return result;
}
export function restoreMapping(
  headers: string[],
  saved: Mappings,
  current: string[],
  kind: ImportKind,
) {
  const mapping: Mappings = {};
  let missing = 0;
  for (const field of importDefinitions[kind].fields) {
    const index = saved[field.key];
    if (index === undefined || index === -1) continue;
    const header = headers[index];
    const matches = current
      .map((h, i) =>
        header && normalizeHeader(h) === normalizeHeader(header) ? i : -1,
      )
      .filter((i) => i >= 0);
    if (matches.length === 1 && Number.isInteger(index))
      mapping[field.key] = matches[0];
    else missing++;
  }
  return { mapping, missing };
}
export function decimal(value: Cell): string {
  if (value === null || value === "") return "0";
  if (typeof value === "number") return String(value);
  const text = String(value).trim();
  if (text.includes(",")) {
    if (!/^(?:\d{1,3}(?:\.\d{3})+|\d+),\d{1,3}$/.test(text)) return "invalid";
    return text.replaceAll(".", "").replace(",", ".");
  }
  return text;
}
export function mapRows(
  sheet: Sheet,
  kind: ImportKind,
  mapping: Mappings,
): ImportRow[] {
  return sheet.rows.map((row) => {
    const result: ImportRow = { line: row.line, name: "" };
    for (const field of importDefinitions[kind].fields) {
      const index = mapping[field.key];
      const value =
        index === undefined || index < 0 ? null : (row.cells[index] ?? null);
      result[field.key] =
        field.key === "minimum_stock"
          ? decimal(value)
          : String(value ?? "").trim();
      if (field.key === "unit")
        result[field.key] =
          String(value ?? "UN")
            .trim()
            .toUpperCase() || "UN";
    }
    return result;
  });
}
