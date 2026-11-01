/**
 * Phase 2 — get_trial_balance_with_opening: authorization and the opening + movement = closing identity.
 * Runs against the LOCAL clean stack only (no browser). Every assertion about access is made through a real
 * signed-in session; the service key is used only to create the fixture's users, roles and memberships.
 *
 * FIXED BEFORE EXECUTION  (period asked for: 2026-02-01 .. 2026-02-28; fiscal years 2025 and 2026 exist, none closed)
 *   E1 2025-03-01  Dr cash 1,000 / Cr revenue 1,000      (earlier, unclosed year)
 *   E2 2025-06-01  Dr expense 200 / Cr cash 200          (earlier, unclosed year)
 *   E3 2026-01-05  Dr cash 400 / Cr retained earnings 400 (current year, before the period)
 *   E4 2026-02-10  Dr cash 300 / Cr revenue 300          (in the period)
 *   E5 2026-02-11  Dr expense 50 / Cr cash 50            (in the period)
 *   E6 2026-02-12  DRAFT Dr cash 9,999 / Cr revenue 9,999 (never posted: must not appear)
 *   cash:     opening 1,000 - 200 + 400 = 1,200 Dr ; period Dr 300 Cr 50 ; closing 1,450
 *   revenue:  opening 0 (income opens year-to-date from 2026-01-01) ; period Cr 300 ; closing 300
 *   expense:  opening 0 ; period Dr 50 ; closing 50
 *   RE-PRIOR (synthetic equity line for the earlier unclosed year): opening Cr 800 (1,000 revenue - 200 expense)
 *   retained earnings 3100: opening Cr 400
 *   every row: opening + movement = closing ; totals of opening, period and closing each balance Dr = Cr
 *   access: no finance.reports.read / suspended / invited / member of another org / anonymous -> 42501, no rows
 */
import { test, expect } from "./helpers/local-only";
import { randomUUID } from "node:crypto";
import { adminClient, createJourneyFixture, PASSWORD, signedInClient, localEnv, type JourneyFixture } from "./helpers/accounting-fixture";
import { createClient } from "@supabase/supabase-js";

test.describe.configure({ mode: "serial" });

type Row = {
  account_id: string; code: string; category: string; normal_balance: string;
  opening_debit: string; opening_credit: string; period_debit: string; period_credit: string;
  closing_debit: string; closing_credit: string; opening_balance: string; closing_balance: string;
  is_synthetic: boolean; fiscal_year_known: boolean;
};
const n = (v: string | number) => Number(v);

let fx: JourneyFixture;
const rpc = (c: Awaited<ReturnType<typeof signedInClient>>, org: string | null, from = "2026-02-01", to = "2026-02-28") =>
  c.rpc("get_trial_balance_with_opening", { p_organization_id: org, p_start_date: from, p_end_date: to });

test.beforeAll(async () => {
  test.setTimeout(240_000);
  fx = await createJourneyFixture("tbo");
  const admin = adminClient();
  const owner = await signedInClient(fx.owner.email);

  const expense = (await admin.from("chart_of_accounts").select("id,code").eq("organization_id", fx.orgId).eq("category", "EXPENSE").eq("is_group", false).order("code").limit(1).single()).data!;
  const period = async (date: string) => {
    const { data } = await admin.from("fiscal_periods").select("id").eq("organization_id", fx.orgId).lte("start_date", date).gte("end_date", date).single();
    return data!.id as string;
  };
  const cash = fx.accounts["1110"], rev = fx.accounts["4100"], re = fx.accounts["3100"];
  const post = async (date: string, dr: string, cr: string, amount: number, doPost: boolean, tag: string) => {
    const created = await owner.rpc("create_journal_entry", {
      p_organization_id: fx.orgId, p_resort_id: null, p_fiscal_period_id: await period(date), p_entry_date: date, p_description: tag, p_source_type: "JOURNAL_VOUCHER",
      p_lines: [{ account_id: dr, debit: amount, credit: 0 }, { account_id: cr, debit: 0, credit: amount }], p_idempotency_key: randomUUID(),
    });
    expect(created.error, `${tag}: ${created.error?.message}`).toBeNull();
    if (!doPost) return;
    const id = created.data as string;
    const submitted = await owner.rpc("submit_journal_entry_for_review", { p_journal_entry_id: id });
    expect(submitted.error, `${tag} submit: ${submitted.error?.message}`).toBeNull();
    const posted = await owner.rpc("post_journal_entry", { p_journal_entry_id: id });
    expect(posted.error, `${tag} post: ${posted.error?.message}`).toBeNull();
  };
  await post("2025-03-01", cash, rev, 1000, true, "E1");
  await post("2025-06-01", expense.id as string, cash, 200, true, "E2");
  await post("2026-01-05", cash, re, 400, true, "E3");
  await post("2026-02-10", cash, rev, 300, true, "E4");
  await post("2026-02-11", expense.id as string, cash, 50, true, "E5");
  await post("2026-02-12", cash, rev, 9999, false, "E6-draft");
  (fx as unknown as { expenseId: string }).expenseId = expense.id as string;
});

test("E1 opening + movement = closing for every row, and each column balances", async () => {
  const session = await signedInClient(fx.accountant.email);
  const { data, error } = await rpc(session, fx.orgId);
  expect(error, error?.message).toBeNull();
  const rows = data as Row[];
  for (const r of rows) {
    const move = r.normal_balance === "DEBIT" ? n(r.period_debit) - n(r.period_credit) : n(r.period_credit) - n(r.period_debit);
    expect(n(r.opening_balance) + move, `${r.code} opening + movement`).toBeCloseTo(n(r.closing_balance), 2);
  }
  const sum = (k: keyof Row) => rows.reduce((s, r) => s + n(r[k] as string), 0);
  expect(sum("opening_debit")).toBeCloseTo(sum("opening_credit"), 2);
  expect(sum("period_debit")).toBeCloseTo(sum("period_credit"), 2);
  expect(sum("closing_debit")).toBeCloseTo(sum("closing_credit"), 2);
  expect(rows.every((r) => r.fiscal_year_known)).toBe(true);
});

test("E2 fixed expectations: balance-sheet carries cumulative, income-statement opens year-to-date, earlier years go to RE-PRIOR", async () => {
  const session = await signedInClient(fx.accountant.email);
  const rows = (await rpc(session, fx.orgId)).data as Row[];
  const by = (id: string) => rows.find((r) => r.account_id === id)!;
  const cash = by(fx.accounts["1110"]);
  expect([n(cash.opening_balance), n(cash.period_debit), n(cash.period_credit), n(cash.closing_balance)]).toEqual([1200, 300, 50, 1450]);
  const rev = by(fx.accounts["4100"]);
  expect([n(rev.opening_balance), n(rev.period_credit), n(rev.closing_balance)]).toEqual([0, 300, 300]);
  const exp = by((fx as unknown as { expenseId: string }).expenseId);
  expect([n(exp.opening_balance), n(exp.period_debit), n(exp.closing_balance)]).toEqual([0, 50, 50]);
  expect(n(by(fx.accounts["3100"]).opening_balance)).toBe(400);
  const prior = rows.find((r) => r.is_synthetic)!;
  expect(prior, "synthetic earlier-years equity line").toBeTruthy();
  expect(prior.code).toBe("RE-PRIOR");
  expect(n(prior.opening_credit)).toBe(800);
  // the unposted draft (9,999) is nowhere
  expect(rows.some((r) => n(r.closing_debit) >= 9999 || n(r.closing_credit) >= 9999 || n(r.period_credit) >= 9999 || n(r.period_debit) >= 9999)).toBe(false);
});

test("E3 refused for: no finance.reports.read, suspended, invited, another organization's member, anonymous, null org", async () => {
  const admin = adminClient();
  const env = localEnv();
  const mkUser = async (label: string) => {
    const email = `${label}-${fx.tag}@demo.local`;
    const created = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
    if (created.error || !created.data.user) throw new Error(created.error?.message);
    return { id: created.data.user.id, email };
  };
  const dues = await admin.from("permissions").select("id").eq("key", "finance.dues.read").single();
  const rid = randomUUID();
  await admin.from("roles").insert({ id: rid, organization_id: fx.orgId, key: "DUES_ONLY", name_ar: "x", name_en: "Dues only", is_system: false });
  await admin.from("role_permissions").insert({ role_id: rid, permission_id: dues.data!.id });
  const readerRole = (await admin.from("roles").select("id").eq("organization_id", fx.orgId).eq("key", "ACCOUNTANT_WITH_VOID").single()).data!.id as string;

  const noPerm = await mkUser("noperm"); const suspended = await mkUser("susp"); const invited = await mkUser("inv"); const stranger = await mkUser("stranger");
  for (const [u, status, role] of [[noPerm, "active", rid], [suspended, "suspended", readerRole], [invited, "invited", readerRole]] as const) {
    await admin.from("organization_memberships").insert({ organization_id: fx.orgId, user_id: u.id, status });
    await admin.from("user_role_assignments").insert({ organization_id: fx.orgId, user_id: u.id, role_id: role });
  }
  const other = await createJourneyFixture("tbo-other");
  void stranger;

  const refused = async (c: Awaited<ReturnType<typeof signedInClient>>, org: string | null, why: string) => {
    const res = await rpc(c, org);
    expect(res.error, `${why}: expected an error`).not.toBeNull();
    expect(res.error!.code, why).toBe("42501");
    expect(res.data, why).toBeNull();
  };
  await refused(await signedInClient(noPerm.email), fx.orgId, "member without finance.reports.read");
  await refused(await signedInClient(suspended.email), fx.orgId, "suspended member");
  await refused(await signedInClient(invited.email), fx.orgId, "invited (not yet active) member");
  await refused(await signedInClient(other.accountant.email), fx.orgId, "accountant of another organization");
  await refused(await signedInClient(stranger.email), fx.orgId, "authenticated user with no membership");
  await refused(await signedInClient(fx.accountant.email), null, "null organization");
  const anon = createClient(env.url, env.anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const anonRes = await rpc(anon as never, fx.orgId);
  expect(anonRes.error).not.toBeNull();
  expect(anonRes.data).toBeNull();
  // the organization the other accountant belongs to is readable by them, and shows none of this one's balances
  const own = (await rpc(await signedInClient(other.accountant.email), other.orgId)).data as Row[];
  expect(own.every((r) => n(r.closing_debit) === 0 && n(r.closing_credit) === 0)).toBe(true);
});

test("E4 an invalid period is rejected, not guessed", async () => {
  const session = await signedInClient(fx.accountant.email);
  const res = await rpc(session, fx.orgId, "2026-03-01", "2026-02-01");
  expect(res.error?.code).toBe("22023");
});
