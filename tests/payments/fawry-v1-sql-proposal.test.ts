import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Disposable in-memory synthetic PostgreSQL only. No Supabase connection,
// migration runner, disk database, production rows or credentials.
const db = new PGlite();
const proposal = readFileSync(new URL("../../supabase/proposals/fawry_v1_initiation_denial.sql", import.meta.url), "utf8");
const id = "11111111-1111-4111-8111-111111111111";

beforeAll(async () => {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create table public.online_payment_transactions (
      id uuid primary key, provider text, environment text, organization_id uuid,
      property_id uuid, member_id uuid, client_request_id text,
      provider_settings_id uuid, provider_merchant_identifier_snapshot text,
      amount numeric, currency text, provider_reference text,
      checkout_requested_at timestamptz, checkout_created_at timestamptz,
      status text, payment_id uuid, provider_payload jsonb,
      paid_at timestamptz, updated_at timestamptz
    );
    create table public.payments (id uuid primary key, amount numeric);
    insert into public.online_payment_transactions
      (id, provider, environment, amount, currency, provider_reference, status, client_request_id)
      values ('${id}', 'FAWRY', 'PRODUCTION', 500, 'EGP', 'existing-reference', 'PENDING', 'prior-attempt');
    grant select, insert, update on public.online_payment_transactions to service_role;
    grant select, insert on public.payments to service_role;
  `);
  await db.exec(proposal);
});
afterAll(async () => { await db.close(); });

describe("Fawry SQL proposal in a disposable synthetic schema", () => {
  it.each(["authenticated", "service_role"])("denies direct RPC and replay for %s", async (role) => {
    await db.exec(`set role ${role}`);
    try {
      await expect(db.query(`select * from public.create_online_payment_checkout_transaction(
        array['${id}'::uuid], 'FAWRY', 'PRODUCTION', '${id}'::uuid, 'prior-attempt')`))
        .rejects.toThrow("FAWRY_INITIATION_DISABLED");
    } finally { await db.exec("reset role"); }
    expect((await db.query("select count(*)::int as n from public.online_payment_transactions")).rows).toEqual([{ n: 1 }]);
  });

  it("denies service_role reference finalization before updating a previous row", async () => {
    await db.exec("set role service_role");
    try {
      await expect(db.query(`select public.mark_online_payment_checkout_created('${id}', 'new-reference')`))
        .rejects.toThrow("FAWRY_INITIATION_DISABLED");
    } finally { await db.exec("reset role"); }
    expect((await db.query("select provider_reference from public.online_payment_transactions")).rows).toEqual([{ provider_reference: "existing-reference" }]);
  });

  it.each(["PRODUCTION", "SANDBOX"])("rejects direct bypassrls insert (%s)", async (environment) => {
    await db.exec("set role service_role");
    try {
      await expect(db.query("insert into public.online_payment_transactions(id, provider, environment) values ($1, 'FAWRY', $2)",
        ["22222222-2222-4222-8222-222222222222", environment])).rejects.toThrow("FAWRY_INITIATION_DISABLED");
    } finally { await db.exec("reset role"); }
  });

  it("rejects direct reference rewrite, initiation timestamp and provider relabeling", async () => {
    await db.exec("set role service_role");
    try {
      for (const assignment of ["provider_reference='new-ref'", "checkout_created_at=now()", "environment='SANDBOX'", "provider='PAYMOB'"]) {
        await expect(db.query(`update public.online_payment_transactions set ${assignment} where id='${id}'`))
          .rejects.toThrow("FAWRY_INITIATION_DISABLED");
      }
    } finally { await db.exec("reset role"); }
  });

  it("preserves reads, prior settlement fields and ordinary payments table writes", async () => {
    await db.exec("set role service_role");
    try {
      const paymentId = "33333333-3333-4333-8333-333333333333";
      await db.query("insert into public.payments(id, amount) values ($1, 500)", [paymentId]);
      await db.query(`update public.online_payment_transactions set status='PAID', payment_id=$1,
        paid_at=now(), provider_payload='{"verified":true}'::jsonb, updated_at=now() where id=$2`, [paymentId, id]);
      expect((await db.query("select status, provider_reference from public.online_payment_transactions")).rows)
        .toEqual([{ status: "PAID", provider_reference: "existing-reference" }]);
      expect((await db.query("select count(*)::int as n from public.payments")).rows).toEqual([{ n: 1 }]);
    } finally { await db.exec("reset role"); }
  });

  it("keeps the direct-write trigger active under replica mode", async () => {
    await db.exec("set session_replication_role=replica");
    try {
      await expect(db.query("insert into public.online_payment_transactions(id,provider) values ($1,'FAWRY')",
        ["44444444-4444-4444-8444-444444444444"])).rejects.toThrow("FAWRY_INITIATION_DISABLED");
    } finally { await db.exec("set session_replication_role=origin"); }
  });

  it.each(["origin", "replica"])("prevents financial reset after first settlement (%s)", async (mode) => {
    await db.exec(`set session_replication_role=${mode}`);
    await db.exec("set role service_role");
    try {
      for (const assignment of [
        "status='PENDING', payment_id=null, paid_at=null",
        "status=null", "payment_id=null", "paid_at=null",
        "payment_id='55555555-5555-4555-8555-555555555555'", "paid_at=now()",
      ]) {
        await expect(db.query(`update public.online_payment_transactions set ${assignment} where id='${id}'`))
          .rejects.toThrow("FAWRY_INITIATION_DISABLED");
      }
      expect((await db.query("select status, provider_reference, payment_id from public.online_payment_transactions where id=$1", [id])).rows)
        .toEqual([{ status: "PAID", provider_reference: "existing-reference", payment_id: "33333333-3333-4333-8333-333333333333" }]);
    } finally { await db.exec("reset role; set session_replication_role=origin"); }
  });

  it("preserves other-provider insert, finalization and status behavior", async () => {
    const otherId = "66666666-6666-4666-8666-666666666666";
    await db.exec("set role service_role");
    try {
      await db.query("insert into public.online_payment_transactions(id,provider,environment,status) values ($1,'PAYMOB','SANDBOX','PENDING')", [otherId]);
      await db.query("select public.mark_online_payment_checkout_created($1,'other-reference')", [otherId]);
      await db.query("update public.online_payment_transactions set status='PAID',paid_at=now() where id=$1", [otherId]);
      expect((await db.query("select status,provider_reference from public.online_payment_transactions where id=$1", [otherId])).rows)
        .toEqual([{ status: "PAID", provider_reference: "other-reference" }]);
    } finally { await db.exec("reset role"); }
  });

  it("fails closed when a historical checkout overload is present", async () => {
    await db.exec(`create function public.create_online_payment_checkout_transaction(uuid[],text)
      returns void language sql as 'select';`);
    try {
      await expect(db.exec(proposal)).rejects.toThrow("UNREVIEWED_CHECKOUT_OVERLOAD");
    } finally {
      await db.exec("rollback");
      await db.exec("drop function public.create_online_payment_checkout_transaction(uuid[],text)");
    }
  });

  it("fails closed when a finalization overload is present", async () => {
    await db.exec(`create function public.mark_online_payment_checkout_created(uuid,text,text)
      returns void language sql as 'select';`);
    try {
      await expect(db.exec(proposal)).rejects.toThrow("UNREVIEWED_FINALIZATION_OVERLOAD");
    } finally { await db.exec("rollback"); }
  });
});
