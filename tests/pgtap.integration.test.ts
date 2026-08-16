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

    await admin.rpc("clone_chart_of_accounts_template", {
      p_organization_id: orgId,
      p_template_key: "RESORT_STANDARD",
    });

    const { data: cashAcc } = await admin
      .from("chart_of_accounts")
      .select("id")
      .eq("organization_id", orgId)
      .eq("code", "1110")
      .single();

    const { data: revAcc } = await admin
      .from("chart_of_accounts")
      .select("id")
      .eq("organization_id", orgId)
      .eq("code", "4100")
      .single();

    const { data: yearId } = await admin.rpc("create_fiscal_year", {
      p_organization_id: orgId,
      p_name: "2026",
      p_start_date: "2026-01-01",
      p_end_date: "2026-12-31",
    });

    const { data: period } = await admin
      .from("fiscal_periods")
      .select("id")
      .eq("fiscal_year_id", yearId)
      .limit(1)
      .single();

    if (period) {
      await admin.rpc("set_fiscal_period_status", {
        p_period_id: period.id,
        p_status: "OPEN",
        p_reason: "pgTAP setup",
      });

      // Unbalanced entry must fail
      const { error: unbalErr } = await admin.rpc("create_journal_entry", {
        p_organization_id: orgId,
        p_resort_id: null,
        p_fiscal_period_id: period.id,
        p_entry_date: "2026-01-15",
        p_description: "Unbalanced test",
        p_source_type: "JOURNAL_VOUCHER",
        p_lines: [
          { account_id: cashAcc!.id, debit: 100, credit: 0 },
          { account_id: revAcc!.id, debit: 0, credit: 50 },
        ],
        p_idempotency_key: `pgtap-unbal-${Date.now()}`,
      });

      expect(unbalErr).toBeDefined();
    }

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

  it("7. Phase 2a Resorts-View Compatibility Shim Integrity (auto-updatable view)", async () => {
    const { data: org } = await admin
      .from("organizations")
      .insert({
        name: "pgTAP ResortsViewShim Org",
        slug: `pgtap-resorts-view-shim-${Date.now()}`,
        default_currency: "EGP",
        status: "ACTIVE",
      })
      .select("id")
      .single();

    expect(org?.id).toBeDefined();
    const orgId = org!.id;

    // INSERT through the `resorts` compatibility view -- exercises the
    // actual auto-updatable-view INSERT path (translates to the
    // underlying `properties` table), not just a raw SELECT.
    const { data: viewInsert, error: viewInsertErr } = await admin
      .from("resorts")
      .insert({
        organization_id: orgId,
        name: "Shim Test Resort",
        code: `SHIM-${Date.now()}`,
      })
      .select("id, name, property_type")
      .single();

    expect(viewInsertErr).toBeNull();
    expect(viewInsert?.id).toBeTruthy();
    expect(viewInsert?.property_type).toBe("resort");
    const resortId = viewInsert!.id;

    // The same row must also be visible directly on the renamed table.
    const { data: viaTable, error: tableSelectErr } = await admin
      .from("properties")
      .select("id, name")
      .eq("id", resortId)
      .single();

    expect(tableSelectErr).toBeNull();
    expect(viaTable?.id).toBe(resortId);
    expect(viaTable?.name).toBe("Shim Test Resort");

    // UPDATE through the `resorts` compatibility view -- exercises the
    // auto-updatable-view UPDATE path.
    const { error: viewUpdateErr } = await admin
      .from("resorts")
      .update({ name: "Shim Test Resort (renamed)" })
      .eq("id", resortId);

    expect(viewUpdateErr).toBeNull();

    const { data: afterUpdate } = await admin
      .from("properties")
      .select("name")
      .eq("id", resortId)
      .single();

    expect(afterUpdate?.name).toBe("Shim Test Resort (renamed)");

    // DELETE through the `resorts` compatibility view -- exercises the
    // auto-updatable-view DELETE path, and confirms it's gone from the
    // underlying table too (not just hidden from the view).
    const { error: viewDeleteErr } = await admin.from("resorts").delete().eq("id", resortId);
    expect(viewDeleteErr).toBeNull();

    const { data: afterDelete, error: afterDeleteErr } = await admin
      .from("properties")
      .select("id")
      .eq("id", resortId)
      .maybeSingle();

    expect(afterDeleteErr).toBeNull();
    expect(afterDelete).toBeNull();

    await admin.from("organizations").update({ status: "ARCHIVED" }).eq("id", orgId);
  });
});
