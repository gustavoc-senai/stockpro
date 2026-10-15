import { chromium } from "@playwright/test";
import { expect } from "@playwright/test";
import fs from "node:fs/promises";
import ExcelJS from "exceljs";
const browser = await chromium.launch({ headless: true, channel: "chrome" });
const base = process.env.STOCKPRO_TEST_URL ?? "http://127.0.0.1:5173";
const failures = [];
let checks = 0;
async function check(name, fn) {
  await fn();
  checks++;
  console.log("PASS", name);
}
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.on("pageerror", (e) => failures.push(e.message));
await check("private routes redirect anonymous users", async () => {
  await page.goto(base + "/app/products");
  await expect(page).toHaveURL(/\/login$/);
  await expect(
    page.getByRole("heading", { name: "Tudo sob controle." }),
  ).toBeVisible();
});
await page.screenshot({ path: ".tmp/login-desktop.png", fullPage: true });
await check("signup has its own route and validated fields", async () => {
  await page.getByRole("link", { name: "Criar conta", exact: true }).click();
  await expect(page).toHaveURL(/\/signup$/);
  await expect(
    page.getByRole("textbox", { name: "Nome completo" }),
  ).toBeVisible();
  await expect(page.locator("input[name=password]")).toHaveAttribute(
    "minlength",
    "8",
  );
});
await check("password recovery navigation", async () => {
  await page.goto(base + "/login");
  await page.getByRole("link", { name: "Esqueceu a senha?" }).click();
  await expect(page).toHaveURL(/reset-password/);
  await expect(
    page.getByRole("button", { name: "Enviar link de recuperação" }),
  ).toBeVisible();
});
await check("mobile login fits viewport", async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(base + "/login");
  await expect(
    page.getByRole("heading", { name: "Tudo sob controle." }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: ".tmp/login-mobile.png", fullPage: true });
});
await page.close();
const userId = "10000000-0000-4000-8000-000000000001";
const orgA = "30000000-0000-4000-8000-000000000001",
  orgB = "30000000-0000-4000-8000-000000000002";
const branchId = "40000000-0000-4000-8000-000000000001",
  warehouseId = "50000000-0000-4000-8000-000000000001";
const payload = {
  sub: userId,
  role: "authenticated",
  exp: Math.floor(Date.now() / 1000) + 3600,
};
const token =
  Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
    "base64url",
  ) +
  "." +
  Buffer.from(JSON.stringify(payload)).toString("base64url") +
  ".test";
const user = {
  id: userId,
  email: "qa@example.test",
  aud: "authenticated",
  role: "authenticated",
  user_metadata: { full_name: "Pessoa de Teste" },
  app_metadata: { provider: "email" },
  created_at: new Date().toISOString(),
};
const session = {
  access_token: token,
  refresh_token: "browser-test-only",
  token_type: "bearer",
  expires_in: 3600,
  expires_at: payload.exp,
  user,
};
const env = Object.fromEntries(
  (await fs.readFile(".env.local", "utf8"))
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((x) => x.includes("="))
    .map((x) => {
      const i = x.indexOf("=");
      return [x.slice(0, i).trim(), x.slice(i + 1).trim()];
    }),
);
const project = new URL(env.VITE_SUPABASE_URL).hostname.split(".")[0];
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
});
await context.addInitScript(
  ({ session, key }) => {
    if (!localStorage.getItem(key))
      localStorage.setItem(key, JSON.stringify(session));
  },
  { session, key: `sb-${project}-auth-token` },
);
const app = await context.newPage();
app.on("pageerror", (e) => failures.push(e.message));
let memberships = [
  {
    organization_id: orgA,
    role: "owner",
    organizations: { id: orgA, name: "Organização de teste A" },
  },
  {
    organization_id: orgB,
    role: "owner",
    organizations: { id: orgB, name: "Organização de teste B" },
  },
];
const records = {
  branches: [],
  warehouses: [],
  products: [],
  categories: [],
  suppliers: [],
  stock_balances: [],
  stock_movements: [],
  stock_counts: [],
  brands: [],
  customers: [],
  purchase_orders: [],
  organization_invitations: [],
  audit_events: [],
  catalog_import_mappings: [],
  catalog_imports: [],
};
const scopedRequests = [];
let teammateRole = "viewer";
await context.route("https://*.supabase.co/**", async (route) => {
  const req = route.request(),
    url = new URL(req.url());
  let body, exactCount;
  if (url.pathname.startsWith("/auth/v1/"))
    body = url.pathname.endsWith("/user") ? user : session;
  else {
    const table = url.pathname.split("/").pop();
    if (table === "stockpro_dashboard")
      body = {
        products: records.products.length,
        branches: records.branches.length,
        warehouses: records.warehouses.length,
        movements_today: 0,
        low_stock: 0,
        activity: Array.from({ length: 7 }, (_, i) => ({
          day: `2026-10-${String(9 + i).padStart(2, "0")}`,
          entries: 0,
          exits: 0,
          transfers: 0,
        })),
      };
    else if (table === "stockpro_onboard") {
      memberships = [
        {
          organization_id: orgA,
          role: "owner",
          organizations: { id: orgA, name: "Nova empresa de teste" },
        },
      ];
      body = orgA;
    } else if (table === "stockpro_set_catalog_status") {
      const input = req.postDataJSON();
      const row = records[input.p_kind]?.find(
        (row) => row.id === input.p_id && row.organization_id === input.p_org,
      );
      if (row) row.is_active = input.p_active;
      body = null;
    } else if (table === "stockpro_move") body = crypto.randomUUID();
    else if (table === "stockpro_save_purchase") {
      const input = req.postDataJSON();
      let order = records.purchase_orders.find((r) => r.id === input.p_id);
      const fields = {
        id: input.p_id,
        organization_id: input.p_org,
        supplier_id: input.p_supplier,
        warehouse_id: input.p_warehouse,
        notes: input.p_notes,
        status: "draft",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        received_at: null,
        supplier: {
          name: records.suppliers.find((r) => r.id === input.p_supplier)?.name,
        },
        warehouse: {
          name: records.warehouses.find((r) => r.id === input.p_warehouse)
            ?.name,
        },
        items: input.p_items.map((i) => ({
          ...i,
          product: records.products.find((p) => p.id === i.product_id),
        })),
      };
      if (order) Object.assign(order, fields);
      else records.purchase_orders.push(fields);
      body = input.p_id;
    } else if (table === "stockpro_purchase_action") {
      const input = req.postDataJSON();
      const order = records.purchase_orders.find((r) => r.id === input.p_id);
      order.status = {
        order: "ordered",
        receive: "received",
        cancel: "cancelled",
      }[input.p_action];
      order.updated_at = new Date().toISOString();
      if (order.status === "received")
        order.received_at = new Date().toISOString();
      body = input.p_id;
    } else if (table === "stockpro_count") body = crypto.randomUUID();
    else if (table === "stockpro_product_balances") {
      const input = req.postDataJSON();
      const rows = records.products
        .filter((r) => r.organization_id === input.p_org)
        .map((r) => ({
          ...r,
          quantity: 0,
          low_stock: Number(r.minimum_stock) > 0,
        }))
        .filter((r) => !input.p_low_only || r.low_stock);
      body = {
        rows,
        count: rows.length,
        summary: {
          products: rows.length,
          low_stock: 0,
          out_of_stock: rows.length,
        },
      };
    } else if (
      table === "stockpro_preview_import" ||
      table === "stockpro_commit_import"
    ) {
      const input = req.postDataJSON();
      let ready = 0,
        existing = 0,
        errors = 0;
      const seen = new Set();
      const rows = input.p_rows.map((r, index) => {
        const key = String(input.p_kind === "products" ? r.sku : r.name)
          .trim()
          .toLowerCase();
        const problems = [];
        if (!r.name || r.name.length < 2)
          problems.push("Nome deve ter de 2 a 120 caracteres.");
        if (seen.has(key)) problems.push("Repetido no arquivo.");
        seen.add(key);
        const found = records[input.p_kind].some(
          (item) =>
            item.organization_id === input.p_org &&
            String(
              input.p_kind === "products" ? item.sku : item.name,
            ).toLowerCase() === key,
        );
        const status = problems.length ? "error" : found ? "existing" : "ready";
        if (status === "error") errors++;
        else if (status === "existing") existing++;
        else ready++;
        return {
          index: index + 1,
          line: r.line,
          name: r.name,
          sku: r.sku ?? "",
          status,
          errors: problems,
          data: r,
        };
      });
      if (table === "stockpro_preview_import")
        body = { rows, ready, existing, errors, total: rows.length };
      else {
        for (const r of rows.filter((r) => r.status === "ready"))
          records[input.p_kind].push({
            ...r.data,
            id: crypto.randomUUID(),
            organization_id: input.p_org,
            is_active: true,
          });
        const summary = {
          id: crypto.randomUUID(),
          organization_id: input.p_org,
          kind: input.p_kind,
          created_count: ready,
          skipped_count: existing,
          total_count: rows.length,
          created_at: new Date().toISOString(),
        };
        records.catalog_imports.push(summary);
        body = {
          id: summary.id,
          created: ready,
          skipped: existing,
          total: rows.length,
          replayed: false,
        };
      }
    } else if (table === "stockpro_team")
      body = {
        count: 2,
        members: [
          {
            user_id: userId,
            role: "owner",
            full_name: "Pessoa de Teste",
            email: user.email,
          },
          {
            user_id: "10000000-0000-4000-8000-000000000009",
            role: teammateRole,
            full_name: "Pessoa convidada",
            email: "colleague@example.test",
          },
        ],
      };
    else if (table === "stockpro_invite") {
      const input = req.postDataJSON();
      const row = {
        id: crypto.randomUUID(),
        organization_id: input.p_org,
        email: input.p_email,
        role: input.p_role,
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
        revoked_at: null,
        accepted_at: null,
      };
      records.organization_invitations.push(row);
      body = row.id;
    } else if (table === "stockpro_revoke_invite") {
      const input = req.postDataJSON();
      records.organization_invitations.find(
        (i) => i.id === input.p_id,
      ).revoked_at = new Date().toISOString();
      body = null;
    } else if (table === "stockpro_member_action") {
      const input = req.postDataJSON();
      if (input.p_action === "role") teammateRole = input.p_role;
      body = null;
    } else if (table === "stockpro_invitation")
      body = {
        organization_name: "Empresa convidada",
        role: "viewer",
        status: "pending",
        expires_at: new Date(Date.now() + 86400000).toISOString(),
      };
    else if (table === "stockpro_accept_invite") {
      memberships.push({
        organization_id: "30000000-0000-4000-8000-000000000003",
        role: "viewer",
        organizations: {
          id: "30000000-0000-4000-8000-000000000003",
          name: "Empresa convidada",
        },
      });
      body = "30000000-0000-4000-8000-000000000003";
    } else if (table === "organization_members")
      body = url.searchParams.get("select")?.includes("organizations")
        ? memberships
        : [{ user_id: userId, role: "owner" }];
    else if (table === "organizations") body = { id: orgA };
    else if (table in records) {
      const org = url.searchParams.get("organization_id")?.replace("eq.", "");
      scopedRequests.push({
        table,
        org,
        active: url.searchParams.get("is_active"),
        order: url.searchParams.get("order"),
      });
      if (req.method() === "POST") {
        const input = req.postDataJSON();
        const row = {
          id:
            table === "branches"
              ? branchId
              : table === "warehouses"
                ? warehouseId
                : crypto.randomUUID(),
          is_active: true,
          ...input,
        };
        records[table].push(row);
        body = { id: row.id };
      } else if (
        req.method() === "DELETE" &&
        table === "catalog_import_mappings"
      ) {
        const id = url.searchParams.get("id")?.replace("eq.", "");
        records[table] = records[table].filter(
          (r) => r.id !== id || r.organization_id !== org,
        );
        body = null;
      } else if (req.method() === "PATCH") {
        const id = url.searchParams.get("id")?.replace("eq.", "");
        const row = records[table].find((r) => r.id === id);
        if (row) Object.assign(row, req.postDataJSON());
        body = { id };
      } else {
        body = records[table].filter((r) => r.organization_id === org);
        for (const field of [
          "id",
          "supplier_id",
          "product_id",
          "status",
          "kind",
        ]) {
          const value = url.searchParams.get(field);
          if (value?.startsWith("eq."))
            body = body.filter((r) => r[field] === value.slice(3));
        }
        if (
          [
            "products",
            "categories",
            "brands",
            "suppliers",
            "customers",
          ].includes(table)
        ) {
          const expression = url.searchParams.get("or") ?? "";
          const productTerm = expression.match(
            /name\.ilike\."%([\s\S]*?)%"/,
          )?.[1];
          const nameTerm = url.searchParams
            .get("name")
            ?.replace(/^ilike\.%/, "")
            .replace(/%$/, "");
          const term = (productTerm ?? nameTerm)
            ?.replace(/\\(.)/g, "$1")
            .toLocaleLowerCase("pt-BR");
          if (term)
            body = body.filter(
              (row) =>
                row.name.toLocaleLowerCase("pt-BR").includes(term) ||
                (table === "products" &&
                  row.sku?.toLocaleLowerCase("pt-BR").includes(term)),
            );
          const active = url.searchParams.get("is_active");
          if (active)
            body = body.filter((r) => r.is_active === (active === "eq.true"));
          const order = url.searchParams.get("order") ?? "name.asc";
          const field = order.startsWith("sku") ? "sku" : "name";
          body.sort(
            (a, b) =>
              String(a[field] ?? "").localeCompare(
                String(b[field] ?? ""),
                "pt-BR",
              ) * (order.includes("desc") ? -1 : 1),
          );
        }
        exactCount = body.length;
        const offset = Number(url.searchParams.get("offset") ?? 0),
          limit = Number(url.searchParams.get("limit") ?? 1000);
        body = body.slice(offset, offset + limit);
        if (
          table === "products" &&
          url.searchParams.get("select")?.includes("category:")
        )
          body = body.map((r) => ({
            ...r,
            category: null,
            brand: null,
            supplier: r.supplier_id
              ? {
                  name: records.suppliers.find((s) => s.id === r.supplier_id)
                    ?.name,
                }
              : null,
          }));
      }
    } else body = [];
  }
  const total = exactCount ?? (Array.isArray(body) ? body.length : 1);
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    headers: {
      "content-range": `0-${Math.max(0, total - 1)}/${total}`,
      "access-control-expose-headers": "content-range",
    },
    body: JSON.stringify(body),
  });
});
await check(
  "authenticated dashboard renders without fabricated metrics",
  async () => {
    await app.goto(base + "/app/dashboard");
    await expect(
      app.getByRole("heading", { name: "Visão geral", exact: true }),
    ).toBeVisible();
    await expect(
      app.getByRole("combobox", { name: "Empresa ativa" }),
    ).toHaveValue(orgA);
    await app.screenshot({
      path: ".tmp/dashboard-desktop.png",
      fullPage: true,
    });
  },
);
await check("branch creation persists through query invalidation", async () => {
  await app.getByRole("link", { name: "Filiais", exact: true }).click();
  await app
    .getByRole("button", { name: "Cadastrar filial", exact: true })
    .click();
  await app
    .getByRole("textbox", { name: "Nome", exact: true })
    .fill("Filial de teste");
  await app.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(
    app.getByRole("cell", { name: "Filial de teste", exact: true }),
  ).toBeVisible();
});
await check("warehouse creation links active organization branch", async () => {
  await app.getByRole("link", { name: "Depósitos", exact: true }).click();
  await app
    .getByRole("button", { name: "Cadastrar depósito", exact: true })
    .click();
  await app
    .getByRole("textbox", { name: "Nome", exact: true })
    .fill("Depósito de teste");
  await app.getByLabel("Filial", { exact: true }).selectOption(branchId);
  await app.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(
    app.getByRole("cell", { name: "Depósito de teste", exact: true }),
  ).toBeVisible();
});
for (const [path, title, singular, name] of [
  ["categories", "Categorias", "categoria", "Categoria de teste"],
  ["suppliers", "Fornecedores", "fornecedor", "Fornecedor de teste"],
  ["products", "Produtos", "produto", "Produto de teste"],
])
  await check(`${title} form saves organization-scoped data`, async () => {
    await app.goto(base + "/app/" + path);
    await app
      .getByRole("button", { name: `Cadastrar ${singular}`, exact: true })
      .click();
    await app.getByRole("textbox", { name: "Nome", exact: true }).fill(name);
    if (path === "products")
      await app
        .getByRole("textbox", { name: "SKU / Código interno", exact: true })
        .fill("QA-001");
    await app
      .getByRole("button", { name: "Salvar cadastro", exact: true })
      .click();
    await expect(app.getByRole("cell", { name, exact: true })).toBeVisible();
  });
await check(
  "movement form validates and submits transactional RPC",
  async () => {
    await app.goto(base + "/app/movements");
    await app
      .getByRole("button", { name: "Registrar movimentação", exact: true })
      .click();
    await app
      .getByLabel("Produto", { exact: true })
      .selectOption(records.products[0].id);
    await app
      .getByLabel("Depósito de entrada", { exact: true })
      .selectOption(warehouseId);
    await app.getByLabel("Quantidade", { exact: true }).fill("5");
    await app
      .getByRole("button", { name: "Confirmar movimentação", exact: true })
      .click();
    await expect(app.getByRole("status")).toHaveText(
      "Movimentação registrada com sucesso.",
    );
  },
);

await check("inventory submits an auditable physical count", async () => {
  await app.goto(base + "/app/inventory");
  await app
    .getByRole("button", { name: "Registrar contagem", exact: true })
    .click();
  await app
    .getByRole("combobox", { name: "Produto", exact: true })
    .selectOption(records.products[0].id);
  await app
    .getByRole("combobox", { name: "Depósito", exact: true })
    .selectOption(warehouseId);
  await app.getByLabel("Quantidade contada").fill("4");
  await app.getByLabel("Justificativa").fill("Conferência de teste");
  await app.getByRole("checkbox").check();
  await app
    .getByRole("button", {
      name: "Confirmar contagem e ajustar saldo",
      exact: true,
    })
    .click();
  await expect(app.getByRole("status")).toHaveText(
    "Contagem registrada e saldo conferido com sucesso.",
  );
});
await check("reports export visible organization rows as CSV", async () => {
  await app.goto(base + "/app/reports");
  await expect(
    app.getByRole("cell", { name: "Produto de teste", exact: true }),
  ).toBeVisible();
  const event = app.waitForEvent("download");
  await app.getByRole("button", { name: "Exportar página CSV" }).click();
  const file = await event;
  expect(file.suggestedFilename()).toContain(".csv");
  await file.saveAs(".tmp/report-test.csv");
  expect(await fs.readFile(".tmp/report-test.csv", "utf8")).toContain(
    "Produto de teste",
  );
});
for (const [path, title] of [
  ["alerts", "Alertas de estoque"],
  ["account", "Minha conta"],
  ["settings", "Configurações da empresa"],
  ["team", "Equipe"],
  ["help", "Clareza para o seu dia a dia."],
])
  await check(path + " page renders", async () => {
    await app.goto(base + "/app/" + path);
    await expect(
      app.getByRole("heading", { name: title, exact: true }),
    ).toBeVisible();
  });

for (const [path, singular, name] of [
  ["brands", "marca", "Marca de teste"],
  ["customers", "cliente", "Cliente de teste"],
])
  await check(path + " CRUD page saves data", async () => {
    await app.goto(base + "/app/" + path);
    await app
      .getByRole("button", { name: "Cadastrar " + singular, exact: true })
      .click();
    await app.getByRole("textbox", { name: "Nome", exact: true }).fill(name);
    await app
      .getByRole("button", { name: "Salvar cadastro", exact: true })
      .click();
    await expect(app.getByRole("cell", { name, exact: true })).toBeVisible();
  });
await check("product detail page links catalog and stock history", async () => {
  await app.goto(base + "/app/products/" + records.products[0].id);
  await expect(
    app.getByRole("heading", { name: "Produto de teste", exact: true }),
  ).toBeVisible();
  await expect(
    app.getByRole("heading", { name: "Saldos por depósito", exact: true }),
  ).toBeVisible();
  await expect(
    app.getByRole("heading", { name: "Histórico deste produto", exact: true }),
  ).toBeVisible();
});
await check(
  "supplier detail page shows contact and purchase sections",
  async () => {
    await app.goto(base + "/app/suppliers/" + records.suppliers[0].id);
    await expect(
      app.getByRole("heading", { name: "Fornecedor de teste", exact: true }),
    ).toBeVisible();
    await expect(
      app.getByRole("heading", {
        name: "Pedidos deste fornecedor",
        exact: true,
      }),
    ).toBeVisible();
  },
);
await check("purchase draft confirmation and receipt navigation", async () => {
  await app.goto(base + "/app/purchases");
  await app.getByRole("link", { name: "Novo pedido", exact: true }).click();
  await expect(
    app.getByRole("heading", { name: "Novo pedido de compra", exact: true }),
  ).toBeVisible();
  await app
    .getByRole("combobox", { name: "Fornecedor", exact: true })
    .selectOption(records.suppliers[0].id);
  await app
    .getByRole("combobox", { name: "Depósito de recebimento", exact: true })
    .selectOption(warehouseId);
  await app
    .getByRole("combobox", { name: "Produto 1", exact: true })
    .selectOption(records.products[0].id);
  await app
    .getByRole("spinbutton", { name: "Quantidade 1", exact: true })
    .fill("3");
  await app
    .getByRole("spinbutton", { name: "Valor unitário 1", exact: true })
    .fill("12.50");
  await app
    .getByRole("button", { name: "Salvar rascunho", exact: true })
    .click();
  await expect(app).toHaveURL(/\/app\/purchases\/[0-9a-f-]+$/);
  await app
    .getByRole("button", { name: "Confirmar pedido", exact: true })
    .click();
  await app
    .getByRole("button", { name: "Confirmar operação", exact: true })
    .click();
  await app
    .getByRole("button", { name: "Receber todos os itens", exact: true })
    .click();
  await app
    .getByRole("button", { name: "Confirmar operação", exact: true })
    .click();
  await expect(app.getByRole("status")).toContainText("Compra recebida");
  await app.screenshot({
    path: ".tmp/purchase-detail-desktop.png",
    fullPage: true,
  });
});
await check("new pages fit mobile viewport", async () => {
  await app.setViewportSize({ width: 390, height: 844 });
  for (const path of ["customers", "brands", "purchases", "purchases/new"]) {
    await app.goto(base + "/app/" + path);
    await expect(app.locator("main h1").first()).toBeVisible();
    expect(
      await app.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await app.screenshot({
    path: ".tmp/purchase-new-mobile.png",
    fullPage: true,
  });
  await app.setViewportSize({ width: 1440, height: 1000 });
});

await check(
  "product search requests name and SKU within active organization",
  async () => {
    await app.goto(base + "/app/products");
    const event = app.waitForRequest(
      (r) =>
        r.url().includes("/rest/v1/products") &&
        new URL(r.url()).searchParams.has("or"),
    );
    await app
      .getByRole("searchbox", { name: "Buscar por nome ou SKU" })
      .fill("QA-001");
    const request = await event;
    const params = new URL(request.url()).searchParams;
    expect(params.get("or")).toContain("sku.ilike.");
    expect(params.get("organization_id")).toBe("eq." + orgA);
  },
);
await check(
  "sidebar groups collapse and search finds pages regardless of accents",
  async () => {
    await app.goto(base + "/app/products");
    await app.getByRole("button", { name: "Cadastros", exact: true }).click();
    await expect(
      app.getByRole("link", { name: "Categorias", exact: true }),
    ).not.toBeVisible();
    await app
      .getByRole("searchbox", { name: "Buscar página no menu", exact: true })
      .fill("depositos");
    await expect(
      app.getByRole("link", { name: "Depósitos", exact: true }),
    ).toBeVisible();
    await expect(
      app.getByRole("link", { name: "Produtos", exact: true }),
    ).toHaveCount(0);
    await app.getByRole("link", { name: "Depósitos", exact: true }).click();
    await expect(
      app.getByRole("heading", { name: "Depósitos", exact: true }),
    ).toBeVisible();
    await app.getByRole("button", { name: "Cadastros", exact: true }).click();
  },
);
await check(
  "catalog filters and sorts complete server result set and confirms status changes",
  async () => {
    await app.goto(base + "/app/products");
    await app
      .locator('summary[aria-label="Ações de Produto de teste"]')
      .click();
    await app.getByRole("button", { name: "Desativar", exact: true }).click();
    const dialog = app.getByRole("dialog", {
      name: "Desativar cadastro?",
      exact: true,
    });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();
    expect(
      records.products.find((r) => r.name === "Produto de teste").is_active,
    ).toBe(true);
    await app
      .locator('summary[aria-label="Ações de Produto de teste"]')
      .click();
    await app.getByRole("button", { name: "Desativar", exact: true }).click();
    await dialog
      .getByRole("button", { name: "Desativar", exact: true })
      .click();
    await expect(dialog).not.toBeVisible();
    await app
      .getByLabel("Filtrar situação", { exact: true })
      .selectOption("active");
    await expect(
      app.getByRole("heading", {
        name: "Nenhum resultado encontrado",
        exact: true,
      }),
    ).toBeVisible();
    await app
      .getByLabel("Filtrar situação", { exact: true })
      .selectOption("inactive");
    await expect(
      app.getByRole("cell", { name: "Produto de teste", exact: true }),
    ).toBeVisible();
    await app
      .getByLabel("Ordenar catálogo", { exact: true })
      .selectOption("sku");
    await expect
      .poll(() =>
        scopedRequests.some(
          (r) =>
            r.table === "products" &&
            r.active === "eq.false" &&
            r.order?.startsWith("sku.asc"),
        ),
      )
      .toBe(true);
    await app
      .getByLabel("Filtrar situação", { exact: true })
      .selectOption("all");
    await app
      .locator('summary[aria-label="Ações de Produto de teste"]')
      .click();
    await app.getByRole("button", { name: "Ativar", exact: true }).click();
    await app
      .getByRole("dialog")
      .getByRole("button", { name: "Ativar", exact: true })
      .click();
    await expect(app.getByRole("dialog")).not.toBeVisible();
  },
);
await check(
  "catalog column controls and mobile cards preserve useful fields",
  async () => {
    await app.getByText("Colunas", { exact: true }).click();
    await app.getByRole("checkbox", { name: "SKU", exact: true }).uncheck();
    await expect(
      app.getByRole("columnheader", { name: "SKU", exact: true }),
    ).toHaveCount(0);
    await app.getByRole("checkbox", { name: "SKU", exact: true }).check();
    await expect(
      app.getByRole("columnheader", { name: "SKU", exact: true }),
    ).toBeVisible();
    await app.getByText("Colunas", { exact: true }).click();
    await expect(
      app.getByText("1 registros encontrados", { exact: true }),
    ).toBeVisible();
    await app.screenshot({
      path: ".tmp/catalog-desktop.png",
      fullPage: true,
      animations: "disabled",
    });
    await app.setViewportSize({ width: 390, height: 844 });
    await expect(
      app
        .locator(".catalog-mobile")
        .getByRole("heading", { name: "Produto de teste", exact: true }),
    ).toBeVisible();
    await expect(app.locator(".catalog-desktop")).not.toBeVisible();
    expect(
      await app.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await app.screenshot({
      path: ".tmp/catalog-mobile.png",
      fullPage: true,
      animations: "disabled",
    });
    await app.setViewportSize({ width: 1440, height: 1000 });
  },
);
await check(
  "unsaved catalog changes can be kept on navigation or discarded explicitly",
  async () => {
    await app
      .getByRole("button", { name: "Cadastrar produto", exact: true })
      .click();
    await app
      .getByRole("textbox", { name: "Nome", exact: true })
      .fill("Cadastro temporário");
    const navigationDialog = app.waitForEvent("dialog");
    const navigationClick = app
      .getByRole("link", { name: "Categorias", exact: true })
      .click();
    await (await navigationDialog).dismiss();
    await navigationClick;
    await expect(app).toHaveURL(/app\/products$/);
    app.once("dialog", (dialog) => dialog.dismiss());
    await app
      .getByRole("combobox", { name: "Empresa ativa", exact: true })
      .selectOption(orgB);
    await expect(
      app.getByRole("combobox", { name: "Empresa ativa", exact: true }),
    ).toHaveValue(orgA);
    await app
      .locator("form")
      .getByRole("button", { name: "Cancelar", exact: true })
      .click();
    await expect(
      app.getByRole("dialog", { name: "Descartar alterações?", exact: true }),
    ).toBeVisible();
    await app
      .getByRole("dialog")
      .getByRole("button", { name: "Cancelar", exact: true })
      .click();
    await expect(
      app.getByRole("textbox", { name: "Nome", exact: true }),
    ).toHaveValue("Cadastro temporário");
    await app
      .locator("form")
      .getByRole("button", { name: "Cancelar", exact: true })
      .click();
    await app
      .getByRole("dialog")
      .getByRole("button", { name: "Descartar", exact: true })
      .click();
    await expect(app.locator("form")).toHaveCount(0);
  },
);
await check(
  "catalog preferences survive reload and stay scoped to the company",
  async () => {
    await app
      .getByLabel("Filtrar situação", { exact: true })
      .selectOption("inactive");
    await app
      .getByLabel("Ordenar catálogo", { exact: true })
      .selectOption("name_desc");
    await app.reload();
    await expect(
      app.getByLabel("Filtrar situação", { exact: true }),
    ).toHaveValue("inactive");
    await expect(
      app.getByLabel("Ordenar catálogo", { exact: true }),
    ).toHaveValue("name_desc");
    await app
      .getByRole("combobox", { name: "Empresa ativa", exact: true })
      .selectOption(orgB);
    await expect(
      app.getByLabel("Filtrar situação", { exact: true }),
    ).toHaveValue("all");
    await app
      .getByRole("combobox", { name: "Empresa ativa", exact: true })
      .selectOption(orgA);
    await expect(
      app.getByLabel("Filtrar situação", { exact: true }),
    ).toHaveValue("inactive");
    await app
      .getByRole("button", { name: "Restaurar preferências", exact: true })
      .click();
  },
);
await check(
  "browser back preserves unsaved form when navigation is declined",
  async () => {
    await app.getByRole("link", { name: "Categorias", exact: true }).click();
    await app.getByRole("link", { name: "Produtos", exact: true }).click();
    await app
      .getByRole("button", { name: "Cadastrar produto", exact: true })
      .click();
    await app
      .getByRole("textbox", { name: "Nome", exact: true })
      .fill("Não perder no histórico");
    const event = app.waitForEvent("dialog");
    await app.evaluate(() => history.back());
    await (await event).dismiss();
    await expect(app).toHaveURL(/app\/products$/);
    await expect(
      app.getByRole("textbox", { name: "Nome", exact: true }),
    ).toHaveValue("Não perder no histórico");
    await app
      .locator("form")
      .getByRole("button", { name: "Cancelar", exact: true })
      .click();
    await app
      .getByRole("dialog")
      .getByRole("button", { name: "Descartar", exact: true })
      .click();
  },
);
await check(
  "catalog references find products beyond the first thousand and retain selection after search",
  async () => {
    const fixtures = Array.from({ length: 1005 }, (_, index) => ({
      id: "90000000-0000-4000-8000-" + String(index).padStart(12, "0"),
      organization_id: orgA,
      name: "Item grande " + String(index).padStart(4, "0"),
      sku: "GRANDE-" + index,
      unit: "UN",
      is_active: true,
    }));
    records.products.push(...fixtures);
    await app.goto(base + "/app/movements");
    await app
      .getByRole("button", { name: "Registrar movimentação", exact: true })
      .click();
    await app
      .getByRole("searchbox", { name: "Buscar produto", exact: true })
      .fill("GRANDE-1004");
    await expect(
      app.getByRole("option", {
        name: "Item grande 1004 · GRANDE-1004 (UN)",
        exact: true,
      }),
    ).toHaveCount(1);
    const selected = fixtures.at(-1).id;
    await app
      .getByRole("combobox", { name: "Produto", exact: true })
      .selectOption(selected);
    await app
      .getByRole("searchbox", { name: "Buscar produto", exact: true })
      .fill("impossível-encontrar");
    await expect(
      app.getByRole("combobox", { name: "Produto", exact: true }),
    ).toHaveValue(selected);
    app.once("dialog", (dialog) => dialog.accept());
    await app
      .locator("form")
      .getByRole("button", { name: "Cancelar", exact: true })
      .click();
    records.products = records.products.filter(
      (row) => !fixtures.some((f) => f.id === row.id),
    );
    await app.goto(base + "/app/products");
  },
);
await check("team invitation creation and revocation", async () => {
  await app.goto(base + "/app/team");
  await expect(
    app.getByText("Pessoa convidada", { exact: true }),
  ).toBeVisible();
  await app.getByRole("button", { name: "Gerar convite", exact: true }).click();
  await app
    .getByRole("textbox", { name: "E-mail do convidado", exact: true })
    .fill("colleague@example.test");
  await app
    .getByRole("button", { name: "Criar link de convite", exact: true })
    .click();
  await expect(
    app.getByRole("textbox", { name: "Link para compartilhar", exact: true }),
  ).toHaveValue(/\/invite\/[0-9a-f-]+$/);
  await app.getByRole("button", { name: "Revogar", exact: true }).click();
  await expect(
    app.getByRole("cell", { name: "Revogado", exact: true }),
  ).toBeVisible();
});
await check("member role change requires explicit confirmation", async () => {
  await app
    .getByRole("button", { name: "Tornar administrador", exact: true })
    .click();
  await expect(
    app.getByRole("heading", { name: "Confirmar alteração de acesso" }),
  ).toBeVisible();
  await app
    .getByRole("button", { name: "Confirmar alteração", exact: true })
    .click();
  await expect(
    app.getByRole("heading", { name: "Confirmar alteração de acesso" }),
  ).toHaveCount(0);
  await expect(
    app
      .getByRole("row", { name: /Pessoa convidada/ })
      .getByRole("cell", { name: "Administrador", exact: true }),
  ).toBeVisible();
});
await check("team layout remains usable on mobile", async () => {
  await app.setViewportSize({ width: 390, height: 844 });
  await app.goto(base + "/app/team");
  await expect(
    app.getByRole("heading", { name: "Equipe", exact: true }),
  ).toBeVisible();
  expect(
    await app.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await app.screenshot({ path: ".tmp/team-mobile.png", fullPage: true });
  await app.setViewportSize({ width: 1440, height: 1000 });
});
await check("audit page renders isolated history state", async () => {
  await app.goto(base + "/app/audit");
  await expect(
    app.getByRole("heading", { name: "Histórico de alterações", exact: true }),
  ).toBeVisible();
  await expect(
    app.getByRole("heading", { name: "Nenhuma alteração nesta seleção" }),
  ).toBeVisible();
});

await check(
  "category CSV import requires preview and confirmation and preserves existing rows",
  async () => {
    await app.goto(base + "/app/imports");
    await app.getByRole("button", { name: /^1 Arquivo$/ }).click();
    await app
      .getByRole("combobox", { name: "O que deseja importar?" })
      .selectOption("categories");
    await app.getByLabel("Arquivo para importar").setInputFiles({
      name: "categorias.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(
        "Nome;Descrição\nCategoria de teste;Preservar\nCategoria importada;Nova categoria",
        "utf8",
      ),
    });
    await expect(
      app.getByRole("combobox", { name: "Coluna Nome", exact: true }),
    ).toHaveValue("0");
    await app
      .getByRole("button", {
        name: "Conferir dados antes de importar",
        exact: true,
      })
      .click();
    await expect(
      app.getByRole("cell", { name: "Preservar existente", exact: true }),
    ).toBeVisible();
    await app
      .getByRole("button", { name: "Continuar para confirmação", exact: true })
      .click();
    const button = app.getByRole("button", {
      name: "Confirmar importação de 1 cadastros",
    });
    await expect(button).toBeDisabled();
    await app
      .getByRole("checkbox", { name: /Conferi os dados e a empresa/ })
      .check();
    await button.click();
    await expect(app.getByRole("status")).toContainText(
      "1 cadastros criados e 1 registros existentes preservados",
    );
    expect(
      records.categories.filter((r) => r.name === "Categoria importada"),
    ).toHaveLength(1);
  },
);
await check("Excel model download has the expected headers", async () => {
  await app.getByRole("button", { name: /^1 Arquivo$/ }).click();
  const event = app.waitForEvent("download");
  await app.getByRole("button", { name: "Modelo Excel", exact: true }).click();
  const file = await event;
  await file.saveAs(".tmp/import-template.xlsx");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(".tmp/import-template.xlsx");
  expect(workbook.worksheets[0].getCell("A1").value).toBe("Nome");
  expect(workbook.worksheets[0].getCell("B1").value).toBe("Descrição");
});
await check(
  "Excel upload preserves textual SKU and uses real worksheet selection",
  async () => {
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet("Produtos").addRows([
      ["Nome", "SKU", "Unidade", "Categoria", "Estoque mínimo"],
      ["Item Excel", "00045", "UN", "Categoria importada", 2.5],
    ]);
    workbook.addWorksheet("Outras categorias").addRows([
      ["Nome", "Descrição"],
      ["Outra categoria", "Descrição"],
    ]);
    await app.getByRole("button", { name: /^1 Arquivo$/ }).click();
    await app
      .getByRole("combobox", { name: "O que deseja importar?" })
      .selectOption("products");
    await app.getByLabel("Arquivo para importar").setInputFiles({
      name: "produtos.xlsx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: Buffer.from(await workbook.xlsx.writeBuffer()),
    });
    await expect(
      app.getByRole("combobox", { name: "Aba da planilha" }),
    ).toHaveValue("0");
    await expect(
      app.getByRole("combobox", { name: "Coluna SKU", exact: true }),
    ).toHaveValue("1");
    await app
      .getByRole("button", {
        name: "Conferir dados antes de importar",
        exact: true,
      })
      .click();
    await expect(
      app.getByRole("cell", { name: "00045", exact: true }),
    ).toBeVisible();
    await app.getByRole("button", { name: /^2 Colunas$/ }).click();
    await app
      .getByRole("combobox", { name: "Aba da planilha" })
      .selectOption("1");
    await expect(
      app.getByRole("heading", { name: "Prévia da importação", exact: true }),
    ).toHaveCount(0);
  },
);
await check(
  "Excel formulas are rejected before reaching the backend",
  async () => {
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet("Produtos").addRows([
      ["Nome", "SKU"],
      ["Formula product", { formula: "1+1", result: 2 }],
    ]);
    await app.getByLabel("Arquivo para importar").setInputFiles({
      name: "formula.xlsx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: Buffer.from(await workbook.xlsx.writeBuffer()),
    });
    await expect(app.getByRole("alert")).toContainText(
      "substitua fórmulas por valores",
    );
  },
);
await check(
  "bad import rows block all writes and expose downloadable report",
  async () => {
    await app.getByRole("button", { name: /^1 Arquivo$/ }).click();
    await app
      .getByRole("combobox", { name: "O que deseja importar?" })
      .selectOption("categories");
    await app.getByLabel("Arquivo para importar").setInputFiles({
      name: "invalid.csv",
      mimeType: "text/csv",
      buffer: Buffer.from("Nome;Descrição\nX;Nome muito curto", "utf8"),
    });
    await app
      .getByRole("button", {
        name: "Conferir dados antes de importar",
        exact: true,
      })
      .click();
    await expect(
      app.getByRole("button", { name: /Confirmar importação de/ }),
    ).toHaveCount(0);
    await expect(
      app.getByRole("cell", { name: "Corrigir", exact: true }),
    ).toBeVisible();
    const event = app.waitForEvent("download");
    await app
      .getByRole("button", { name: "Baixar relatório de conferência" })
      .click();
    expect((await event).suggestedFilename()).toContain(".csv");
    await app.setViewportSize({ width: 390, height: 844 });
    expect(
      await app.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await app.screenshot({
      path: ".tmp/imports-mobile.png",
      fullPage: true,
      animations: "disabled",
    });
    await app.setViewportSize({ width: 1440, height: 1000 });
  },
);
await check(
  "editing import data invalidates preview and requires another review",
  async () => {
    await app
      .getByRole("button", { name: "Editar dados", exact: true })
      .click();
    await app
      .getByLabel("Nome, linha 2", { exact: true })
      .fill("Categoria corrigida");
    await expect(
      app.getByRole("heading", { name: "Prévia da importação", exact: true }),
    ).toHaveCount(0);
    await expect(
      app.getByRole("button", { name: /Confirmar importação de/ }),
    ).toHaveCount(0);
    await app
      .getByRole("button", {
        name: "Conferir dados antes de importar",
        exact: true,
      })
      .click();
    await expect(
      app
        .getByRole("cell", { name: "Categoria corrigida", exact: true })
        .last(),
    ).toBeVisible();
    await app
      .getByRole("button", { name: "Continuar para confirmação", exact: true })
      .click();
    await expect(
      app.getByRole("button", { name: /Confirmar importação de/ }),
    ).toBeDisabled();
    await app.getByRole("button", { name: /^3 Correções$/ }).click();
    await app
      .getByRole("button", {
        name: "Restaurar valores do arquivo",
        exact: true,
      })
      .click();
    await expect(app.getByLabel("Nome, linha 2", { exact: true })).toHaveValue(
      "X",
    );
    await expect(
      app.getByRole("heading", { name: "Prévia da importação", exact: true }),
    ).toHaveCount(0);
  },
);
await check(
  "saved column models survive reordered files and can be deleted",
  async () => {
    await app.getByRole("button", { name: /^2 Colunas$/ }).click();
    await app
      .getByLabel("Nome do modelo de colunas", { exact: true })
      .fill("Planilha padrão");
    await app
      .getByRole("button", { name: "Salvar associação atual", exact: true })
      .click();
    await expect(
      app.getByRole("option", { name: "Planilha padrão", exact: true }),
    ).toHaveCount(1);
    await app.getByLabel("Arquivo para importar").setInputFiles({
      name: "reordered.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(
        "Descrição;Nome\nUma descrição;Teste reordenado",
        "utf8",
      ),
    });
    await app
      .getByRole("combobox", { name: "Coluna Nome", exact: true })
      .selectOption("0");
    await app
      .getByLabel("Modelo de colunas salvo")
      .selectOption({ label: "Planilha padrão" });
    await app
      .getByRole("button", { name: "Aplicar modelo", exact: true })
      .click();
    await expect(
      app.getByRole("combobox", { name: "Coluna Nome", exact: true }),
    ).toHaveValue("1");
    await expect(
      app.getByRole("combobox", { name: "Coluna Descrição", exact: true }),
    ).toHaveValue("0");
    await app
      .getByRole("button", { name: "Excluir modelo", exact: true })
      .click();
    await expect(
      app.getByRole("option", { name: "Planilha padrão", exact: true }),
    ).toHaveCount(0);
  },
);
await check("company switch clears previous organization view", async () => {
  await app.goto(base + "/app/products");
  await app.getByRole("combobox", { name: "Empresa ativa" }).selectOption(orgB);
  await expect(
    app.getByRole("cell", { name: "Produto de teste", exact: true }),
  ).toHaveCount(0);
  await expect(
    app.getByRole("heading", { name: "Seu primeiro produto começa aqui" }),
  ).toBeVisible();
  expect(
    scopedRequests.some((r) => r.table === "products" && r.org === orgB),
  ).toBe(true);
});
await check("mobile workspace menu and layout", async () => {
  await app.setViewportSize({ width: 390, height: 844 });
  await app.goto(base + "/app/dashboard");
  await app.getByRole("button", { name: "Abrir menu", exact: true }).click();
  await app.getByRole("link", { name: "Produtos", exact: true }).click();
  await expect(
    app.getByRole("heading", { name: "Produtos", exact: true }),
  ).toBeVisible();
  expect(
    await app.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await app.screenshot({ path: ".tmp/products-mobile.png", fullPage: true });
});
await check(
  "authenticated user without organization reaches onboarding",
  async () => {
    memberships = [];
    await app.goto(base + "/onboarding");
    await expect(
      app.getByRole("heading", { name: "Configure sua empresa" }),
    ).toBeVisible();
    await app.getByLabel("Nome da empresa").fill("Nova empresa de teste");
    await app
      .getByRole("button", { name: "Criar empresa", exact: true })
      .click();
    await expect(app).toHaveURL(/\/app\/dashboard$/);
  },
);

await check(
  "accepting invitation selects newly joined organization",
  async () => {
    await app.goto(base + "/invite/70000000-0000-4000-8000-000000000001");
    await app
      .getByRole("button", { name: "Aceitar convite e entrar", exact: true })
      .click();
    await expect(app).toHaveURL(/\/app\/dashboard$/);
    await expect(
      app.getByRole("combobox", { name: "Empresa ativa" }),
    ).toHaveValue("30000000-0000-4000-8000-000000000003");
    await app.goto(base + "/app/audit");
    await expect(
      app.getByRole("heading", { name: "Acesso restrito" }),
    ).toBeVisible();
    await app.goto(base + "/app/dashboard");
  },
);
await check(
  "import is hidden and denied for non-owner membership",
  async () => {
    await app.goto(base + "/app/imports");
    await expect(
      app.getByRole("heading", {
        name: "Importação exclusiva do proprietário",
      }),
    ).toBeVisible();
    await expect(
      app.getByRole("link", { name: "Importar planilha", exact: true }),
    ).toHaveCount(0);
  },
);
await check(
  "ordinary members may toggle catalogue status without gaining edit or administration",
  async () => {
    const membership = memberships.find((m) => m.organization_id === orgA);
    membership.role = "viewer";
    await app.setViewportSize({ width: 1440, height: 1000 });
    await app.goto(base + "/app/products");
    await app
      .getByRole("combobox", { name: "Empresa ativa", exact: true })
      .selectOption(orgA);
    await expect(
      app.getByRole("button", { name: "Cadastrar produto", exact: true }),
    ).toHaveCount(0);
    await app
      .locator('summary[aria-label="Ações de Produto de teste"]')
      .click();
    await expect(
      app.getByRole("button", { name: "Editar Produto de teste", exact: true }),
    ).toHaveCount(0);
    await app.getByRole("button", { name: "Desativar", exact: true }).click();
    await app
      .getByRole("dialog")
      .getByRole("button", { name: "Desativar", exact: true })
      .click();
    await expect(
      app.getByRole("cell", { name: "Inativo", exact: true }),
    ).toBeVisible();
    await app.goto(base + "/app/categories");
    await expect(
      app.getByRole("button", { name: "Cadastrar categoria", exact: true }),
    ).toHaveCount(0);
    await app
      .locator('summary[aria-label="Ações de Categoria de teste"]')
      .click();
    await app.getByRole("button", { name: "Desativar", exact: true }).click();
    await app
      .getByRole("dialog")
      .getByRole("button", { name: "Desativar", exact: true })
      .click();
    await expect(
      app
        .getByRole("row")
        .filter({ hasText: "Categoria de teste" })
        .getByRole("cell", { name: "Inativo", exact: true }),
    ).toBeVisible();
    await app.setViewportSize({ width: 390, height: 844 });
    const card = app
      .locator(".catalog-card")
      .filter({ hasText: "Categoria de teste" });
    await expect(
      card.getByRole("button", { name: "Editar categoria", exact: true }),
    ).toHaveCount(0);
    await card.getByRole("button", { name: "Ativar", exact: true }).click();
    await app
      .getByRole("dialog")
      .getByRole("button", { name: "Ativar", exact: true })
      .click();
    await expect(card.getByText("Ativo", { exact: true })).toBeVisible();
  },
);
await check("logout removes private route access", async () => {
  await app.setViewportSize({ width: 1440, height: 1000 });
  await app.getByRole("button", { name: "Sair da conta", exact: true }).click();
  await expect(app).toHaveURL(/\/login$/);
});
expect(failures).toEqual([]);
console.log(
  `${checks} browser checks passed. Authenticated backend responses are intercepted fixtures, not remote end-to-end verification.`,
);
await browser.close();
