process.on("uncaughtException", (error) => {
  console.error(
    error.message,
    error.detail ?? "",
    error.where ?? "",
    error.position,
    error.query?.slice(
      Math.max(0, Number(error.position) - 100),
      Number(error.position) + 100,
    ),
  );
  process.exit(1);
});
process.on("unhandledRejection", (error) => {
  console.error(error.message, error.detail ?? "", error.where ?? "");
  process.exit(1);
});
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs/promises";
import assert from "node:assert/strict";
for (const name of [
  "202610150001_foundation.sql",
  "202610150002_inventory.sql",
  "202610150003_inventory_reports.sql",
  "202610150004_purchases_contacts.sql",
]) {
  try {
    await fs.access(new URL("../supabase/migrations/" + name, import.meta.url));
  } catch {
    console.error(
      "A suíte histórica exige os scripts SQL 001 a 004, removidos após aplicação no Supabase. Para as regras novas, execute npm test. Restaure uma cópia arquivada dos SQLs para repetir a suíte histórica.",
    );
    process.exit(1);
  }
}
const db = new PGlite();
await db.exec(`
 create role anon; create role authenticated;
 create schema auth;
 create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 grant usage on schema auth to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;
 create table public.profiles(id uuid primary key references auth.users,full_name text, sensitive text);
 create table public.organizations(id uuid primary key default gen_random_uuid(),name text not null,owner_id uuid not null references auth.users);
 create table public.organization_members(organization_id uuid references public.organizations,user_id uuid references auth.users,role text not null,primary key(organization_id,user_id));
 create table public.branches(id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations,name text not null,is_active boolean not null default true);
 create table public.warehouses(id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations,branch_id uuid not null references public.branches,name text not null,is_active boolean not null default true);
 create function public.create_organization(p_name text) returns uuid language plpgsql security definer set search_path=public as $$ declare v uuid; begin insert into organizations(name,owner_id) values(p_name,auth.uid()) returning id into v; insert into organization_members values(v,auth.uid(),'owner'); return v; end $$;
 create policy legacy_open on public.branches for all using(true) with check(true);
 grant update(organization_id) on public.branches to authenticated;
`);
for (const file of [
  "202610150001_foundation.sql",
  "202610150002_inventory.sql",
  "202610150003_inventory_reports.sql",
  "202610150004_purchases_contacts.sql",
])
  await db.exec(
    await fs.readFile(
      new URL("../supabase/migrations/" + file, import.meta.url),
      "utf8",
    ),
  );
let passed = 0;
async function test(name, fn) {
  await fn();
  passed++;
  console.log("PASS", name);
}
async function user(id) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
  await db.exec("set role authenticated");
}
async function fails(sql, params = []) {
  await assert.rejects(
    () => db.query(sql, params),
    (error) => {
      assert.notEqual(
        error.code,
        "42601",
        "Test query must be syntactically valid",
      );
      return true;
    },
  );
}
const u1 = "10000000-0000-4000-8000-000000000001",
  u2 = "10000000-0000-4000-8000-000000000002",
  u3 = "10000000-0000-4000-8000-000000000003";
await db.query("insert into auth.users values($1),($2),($3)", [u1, u2, u3]);
const req = "20000000-0000-4000-8000-000000000001";
await user(u1);
await test("onboarding rolls back organization on invalid branch", async () => {
  await fails("select stockpro_onboard('Empresa 1','x','',gen_random_uuid())");
  assert.equal((await db.query("select * from organizations")).rows.length, 0);
});
let o1, o2, w1, w2, b2, p1;
await test("onboarding creates owner, branch and warehouse atomically", async () => {
  o1 = (
    await db.query(
      "select stockpro_onboard('Empresa 1','Matriz','Principal',$1) id",
      [req],
    )
  ).rows[0].id;
  assert.equal(
    (await db.query("select role from organization_members")).rows[0].role,
    "owner",
  );
  w1 = (await db.query("select id from warehouses")).rows[0].id;
});
await test("onboarding request is idempotent", async () => {
  assert.equal(
    (
      await db.query(
        "select stockpro_onboard('Empresa 1','Matriz','Principal',$1) id",
        [req],
      )
    ).rows[0].id,
    o1,
  );
  assert.equal((await db.query("select * from organizations")).rows.length, 1);
});
await test("direct legacy creation RPC is denied", () =>
  fails("select create_organization('Bypass')"));
await user(u2);
o2 = (
  await db.query(
    "select stockpro_onboard('Empresa 2','Matriz 2','Depósito 2',gen_random_uuid()) id",
  )
).rows[0].id;
b2 = (await db.query("select id from branches")).rows[0].id;
w2 = (await db.query("select id from warehouses")).rows[0].id;
await user(u1);
await test("RLS hides foreign organizations despite legacy permissive policy", async () => {
  assert.equal((await db.query("select * from organizations")).rows.length, 1);
  assert.equal(
    (await db.query("select * from branches where organization_id=$1", [o2]))
      .rows.length,
    0,
  );
});
await test("foreign branch insertion denied", () =>
  fails("insert into branches(organization_id,name) values($1,'Intrusão')", [
    o2,
  ]));
await test("warehouse cannot reference foreign branch", () =>
  fails(
    "insert into warehouses(organization_id,branch_id,name) values($1,$2,'Intrusão')",
    [o1, b2],
  ));
await test("organization_id is immutable even with old column grant", () =>
  fails("update branches set organization_id=$1 where organization_id=$2", [
    o2,
    o1,
  ]));
await test("owner and membership role are immutable", async () => {
  await fails("update organizations set owner_id=$1 where id=$2", [u2, o1]);
  await fails(
    "update organization_members set role='admin' where organization_id=$1",
    [o1],
  );
});
await test("catalog scoped uniqueness and foreign category protection", async () => {
  p1 = (
    await db.query(
      "insert into products(organization_id,name,sku) values($1,'Produto','ABC') returning id",
      [o1],
    )
  ).rows[0].id;
  await fails(
    "insert into products(organization_id,name,sku) values($1,'Duplicado','ABC')",
    [o1],
  );
});
const move = (
  kind,
  qty,
  warehouse = w1,
  dest = null,
  request = crypto.randomUUID(),
) =>
  db.query("select stockpro_move($1,$2,$3,$4,$5,$6,$7,$8) id", [
    o1,
    p1,
    warehouse,
    dest,
    kind,
    qty,
    "Teste",
    request,
  ]);
await test("entry updates balance and ledger once across retries", async () => {
  const key = crypto.randomUUID();
  const a = await move("in", 10, w1, null, key);
  const b = await move("in", 10, w1, null, key);
  assert.equal(a.rows[0].id, b.rows[0].id);
  assert.equal(
    Number(
      (await db.query("select quantity from stock_balances")).rows[0].quantity,
    ),
    10,
  );
  await fails("select stockpro_move($1,$2,$3,null,$4,12,$5,$6)", [
    o1,
    p1,
    w1,
    "in",
    "Teste",
    key,
  ]);
});
await test("insufficient stock is rejected without ledger or balance changes", async () => {
  await assert.rejects(() => move("out", 11));
  assert.equal(
    Number(
      (await db.query("select quantity from stock_balances")).rows[0].quantity,
    ),
    10,
  );
  assert.equal(
    (await db.query("select * from stock_movements")).rows.length,
    1,
  );
});
await test("foreign warehouse movement denied", () =>
  assert.rejects(() => move("in", 1, w2)));
await test("transfer updates both balances atomically", async () => {
  const branch = (await db.query("select id from branches")).rows[0].id;
  const dest = (
    await db.query(
      "insert into warehouses(organization_id,branch_id,name) values($1,$2,'Destino') returning id",
      [o1, branch],
    )
  ).rows[0].id;
  await move("transfer", 3, w1, dest);
  const sum = (await db.query("select sum(quantity) n from stock_balances"))
    .rows[0].n;
  assert.equal(Number(sum), 10);
  assert.equal(
    Number(
      (
        await db.query(
          "select quantity from stock_balances where warehouse_id=$1",
          [w1],
        )
      ).rows[0].quantity,
    ),
    7,
  );
});
await test("direct balance and ledger modifications denied", async () => {
  await fails("update stock_balances set quantity=999");
  await fails("delete from stock_movements");
});
await db.exec("reset role");
await db.query("insert into organization_members values($1,$2,'viewer')", [
  o1,
  u3,
]);
await user(u3);
await test("viewer can read but cannot mutate", async () => {
  assert.equal((await db.query("select * from products")).rows.length, 1);
  await fails(
    "insert into products(organization_id,name,sku) values($1,'Negado','DENIED')",
    [o1],
  );
  await assert.rejects(() => move("in", 1));
});
await user(u2);
await test("second organization cannot read first organization inventory", async () => {
  assert.equal((await db.query("select * from products")).rows.length, 0);
  assert.equal((await db.query("select * from stock_balances")).rows.length, 0);
  assert.equal(
    (await db.query("select * from stock_movements")).rows.length,
    0,
  );
});
await user(u1);
await test("dashboard aggregates actual scoped data and seven days", async () => {
  const value = (await db.query("select stockpro_dashboard($1) data", [o1]))
    .rows[0].data;
  assert.equal(value.products, 1);
  assert.equal(value.activity.length, 7);
  assert.equal(value.movements_today, 2);
});
await test("reports return per-product totals and enforce membership", async () => {
  const value = (
    await db.query("select stockpro_product_balances($1) data", [o1])
  ).rows[0].data;
  assert.equal(value.rows.length, 1);
  assert.equal(Number(value.rows[0].quantity), 10);
  await fails("select stockpro_product_balances($1)", [o2]);
});
const countRequest = crypto.randomUUID();
await test("physical inventory adjusts balance and writes audit once", async () => {
  const first = (
    await db.query("select stockpro_count($1,$2,$3,4,$4,$5) id", [
      o1,
      p1,
      w1,
      "Contagem de teste",
      countRequest,
    ])
  ).rows[0].id;
  const retry = (
    await db.query("select stockpro_count($1,$2,$3,4,$4,$5) id", [
      o1,
      p1,
      w1,
      "Contagem de teste",
      countRequest,
    ])
  ).rows[0].id;
  assert.equal(first, retry);
  const count = (await db.query("select * from stock_counts")).rows[0];
  assert.equal(Number(count.previous_quantity), 7);
  assert.equal(Number(count.difference), -3);
  assert.equal(
    Number(
      (
        await db.query(
          "select quantity from stock_balances where warehouse_id=$1",
          [w1],
        )
      ).rows[0].quantity,
    ),
    4,
  );
});
await test("unchanged inventory is audited without extra movement", async () => {
  const before = (await db.query("select count(*) n from stock_movements"))
    .rows[0].n;
  await db.query("select stockpro_count($1,$2,$3,4,$4,gen_random_uuid())", [
    o1,
    p1,
    w1,
    "Conferência sem diferença",
  ]);
  assert.equal(
    (await db.query("select count(*) n from stock_movements")).rows[0].n,
    before,
  );
});
await test("inventory rejects foreign warehouse and negative quantity", async () => {
  await fails("select stockpro_count($1,$2,$3,0,$4,gen_random_uuid())", [
    o1,
    p1,
    w2,
    "Tentativa inválida",
  ]);
  await fails("select stockpro_count($1,$2,$3,-1,$4,gen_random_uuid())", [
    o1,
    p1,
    w1,
    "Quantidade inválida",
  ]);
  await fails("delete from stock_counts");
});
await test("low-stock report compares consolidated balance to minimum", async () => {
  await db.query("update products set minimum_stock=9 where id=$1", [p1]);
  const value = (
    await db.query("select stockpro_product_balances($1,'',0,true) data", [o1])
  ).rows[0].data;
  assert.equal(value.count, 1);
  assert.equal(Number(value.rows[0].quantity), 7);
});
await user(u2);
await test("inventory audit is isolated between organizations", async () => {
  assert.equal((await db.query("select * from stock_counts")).rows.length, 0);
  await fails("select stockpro_count($1,$2,$3,5,$4,gen_random_uuid())", [
    o1,
    p1,
    w1,
    "Acesso indevido",
  ]);
});

await user(u1);
const supplier = (
  await db.query(
    "insert into suppliers(organization_id,name) values($1,'Supplier A') returning id",
    [o1],
  )
).rows[0].id;
const brand = (
  await db.query(
    "insert into brands(organization_id,name) values($1,'Brand A') returning id",
    [o1],
  )
).rows[0].id;
await test("customers and brands persist and protect organization_id", async () => {
  await db.query(
    "insert into customers(organization_id,name,email) values($1,'Customer A','test@example.test')",
    [o1],
  );
  await db.query("update products set brand_id=$1 where id=$2", [brand, p1]);
  await fails("update customers set organization_id=$1", [o2]);
});
await user(u2);
const foreignBrand = (
  await db.query(
    "insert into brands(organization_id,name) values($1,'Brand B') returning id",
    [o2],
  )
).rows[0].id;
await test("new contact data is hidden across organizations", async () => {
  assert.equal((await db.query("select * from customers")).rows.length, 0);
  assert.equal(
    (await db.query("select * from brands where id=$1", [brand])).rows.length,
    0,
  );
});
await user(u1);
await test("product cannot reference another organizations brand", () =>
  fails("update products set brand_id=$1 where id=$2", [foreignBrand, p1]));
const orderId = crypto.randomUUID();
const savePurchase = (id, items, warehouse = w1) =>
  db.query("select stockpro_save_purchase($1,$2,$3,$4,$5,$6::jsonb)", [
    o1,
    id,
    supplier,
    warehouse,
    "Test purchase",
    JSON.stringify(items),
  ]);
const action = (id, value) =>
  db.query("select stockpro_purchase_action($1,$2,$3)", [o1, id, value]);
const item = { product_id: p1, quantity: 5, unit_price: 12.5 };
await test("purchase drafts persist atomically and save retries do not duplicate", async () => {
  await savePurchase(orderId, [item]);
  await savePurchase(orderId, [item]);
  assert.equal(
    (await db.query("select * from purchase_orders")).rows.length,
    1,
  );
  assert.equal(
    (await db.query("select * from purchase_order_items")).rows.length,
    1,
  );
});
await test("purchase rejects duplicate products and foreign warehouse", async () => {
  await assert.rejects(() => savePurchase(crypto.randomUUID(), [item, item]));
  await assert.rejects(() => savePurchase(crypto.randomUUID(), [item], w2));
  assert.equal(
    (await db.query("select * from purchase_orders")).rows.length,
    1,
  );
});
await test("draft cannot be received before confirmation", () =>
  assert.rejects(() => action(orderId, "receive")));
await test("confirmed purchase cannot be edited and receipt is idempotent", async () => {
  await action(orderId, "order");
  await assert.rejects(() =>
    savePurchase(orderId, [{ ...item, quantity: 10 }]),
  );
  const before = Number(
    (
      await db.query(
        "select quantity from stock_balances where product_id=$1 and warehouse_id=$2",
        [p1, w1],
      )
    ).rows[0].quantity,
  );
  await action(orderId, "receive");
  await action(orderId, "receive");
  const after = Number(
    (
      await db.query(
        "select quantity from stock_balances where product_id=$1 and warehouse_id=$2",
        [p1, w1],
      )
    ).rows[0].quantity,
  );
  assert.equal(after, before + 5);
  assert.equal(
    (
      await db.query("select status from purchase_orders where id=$1", [
        orderId,
      ])
    ).rows[0].status,
    "received",
  );
  await assert.rejects(() => action(orderId, "cancel"));
});
const cancelledId = crypto.randomUUID();
await test("cancelled purchase cannot be received", async () => {
  await savePurchase(cancelledId, [item]);
  await action(cancelledId, "cancel");
  await action(cancelledId, "cancel");
  await assert.rejects(() => action(cancelledId, "order"));
  await assert.rejects(() => action(cancelledId, "receive"));
});
const p2 = (
  await db.query(
    "insert into products(organization_id,name,sku) values($1,'Second product','P2') returning id",
    [o1],
  )
).rows[0].id;
const rollbackId = crypto.randomUUID();
await test("failed item receipt rolls back all movements and balances", async () => {
  await savePurchase(rollbackId, [item, { ...item, product_id: p2 }]);
  await action(rollbackId, "order");
  await db.query("update products set is_active=false where id=$1", [p2]);
  const before = (await db.query("select count(*) n from stock_movements"))
    .rows[0].n;
  const balance = (await db.query("select sum(quantity) n from stock_balances"))
    .rows[0].n;
  await assert.rejects(() => action(rollbackId, "receive"));
  assert.equal(
    (await db.query("select count(*) n from stock_movements")).rows[0].n,
    before,
  );
  assert.equal(
    (await db.query("select sum(quantity) n from stock_balances")).rows[0].n,
    balance,
  );
  assert.equal(
    (
      await db.query("select status from purchase_orders where id=$1", [
        rollbackId,
      ])
    ).rows[0].status,
    "ordered",
  );
});
await test("direct purchase status and line item manipulation denied", async () => {
  await fails("update purchase_orders set status='received'");
  await fails("delete from purchase_order_items");
});
await user(u3);
await test("viewer can read purchases but cannot create or receive", async () => {
  assert.equal(
    (await db.query("select * from purchase_orders")).rows.length,
    3,
  );
  await assert.rejects(() => savePurchase(crypto.randomUUID(), [item]));
  await assert.rejects(() => action(rollbackId, "receive"));
  await fails(
    "insert into customers(organization_id,name) values($1,'Denied')",
    [o1],
  );
});
await user(u2);
await test("purchase headers and items isolated between organizations", async () => {
  assert.equal(
    (await db.query("select * from purchase_orders")).rows.length,
    0,
  );
  assert.equal(
    (await db.query("select * from purchase_order_items")).rows.length,
    0,
  );
  await assert.rejects(() => action(rollbackId, "receive"));
});
await db.exec("reset role; set role anon");
await test("anonymous access denied", async () => {
  await fails("select * from products");
  await fails("select * from branches");
});
console.log(
  `${passed} database tests passed. Local PostgreSQL fixture only; remote Supabase policies not audited.`,
);
await db.close();
