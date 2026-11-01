import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { addBankAccount, adminClient, createJourneyFixture, PASSWORD, signedInClient, type JourneyFixture } from "./e2e/helpers/accounting-fixture";
import { sql } from "./helpers/gate-release";

/**
 * Migration 20261018100000, second half: (1) WHO may link a GL account to a cash box / bank account and to WHAT; (2) clear_incoming_cheque against the
 * deposit rule (valid bank, deactivated bank, invalid account) leaves no partial trace. Real sessions, fixture organizations, isolated stack only.
 */
const q = (query: string) => sql(query);
type Client = Awaited<ReturnType<typeof signedInClient>>;
type Rpc = { data: unknown; error: { code?: string; message: string } | null };
const ok = <T = Record<string, unknown>>(r: Rpc): T => { expect(r.error, r.error?.message).toBeNull(); return r.data as T; };
const err = (r: Rpc) => `${r.error?.code ?? ""}:${r.error?.message ?? ""}`;
const periodOf = (orgId: string, date: string) => q(`select id from public.fiscal_periods where organization_id='${orgId}' and start_date<='${date}' and end_date>='${date}' limit 1`);

let fx: JourneyFixture;
let other: JourneyFixture;
let owner: Client, collector: Client, cashier: Client, auditor: Client;
let due = "";
let bankId = "", bankAccountId = "";
const acct = (c: string) => fx.accounts[c];

async function userWithRole(f: JourneyFixture, roleKey: string, label: string) {
  const admin = adminClient();
  const email = `${label}-${f.tag}@demo.local`;
  const created = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  expect(created.error).toBeNull();
  const roleId = (await admin.from("roles").select("id").eq("organization_id", f.orgId).eq("key", roleKey).single()).data!.id as string;
  await admin.from("organization_memberships").insert({ organization_id: f.orgId, user_id: created.data.user!.id, status: "active" });
  await admin.from("user_role_assignments").insert({ user_id: created.data.user!.id, role_id: roleId, organization_id: f.orgId });
  return signedInClient(email);
}

/** everything a clearing writes, as one string; a refused clearing must leave it unchanged */
const trace = (chequeId: string) => q(`select (select count(*) from public.payments where organization_id='${fx.orgId}')||'/'||
  (select count(*) from public.payment_allocations pa join public.payments p on p.id=pa.payment_id where p.organization_id='${fx.orgId}')||'/'||
  (select count(*) from public.journal_entries where organization_id='${fx.orgId}')||'/'||
  (select count(*) from public.journal_entry_lines l join public.journal_entries j on j.id=l.journal_entry_id where j.organization_id='${fx.orgId}')||'/'||
  (select count(*) from public.platform_audit_logs where organization_id='${fx.orgId}')||'/'||
  (select count(*) from public.cheque_status_history where cheque_id='${chequeId}')||'/'||
  (select status||':'||coalesce(payment_id::text,'-') from public.cheques where id='${chequeId}')`);

async function depositedCheque(bankAcc: string, number: string, amount = 500) {
  const rec = ok<string>(await owner.rpc("record_incoming_cheque", {
    p_organization_id: fx.orgId, p_resort_id: fx.propertyId, p_bank_account_id: bankAcc, p_cheque_number: number, p_amount: amount,
    p_member_id: fx.member.id, p_cheque_date: "2026-08-01", p_due_date: "2026-08-10" }));
  ok(await owner.rpc("set_cheque_status", { p_cheque_id: rec, p_new_status: "DEPOSITED", p_note: "to bank" }));
  return rec;
}
const clear = (id: string, amount = 500) => owner.rpc("clear_incoming_cheque", { p_cheque_id: id, p_clearing_date: "2026-08-10", p_fiscal_period_id: periodOf(fx.orgId, "2026-08-10"), p_allocations: [{ due_id: due, amount }] }) as PromiseLike<Rpc>;
async function refusedClear(id: string, label: string) {
  const before = trace(id);
  const r = await clear(id);
  expect(r.error, `${label}: expected a refusal`).not.toBeNull();
  expect(err(r), label).toMatch(/DEPOSIT_ACCOUNT_INVALID/);
  expect(trace(id), `${label}: a refused clearing left a partial trace`).toBe(before);
  expect(q(`select status from public.cheques where id='${id}'`)).toBe("DEPOSITED");
}

beforeAll(async () => {
  fx = await createJourneyFixture("trs-a");
  other = await createJourneyFixture("trs-b");
  owner = await signedInClient(fx.owner.email);
  auditor = await signedInClient(fx.auditor.email);
  collector = await userWithRole(fx, "COLLECTOR", "collector");
  cashier = await userWithRole(fx, "CASHIER", "cashier");
  const typeId = q(`select id from public.due_types where organization_id='${fx.orgId}' limit 1`);
  const issued = await owner.rpc("issue_dues", { p_organization_id: fx.orgId, p_resort_id: fx.propertyId, p_unit_ids: [fx.unit.id], p_due_type_id: typeId, p_receivable_account_id: acct("1130"), p_amount: 5000, p_issue_date: "2026-08-01", p_due_date: "2026-08-01", p_description: "TRS-D1" });
  expect(issued.error, issued.error?.message).toBeNull();
  due = q(`select id from public.dues where organization_id='${fx.orgId}' and description='TRS-D1'`).split("\n")[0];
  const bank = await addBankAccount(fx);
  bankId = bank.bankId; bankAccountId = bank.bankAccountId;
}, 600_000);

describe.sequential("1. who may link an account, and to what", () => {
  const box = (c: Client, account: string, org = fx.orgId) =>
    c.from("cashboxes").insert({ organization_id: org, property_id: fx.propertyId, name: `t-${randomUUID().slice(0, 6)}`, gl_account_id: account });
  const bank = (c: Client, account: string, org = fx.orgId) =>
    c.from("bank_accounts").insert({ organization_id: org, property_id: fx.propertyId, bank_id: bankId, account_name: "x", account_number: `N-${randomUUID().slice(0, 6)}`, gl_account_id: account });

  it("users who may RECORD receipts but not manage accounts (collector, cashier) cannot link anything, by table insert or by RPC", async () => {
    for (const c of [collector, cashier]) {
      expect((await box(c, acct("1110"))).error, "cashbox insert").not.toBeNull();
      expect((await bank(c, acct("1120"))).error, "bank insert").not.toBeNull();
      expect(err(await c.rpc("create_cashbox", { p_organization_id: fx.orgId, p_resort_id: fx.propertyId, p_name: "x", p_gl_account_id: acct("1110") }))).toMatch(/42501/);
    }
    expect((await box(auditor, acct("1110"))).error).not.toBeNull();
  });
  it("a user who may record receipts can still not turn an account into a deposit account by editing it (no UPDATE of links, no chart edits)", async () => {
    const upd = await collector.from("cashboxes").update({ gl_account_id: acct("1130") }).eq("organization_id", fx.orgId).select("id");
    expect((upd.data ?? []).length, "rows a collector could update").toBe(0);
    const flag = await collector.from("chart_of_accounts").update({ is_cash_equivalent: true }).eq("id", acct("1130")).select("id");
    expect((flag.data ?? []).length, "rows a collector could reclassify").toBe(0);
    expect(q(`select is_cash_equivalent from public.chart_of_accounts where id='${acct("1130")}'`)).toBe("f");
  });
  it("an accounts manager (owner) can link a real cash / bank account", async () => {
    expect((await box(owner, acct("1110"))).error).toBeNull();
    expect((await bank(owner, acct("1120"))).error).toBeNull();
  });
  it("…but not the receivables account 1130, another ordinary asset (1210), a liability (2250), a group (1100) or an inactive account — by insert AND by create_cashbox", async () => {
    q(`update public.chart_of_accounts set is_active=false where id='${acct("1220")}'`);
    for (const code of ["1130", "1210", "2250", "1100", "1220"]) {
      const a = await box(owner, acct(code));
      expect(err({ data: null, error: a.error }), `cashbox on ${code}`).toMatch(/GL_ACCOUNT_NOT_CASH_OR_BANK/);
      const b = await bank(owner, acct(code));
      expect(err({ data: null, error: b.error }), `bank account on ${code}`).toMatch(/GL_ACCOUNT_NOT_CASH_OR_BANK/);
    }
    for (const code of ["1130", "2250", "1100"]) {
      expect(err(await owner.rpc("create_cashbox", { p_organization_id: fx.orgId, p_resort_id: fx.propertyId, p_name: "x", p_gl_account_id: acct(code) })), `create_cashbox ${code}`).toMatch(/GL_ACCOUNT_NOT_|GL_ACCOUNT_NOT_CASH_OR_BANK/);
    }
    expect(q(`select count(*) from public.cashboxes where organization_id='${fx.orgId}' and gl_account_id in ('${acct("1130")}','${acct("1210")}','${acct("2250")}','${acct("1100")}','${acct("1220")}')`)).toBe("0");
  });
  it("…and not an account of ANOTHER organization, nor a row written for another organization", async () => {
    expect(err({ data: null, error: (await box(owner, other.accounts["1110"])).error })).toMatch(/GL_ACCOUNT_NOT_CASH_OR_BANK/);
    expect((await box(owner, other.accounts["1110"], other.orgId)).error, "forged organization_id").not.toBeNull();
    expect(q(`select count(*) from public.cashboxes where gl_account_id='${other.accounts["1110"]}' and organization_id='${fx.orgId}'`)).toBe("0");
  });
  it("re-pointing an existing link is checked too (UPDATE of gl_account_id), and an unrelated edit of a legacy row is not blocked", async () => {
    const id = q(`select id from public.cashboxes where organization_id='${fx.orgId}' and gl_account_id='${acct("1110")}' limit 1`);
    const r = await owner.from("cashboxes").update({ gl_account_id: acct("1130") }).eq("id", id).select("id");
    expect(err({ data: null, error: r.error })).toMatch(/GL_ACCOUNT_NOT_CASH_OR_BANK/);
    expect(q(`select gl_account_id from public.cashboxes where id='${id}'`)).toBe(acct("1110"));
    // a legacy bad row (written with the triggers bypassed) can still be renamed: the triggers watch the account, not the name
    const legacyId = randomUUID();
    q(`set session_replication_role = replica; insert into public.cashboxes(id, organization_id, property_id, name, gl_account_id) values ('${legacyId}','${fx.orgId}','${fx.propertyId}','legacy','${acct("1130")}')`);
    const ren = await owner.from("cashboxes").update({ name: "legacy renamed" }).eq("id", legacyId).select("id");
    expect(ren.error, ren.error?.message).toBeNull();
    expect(ren.data?.length).toBe(1);
  });
  it("the legacy cash box on 1130 does NOT make 1130 a deposit account: the rule refuses it at receipt time", async () => {
    const r = await owner.rpc("record_advance_payment", { p_organization_id: fx.orgId, p_resort_id: fx.propertyId, p_member_id: fx.member.id, p_unit_id: fx.unit.id, p_amount: 10, p_method: "CASH", p_payment_date: "2026-08-10", p_deposit_account_id: acct("1130"), p_fiscal_period_id: periodOf(fx.orgId, "2026-08-10"), p_allocations: [], p_idempotency_key: randomUUID() });
    expect(err(r)).toMatch(/DEPOSIT_ACCOUNT_INVALID|ADVANCE_ACCOUNT_NOT_CONFIGURED/);
    const p = await owner.rpc("record_payment", { p_organization_id: fx.orgId, p_resort_id: fx.propertyId, p_member_id: fx.member.id, p_unit_id: fx.unit.id, p_amount: 10, p_method: "CASH", p_payment_date: "2026-08-10", p_deposit_account_id: acct("1130"), p_fiscal_period_id: periodOf(fx.orgId, "2026-08-10"), p_allocations: [{ due_id: due, amount: 10 }], p_idempotency_key: randomUUID() });
    expect(err(p)).toMatch(/DEPOSIT_ACCOUNT_INVALID/);
  });
  it("the account lists of the cash box and bank forms offer only cash-like accounts (the database refuses the rest)", async () => {
    const { data } = await owner.from("chart_of_accounts").select("code").eq("organization_id", fx.orgId).eq("is_group", false).eq("is_active", true).eq("is_cash_equivalent", true).in("category", ["ASSET"]).order("code");
    expect((data ?? []).map((r) => r.code)).toEqual(["1110", "1120"]);
  });
});

describe.sequential("2. clear_incoming_cheque against the deposit rule", () => {
  it("valid: an active bank account whose GL account is cash-like — the cheque clears, one payment, one history row, debit on 1120", async () => {
    const id = await depositedCheque(bankAccountId, "CHQ-001");
    const before = trace(id);
    const paymentId = ok<string>(await clear(id));
    expect(paymentId).toMatch(/^[0-9a-f-]{36}$/);
    expect(q(`select status||':'||(payment_id='${paymentId}')::text from public.cheques where id='${id}'`)).toBe("CLEARED:true");
    expect(q(`select a.code from public.payments p join public.journal_entry_lines l on l.journal_entry_id=p.journal_entry_id and l.debit>0 join public.chart_of_accounts a on a.id=l.account_id where p.id='${paymentId}'`)).toBe("1120");
    expect(q(`select count(*) from public.cheque_status_history where cheque_id='${id}' and to_status='CLEARED'`)).toBe("1");
    expect(trace(id)).not.toBe(before);
  });
  it("deactivated bank account: refused with DEPOSIT_ACCOUNT_INVALID, nothing written, the cheque stays DEPOSITED; reactivating is the remedy", async () => {
    const id = await depositedCheque(bankAccountId, "CHQ-002");
    // every bank account that points at 1120 (section 1 created a second one): the account is valid while ANY active link remains
    q(`update public.bank_accounts set is_active=false where organization_id='${fx.orgId}' and gl_account_id='${acct("1120")}'`);
    try {
      await refusedClear(id, "deactivated bank");
    } finally {
      q(`update public.bank_accounts set is_active=true where organization_id='${fx.orgId}' and gl_account_id='${acct("1120")}'`);
    }
    ok(await clear(id));
    expect(q(`select status from public.cheques where id='${id}'`)).toBe("CLEARED");
  });
  it("invalid account: a LEGACY bank account whose GL account is the receivables account (1130), a liability (2250) or a group (1100) — refused, no trace", async () => {
    for (const [code, n] of [["1130", "CHQ-003"], ["2250", "CHQ-004"], ["1100", "CHQ-005"]] as const) {
      const ba = randomUUID();
      q(`set session_replication_role = replica; insert into public.bank_accounts(id, organization_id, property_id, bank_id, account_name, account_number, gl_account_id) values ('${ba}','${fx.orgId}','${fx.propertyId}','${bankId}','legacy ${code}','L-${code}','${acct(code)}')`);
      const id = await depositedCheque(ba, n);
      await refusedClear(id, `bank account on ${code}`);
    }
  });
  it("a cash-like account that no active cash box or bank account points at is refused as well (bank account removed from use)", async () => {
    const ba = randomUUID();
    q(`insert into public.bank_accounts(id, organization_id, property_id, bank_id, account_name, account_number, gl_account_id, is_active) values ('${ba}','${fx.orgId}','${fx.propertyId}','${bankId}','second 1110','S-1110','${acct("1110")}', false)`);
    q(`update public.cashboxes set is_active=false where organization_id='${fx.orgId}' and gl_account_id='${acct("1110")}'`);
    try {
      const id = await depositedCheque(ba, "CHQ-006");
      await refusedClear(id, "1110 with every link inactive");
    } finally {
      q(`update public.cashboxes set is_active=true where organization_id='${fx.orgId}' and gl_account_id='${acct("1110")}'`);
    }
  });
});

describe.sequential("3. reclassifying a LINKED account cannot be used to get around the rule", () => {
  const pay = (account: string, amount = 10) =>
    owner.rpc("record_payment", { p_organization_id: fx.orgId, p_resort_id: fx.propertyId, p_member_id: fx.member.id, p_unit_id: fx.unit.id, p_amount: amount, p_method: "CASH", p_payment_date: "2026-08-10", p_deposit_account_id: account, p_fiscal_period_id: periodOf(fx.orgId, "2026-08-10"), p_allocations: [{ due_id: due, amount }], p_idempotency_key: randomUUID() }) as PromiseLike<Rpc>;
  const refusedPay = async (account: string, label: string) => {
    const r = await pay(account);
    expect(r.error, `${label}: expected a refusal`).not.toBeNull();
    expect(err(r), label).toMatch(/DEPOSIT_ACCOUNT_INVALID/);
  };
  const orgCounts = () => q(`select (select count(*) from public.payments where organization_id='${fx.orgId}')||'/'||(select count(*) from public.journal_entries where organization_id='${fx.orgId}')`);

  it("a USED linked account (1110): category and group flags are locked by the chart itself; turning off the cash-like flag or deactivating it makes receipts refuse at once, restoring accepts again", async () => {
    ok(await pay(acct("1110")));                       // makes sure 1110 is used
    for (const patch of [{ category: "LIABILITY" }, { is_group: true }]) {
      const r = await owner.from("chart_of_accounts").update(patch).eq("id", acct("1110")).select("id");
      expect(err({ data: null, error: r.error }), JSON.stringify(patch)).toMatch(/COA_USED_TYPE_LOCKED/);
    }
    for (const [patch, restore] of [[{ is_cash_equivalent: false }, { is_cash_equivalent: true }], [{ is_active: false }, { is_active: true }]] as const) {
      const before = orgCounts();
      expect((await adminClient().from("chart_of_accounts").update(patch).eq("id", acct("1110"))).error).toBeNull();
      await refusedPay(acct("1110"), `1110 after ${JSON.stringify(patch)}`);
      expect(orgCounts(), "a refused receipt left a trace").toBe(before);
      expect((await adminClient().from("chart_of_accounts").update(restore).eq("id", acct("1110"))).error).toBeNull();
      ok(await pay(acct("1110")));
    }
  });
  it("an UNUSED linked account: changing its category or making it a group (still allowed by the chart) makes receipts refuse; changing it back accepts", async () => {
    const admin = adminClient();
    const created = await admin.from("chart_of_accounts").insert({ organization_id: fx.orgId, code: `1115-${Date.now() % 100000}`, name_ar: "عهدة اختبار", name_en: "Test petty cash", category: "ASSET", normal_balance: "DEBIT", is_cash_equivalent: true }).select("id").single();
    expect(created.error, created.error?.message).toBeNull();
    const w = created.data!.id as string;
    expect((await owner.from("cashboxes").insert({ organization_id: fx.orgId, property_id: fx.propertyId, name: "petty", gl_account_id: w })).error).toBeNull();
    for (const [patch, restore] of [[{ category: "LIABILITY" }, { category: "ASSET" }], [{ is_group: true }, { is_group: false }]] as const) {
      expect((await admin.from("chart_of_accounts").update(patch).eq("id", w)).error, JSON.stringify(patch)).toBeNull();
      await refusedPay(w, `linked unused account after ${JSON.stringify(patch)}`);
      expect((await admin.from("chart_of_accounts").update(restore).eq("id", w)).error).toBeNull();
    }
    ok(await pay(w));
  });
  it("only an accounts manager can make an ordinary asset cash-like and link it: collector/cashier cannot flip the flag; the owner can (privilege), and the flip leaves the account usable only through a valid link", async () => {
    for (const c of [collector, cashier]) {
      const r = await c.from("chart_of_accounts").update({ is_cash_equivalent: true }).eq("id", acct("1210")).select("id");
      expect((r.data ?? []).length, "rows a non-manager could reclassify").toBe(0);
    }
    expect(q(`select is_cash_equivalent from public.chart_of_accounts where id='${acct("1210")}'`)).toBe("f");
    await refusedPay(acct("1210"), "1210 before any flag / link");
    // flag alone is not enough: no link yet
    expect((await owner.from("chart_of_accounts").update({ is_cash_equivalent: true }).eq("id", acct("1210")).select("id")).error).toBeNull();
    await refusedPay(acct("1210"), "1210 flagged but not linked");
    expect((await owner.from("cashboxes").insert({ organization_id: fx.orgId, property_id: fx.propertyId, name: "reclassified", gl_account_id: acct("1210") })).error).toBeNull();
    ok(await pay(acct("1210")));
  });
});

describe.sequential("4. audit of the cash-like flag: actual changes only, no new write permission", () => {
  const audit = (id: string) => Number(q(`select count(*) from public.platform_audit_logs where action='coa.cash_equivalent_changed' and entity_id='${id}'`));
  const anyCoaAudit = (id: string) => Number(q(`select count(*) from public.platform_audit_logs where entity_type='chart_of_account' and entity_id='${id}'`));
  it("an owner flipping the flag writes exactly ONE row (who, from, to, whether linked); a no-op update and an update of another column write none of this kind", async () => {
    const id = acct("1140");
    const b0 = audit(id);
    const flip = await owner.from("chart_of_accounts").update({ is_cash_equivalent: true }).eq("id", id).select("id");
    expect(flip.error, flip.error?.message).toBeNull();
    expect(audit(id)).toBe(b0 + 1);
    const row = q(`select actor_id::text||'|'||(safe_change_summary->>'from')||'|'||(safe_change_summary->>'to')||'|'||(safe_change_summary->>'linked_to_active_cashbox_or_bank')||'|'||(safe_change_summary->>'code') from public.platform_audit_logs where action='coa.cash_equivalent_changed' and entity_id='${id}' order by created_at desc limit 1`);
    const [actor, from, to, linked, code] = row.split("|");
    expect(actor).toBe(q(`select id::text from auth.users where email='${fx.owner.email}'`));
    expect([from, to, linked, code]).toEqual(["false", "true", "false", "1140"]);
    // same value again: nothing
    expect((await owner.from("chart_of_accounts").update({ is_cash_equivalent: true }).eq("id", id).select("id")).error).toBeNull();
    expect(audit(id), "no-op update").toBe(b0 + 1);
    // another column: the chart's own audit may write its row, this trigger must not
    expect((await owner.from("chart_of_accounts").update({ name_en: "Renamed 1140" }).eq("id", id).select("id")).error).toBeNull();
    expect(audit(id), "other column").toBe(b0 + 1);
    // flipping back is a second actual change
    expect((await owner.from("chart_of_accounts").update({ is_cash_equivalent: false }).eq("id", id).select("id")).error).toBeNull();
    expect(audit(id)).toBe(b0 + 2);
  });
  it("a linked account's flip records linked = true; a service-role change is recorded too (actor empty)", async () => {
    const id = acct("1110");
    const b0 = audit(id);
    expect((await adminClient().from("chart_of_accounts").update({ is_cash_equivalent: false }).eq("id", id)).error).toBeNull();
    expect((await adminClient().from("chart_of_accounts").update({ is_cash_equivalent: true }).eq("id", id)).error).toBeNull();
    expect(audit(id)).toBe(b0 + 2);
    expect(q(`select safe_change_summary->>'linked_to_active_cashbox_or_bank' from public.platform_audit_logs where action='coa.cash_equivalent_changed' and entity_id='${id}' order by created_at desc limit 1`)).toBe("true");
  });
  it("no write permission was widened: collector / cashier / auditor still change nothing and leave no row; the audit function and trigger function are not executable by users", async () => {
    // a fresh ordinary asset account: section 3 already reclassified 1210 as cash-like on purpose
    const fresh = await adminClient().from("chart_of_accounts").insert({ organization_id: fx.orgId, code: `1118-${Date.now() % 100000}`, name_ar: "حساب عادي", name_en: "Plain asset (audit test)", category: "ASSET", normal_balance: "DEBIT", is_cash_equivalent: false }).select("id").single();
    expect(fresh.error, fresh.error?.message).toBeNull();
    const id = fresh.data!.id as string;
    const b0 = audit(id);
    for (const c of [collector, cashier, auditor]) {
      const r = await c.from("chart_of_accounts").update({ is_cash_equivalent: true }).eq("id", id).select("id");
      expect((r.data ?? []).length, "rows a non-manager could change").toBe(0);
    }
    expect(audit(id)).toBe(b0);
    expect(q(`select is_cash_equivalent from public.chart_of_accounts where id='${id}'`)).toBe("f");
    for (const fn of ["public.log_coa_cash_equivalent_change()", "public.validate_treasury_gl_account()"]) {
      expect(q(`select has_function_privilege('authenticated','${fn}','execute')::text||'/'||has_function_privilege('anon','${fn}','execute')::text`), fn).toBe("false/false");
    }
    // direct insert into the audit table by a user is still impossible
    const ins = await owner.from("platform_audit_logs").insert({ organization_id: fx.orgId, action: "coa.cash_equivalent_changed", entity_type: "chart_of_account", entity_id: id });
    expect(ins.error, "users must not write audit rows directly").not.toBeNull();
  });
});
