import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { adminClient, createJourneyFixture, localEnv, PASSWORD, signedInClient, type JourneyFixture } from "./e2e/helpers/accounting-fixture";
import { sql } from "./helpers/gate-release";

/**
 * Third review (migration 20261017100400): no identity is not authority. A caller is trusted only as service_role (or an
 * administrative connection with no role set); `authenticated` without a subject, `anon`, a suspended owner, another member and
 * another organization get nothing — from the helper, from both as-of functions and from the views. Isolated stack only.
 */
const q = (query: string) => sql(query);
type Client = Awaited<ReturnType<typeof signedInClient>>;
type Rpc = { data: unknown; error: { code?: string; message: string } | null };
const ok = <T = Record<string, unknown>>(r: Rpc): T => { expect(r.error, r.error?.message).toBeNull(); return r.data as T; };

let fx: JourneyFixture, other: JourneyFixture;
let owner: Client, accountant: Client, otherOwner: Client;
let mA: { unit: string; member: string }, nA: { unit: string; member: string };
let receipt = "", dueM = "", portalM: ReturnType<typeof createClient>, portalN: ReturnType<typeof createClient>, portalMUserId = "";
const periodOf = (orgId: string, date: string) => q(`select id from public.fiscal_periods where organization_id='${orgId}' and start_date<='${date}' and end_date>='${date}' limit 1`) || randomUUID();
const asRole = (role: string, claims: Record<string, string> | null, body: string) => {
  const setup = claims
    ? `select set_config('request.jwt.claims', '${JSON.stringify(claims)}', true), set_config('request.jwt.claim.sub', '${claims.sub ?? ""}', true), set_config('request.jwt.claim.role', '${claims.role ?? ""}', true);`
    : "";
  const out = q(`begin; set local role ${role}; ${setup} ${body}; rollback;`);
  return out.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).filter((l) => !["BEGIN", "SET", "ROLLBACK"].includes(l) && !/^\s*$/.test(l));
};
const lastValue = (lines: string[]) => lines[lines.length - 1] ?? "";
const addUnit = async (f: JourneyFixture, code: string) => {
  const admin = adminClient();
  const u = randomUUID(), m = randomUUID();
  await admin.from("units").insert({ id: u, organization_id: f.orgId, property_id: f.propertyId, code });
  await admin.from("members").insert({ id: m, organization_id: f.orgId, full_name: `Owner ${code}` });
  await admin.from("unit_ownerships").insert({ organization_id: f.orgId, unit_id: u, member_id: m, share_percentage: 100, is_primary_contact: true, start_date: "2026-01-01" });
  return { unit: u, member: m };
};
const portalLogin = async (f: JourneyFixture, memberId: string, label: string) => {
  const email = `${label}-${f.tag}@demo.local`;
  const u = await adminClient().auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  q(`update public.members set user_id='${u.data.user!.id}' where id='${memberId}'`);
  const c = createClient(localEnv().url, localEnv().anon, { auth: { persistSession: false, autoRefreshToken: false } });
  expect((await c.auth.signInWithPassword({ email, password: PASSWORD })).error).toBeNull();
  return { client: c, userId: u.data.user!.id };
};
const credit = async (c: ReturnType<typeof createClient> | Client, d = "2026-09-30") =>
  ((await c.rpc("payment_credit_balances_as_of", { p_org: fx.orgId, p_as_of: d })).data as { payment_id: string }[] | null) ?? [];
const allocs = async (c: ReturnType<typeof createClient> | Client, d = "2026-09-30") =>
  ((await c.rpc("payment_allocations_as_of", { p_org: fx.orgId, p_as_of: d })).data as unknown[] | null) ?? [];

beforeAll(async () => {
  fx = await createJourneyFixture("adv-r3");
  other = await createJourneyFixture("adv-r3-other");
  owner = await signedInClient(fx.owner.email);
  accountant = await signedInClient(fx.accountant.email);
  otherOwner = await signedInClient(other.owner.email);
  ok(await owner.rpc("set_default_customer_advance_account", { p_organization_id: fx.orgId, p_property_id: fx.propertyId, p_account_id: fx.accounts["2250"] }));
  mA = await addUnit(fx, "R3-M");
  nA = await addUnit(fx, "R3-N");
  const typeId = q(`select id from public.due_types where organization_id='${fx.orgId}' limit 1`);
  ok(await owner.rpc("issue_dues", { p_organization_id: fx.orgId, p_resort_id: fx.propertyId, p_unit_ids: [mA.unit], p_due_type_id: typeId, p_receivable_account_id: fx.accounts["1130"], p_amount: 400, p_issue_date: "2026-09-02", p_due_date: "2026-09-02", p_description: "R3D1" }) as Rpc);
  dueM = q(`select id from public.dues where organization_id='${fx.orgId}' and description='R3D1'`);
  receipt = ok<{ payment_id: string }>(await accountant.rpc("record_advance_payment", { p_organization_id: fx.orgId, p_resort_id: fx.propertyId, p_member_id: mA.member, p_unit_id: mA.unit, p_amount: 700, p_method: "CASH", p_payment_date: "2026-09-02", p_deposit_account_id: fx.accounts["1110"], p_fiscal_period_id: periodOf(fx.orgId, "2026-09-02"), p_allocations: [], p_idempotency_key: randomUUID() }) as Rpc).payment_id;
  ok(await accountant.rpc("apply_payment_credit", { p_organization_id: fx.orgId, p_payment_id: receipt, p_allocations: [{ due_id: dueM, amount: 250 }], p_application_date: "2026-09-06", p_fiscal_period_id: periodOf(fx.orgId, "2026-09-06"), p_idempotency_key: randomUUID() }) as Rpc);
  const m = await portalLogin(fx, mA.member, "r3-m");
  portalM = m.client; portalMUserId = m.userId;
  portalN = (await portalLogin(fx, nA.member, "r3-n")).client;
}, 600_000);

describe.sequential("1. who is trusted: an explicit server role, never the lack of an identity", () => {
  it("an administrative connection (no role set) is trusted; is_trusted_backend() itself is not callable by client roles", () => {
    expect(q("select public.is_trusted_backend()::text")).toBe("true");
    // the helper is internal: authenticated / anon cannot even call it
    for (const role of ["authenticated", "anon"]) {
      let message = "";
      try { asRole(role, { role }, "select public.is_trusted_backend()::text"); } catch (e) { message = String((e as { stderr?: string }).stderr ?? e); }
      expect(message, role).toMatch(/permission denied/);
    }
  });
  it("what each role is shown for an existing POSTED receipt (through the helper that the readers use): service_role and admin yes; authenticated with or without a subject, and anon, no", () => {
    const status = (role: string, claims: Record<string, string> | null) => {
      try { return lastValue(asRole(role, claims, `select coalesce(public.payment_receipt_entry_status('${receipt}'), 'NULL')`)); }
      catch (e) { return /permission denied/.test(String((e as { stderr?: string }).stderr ?? e)) ? "DENIED" : "ERROR"; }
    };
    expect(q(`select public.payment_receipt_entry_status('${receipt}')`)).toBe("POSTED");                       // administrative connection
    expect(status("service_role", { role: "service_role" })).toBe("POSTED");
    expect(status("authenticated", { role: "authenticated" })).toBe("NULL");                                     // a token WITHOUT a subject
    expect(status("authenticated", { role: "authenticated", sub: randomUUID() })).toBe("NULL");
    expect(status("authenticated", null)).toBe("NULL");                                                          // no claims at all
    expect(status("anon", { role: "anon" })).toBe("DENIED");
  });
});

describe.sequential("2. an authenticated request with no identity gets nothing, from every new reader", () => {
  it("helper -> NULL; both as-of functions -> no rows; both views -> no rows (for a receipt that exists and is POSTED)", () => {
    const noId = { role: "authenticated" };
    expect(lastValue(asRole("authenticated", noId, `select coalesce(public.payment_receipt_entry_status('${receipt}'), 'NULL')`))).toBe("NULL");
    expect(lastValue(asRole("authenticated", noId, `select count(*) from public.payment_allocations_as_of('${fx.orgId}', '2026-09-30')`))).toBe("0");
    expect(lastValue(asRole("authenticated", noId, `select count(*) from public.payment_credit_balances_as_of('${fx.orgId}', '2026-09-30')`))).toBe("0");
    expect(lastValue(asRole("authenticated", noId, "select count(*) from public.effective_payment_allocations"))).toBe("0");
    expect(lastValue(asRole("authenticated", noId, "select count(*) from public.payment_credit_balances"))).toBe("0");
    // and with a subject that belongs to nobody
    const stranger = { role: "authenticated", sub: randomUUID() };
    expect(lastValue(asRole("authenticated", stranger, `select count(*) from public.payment_credit_balances_as_of('${fx.orgId}', '2026-09-30')`))).toBe("0");
    expect(lastValue(asRole("authenticated", stranger, `select coalesce(public.payment_receipt_entry_status('${receipt}'), 'NULL')`))).toBe("NULL");
  });
  it("what must still work: service_role through the API, an administrative connection, the accountant", async () => {
    expect((await credit(adminClient() as never)).map((r) => r.payment_id)).toContain(receipt);
    expect((await allocs(adminClient() as never)).length).toBeGreaterThan(0);
    expect(Number(q(`select count(*) from public.payment_credit_balances_as_of('${fx.orgId}', '2026-09-30') where payment_id='${receipt}'`))).toBe(1);
    expect((await credit(accountant)).map((r) => r.payment_id)).toContain(receipt);
    expect(q(`select public.payment_receipt_entry_status('${receipt}')`)).toBe("POSTED");
  });
  it("anon is refused outright", async () => {
    const anon = createClient(localEnv().url, localEnv().anon, { auth: { persistSession: false, autoRefreshToken: false } });
    expect((await anon.rpc("payment_credit_balances_as_of", { p_org: fx.orgId, p_as_of: "2026-09-30" })).error).not.toBeNull();
    expect((await anon.rpc("payment_receipt_entry_status", { p_payment_id: receipt })).error).not.toBeNull();
  });
});

describe.sequential("3. the owner: sees their own, loses it while suspended, gets it back when reactivated; nobody else ever sees it", () => {
  it("M sees the receipt and its application; N, the other organization and the ledger see/give nothing", async () => {
    expect((await credit(portalM)).map((r) => r.payment_id)).toEqual([receipt]);
    expect(await allocs(portalM)).toHaveLength(1);
    expect(await credit(portalN)).toEqual([]);
    expect(await credit(otherOwner)).toEqual([]);
    expect(((await portalM.from("journal_entries").select("id")).data ?? [])).toHaveLength(0);
  });
  it("the credit-balance function returns an account ID and nothing the owner can read through it (documentation correction)", async () => {
    const rows = (await portalM.rpc("payment_credit_balances_as_of", { p_org: fx.orgId, p_as_of: "2026-09-30" })).data as Record<string, unknown>[];
    expect(Object.keys(rows[0]).sort()).toEqual(["advance_account_id", "advance_amount", "member_id", "payment_id", "remaining_amount", "unit_id"]);
    expect(rows[0].advance_account_id).toBe(fx.accounts["2250"]);
    expect(((await portalM.from("chart_of_accounts").select("id, code")).data ?? [])).toHaveLength(0);   // the id opens nothing
    const allocationCols = Object.keys(((await portalM.rpc("payment_allocations_as_of", { p_org: fx.orgId, p_as_of: "2026-09-30" })).data as Record<string, unknown>[])[0]);
    expect(allocationCols.sort()).toEqual(["allocation_id", "amount", "applied_on", "due_id", "kind", "payment_id"]);
  });
  it("suspended portal access: M gets nothing from the helper, both functions and both views; staff are unaffected and can still apply credit", async () => {
    q(`insert into public.member_portal_access(organization_id, member_id, status, login_method, auth_user_id, auth_origin, suspended_at, activated_at)
       values('${fx.orgId}','${mA.member}','suspended','email','${portalMUserId}','linked_existing', now(), now())`);
    expect(await credit(portalM)).toEqual([]);
    expect(await allocs(portalM)).toEqual([]);
    expect((await portalM.rpc("payment_receipt_entry_status", { p_payment_id: receipt })).data).toBeNull();
    expect(((await portalM.from("payment_credit_balances").select("payment_id")).data ?? [])).toHaveLength(0);
    expect(((await portalM.from("effective_payment_allocations").select("id")).data ?? [])).toHaveLength(0);
    expect((await credit(accountant)).map((r) => r.payment_id)).toContain(receipt);                       // staff: unchanged
    ok(await accountant.rpc("apply_payment_credit", { p_organization_id: fx.orgId, p_payment_id: receipt, p_allocations: [{ due_id: dueM, amount: 50 }], p_application_date: "2026-09-08", p_fiscal_period_id: periodOf(fx.orgId, "2026-09-08"), p_idempotency_key: randomUUID() }) as Rpc);
  });
  it("reactivation: the very same owner session gets the figures back, including the application staff made meanwhile", async () => {
    q(`update public.member_portal_access set status='active', suspended_at=null where member_id='${mA.member}'`);
    expect((await credit(portalM)).map((r) => r.payment_id)).toEqual([receipt]);
    expect(await allocs(portalM)).toHaveLength(2);                                                         // 250 and the 50 applied during the suspension
    expect((await portalM.rpc("payment_receipt_entry_status", { p_payment_id: receipt })).data).toBe("POSTED");
    expect(((await portalM.from("payment_credit_balances").select("remaining_amount").eq("payment_id", receipt)).data ?? []).map((r) => Number(r.remaining_amount))).toEqual([400]);
    // and still nobody else
    expect(await credit(portalN)).toEqual([]);
    expect(await credit(otherOwner)).toEqual([]);
  });
});

describe.sequential("4. static: no other function treats a missing uid as authority", () => {
  it("no function body (new or old) still contains the identity-less trust in the as-of/helper functions", () => {
    for (const f of ["payment_receipt_entry_status", "payment_allocations_as_of", "payment_credit_balances_as_of"]) {
      const body = q(`select pg_get_functiondef('public.${f}'::regproc)`);
      expect(body, f).not.toMatch(/auth\.uid\(\)\s+IS\s+NULL/i);
      expect(body, f).toContain("is_trusted_backend()");
    }
    const acl = q("select coalesce((select string_agg(case when a.grantee=0 then 'PUBLIC' else a.grantee::regrole::text end, ',') from aclexplode(proacl) a),'DEFAULT-PUBLIC') from pg_proc where proname='is_trusted_backend' and pronamespace='public'::regnamespace");
    expect(acl).not.toMatch(/authenticated|anon|PUBLIC/);
  });
});
