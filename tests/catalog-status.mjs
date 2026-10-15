import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
const db = new PGlite();
await db.exec(
  await fs.readFile(new URL("fixtures/team.sql", import.meta.url), "utf8"),
);
await db.exec(
  "alter table products add column is_active boolean not null default true",
);
for (const table of ["categories", "brands", "suppliers", "customers"])
  await db.exec(`create table ${table}(like products including all)`);
await db.exec(
  await fs.readFile(
    new URL(
      "../supabase/updates/202610150009_catalog_status.sql",
      import.meta.url,
    ),
    "utf8",
  ),
);
const org = "20000000-0000-4000-8000-000000000001",
  foreign = "20000000-0000-4000-8000-000000000002",
  row = "30000000-0000-4000-8000-000000000001";
const users = Array.from(
  { length: 5 },
  (_, i) => "10000000-0000-4000-8000-" + String(i + 1).padStart(12, "0"),
);
await db.query("insert into organizations values($1,'A'),($2,'B')", [
  org,
  foreign,
]);
for (let i = 0; i < users.length; i++) {
  await db.query("insert into auth.users(id) values($1)", [users[i]]);
  await db.query(
    "insert into organization_members values($1,$2,$3::member_role)",
    [
      i === 4 ? foreign : org,
      users[i],
      ["owner", "admin", "viewer", "viewer", "owner"][i],
    ],
  );
}
for (const table of [
  "products",
  "categories",
  "brands",
  "suppliers",
  "customers",
])
  await db.query(
    `insert into ${table}(id,organization_id,name) values($1,$2,'Cadastro')`,
    [row, org],
  );
async function as(id) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
  await db.exec("set role authenticated");
}
const status = (kind = "products", active = false, target = org) =>
  db.query("select stockpro_set_catalog_status($1,$2,$3,$4)", [
    target,
    kind,
    row,
    active,
  ]);
let passed = 0;
async function test(name, fn) {
  await fn();
  console.log("PASS", name);
  passed++;
}
for (let i = 0; i < 3; i++)
  await test(
    ["owner", "admin", "viewer"][i] + " can change status",
    async () => {
      await as(users[i]);
      await status("products", i % 2 === 1);
    },
  );
await test("member can change all five supported catalogue entities", async () => {
  await as(users[2]);
  for (const kind of [
    "products",
    "categories",
    "brands",
    "suppliers",
    "customers",
  ])
    await status(kind, true);
});
await test("member cannot directly modify product fields", async () => {
  assert.equal(
    (
      await db.query(
        "update products set name='Bypass' where id=$1 returning id",
        [row],
      )
    ).rows.length,
    0,
  );
  assert.equal(
    (await db.query("select name from products where id=$1", [row])).rows[0]
      .name,
    "Cadastro",
  );
});
await test("foreign owner cannot change status", async () => {
  for (const id of [users[4]]) {
    await as(id);
    await assert.rejects(status(), (e) => e.code === "42501");
  }
});
await test("invalid tables and null status are rejected", async () => {
  await as(users[2]);
  for (const kind of [
    "organization_members",
    "products;drop table products",
    null,
  ])
    await assert.rejects(status(kind), (e) => e.code === "22023");
  await assert.rejects(status("products", null), (e) => e.code === "22023");
});
await test("missing or foreign records are not changed", async () => {
  await assert.rejects(
    status("products", false, foreign),
    (e) => e.code === "42501",
  );
  await assert.rejects(
    db.query(
      "select stockpro_set_catalog_status($1,'products',gen_random_uuid(),false)",
      [org],
    ),
    (e) => e.code === "P0002",
  );
});
await test("status audit is appended once; retries are no-ops", async () => {
  await as(users[2]);
  await status("products", false);
  await db.exec("reset role");
  const before = (
    await db.query(
      "select count(*) n from audit_events where action='status_changed'",
    )
  ).rows[0].n;
  await as(users[2]);
  await status("products", false);
  await db.exec("reset role");
  assert.equal(
    (
      await db.query(
        "select count(*) n from audit_events where action='status_changed'",
      )
    ).rows[0].n,
    before,
  );
});
await test("anonymous execution is denied", async () => {
  await db.exec("set role anon");
  await assert.rejects(status(), (e) => e.code === "42501");
});
await db.close();
console.log(`${passed} status checks passed`);
