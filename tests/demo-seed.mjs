import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs/promises";
import assert from "node:assert/strict";
const db = new PGlite();
await db.exec(
  await fs.readFile(
    new URL("fixtures/demo-contract.sql", import.meta.url),
    "utf8",
  ),
);
const source = await fs.readFile(
  new URL("../supabase/demo/stockpro_demo.sql", import.meta.url),
  "utf8",
);
const script = source.replace(
  /v_email text := '[^']*'/,
  "v_email text := 'demo@example.test'",
);
let passed = 0;
async function test(name, fn) {
  await fn();
  console.log("PASS", name);
  passed++;
}
await test("missing account prevents any demonstration data", async () => {
  await assert.rejects(db.exec(script), /Conta não encontrada/);
  await db.exec("rollback");
  assert.equal(
    (await db.query("select count(*) n from organizations")).rows[0].n,
    0,
  );
});
const user = "10000000-0000-4000-8000-000000000001";
await db.query("insert into auth.users values($1,'demo@example.test',now())", [
  user,
]);
await test("script creates the complete linked demonstration", async () => {
  await db.exec(script);
  for (const [table, count] of Object.entries({
    profiles: 1,
    organizations: 1,
    organization_members: 1,
    branches: 2,
    warehouses: 3,
    categories: 8,
    brands: 6,
    suppliers: 6,
    customers: 10,
    products: 36,
    stock_counts: 12,
    stock_movements: 98,
    stock_balances: 66,
  }))
    assert.equal(
      (await db.query(`select count(*) n from ${table}`)).rows[0].n,
      count,
      table,
    );
  assert.equal(
    (await db.query("select role from organization_members")).rows[0].role,
    "owner",
  );
});
await test("stock is nonnegative, balanced against movements and has low-stock examples", async () => {
  const rows = (await db.query("select * from stock_balances")).rows;
  for (const row of rows) {
    const ledger = await db.query(
      "select coalesce(sum(case when warehouse_id=$3 and kind='in' then quantity when warehouse_id=$3 and kind in('out','transfer') then -quantity when destination_id=$3 and kind='transfer' then quantity else 0 end),0) n from stock_movements where organization_id=$1 and product_id=$2",
      [row.organization_id, row.product_id, row.warehouse_id],
    );
    assert.equal(Number(row.quantity), Number(ledger.rows[0].n));
    assert.ok(Number(row.quantity) >= 0);
  }
  assert.ok(
    (
      await db.query(
        "select p.id from products p join stock_balances b on b.product_id=p.id group by p.id having sum(b.quantity)<p.minimum_stock",
      )
    ).rows.length > 0,
  );
  assert.equal(
    (await db.query("select count(*) n from stock_counts where difference=0"))
      .rows[0].n,
    4,
  );
});
await test("rerun is a no-op and preserves later manual changes", async () => {
  await db.exec(
    "update profiles set full_name='Meu nome'; update products set name='Produto editado' where sku='DEMO-0001'",
  );
  await db.exec(script);
  assert.equal(
    (await db.query("select count(*) n from stock_movements")).rows[0].n,
    98,
  );
  assert.equal(
    (await db.query("select full_name from profiles")).rows[0].full_name,
    "Meu nome",
  );
  assert.equal(
    (await db.query("select name from products where sku='DEMO-0001'")).rows[0]
      .name,
    "Produto editado",
  );
});
await test("a second confirmed account gets independent demonstration data", async () => {
  await db.exec(
    "insert into auth.users values('10000000-0000-4000-8000-000000000002','other@example.test',now())",
  );
  await db.exec(script.replaceAll("demo@example.test", "other@example.test"));
  assert.equal(
    (await db.query("select count(*) n from organizations")).rows[0].n,
    2,
  );
  assert.equal(
    (await db.query("select count(*) n from products")).rows[0].n,
    72,
  );
});
await test("failure midway rolls back all newly created business data", async () => {
  await db.exec(
    "insert into auth.users values('10000000-0000-4000-8000-000000000003','broken@example.test',now()); alter table products add constraint simulated_error check(sku <> 'DEMO-0030') not valid",
  );
  await assert.rejects(
    db.exec(script.replaceAll("demo@example.test", "broken@example.test")),
  );
  await db.exec("rollback");
  assert.equal(
    (await db.query("select count(*) n from organizations")).rows[0].n,
    2,
  );
  assert.equal(
    (await db.query("select count(*) n from products")).rows[0].n,
    72,
  );
});
await test("technology company has an independent catalogue, owner and repeat protection", async () => {
  const technology = await fs.readFile(
    new URL("../supabase/demo/stockpro_tecnologia_demo.sql", import.meta.url),
    "utf8",
  );
  await db.exec("alter table products drop constraint simulated_error");
  await db.exec(
    "insert into auth.users values('10000000-0000-4000-8000-000000000004','gustavo.h.monteiro@aluno.senai.br',now())",
  );
  await db.exec(technology);
  const org = (
    await db.query(
      "select id from organizations where name='Nexora Tecnologia · Demonstração'",
    )
  ).rows[0].id;
  for (const [table, count] of Object.entries({
    branches: 2,
    warehouses: 3,
    products: 36,
    categories: 8,
    brands: 6,
    suppliers: 6,
    customers: 10,
    stock_counts: 12,
    stock_movements: 98,
  })) {
    assert.equal(
      (
        await db.query(
          `select count(*) n from ${table} where organization_id=$1`,
          [org],
        )
      ).rows[0].n,
      count,
      table,
    );
  }
  assert.equal(
    (
      await db.query(
        "select user_id from organization_members where organization_id=$1 and role='owner'",
        [org],
      )
    ).rows[0].user_id,
    "10000000-0000-4000-8000-000000000004",
  );
  assert.equal(
    (
      await db.query(
        "select count(*) n from products where organization_id=$1 and unit<>'UN'",
        [org],
      )
    ).rows[0].n,
    0,
  );
  await db.exec(technology);
  assert.equal(
    (await db.query("select count(*) n from organizations")).rows[0].n,
    3,
  );
});
await db.close();
console.log(
  `${passed} demonstration checks passed using local RPC contract doubles, not the remote database.`,
);
