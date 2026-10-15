import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs/promises";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { parseCsv, checkXlsxArchive } from "../src/features/imports/parser.ts";
import {
  mapRows,
  suggestMappings,
  decimal,
  MAX_ROWS,
} from "../src/features/imports/model.ts";
process.on("uncaughtException", (e) => {
  console.error(e.message, e.where ?? "");
  process.exit(1);
});
let passed = 0;
async function test(name, fn) {
  await fn();
  passed++;
  console.log("PASS", name);
}
await test("CSV handles BOM, accents, quoted separators and multiline descriptions", async () => {
  const sheet = parseCsv(
    '\uFEFFNome;Descrição\r\nFerragens;"Peças; úteis\npara uso"\r\n',
  );
  assert.equal(sheet.rows.length, 1);
  assert.equal(sheet.rows[0].cells[1], "Peças; úteis\npara uso");
  assert.deepEqual(suggestMappings(sheet, "categories"), {
    name: 0,
    description: 1,
  });
});
await test("comma and tab separated CSV are detected", async () => {
  assert.equal(parseCsv("name,sku\nItem,A-1").rows[0].cells[1], "A-1");
  assert.equal(parseCsv("name\tsku\nItem\tA-1").rows[0].cells[1], "A-1");
});
await test("malformed quoted CSV is rejected", async () => {
  assert.throws(() => parseCsv('nome;sku\n"broken;1'));
  assert.throws(() => parseCsv('nome;sku\n"name"invalid;1'));
});
await test("duplicate headers require explicit mapping", async () => {
  const sheet = parseCsv("Nome;Name\nItem;Item");
  assert.equal(suggestMappings(sheet, "categories").name, undefined);
});
await test("product template column names map without confusing references", async () => {
  const sheet = parseCsv(
    'Nome;SKU;Unidade;Categoria;Marca;Fornecedor;Estoque mínimo\nParafuso;00012;UN;Ferragens;Marca A;Fornecedor A;"1.234,5"',
  );
  const mapping = suggestMappings(sheet, "products");
  assert.equal(mapping.name, 0);
  assert.equal(mapping.sku, 1);
  const row = mapRows(sheet, "products", mapping)[0];
  assert.equal(row.sku, "00012");
  assert.equal(row.minimum_stock, "1234.5");
  assert.equal(row.category, "Ferragens");
});
await test("numeric parsing preserves meaning and rejects ambiguous formats", async () => {
  assert.equal(decimal("12,5"), "12.5");
  assert.equal(decimal("1.200,125"), "1200.125");
  assert.equal(decimal("1,234.56"), "invalid");
  assert.equal(decimal("-1"), "-1");
  assert.equal(decimal(null), "0");
});
await test("large CSV and excess columns are rejected", async () => {
  assert.throws(() =>
    parseCsv(
      "Nome\n" +
        Array.from({ length: MAX_ROWS + 1 }, (_, i) => "Item " + i).join("\n"),
    ),
  );
  assert.throws(() => parseCsv(Array(51).fill("Nome").join(";")));
});
await test("Excel template can be written and read with corrected UUID dependency", async () => {
  const workbook = new ExcelJS.Workbook(),
    sheet = workbook.addWorksheet("Produtos");
  sheet.addRow(["Nome", "SKU"]);
  sheet.addRow(["Item", "00012"]);
  sheet.addConditionalFormatting({
    ref: "A2",
    rules: [
      {
        type: "expression",
        formulae: ["1=1"],
        priority: 1,
        style: { font: { bold: true } },
      },
    ],
  });
  const bytes = await workbook.xlsx.writeBuffer();
  const buffer = new Uint8Array(bytes).buffer;
  checkXlsxArchive(buffer);
  const copy = new ExcelJS.Workbook();
  await copy.xlsx.load(bytes);
  assert.equal(copy.worksheets[0].getCell("B2").value, "00012");
});
await test("invalid archive and declared excessive expanded size are rejected", async () => {
  assert.throws(() => checkXlsxArchive(new ArrayBuffer(32)));
  const workbook = new ExcelJS.Workbook();
  workbook.addWorksheet("Dados").addRow(["Nome"]);
  const bytes = new Uint8Array(await workbook.xlsx.writeBuffer()),
    view = new DataView(bytes.buffer);
  let directory = -1;
  for (let i = 0; i < bytes.length - 46; i++)
    if (view.getUint32(i, true) === 0x02014b50) {
      directory = i;
      break;
    }
  assert.ok(directory >= 0);
  view.setUint32(directory + 24, 40 * 1024 * 1024, true);
  assert.throws(() => checkXlsxArchive(bytes.buffer));
});
const db = new PGlite();
await db.exec(
  (
    await fs.readFile(new URL("fixtures/team.sql", import.meta.url), "utf8")
  ).replaceAll("\uFEFF", ""),
);
await db.exec(`
 create table categories(id uuid primary key default gen_random_uuid(),organization_id uuid not null references organizations,name text not null check(length(name) between 2 and 120),description text default '',is_active boolean default true,unique(organization_id,id),unique(organization_id,name));
 create table brands(like categories including all);
 create table suppliers(id uuid primary key default gen_random_uuid(),organization_id uuid not null references organizations,name text not null,email text default '',phone text default '',document text default '',is_active boolean default true,unique(organization_id,id));
 create table customers(like suppliers including all);
 alter table products alter column id set default gen_random_uuid();
 alter table products add column sku text,add column unit text default 'UN',add column minimum_stock numeric(18,3) default 0,add column category_id uuid,add column brand_id uuid,add column supplier_id uuid,add column is_active boolean default true;
 alter table products add constraint product_sku unique(organization_id,sku),add foreign key(organization_id,category_id) references categories(organization_id,id),add foreign key(organization_id,brand_id) references brands(organization_id,id),add foreign key(organization_id,supplier_id) references suppliers(organization_id,id);
 alter table products add constraint test_future_constraint check(sku<>'REJECT');
`);
await db.exec(
  (
    await fs.readFile(
      new URL(
        "../supabase/updates/202610150007_catalog_import.sql",
        import.meta.url,
      ),
      "utf8",
    )
  ).replace(/^\uFEFF/, ""),
);
const org = "20000000-0000-4000-8000-000000000001",
  foreign = "20000000-0000-4000-8000-000000000002";
const owner = "10000000-0000-4000-8000-000000000001",
  admin = "10000000-0000-4000-8000-000000000002",
  viewer = "10000000-0000-4000-8000-000000000003",
  outsider = "10000000-0000-4000-8000-000000000004";
await db.query(
  "insert into organizations values($1,'Company A'),($2,'Company B')",
  [org, foreign],
);
for (const id of [owner, admin, viewer, outsider])
  await db.query("insert into auth.users(id) values($1)", [id]);
await db.query(
  "insert into organization_members values($1,$2,'owner'),($1,$3,'admin'),($1,$4,'viewer'),($5,$6,'owner')",
  [org, owner, admin, viewer, foreign, outsider],
);
async function as(id) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
  await db.exec("set role authenticated");
}
async function denied(fn) {
  await assert.rejects(fn, (e) => {
    assert.notEqual(e.code, "42601");
    return true;
  });
}
const preview = (kind, rows, target = org) =>
  db
    .query("select stockpro_preview_import($1,$2,$3::jsonb) data", [
      target,
      kind,
      JSON.stringify(rows),
    ])
    .then((r) => r.rows[0].data);
const commit = (kind, rows, request = crypto.randomUUID()) =>
  db
    .query("select stockpro_commit_import($1,$2,$3::jsonb,$4) data", [
      org,
      kind,
      JSON.stringify(rows),
      request,
    ])
    .then((r) => r.rows[0].data);
await as(owner);
await test("preview validates without creating records", async () => {
  const data = await preview("categories", [
    { line: 2, name: "Ferragens", description: "Materiais" },
  ]);
  assert.equal(data.ready, 1);
  assert.equal(data.errors, 0);
  await db.exec("reset role");
  assert.equal(
    (await db.query("select count(*) n from categories")).rows[0].n,
    0,
  );
  await as(owner);
});
const request = crypto.randomUUID(),
  categoryRows = [{ line: 2, name: "Ferragens", description: "Materiais" }];
await test("category import commits atomically and repeated request returns same result", async () => {
  const first = await commit("categories", categoryRows, request);
  const retry = await commit("categories", categoryRows, request);
  assert.equal(first.created, 1);
  assert.equal(retry.id, first.id);
  assert.equal(retry.replayed, true);
  await denied(() => commit("categories", [{ name: "Outro" }], request));
});
await test("existing case-insensitive category names are preserved", async () => {
  const data = await commit("categories", [
    { name: "  FERRAGENS  ", description: "Do not overwrite" },
  ]);
  assert.equal(data.created, 0);
  assert.equal(data.skipped, 1);
  await db.exec("reset role");
  assert.equal(
    (await db.query("select description from categories")).rows[0].description,
    "Materiais",
  );
  await as(owner);
});
await test("duplicate rows block entire batch without creating other valid rows", async () => {
  const rows = [{ name: "Materiais A" }, { name: "materiais a" }];
  assert.equal((await preview("categories", rows)).errors, 1);
  await denied(() => commit("categories", rows));
  await db.exec("reset role");
  assert.equal(
    (await db.query("select count(*) n from categories")).rows[0].n,
    1,
  );
  await as(owner);
});
await test("brands, suppliers and customers can be imported", async () => {
  assert.equal((await commit("brands", [{ name: "Marca A" }])).created, 1);
  assert.equal(
    (
      await commit("suppliers", [
        { name: "Fornecedor A", email: "contato@example.test" },
      ])
    ).created,
    1,
  );
  assert.equal(
    (await commit("customers", [{ name: "Cliente A", phone: "001234" }]))
      .created,
    1,
  );
});
const productRows = [
  {
    line: 2,
    name: "Parafuso",
    sku: "00012",
    unit: "UN",
    minimum_stock: "2.5",
    category: "ferragens",
    brand: "marca a",
    supplier: "Fornecedor A",
  },
];
await test("product links resolve only active records of the same company", async () => {
  const plan = await preview("products", productRows);
  assert.equal(plan.errors, 0);
  assert.ok(plan.rows[0].data.category_id);
  assert.equal((await commit("products", productRows)).created, 1);
  assert.equal((await commit("products", productRows)).skipped, 1);
});
await test("unknown or foreign category cannot be associated", async () => {
  await db.exec("reset role");
  await db.query(
    "insert into categories(organization_id,name) values($1,'Foreign category')",
    [foreign],
  );
  await as(owner);
  const plan = await preview("products", [
    { name: "New item", sku: "X", category: "Foreign category" },
  ]);
  assert.equal(plan.errors, 1);
  await denied(() =>
    commit("products", [
      { name: "New item", sku: "X", category: "Foreign category" },
    ]),
  );
});
await test("ambiguous reference names must be corrected before import", async () => {
  await db.exec("reset role");
  await db.query(
    "insert into categories(organization_id,name) values($1,'FERRAGENS')",
    [org],
  );
  await as(owner);
  const data = await preview("products", [
    { name: "Item X", sku: "X2", category: "Ferragens" },
  ]);
  assert.equal(data.errors, 1);
});
await test("negative minimum, invalid unit and malformed email are rejected", async () => {
  assert.equal(
    (
      await preview("products", [
        { name: "Item Z", sku: "Z", minimum_stock: "-1", unit: "INVALID" },
      ])
    ).errors,
    1,
  );
  assert.equal(
    (await preview("customers", [{ name: "Contact", email: "invalid" }]))
      .errors,
    1,
  );
});
await test("stale previews are validated again at commit", async () => {
  const rows = [{ name: "Item B", sku: "B", brand: "Marca A" }];
  assert.equal((await preview("products", rows)).ready, 1);
  await db.exec("reset role");
  await db.query("update brands set is_active=false");
  await as(owner);
  await denied(() => commit("products", rows));
});
await test("later database constraint failure rolls back earlier insert and audit", async () => {
  const id = crypto.randomUUID(),
    before = (await db.query("select count(*) n from products")).rows[0].n;
  await denied(() =>
    commit(
      "products",
      [
        { name: "Would create", sku: "OK" },
        { name: "Rejected row", sku: "REJECT" },
      ],
      id,
    ),
  );
  assert.equal(
    (await db.query("select count(*) n from products")).rows[0].n,
    before,
  );
  assert.equal(
    (
      await db.query(
        "select count(*) n from catalog_imports where request_id=$1",
        [id],
      )
    ).rows[0].n,
    0,
  );
});
await test("row limit and unsupported entity names are enforced by server", async () => {
  await denied(() => preview("organizations", [{ name: "Forbidden" }]));
  await denied(() => preview("categories", []));
  await denied(() =>
    preview(
      "categories",
      Array.from({ length: 1001 }, (_, i) => ({ name: "Category " + i })),
    ),
  );
});
for (const [id, label] of [
  [admin, "administrator"],
  [viewer, "viewer"],
  [outsider, "foreign owner"],
]) {
  await as(id);
  await test(
    label + " cannot preview, commit or read another owner import history",
    async () => {
      await denied(() => preview("categories", [{ name: "Denied" }]));
      await denied(() => commit("categories", [{ name: "Denied" }]));
      assert.equal(
        (await db.query("select * from catalog_imports")).rows.length,
        0,
      );
    },
  );
}
await as(owner);
await test("client-supplied organization or foreign IDs are ignored", async () => {
  assert.equal(
    (
      await commit("products", [
        {
          name: "Safe target",
          sku: "SAFE",
          organization_id: foreign,
          category_id: crypto.randomUUID(),
        },
      ])
    ).created,
    1,
  );
  const row = (
    await db.query(
      "select organization_id,category_id from products where sku='SAFE'",
    )
  ).rows[0];
  assert.equal(row.organization_id, org);
  assert.equal(row.category_id, null);
});
await test("import creates one summary audit event and history row", async () => {
  const rows = (
    await db.query("select * from audit_events where action='import_completed'")
  ).rows;
  assert.ok(rows.length > 0);
  assert.ok(rows.every((r) => r.actor_id === owner));
  await denied(() => db.query("delete from catalog_imports"));
});
await db.exec("reset role;set role anon");
await test("anonymous import calls are denied", async () => {
  await denied(() => preview("products", productRows));
  await denied(() => db.query("select * from catalog_imports"));
});
console.log(
  `${passed} importer/parser/database checks passed. Local fixtures and SQL 007; no remote data changed.`,
);
await db.close();
