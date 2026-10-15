import fs from "node:fs";
for (const file of [".env.local", ".env"])
  if (fs.existsSync(file)) process.loadEnvFile(file);
const names = [
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_PUBLISHABLE_KEY",
  "STOCKPRO_TEST_OWNER_TOKEN",
  "STOCKPRO_TEST_ORG_ID",
  "STOCKPRO_TEST_OTHER_TOKEN",
  "STOCKPRO_TEST_OTHER_ORG_ID",
];
if (names.some((name) => !process.env[name])) {
  console.log(
    "Não executado: configure duas sessões autenticadas de proprietários de empresas distintas no ambiente local. Consulte docs/production-readiness.md. Nenhuma gravação é realizada.",
  );
  process.exit(2);
}
const [url, key, tokenA, orgA, tokenB, orgB] = names.map(
  (name) => process.env[name],
);
if (orgA === orgB || tokenA === tokenB)
  throw new Error("Use duas empresas e duas sessões distintas.");
if (
  key.startsWith("sb_secret_") ||
  (key.startsWith("eyJ") &&
    JSON.parse(Buffer.from(key.split(".")[1], "base64url")).role ===
      "service_role")
)
  throw new Error("Use somente a chave pública.");
if (![orgA, orgB].every((id) => /^[0-9a-f-]{36}$/i.test(id)))
  throw new Error("IDs de empresa inválidos.");
async function call(token, path, input) {
  const response = await fetch(url + path, {
    method: input ? "POST" : "GET",
    headers: {
      apikey: key,
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
    },
    ...(input ? { body: JSON.stringify(input) } : {}),
    signal: AbortSignal.timeout(15000),
  });
  return {
    ok: response.ok,
    status: response.status,
    data: await response.json(),
  };
}
let failures = 0;
function check(label, ok) {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}`);
  if (!ok) failures++;
}
const users = await Promise.all(
  [tokenA, tokenB].map((token) => call(token, "/auth/v1/user")),
);
if (
  users.some((user) => !user.ok || !user.data.id) ||
  users[0].data.id === users[1].data.id
)
  throw new Error(
    "As sessões devem ser válidas e pertencer a usuários distintos.",
  );
for (const [label, token, own, foreign, user] of [
  ["A", tokenA, orgA, orgB, users[0].data.id],
  ["B", tokenB, orgB, orgA, users[1].data.id],
]) {
  const membership = await call(
    token,
    `/rest/v1/organization_members?select=role&organization_id=eq.${own}&user_id=eq.${user}`,
  );
  const owner =
    membership.ok && membership.data.some((row) => row.role === "owner");
  check(`Sessão ${label}: proprietário da empresa de teste`, owner);
  if (!owner) continue;
  for (const table of [
    "products",
    "categories",
    "suppliers",
    "catalog_imports",
    "catalog_import_mappings",
    "audit_events",
  ]) {
    const local = await call(
      token,
      `/rest/v1/${table}?select=id&organization_id=eq.${own}&limit=1`,
    );
    check(
      `Sessão ${label}: leitura permitida de ${table} na própria empresa`,
      local.ok && Array.isArray(local.data),
    );
    const other = await call(
      token,
      `/rest/v1/${table}?select=id&organization_id=eq.${foreign}&limit=1`,
    );
    check(
      `Sessão ${label}: ${table} de outra empresa invisível`,
      (other.ok && Array.isArray(other.data) && !other.data.length) ||
        [401, 403].includes(other.status),
    );
  }
  const denied = await call(token, "/rest/v1/rpc/stockpro_preview_import", {
    p_org: foreign,
    p_kind: "categories",
    p_rows: [{ line: 2, name: "Diagnóstico sem gravação" }],
  });
  check(
    `Sessão ${label}: conferência em outra empresa negada`,
    !denied.ok && denied.data.code === "42501",
  );
  const ownPreview = await call(token, "/rest/v1/rpc/stockpro_preview_import", {
    p_org: own,
    p_kind: "categories",
    p_rows: [{ line: 2, name: "Diagnostico " + crypto.randomUUID() }],
  });
  check(
    `Sessão ${label}: conferência válida sem gravar`,
    ownPreview.ok &&
      ownPreview.data.ready === 1 &&
      ownPreview.data.errors === 0,
  );
}
console.log(
  "Somente leituras e prévias. Não foram testadas gravações, transações ou permissões de admin/leitor.",
);
process.exitCode = failures ? 1 : 0;
