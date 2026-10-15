import fs from "node:fs";
for (const file of [".env.local", ".env"])
  if (fs.existsSync(file)) process.loadEnvFile(file);
const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key)
  throw new Error("Configure a URL e a chave pública em .env.local.");
if (
  key.startsWith("sb_secret_") ||
  (key.startsWith("eyJ") &&
    JSON.parse(Buffer.from(key.split(".")[1], "base64url")).role ===
      "service_role")
)
  throw new Error("Este diagnóstico aceita somente chave pública.");
const headers = { apikey: key, "Content-Type": "application/json" };
const org = "00000000-0000-4000-8000-000000000000";
let failures = 0;
for (const table of [
  "products",
  "organization_members",
  "catalog_imports",
  "catalog_import_mappings",
  "audit_events",
]) {
  const response = await fetch(
    `${url}/rest/v1/${table}?select=${table === "organization_members" ? "user_id" : "id"}&limit=1`,
    {
      headers,
      signal: AbortSignal.timeout(15000),
    },
  );
  const data = await response.json();
  const missing = ["PGRST205", "42P01"].includes(data?.code);
  const exposed = response.ok && Array.isArray(data) && data.length > 0;
  const denied = [401, 403].includes(response.status);
  const empty = response.ok && Array.isArray(data) && !data.length;
  const ok = !missing && !exposed && (denied || empty);
  if (!ok) failures++;
  console.log(
    `${ok ? "PASS" : "FAIL"} ${table}: ${missing ? "recurso ausente no cache da API" : exposed ? "dados visíveis sem sessão" : denied ? "acesso anônimo negado" : empty ? "nenhuma linha visível sem sessão" : "resposta inesperada"} (HTTP ${response.status})`,
  );
}
for (const [name, args] of [
  ["stockpro_preview_import", { p_org: org, p_kind: "products", p_rows: [] }],
  ["stockpro_team", { p_org: org, p_page: 0 }],
]) {
  const response = await fetch(`${url}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers,
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(15000),
  });
  const data = await response.json();
  const denied = [401, 403].includes(response.status) && data?.code === "42501";
  if (!denied) failures++;
  console.log(
    `${denied ? "PASS" : "FAIL"} ${name}: ${denied ? "execução anônima negada" : data?.code === "PGRST202" ? "função ausente no cache da API" : "restrição não comprovada"} (HTTP ${response.status})`,
  );
}
console.log(
  "Diagnóstico sem gravações. Não substitui testes autenticados entre duas empresas nem inspeção das políticas RLS.",
);
process.exitCode = failures ? 1 : 0;
