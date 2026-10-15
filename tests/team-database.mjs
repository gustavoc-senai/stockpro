import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs/promises";
import assert from "node:assert/strict";
process.on("uncaughtException", (e) => {
  console.error(e.message, e.where ?? "");
  process.exit(1);
});
const db = new PGlite();
for (const file of [
  "fixtures/team.sql",
  "../supabase/updates/202610150006_invitation_hardening.sql",
])
  await db.exec(
    (await fs.readFile(new URL(file, import.meta.url), "utf8")).replace(
      /^\uFEFF/,
      "",
    ),
  );
const ids = Array.from(
  { length: 7 },
  (_, i) => `10000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
);
const [owner, admin, viewer, guest, wrong, unverified, otherGuest] = ids;
const org = "20000000-0000-4000-8000-000000000001",
  otherOrg = "20000000-0000-4000-8000-000000000002";
for (const [id, i] of ids.map((id, i) => [id, i]))
  await db.query("insert into auth.users values($1,$2,$3,$4)", [
    id,
    `user${i + 1}@example.test`,
    id === unverified ? null : new Date().toISOString(),
    JSON.stringify({ full_name: "Person " + (i + 1) }),
  ]);
await db.query(
  "insert into organizations values($1,'Company A'),($2,'Company B')",
  [org, otherOrg],
);
await db.query(
  "insert into organization_members values($1,$2,'owner'),($1,$3,'admin'),($1,$4,'viewer'),($5,$6,'owner')",
  [org, owner, admin, viewer, otherOrg, wrong],
);
async function as(id) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
  await db.exec("set role authenticated");
}
let passed = 0;
async function test(name, fn) {
  await fn();
  passed++;
  console.log("PASS", name);
}
async function denied(fn) {
  await assert.rejects(fn, (e) => {
    assert.notEqual(e.code, "42601");
    return true;
  });
}
const invite = (email, role = "viewer") =>
  db
    .query("select stockpro_invite($1,$2,$3) id", [org, email, role])
    .then((r) => r.rows[0].id);
const accept = (id) => db.query("select stockpro_accept_invite($1) id", [id]);
const change = (target, action, role = null) =>
  db.query("select stockpro_member_action($1,$2,$3,$4)", [
    org,
    target,
    action,
    role,
  ]);
await as(owner);
let guestInvite, unverifiedInvite, _adminInvite;
await test("owner can invite verified email with normalized address", async () => {
  guestInvite = await invite(" USER4@EXAMPLE.TEST ");
  const row = (
    await db.query(
      "select email,role from organization_invitations where id=$1",
      [guestInvite],
    )
  ).rows[0];
  assert.equal(row.email, "user4@example.test");
  assert.equal(row.role, "viewer");
});
await test("owner can invite administrator but cannot invite owner", async () => {
  _adminInvite = await invite("new@example.test", "admin");
  await denied(() => invite("invalid@example.test", "owner"));
});
await as(wrong);
await test("wrong email cannot preview or accept invitation or access other team", async () => {
  await denied(() => accept(guestInvite));
  await denied(() => db.query("select stockpro_invitation($1)", [guestInvite]));
  await denied(() => db.query("select stockpro_team($1)", [org]));
  assert.equal((await db.query("select * from audit_events")).rows.length, 0);
});
await as(owner);
unverifiedInvite = await invite("user6@example.test");
await as(unverified);
await test("unconfirmed email cannot accept invitation", () =>
  denied(() => accept(unverifiedInvite)));
await as(guest);
await test("invited user previews only their own invitation", async () => {
  const result = (
    await db.query("select stockpro_invitation($1) data", [guestInvite])
  ).rows[0].data;
  assert.equal(result.organization_name, "Company A");
  assert.equal(result.status, "pending");
});
await test("acceptance supports enum roles and repeated clicks do not duplicate membership", async () => {
  assert.equal((await accept(guestInvite)).rows[0].id, org);
  await accept(guestInvite);
  const team = (await db.query("select stockpro_team($1) data", [org])).rows[0]
    .data;
  assert.equal(team.members.filter((m) => m.user_id === guest).length, 1);
  assert.equal(team.members.find((m) => m.user_id === guest).role, "viewer");
});
await test("viewers see their own email but no colleague emails", async () => {
  const team = (await db.query("select stockpro_team($1) data", [org])).rows[0]
    .data;
  assert.equal(
    team.members.find((m) => m.user_id === guest).email,
    "user4@example.test",
  );
  assert.equal(team.members.find((m) => m.user_id === owner).email, null);
});
await test("viewer cannot invite, change roles or write audit", async () => {
  await denied(() => invite("x@example.test"));
  await denied(() => change(admin, "role", "viewer"));
  await denied(() => db.query("delete from audit_events"));
  assert.equal(
    (await db.query("select * from organization_invitations")).rows.length,
    0,
  );
});
await as(admin);
await test("admin cannot escalate role or overwrite owner admin invitation", async () => {
  await denied(() => invite("another@example.test", "admin"));
  await denied(() => invite("new@example.test", "viewer"));
  await denied(() => change(guest, "role", "admin"));
  await denied(() => change(owner, "remove"));
});
await as(owner);
await test("owner and self memberships cannot be changed or removed", async () => {
  await denied(() => change(owner, "remove"));
  await denied(() => change(owner, "role", "viewer"));
});
await test("owner can promote and demote existing member", async () => {
  await change(guest, "role", "admin");
  let team = (await db.query("select stockpro_team($1) data", [org])).rows[0]
    .data;
  assert.equal(team.members.find((m) => m.user_id === guest).role, "admin");
  await change(guest, "role", "viewer");
});
await test("direct membership mutation remains denied", () =>
  denied(() =>
    db.query("update organization_members set role='admin' where user_id=$1", [
      guest,
    ]),
  ));
let oldInvite, newInvite;
await test("regenerating a link revokes the older invitation", async () => {
  oldInvite = await invite("user7@example.test");
  newInvite = await invite("user7@example.test");
  assert.notEqual(oldInvite, newInvite);
  assert.notEqual(
    (
      await db.query(
        "select revoked_at from organization_invitations where id=$1",
        [oldInvite],
      )
    ).rows[0].revoked_at,
    null,
  );
});
await as(otherGuest);
await test("revoked invitation cannot be accepted", () =>
  denied(() => accept(oldInvite)));
await db.exec("reset role");
await db.query(
  "update organization_invitations set expires_at=now()-interval '1 second' where id=$1",
  [newInvite],
);
await as(otherGuest);
await test("expired invitation cannot be accepted", () =>
  denied(() => accept(newInvite)));
await as(owner);
await test("explicit revocation is idempotent", async () => {
  const id = await invite("revoked@example.test");
  await db.query("select stockpro_revoke_invite($1,$2)", [org, id]);
  await db.query("select stockpro_revoke_invite($1,$2)", [org, id]);
  assert.notEqual(
    (
      await db.query(
        "select revoked_at from organization_invitations where id=$1",
        [id],
      )
    ).rows[0].revoked_at,
    null,
  );
});
await test("remove access preserves account and does not reactivate accepted invitation", async () => {
  await change(guest, "remove");
  await as(guest);
  await denied(() => accept(guestInvite));
  await denied(() => db.query("select stockpro_team($1)", [org]));
  await as(owner);
});
let byAdmin;
await as(admin);
byAdmin = await invite("user7@example.test");
await as(owner);
await change(admin, "role", "viewer");
await as(otherGuest);
await test("removed inviter privilege invalidates their pending invitation", () =>
  denied(() => accept(byAdmin)));
await as(owner);
await test("team events are audited without copying emails", async () => {
  const events = (await db.query("select * from audit_events")).rows;
  assert.ok(events.some((e) => e.action === "invite_accepted"));
  assert.ok(events.some((e) => e.action === "member_removed"));
  assert.ok(events.some((e) => e.action === "role_changed"));
  assert.ok(!JSON.stringify(events).includes("@example.test"));
});
await test("catalog trigger records changed field names without values", async () => {
  const id = crypto.randomUUID();
  await db.query("insert into products values($1,$2,$3)", [
    id,
    org,
    "Sensitive catalog name",
  ]);
  await db.query("update products set name=$1 where id=$2", [
    "Changed name",
    id,
  ]);
  const events = (
    await db.query(
      "select * from audit_events where entity_id=$1 order by created_at",
      [id],
    )
  ).rows;
  assert.equal(events.length, 2);
  assert.ok(
    events.some(
      (e) => e.action === "update" && e.details.changed_fields.includes("name"),
    ),
  );
  assert.ok(!JSON.stringify(events).includes("Sensitive catalog name"));
  await denied(() => db.query("delete from audit_events"));
});
await db.exec("reset role;set role anon");
await test("anonymous callers cannot list audit, invitations or invoke team RPC", async () => {
  await denied(() => db.query("select * from organization_invitations"));
  await denied(() => db.query("select * from audit_events"));
  await denied(() => db.query("select stockpro_team($1)", [org]));
});
const { safeAuthDestination } = await import("../src/lib/authDestination.ts");
await test("login return path rejects external and arbitrary destinations", async () => {
  assert.equal(
    safeAuthDestination("?next=https://evil.test"),
    "/app/dashboard",
  );
  assert.equal(safeAuthDestination("?next=//evil.test"), "/app/dashboard");
  assert.equal(safeAuthDestination("?next=/app/settings"), "/app/dashboard");
  assert.equal(
    safeAuthDestination(
      "?next=" + encodeURIComponent("/invite/" + guestInvite),
    ),
    "/invite/" + guestInvite,
  );
});
console.log(
  `${passed} local team/security tests passed. Fixture snapshot plus update 006; remote bodies were not audited.`,
);
await db.close();
