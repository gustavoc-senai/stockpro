export const validStatus = (
  value: unknown,
): value is "all" | "active" | "inactive" =>
  typeof value === "string" && ["all", "active", "inactive"].includes(value);
export const validSort = (
  value: unknown,
): value is "name" | "name_desc" | "sku" =>
  typeof value === "string" && ["name", "name_desc", "sku"].includes(value);
export const validSearch = (value: unknown): value is string =>
  typeof value === "string" && value.length <= 120;
export const validColumns = (value: unknown): value is string[] =>
  Array.isArray(value) &&
  value.length <= 4 &&
  value.every((column) =>
    ["SKU", "Unidade", "Contato", "Status"].includes(column),
  );
export const validGroups = (value: unknown): value is string[] =>
  Array.isArray(value) &&
  value.length <= 6 &&
  value.every((label) =>
    [
      "Visão geral",
      "Cadastros",
      "Estoque",
      "Compras",
      "Análises",
      "Administração",
    ].includes(label),
  );
