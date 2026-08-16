/**
 * Phase 4, Task 6: proves something the SQL-only pgTAP suite (Task 5,
 * supabase/tests/phase_owner_portal_record_online_payment.sql) cannot --
 * two REAL, simultaneous network connections racing the FOR UPDATE lock
 * on the same online_payment_transactions row, not just sequential calls
 * within one script/session.
 *
 * Both concurrent calls target the SAME transaction_id, so they contend
 * only on that row's FOR UPDATE lock: whichever call acquires it first
 * proceeds to completion; the other blocks until the first commits, then
 * sees status = 'PAID' via the idempotent-replay short-circuit and
 * returns immediately with zero additional writes. This is simple lock
 * contention, not the AB-BA advisory-lock-vs-row-lock cycle Task 4's
 * deadlock fix addressed (that required two DIFFERENT transactions with
 * overlapping-but-different due sets).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });

describe("record_online_payment concurrent replay", () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  let orgId: string;
  let transactionId: string;
  const runSuffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

  beforeAll(async () => {
    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

    const { data: org, error: orgErr } = await admin
      .from("organizations")
      .insert({ name: "Phase4 Concurrency Test", slug: `p4-conc-${runSuffix}`, default_currency: "EGP", status: "ACTIVE" })
      .select("id")
      .single();
    expect(orgErr).toBeNull();
    orgId = org!.id;

    // NOTE / deviation from the plan's literal snippet: the plan called for
    // create_fiscal_year / set_fiscal_period_status RPCs here, "the same
    // pattern already used by tests/pgtap.integration.test.ts". Verified
    // live that this does NOT work under a plain service-role client:
    // create_fiscal_year checks has_permission(auth.uid(), ...), and
    // auth.uid() is null for a service-role JWT (no `sub` claim), so the
    // RPC raises 42501 "not authorized" every time. pgtap.integration.test.ts
    // never actually surfaces this because its RPC error goes unchecked and
    // its real assertions are gated behind `if (period)`, which is falsy
    // when the RPC failed -- that test silently no-ops instead of exercising
    // the path it claims to. The repo's actual proven pattern for
    // service-role fixture provisioning (tests/fixtures.ts, used by every
    // other integration test in this suite) inserts directly into
    // fiscal_years/fiscal_periods with status: 'OPEN', bypassing the
    // RPC-level permission check the way a service-role client legitimately
    // can (RLS/function auth checks don't apply to a service-role client's
    // own direct table writes). Using that pattern here instead.
    const today = new Date().toISOString().slice(0, 10);
    const { data: fiscalYear, error: yearErr } = await admin
      .from("fiscal_years")
      .insert({ organization_id: orgId, name: "2026", start_date: "2026-01-01", end_date: "2026-12-31", status: "OPEN" })
      .select("id")
      .single();
    expect(yearErr).toBeNull();

    const { error: periodErr } = await admin.from("fiscal_periods").insert({
      organization_id: orgId,
      fiscal_year_id: fiscalYear!.id,
      period_number: 1,
      name: "2026 — Full Year",
      start_date: "2026-01-01",
      end_date: "2026-12-31",
      status: "OPEN",
    });
    expect(periodErr).toBeNull();

    // Remaining fixtures -- resort, chart_of_accounts ASSET (clearing)
    // account, receivable account, organization_finance_settings row,
    // due_type, unit, member, unit_ownerships row, due, and one PENDING
    // online_payment_transactions row + allocation -- ported from the
    // exact same shape used by
    // supabase/tests/phase_owner_portal_record_online_payment.sql's
    // scenario 1 (happy path) setup.
    const { data: resort, error: resortErr } = await admin
      .from("resorts")
      .insert({ organization_id: orgId, name: "Concurrency Test Resort", code: `CONC-${runSuffix}` })
      .select("id")
      .single();
    expect(resortErr).toBeNull();
    const resortId = resort!.id;

    const { data: assetAccount, error: assetErr } = await admin
      .from("chart_of_accounts")
      .insert({
        organization_id: orgId,
        code: `CONC-ASSET-${runSuffix}`,
        name_ar: "مقاصة",
        name_en: "Clearing",
        category: "ASSET",
        normal_balance: "DEBIT",
        is_group: false,
        is_active: true,
      })
      .select("id")
      .single();
    expect(assetErr).toBeNull();
    const assetAccountId = assetAccount!.id;

    const { data: receivableAccount, error: receivableErr } = await admin
      .from("chart_of_accounts")
      .insert({
        organization_id: orgId,
        code: `CONC-RECV-${runSuffix}`,
        name_ar: "ذمم",
        name_en: "Receivable",
        category: "ASSET",
        normal_balance: "DEBIT",
        is_group: false,
        is_active: true,
      })
      .select("id")
      .single();
    expect(receivableErr).toBeNull();
    const receivableAccountId = receivableAccount!.id;

    const { error: settingsErr } = await admin
      .from("organization_finance_settings")
      .insert({ organization_id: orgId, resort_id: resortId, online_payments_clearing_account_id: assetAccountId });
    expect(settingsErr).toBeNull();

    const { data: dueType, error: dueTypeErr } = await admin
      .from("due_types")
      .insert({ organization_id: orgId, name_ar: "اشتراك", name_en: "Dues", default_revenue_account_id: receivableAccountId })
      .select("id")
      .single();
    expect(dueTypeErr).toBeNull();
    const dueTypeId = dueType!.id;

    const { data: unit, error: unitErr } = await admin
      .from("units")
      .insert({ organization_id: orgId, property_id: resortId, code: `CONC-U1-${runSuffix}`, unit_type: "VILLA" })
      .select("id")
      .single();
    expect(unitErr).toBeNull();
    const unitId = unit!.id;

    const { data: member, error: memberErr } = await admin
      .from("members")
      .insert({ organization_id: orgId, full_name: "Concurrency Test Owner" })
      .select("id")
      .single();
    expect(memberErr).toBeNull();
    const memberId = member!.id;

    const { error: ownershipErr } = await admin
      .from("unit_ownerships")
      .insert({ organization_id: orgId, unit_id: unitId, member_id: memberId });
    expect(ownershipErr).toBeNull();

    const { data: due, error: dueErr } = await admin
      .from("dues")
      .insert({
        organization_id: orgId,
        resort_id: resortId,
        unit_id: unitId,
        due_type_id: dueTypeId,
        receivable_account_id: receivableAccountId,
        amount: 1000,
        issue_date: today,
        due_date: today,
        status: "ISSUED",
      })
      .select("id")
      .single();
    expect(dueErr).toBeNull();
    const dueId = due!.id;

    const { data: transaction, error: txnErr } = await admin
      .from("online_payment_transactions")
      .insert({
        organization_id: orgId,
        resort_id: resortId,
        member_id: memberId,
        client_request_id: `conc-${runSuffix}`,
        provider: "PAYMOB",
        amount: 1000,
        expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      })
      .select("id")
      .single();
    expect(txnErr).toBeNull();
    transactionId = transaction!.id;

    const { error: allocErr } = await admin
      .from("online_payment_transaction_allocations")
      .insert({ transaction_id: transactionId, due_id: dueId, amount: 1000 });
    expect(allocErr).toBeNull();
  }, 45000);

  it("only one of two concurrent calls creates a payment", async () => {
    const clientA = createClient(url, serviceKey, { auth: { persistSession: false } });
    const clientB = createClient(url, serviceKey, { auth: { persistSession: false } });

    // webhook_event_id is unique per (provider, webhook_event_id) GLOBALLY
    // (idx_online_txn_webhook_event has no org scoping -- by design, so a
    // provider's webhook event id can never be replayed cross-tenant), so
    // these must be unique per test run, not the plan's literal
    // "concurrent-a"/"concurrent-b" (confirmed live: those collide with a
    // previous run's rows and fail with 23505 on a re-run).
    //
    // Promise.all fires both requests without awaiting either first, and the
    // function does substantial work between acquiring the row lock and
    // committing (clearing-account lookup, fiscal-period lookup, per-due
    // locking), so true overlap in the database is empirically very likely
    // -- but Promise.all alone doesn't structurally guarantee simultaneous
    // execution; treat this as strong evidence, not deterministic proof, of
    // the locking behavior.
    type RecordOnlinePaymentResult = {
      status: string;
      payment_id: string | null;
      failure_code: string | null;
      failure_message: string | null;
    };
    const [resultA, resultB] = await Promise.all([
      clientA
        .rpc("record_online_payment", { p_transaction_id: transactionId, p_webhook_event_id: `concurrent-a-${runSuffix}` })
        .returns<RecordOnlinePaymentResult[]>()
        .single(),
      clientB
        .rpc("record_online_payment", { p_transaction_id: transactionId, p_webhook_event_id: `concurrent-b-${runSuffix}` })
        .returns<RecordOnlinePaymentResult[]>()
        .single(),
    ]);

    expect(resultA.error).toBeNull();
    expect(resultB.error).toBeNull();
    expect(resultA.data?.status).toBe("PAID");
    expect(resultB.data?.status).toBe("PAID");
    expect(resultA.data?.payment_id).toBe(resultB.data?.payment_id);

    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
    const { count } = await admin
      .from("payments")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .eq("method", "ONLINE");
    expect(count).toBe(1);
  }, 30000);

  afterAll(async () => {
    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
    // Do NOT hard-delete: this test posts a real payment, which flips the
    // deposit chart_of_accounts row's is_used to true and trips the
    // COA_USED_DELETE_FORBIDDEN trigger on any cascade that would delete
    // it (Task 5's pgTAP suite hit this exact issue and switched to
    // archiving for the same reason -- see
    // supabase/tests/phase_owner_portal_record_online_payment.sql's
    // cleanup comment). Archive instead, matching that established
    // pattern.
    const res = await admin.rpc("set_organization_status", {
      p_organization_id: orgId,
      p_status: "ARCHIVED",
      p_reason: "test cleanup",
    });
    if (res.error) {
      // set_organization_status self-gates on is_platform_admin(auth.uid()),
      // which is null under the service-role client (no auth.uid()) --
      // same issue this repo's e2e specs already worked around (see
      // tests/e2e/owner-portal-invite.spec.ts's cleanup comment). Fall
      // back to a direct status update, which the service-role client
      // can always do since it bypasses RLS.
      await admin.from("organizations").update({ status: "ARCHIVED" }).eq("id", orgId);
    }
  });
});
