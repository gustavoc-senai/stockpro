import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { restoreMapping } from "../src/features/imports/model.ts";

let passed = 0;
async function test(name, fn) {
  await fn();
  console.log("PASS", name);
  passed++;
}
await test("saved mapping follows reordered headers and ignores unrelated fields", () => {
  assert.deepEqual(
    restoreMapping(
      ["Código", "Nome"],
      { sku: 0, name: 1, email: 0 },
      ["Nome", "CÓDIGO"],
      "products",
    ),
    { mapping: { name: 0, sku: 1 }, missing: 0 },
  );
});
await test("missing, repeated and invalid source columns require manual association", () => {
  assert.deepEqual(
    restoreMapping(
      ["Nome", "SKU"],
      { name: 0, sku: 1, unit: 99 },
      ["Nome", "Name", "Nome"],
      "products",
    ),
    { mapping: {}, missing: 3 },
  );
});
const db = new PGlite();
await db.exec(
  await fs.readFile(new URL("fixtures/team.sql", import.meta.url), "utf8"),
);
await db.exec(
  await fs.readFile(
    new URL(
      "../supabase/updates/202610150008_import_mappings.sql",
      import.meta.url,
    ),
    "utf8",
  ),
);
const org = "20000000-0000-4000-8000-000000000001",
  other = "20000000-0000-4000-8000-000000000002";
const owner = "10000000-0000-4000-8000-000000000001",
  admin = "10000000-0000-4000-8000-000000000002",
  viewer = "10000000-0000-4000-8000-000000000003",
  outsider = "10000000-0000-4000-8000-000000000004";
await db.query("insert into organizations values($1,'A'),($2,'B')", [
  org,
  other,
]);
for (const id of [owner, admin, viewer, outsider])
  await db.query("insert into auth.users(id) values($1)", [id]);
await db.query(
  "insert into organization_members values($1,$2,'owner'),($1,$3,'admin'),($1,$4,'viewer'),($5,$6,'owner')",
  [org, owner, admin, viewer, other, outsider],
);
async function as(id) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
  await db.exec("set role authenticated");
}
const insert = (
  target = org,
  name = "Fornecedor A",
  mapping = { name: 0, sku: 1 },
  headers = ["Nome", "Código"],
) =>
  db.query(
    "insert into catalog_import_mappings(organization_id,kind,name,headers,mapping) values($1,'products',$2,$3::jsonb,$4::jsonb) returning id",
    [target, name, JSON.stringify(headers), JSON.stringify(mapping)],
  );
await test("owner can save and read company mappings", async () => {
  await as(owner);
  await insert();
  assert.equal(
    (await db.query("select * from catalog_import_mappings")).rows.length,
    1,
  );
});
await test("normalized duplicate model names rejected", async () => {
  await assert.rejects(
    insert(org, " fornecedor a "),
    (e) => e.code === "23505",
  );
});
await test("invalid fields, types, indices and excessive headers rejected by database", async () => {
  for (const mapping of [
    { organization_id: 0 },
    { name: "0" },
    { name: 1.5 },
    { name: 50 },
    { name: -2 },
    [],
  ])
    await assert.rejects(
      insert(org, "Invalid", mapping),
      (e) => e.code === "23514",
    );
  await assert.rejects(
    insert(org, "Large", {}, Array(51).fill("A")),
    (e) => e.code === "23514",
  );
  await assert.rejects(
    insert(org, "Null header", {}, [null]),
    (e) => e.code === "23514",
  );
});
for (const [label, id] of [
  ["admin", admin],
  ["viewer", viewer],
  ["foreign owner", outsider],
])
  await test(`${label} cannot read, create or delete another company's models`, async () => {
    await as(id);
    assert.equal(
      (
        await db.query(
          "select * from catalog_import_mappings where organization_id=$1",
          [org],
        )
      ).rows.length,
      0,
    );
    await assert.rejects(insert(), (e) => e.code === "42501");
    assert.equal(
      (
        await db.query(
          "delete from catalog_import_mappings where organization_id=$1 returning id",
          [org],
        )
      ).rows.length,
      0,
    );
  });
await test("model kind and company are isolated", async () => {
  await as(outsider);
  await insert(other);
  assert.equal(
    (await db.query("select * from catalog_import_mappings")).rows.length,
    1,
  );
});
await test("owner may delete own model but cannot update to bypass constraints", async () => {
  await as(owner);
  await assert.rejects(
    db.query("update catalog_import_mappings set organization_id=$1", [other]),
    (e) => e.code === "42501",
  );
  assert.equal(
    (await db.query("delete from catalog_import_mappings returning id")).rows
      .length,
    1,
  );
});
await test("anonymous access is denied", async () => {
  await db.exec("reset role; set role anon");
  await assert.rejects(
    db.query("select * from catalog_import_mappings"),
    (e) => e.code === "42501",
  );
});
await db.close();
console.log(`${passed} import improvement checks passed`);
