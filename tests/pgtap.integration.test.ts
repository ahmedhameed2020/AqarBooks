import { describe, it, expect, beforeAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });

describe("Supabase pgTAP & Database SQL Integrity Suite", () => {
  let admin: SupabaseClient;

  beforeAll(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  });

  it("1. Phase 3 Journal Integrity (Unbalanced entry rejection & posted immutability)", async () => {
    const { data: org, error: orgErr } = await admin
      .from("organizations")
      .insert({
        name: "pgTAP Phase3 Org",
        slug: `pgtap-phase3-${Date.now()}`,
        default_currency: "EGP",
        status: "ACTIVE",
      })
      .select("id")
      .single();

    expect(orgErr).toBeNull();
    const orgId = org!.id;

    // NOTE: chart-of-accounts provisioning does NOT use the
    // clone_chart_of_accounts_template RPC here, for the same reason the
    // fiscal-year fixtures below skip create_fiscal_year: the function
    // checks has_permission(auth.uid(), ..., 'finance.accounts.manage') and
    // auth.uid() is always null under a service-role JWT, so it always
    // raises 42501 under this test's `admin` client (verified against
    // supabase/migrations/20260813000004_fix_coa_clone_template_safe_delete.sql).
    // The original code never surfaced this because the RPC's error went
    // unchecked and cashAcc/revAcc were only ever dereferenced inside the
    // (also-always-false) `if (period)` guard. Inserting the two accounts
    // this test actually needs (cash 1110, revenue 4100, matching
    // RESORT_STANDARD's category/normal_balance) directly instead.
    const { data: cashAcc, error: cashErr } = await admin
      .from("chart_of_accounts")
      .insert({
        organization_id: orgId,
        code: "1110",
        name_ar: "الصندوق",
        name_en: "Cash on Hand",
        category: "ASSET",
        normal_balance: "DEBIT",
        is_group: false,
        is_active: true,
      })
      .select("id")
      .single();
    expect(cashErr).toBeNull();

    const { data: revAcc, error: revErr } = await admin
      .from("chart_of_accounts")
      .insert({
        organization_id: orgId,
        code: "4100",
        name_ar: "إيرادات اشتراكات الصيانة",
        name_en: "Maintenance Fee Revenue",
        category: "REVENUE",
        normal_balance: "CREDIT",
        is_group: false,
        is_active: true,
      })
      .select("id")
      .single();
    expect(revErr).toBeNull();

    // NOTE: fiscal year / period fixture provisioning does NOT use the
    // create_fiscal_year / set_fiscal_period_status RPCs here. Those RPCs
    // check has_permission(auth.uid(), ...), and auth.uid() is always null
    // under a service-role JWT (no `sub` claim), so they raise 42501 "not
    // authorized" every time under this test's `admin` client. Inserting
    // directly into fiscal_years/fiscal_periods with status: 'OPEN' bypasses
    // that RPC-level permission check the way a service-role client
    // legitimately can (RLS/function auth checks don't apply to a
    // service-role client's own direct table writes) -- same pattern used by
    // tests/record-online-payment-concurrency.integration.test.ts's beforeAll.
    const { data: fiscalYear, error: yearErr } = await admin
      .from("fiscal_years")
      .insert({
        organization_id: orgId,
        name: "2026",
        start_date: "2026-01-01",
        end_date: "2026-12-31",
        status: "OPEN",
      })
      .select("id")
      .single();
    expect(yearErr).toBeNull();

    const { data: period, error: periodErr } = await admin
      .from("fiscal_periods")
      .insert({
        organization_id: orgId,
        fiscal_year_id: fiscalYear!.id,
        period_number: 1,
        name: "2026 — Full Year",
        start_date: "2026-01-01",
        end_date: "2026-12-31",
        status: "OPEN",
      })
      .select("id")
      .single();
    expect(periodErr).toBeNull();

    // NOTE: this calls create_journal_entry_internal / post_journal_entry_internal
    // instead of the public create_journal_entry / post_journal_entry RPCs, for
    // two compounding reasons verified empirically against this DB:
    //  1. The public create_journal_entry RPC does its own
    //     has_permission(auth.uid(), ..., 'finance.entries.create') check (see
    //     supabase/migrations/20260813000005_payment_posting_permission_fix_and_overload_cleanup.sql),
    //     which -- same root cause as the fiscal-year RPC bug above -- always
    //     fails under a service-role JWT (auth.uid() is null), raising 42501
    //     FORBIDDEN_FINANCE_PERMISSION regardless of whether the lines balance.
    //     Calling create_journal_entry with unbalanced lines and asserting
    //     `error).toBeDefined()` therefore "passed" for the wrong reason: a
    //     permission rejection, not a balance rejection -- a *balanced* entry
    //     would have failed the exact same way, which the test never checked.
    //  2. Per supabase/migrations/20260810000017_journal_engine.sql's own design
    //     comment, balance is validated only at POST time, not at create time
    //     ("a DRAFT is allowed to be incomplete/unbalanced work in progress") --
    //     so even with permissions fixed, create_journal_entry itself would never
    //     reject an unbalanced entry; only post_journal_entry does.
    // The *_internal functions have no permission check (they're the primitives
    // record_payment uses internally, per that same migration) but still run the
    // real balance validation, so they're the only way a service-role client can
    // exercise the actual "unbalanced entry rejection" rule this test is named for.
    const { data: draftEntryId, error: draftErr } = await admin.rpc("create_journal_entry_internal", {
      p_organization_id: orgId,
      p_resort_id: null,
      p_fiscal_period_id: period!.id,
      p_entry_date: "2026-01-15",
      p_description: "Unbalanced test",
      p_source_type: "JOURNAL_VOUCHER",
      p_lines: [
        { account_id: cashAcc!.id, debit: 100, credit: 0 },
        { account_id: revAcc!.id, debit: 0, credit: 50 },
      ],
      p_idempotency_key: `pgtap-unbal-${Date.now()}`,
    });
    expect(draftErr).toBeNull(); // DRAFT creation itself is allowed to be unbalanced

    // Posting the unbalanced DRAFT must fail.
    const { error: unbalErr } = await admin.rpc("post_journal_entry_internal", {
      p_journal_entry_id: draftEntryId,
    });

    expect(unbalErr).toBeDefined();
    expect(unbalErr?.message).toMatch(/unbalanced entry/i);

    // Archive test org
    await admin.from("organizations").update({ status: "ARCHIVED" }).eq("id", orgId);
  });

  it("2. Phase 4 Receivables & Waterfall Integrity", async () => {
    const { data: org } = await admin
      .from("organizations")
      .insert({
        name: "pgTAP Phase4 Org",
        slug: `pgtap-phase4-${Date.now()}`,
        default_currency: "EGP",
        status: "ACTIVE",
      })
      .select("id")
      .single();

    expect(org?.id).toBeDefined();
    await admin.from("organizations").update({ status: "ARCHIVED" }).eq("id", org!.id);
  });

  it("3. Phase 5 Treasury & Bank Reconciliations Integrity", async () => {
    const { data: org } = await admin
      .from("organizations")
      .insert({
        name: "pgTAP Phase5 Org",
        slug: `pgtap-phase5-${Date.now()}`,
        default_currency: "EGP",
        status: "ACTIVE",
      })
      .select("id")
      .single();

    expect(org?.id).toBeDefined();
    await admin.from("organizations").update({ status: "ARCHIVED" }).eq("id", org!.id);
  });

  it("4. Phase 6 Purchasing & Suppliers Integrity", async () => {
    const { data: org } = await admin
      .from("organizations")
      .insert({
        name: "pgTAP Phase6 Org",
        slug: `pgtap-phase6-${Date.now()}`,
        default_currency: "EGP",
        status: "ACTIVE",
      })
      .select("id")
      .single();

    expect(org?.id).toBeDefined();
    await admin.from("organizations").update({ status: "ARCHIVED" }).eq("id", org!.id);
  });

  it("5. Phase 7 Financial Reports & Audit Chain Integrity", async () => {
    const { data: org } = await admin
      .from("organizations")
      .insert({
        name: "pgTAP Phase7 Org",
        slug: `pgtap-phase7-${Date.now()}`,
        default_currency: "EGP",
        status: "ACTIVE",
      })
      .select("id")
      .single();

    expect(org?.id).toBeDefined();
    await admin.from("organizations").update({ status: "ARCHIVED" }).eq("id", org!.id);
  });

  it("6. Phase 1 Property-Type Classifier Integrity (default + constraint)", async () => {
    const { data: org } = await admin
      .from("organizations")
      .insert({
        name: "pgTAP PropertyType Org",
        slug: `pgtap-property-type-${Date.now()}`,
        default_currency: "EGP",
        status: "ACTIVE",
      })
      .select("id")
      .single();

    expect(org?.id).toBeDefined();
    const orgId = org!.id;

    // Default: inserting a resort without property_type defaults to 'resort'.
    const { data: defaultResort, error: defaultErr } = await admin
      .from("resorts")
      .insert({
        organization_id: orgId,
        name: "PropertyType Default Resort",
        code: `PT-DEFAULT-${Date.now()}`,
      })
      .select("property_type")
      .single();

    expect(defaultErr).toBeNull();
    expect(defaultResort?.property_type).toBe("resort");

    // Explicit valid value is accepted.
    const { data: buildingResort, error: buildingErr } = await admin
      .from("resorts")
      .insert({
        organization_id: orgId,
        name: "PropertyType Building",
        code: `PT-BUILDING-${Date.now()}`,
        property_type: "building",
      })
      .select("property_type")
      .single();

    expect(buildingErr).toBeNull();
    expect(buildingResort?.property_type).toBe("building");

    // Invalid value is rejected by the check constraint.
    const { error: invalidErr } = await admin.from("resorts").insert({
      organization_id: orgId,
      name: "PropertyType Invalid",
      code: `PT-INVALID-${Date.now()}`,
      property_type: "spaceship",
    });

    expect(invalidErr).not.toBeNull();
    expect(invalidErr?.message).toMatch(/resorts_property_type_check/);

    await admin.from("organizations").update({ status: "ARCHIVED" }).eq("id", orgId);
  });
});
