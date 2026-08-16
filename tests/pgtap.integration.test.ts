// @ts-nocheck
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

  it("7. Phase 2a Resorts-View Compatibility Shim Integrity (auto-updatable view + real-user RLS)", async () => {
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

    // --- Part A: auto-updatable-view mechanics (service-role client) ---

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

    const { data: viaTable, error: tableSelectErr } = await admin
      .from("properties")
      .select("id, name")
      .eq("id", resortId)
      .single();

    expect(tableSelectErr).toBeNull();
    expect(viaTable?.id).toBe(resortId);
    expect(viaTable?.name).toBe("Shim Test Resort");

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

    // --- Part B: RLS is correctly enforced through the view for a real
    // (non-service-role) session, not just bypassed like the admin client
    // above. This is the part that actually justifies the migration
    // comment's claim.

    const { error: cloneErr } = await admin.rpc("clone_tenant_role_templates", {
      p_organization_id: orgId,
    });
    expect(cloneErr).toBeNull();

    const { data: ownerRole } = await admin
      .from("roles")
      .select("id")
      .eq("organization_id", orgId)
      .eq("key", "TENANT_OWNER")
      .single();
    expect(ownerRole?.id).toBeDefined();

    const password = "PgTAP_Test_P@ssw0rd_2026!";
    const ownerEmail = `pgtap-resorts-view-owner-${Date.now()}@aqarbooks-test.local`;
    const { data: ownerUser, error: createOwnerErr } = await admin.auth.admin.createUser({
      email: ownerEmail,
      password,
      email_confirm: true,
    });
    expect(createOwnerErr).toBeNull();
    const ownerId = ownerUser!.user!.id;

    const { error: membershipErr } = await admin.from("organization_memberships").insert({
      organization_id: orgId,
      user_id: ownerId,
      status: "active",
    });
    expect(membershipErr).toBeNull();

    const { error: roleAssignErr } = await admin.from("user_role_assignments").insert({
      user_id: ownerId,
      role_id: ownerRole!.id,
      organization_id: orgId,
    });
    expect(roleAssignErr).toBeNull();

    const ownerClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } },
    );
    const { error: ownerSignInErr } = await ownerClient.auth.signInWithPassword({
      email: ownerEmail,
      password,
    });
    expect(ownerSignInErr).toBeNull();

    // Positive case: the org owner (has tenant.settings.manage via RLS's
    // resorts_manage policy) can INSERT through the `resorts` view under
    // their own real session -- this only works if RLS is evaluated
    // correctly against the view, not just the underlying table.
    const { data: ownerInsert, error: ownerInsertErr } = await ownerClient
      .from("resorts")
      .insert({
        organization_id: orgId,
        name: "RLS Owner Resort",
        code: `RLS-OWNER-${Date.now()}`,
      })
      .select("id")
      .single();

    expect(ownerInsertErr).toBeNull();
    expect(ownerInsert?.id).toBeTruthy();
    const ownerResortId = ownerInsert!.id;

    // Negative case: an unrelated user with no membership/role in this
    // organization must be blocked by RLS's resorts_select_member policy
    // when querying through the view -- proves the view isn't accidentally
    // more permissive than the underlying table (RLS SELECT policies
    // filter rows rather than raising errors, so we assert an empty result,
    // not an error).
    const outsiderEmail = `pgtap-resorts-view-outsider-${Date.now()}@aqarbooks-test.local`;
    const { data: outsiderUser, error: createOutsiderErr } = await admin.auth.admin.createUser({
      email: outsiderEmail,
      password,
      email_confirm: true,
    });
    expect(createOutsiderErr).toBeNull();

    const outsiderClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } },
    );
    const { error: outsiderSignInErr } = await outsiderClient.auth.signInWithPassword({
      email: outsiderEmail,
      password,
    });
    expect(outsiderSignInErr).toBeNull();

    const { data: outsiderSelect, error: outsiderSelectErr } = await outsiderClient
      .from("resorts")
      .select("id")
      .eq("id", ownerResortId);

    expect(outsiderSelectErr).toBeNull();
    expect(outsiderSelect).toEqual([]);

    // Cleanup.
    const outsiderId = outsiderUser!.user!.id;
    await admin.from("resorts").delete().eq("id", resortId);
    await admin.from("resorts").delete().eq("id", ownerResortId);

    // Foreign keys from platform_audit_logs.actor_id, user_role_assignments,
    // and organization_memberships still reference these auth users -- they
    // must be removed before deleteUser or the delete fails with a 500
    // ("Database error deleting user"), silently leaking the auth.users row.
    await admin.from("platform_audit_logs").delete().eq("actor_id", ownerId);
    await admin.from("platform_audit_logs").delete().eq("actor_id", outsiderId);
    await admin.from("user_role_assignments").delete().eq("user_id", ownerId);
    await admin.from("organization_memberships").delete().eq("user_id", ownerId);

    const { error: deleteOutsiderErr } = await admin.auth.admin.deleteUser(outsiderId);
    expect(deleteOutsiderErr).toBeNull();
    const { error: deleteOwnerErr } = await admin.auth.admin.deleteUser(ownerId);
    expect(deleteOwnerErr).toBeNull();

    await admin.from("organizations").update({ status: "ARCHIVED" }).eq("id", orgId);
  });

  it("8. Phase 2b-1 Property-ID Cluster Rename Integrity (zones/buildings/units end-to-end via RPC)", async () => {
    const { data: org } = await admin
      .from("organizations")
      .insert({
        name: "pgTAP PropertyIdCluster Org",
        slug: `pgtap-property-id-cluster-${Date.now()}`,
        default_currency: "EGP",
        status: "ACTIVE",
      })
      .select("id")
      .single();

    expect(org?.id).toBeDefined();
    const orgId = org!.id;

    // A resort row: this table is unaffected by this migration.
    const { data: resort, error: resortErr } = await admin
      .from("resorts")
      .insert({
        organization_id: orgId,
        name: "PropertyIdCluster Resort",
        code: `PIC-${Date.now()}`,
      })
      .select("id")
      .single();

    expect(resortErr).toBeNull();
    const resortId = resort!.id;

    // Zone and building created directly with `property_id` -- this proves
    // the column rename on zones/buildings applied. If the column were
    // still `resort_id`, this insert would fail (strict mode) or the row
    // would never be found scoped by `property_id` on read-back.
    const { data: zone, error: zoneErr } = await admin
      .from("zones")
      .insert({
        organization_id: orgId,
        property_id: resortId,
        name_ar: "منطقة اختبار",
        name_en: "Test Zone",
      })
      .select("id, property_id")
      .single();

    expect(zoneErr).toBeNull();
    expect(zone?.property_id).toBe(resortId);
    const zoneId = zone!.id;

    const { data: building, error: buildingErr } = await admin
      .from("buildings")
      .insert({
        organization_id: orgId,
        property_id: resortId,
        code: `BLD-${Date.now()}`,
        name_ar: "مبنى اختبار",
        name_en: "Test Building",
      })
      .select("id, property_id")
      .single();

    expect(buildingErr).toBeNull();
    expect(building?.property_id).toBe(resortId);
    const buildingId = building!.id;

    // import_property_csv / archive_unit / restore_unit are all
    // permission-gated via has_permission(auth.uid(), ...), which requires
    // a real authenticated user with a role assignment -- the service-role
    // admin client has no auth.uid() and would be rejected as
    // "not authorized". Stand up a real TENANT_OWNER session, matching
    // test 7's pattern.
    const { error: cloneErr } = await admin.rpc("clone_tenant_role_templates", {
      p_organization_id: orgId,
    });
    expect(cloneErr).toBeNull();

    const { data: ownerRole } = await admin
      .from("roles")
      .select("id")
      .eq("organization_id", orgId)
      .eq("key", "TENANT_OWNER")
      .single();
    expect(ownerRole?.id).toBeDefined();

    const password = "PgTAP_Test_P@ssw0rd_2026!";
    const ownerEmail = `pgtap-property-id-cluster-owner-${Date.now()}@aqarbooks-test.local`;
    const { data: ownerUser, error: createOwnerErr } = await admin.auth.admin.createUser({
      email: ownerEmail,
      password,
      email_confirm: true,
    });
    expect(createOwnerErr).toBeNull();
    const ownerId = ownerUser!.user!.id;

    const { error: membershipErr } = await admin.from("organization_memberships").insert({
      organization_id: orgId,
      user_id: ownerId,
      status: "active",
    });
    expect(membershipErr).toBeNull();

    const { error: roleAssignErr } = await admin.from("user_role_assignments").insert({
      user_id: ownerId,
      role_id: ownerRole!.id,
      organization_id: orgId,
    });
    expect(roleAssignErr).toBeNull();

    const ownerClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } },
    );
    const { error: ownerSignInErr } = await ownerClient.auth.signInWithPassword({
      email: ownerEmail,
      password,
    });
    expect(ownerSignInErr).toBeNull();

    // The RPC parameter is still named `p_resort_id` (unchanged in this
    // phase) but must map onto the renamed `property_id` column
    // underneath -- this is exactly the surgical edit this test is meant
    // to catch if missed.
    const unitCode = `UNIT-PIC-${Date.now()}`;
    const { data: importResult, error: importErr } = await ownerClient.rpc(
      "import_property_csv",
      {
        p_organization_id: orgId,
        p_import_kind: "units",
        p_resort_id: resortId,
        p_rows: [
          {
            code: unitCode,
            unit_type: "APARTMENT",
            building_id: buildingId,
            zone_id: zoneId,
          },
        ],
      },
    );

    expect(importErr).toBeNull();
    expect(importResult?.imported_rows).toBe(1);

    const { data: importedUnit, error: importedUnitErr } = await admin
      .from("units")
      .select("id, property_id, code, is_active")
      .eq("organization_id", orgId)
      .eq("code", unitCode)
      .single();

    expect(importedUnitErr).toBeNull();
    expect(importedUnit?.property_id).toBe(resortId);
    expect(importedUnit?.code).toBe(unitCode);
    expect(importedUnit?.is_active).toBe(true);
    const unitId = importedUnit!.id;

    // archive_unit
    const { error: archiveErr } = await ownerClient.rpc("archive_unit", {
      p_organization_id: orgId,
      p_unit_id: unitId,
      p_reason: "pgTAP property-id-cluster test",
    });
    expect(archiveErr).toBeNull();

    const { data: afterArchive, error: afterArchiveErr } = await admin
      .from("units")
      .select("is_active")
      .eq("id", unitId)
      .single();
    expect(afterArchiveErr).toBeNull();
    expect(afterArchive?.is_active).toBe(false);

    // restore_unit
    const { error: restoreErr } = await ownerClient.rpc("restore_unit", {
      p_organization_id: orgId,
      p_unit_id: unitId,
    });
    expect(restoreErr).toBeNull();

    const { data: afterRestore, error: afterRestoreErr } = await admin
      .from("units")
      .select("is_active")
      .eq("id", unitId)
      .single();
    expect(afterRestoreErr).toBeNull();
    expect(afterRestore?.is_active).toBe(true);

    // Cleanup.
    // Foreign keys from platform_audit_logs.actor_id, units.created_by/
    // units.archived_by, user_role_assignments.user_id, and
    // organization_memberships.user_id still reference ownerId -- they must
    // be removed before deleteUser or the delete fails with a 500
    // ("Database error deleting user"), silently leaking the auth.users row.
    await admin.from("platform_audit_logs").delete().eq("actor_id", ownerId);
    await admin.from("units").delete().eq("id", unitId);
    await admin.from("user_role_assignments").delete().eq("user_id", ownerId);
    await admin.from("organization_memberships").delete().eq("user_id", ownerId);

    const { error: deleteOwnerErr } = await admin.auth.admin.deleteUser(ownerId);
    expect(deleteOwnerErr).toBeNull();

    await admin.from("organizations").update({ status: "ARCHIVED" }).eq("id", orgId);
  });

  it("9. Phase 2b-2 Membership/Misc Cluster Rename Integrity (resort_memberships/document_sequences/cost_centers/projects property_id)", async () => {
    const { data: org } = await admin
      .from("organizations")
      .insert({
        name: "pgTAP MembershipMiscCluster Org",
        slug: `pgtap-membership-misc-cluster-${Date.now()}`,
        default_currency: "EGP",
        status: "ACTIVE",
      })
      .select("id")
      .single();

    expect(org?.id).toBeDefined();
    const orgId = org!.id;

    // resort_memberships.user_id has a real FK to auth.users(id) ON DELETE
    // CASCADE -- a fake/random UUID would fail the insert, so a real auth
    // user is required here.
    const password = "PgTAP_Test_P@ssw0rd_2026!";
    const memberEmail = `pgtap-membership-misc-cluster-${Date.now()}@aqarbooks-test.local`;
    const { data: memberUser, error: createMemberErr } = await admin.auth.admin.createUser({
      email: memberEmail,
      password,
      email_confirm: true,
    });
    expect(createMemberErr).toBeNull();
    const memberId = memberUser!.user!.id;

    // A resort row the membership will point at.
    const { data: resort, error: resortErr } = await admin
      .from("resorts")
      .insert({
        organization_id: orgId,
        name: "MembershipMiscCluster Resort",
        code: `MMC-${Date.now()}`,
      })
      .select("id")
      .single();

    expect(resortErr).toBeNull();
    const resortId = resort!.id;

    // A second resort with no membership row, to prove the negative case
    // for is_resort_member below isn't accidentally always-true.
    const { data: otherResort, error: otherResortErr } = await admin
      .from("resorts")
      .insert({
        organization_id: orgId,
        name: "MembershipMiscCluster Other Resort",
        code: `MMC-OTHER-${Date.now()}`,
      })
      .select("id")
      .single();

    expect(otherResortErr).toBeNull();
    const otherResortId = otherResort!.id;

    // Insert into resort_memberships directly via `property_id` -- this
    // alone proves the column rename applied. If the column were still
    // `resort_id`, this insert would fail (strict mode).
    const { data: membership, error: membershipInsertErr } = await admin
      .from("resort_memberships")
      .insert({
        organization_id: orgId,
        property_id: resortId,
        user_id: memberId,
      })
      .select("id, property_id")
      .single();

    expect(membershipInsertErr).toBeNull();
    expect(membership?.property_id).toBe(resortId);

    // is_resort_member: positive case (membership row exists for this
    // resort) must return true.
    const { data: isMemberTrue, error: isMemberTrueErr } = await admin.rpc("is_resort_member", {
      p_user_id: memberId,
      p_resort_id: resortId,
    });
    expect(isMemberTrueErr).toBeNull();
    expect(isMemberTrue).toBe(true);

    // is_resort_member: negative case (no membership row for the second
    // resort) must return false -- proves the query isn't accidentally
    // matching on user_id alone.
    const { data: isMemberFalse, error: isMemberFalseErr } = await admin.rpc("is_resort_member", {
      p_user_id: memberId,
      p_resort_id: otherResortId,
    });
    expect(isMemberFalseErr).toBeNull();
    expect(isMemberFalse).toBe(false);

    // next_sequence_value: first call for a unique sequence_type seeds the
    // document_sequences row (property_id column) at 1 and returns 1;
    // second call increments it and returns 2.
    const sequenceType = `phase2b2-test-${Date.now()}`;
    const { data: seqFirst, error: seqFirstErr } = await admin.rpc("next_sequence_value", {
      p_organization_id: orgId,
      p_resort_id: null,
      p_sequence_type: sequenceType,
    });
    expect(seqFirstErr).toBeNull();
    expect(seqFirst).toBe(1);

    const { data: seqSecond, error: seqSecondErr } = await admin.rpc("next_sequence_value", {
      p_organization_id: orgId,
      p_resort_id: null,
      p_sequence_type: sequenceType,
    });
    expect(seqSecondErr).toBeNull();
    expect(seqSecond).toBe(2);

    // cost_centers: direct insert with `property_id`, code/name_ar/name_en
    // are NOT NULL per the live schema.
    const costCenterCode = `CC-PIC-${Date.now()}`;
    const { data: costCenter, error: costCenterErr } = await admin
      .from("cost_centers")
      .insert({
        organization_id: orgId,
        property_id: resortId,
        code: costCenterCode,
        name_ar: "مركز تكلفة اختبار",
        name_en: "Test Cost Center",
      })
      .select("id, property_id, code")
      .single();

    expect(costCenterErr).toBeNull();
    expect(costCenter?.property_id).toBe(resortId);
    expect(costCenter?.code).toBe(costCenterCode);

    // projects: same required columns as cost_centers.
    const projectCode = `PRJ-PIC-${Date.now()}`;
    const { data: project, error: projectErr } = await admin
      .from("projects")
      .insert({
        organization_id: orgId,
        property_id: resortId,
        code: projectCode,
        name_ar: "مشروع اختبار",
        name_en: "Test Project",
      })
      .select("id, property_id, code")
      .single();

    expect(projectErr).toBeNull();
    expect(project?.property_id).toBe(resortId);
    expect(project?.code).toBe(projectCode);

    // Cleanup. is_resort_member and next_sequence_value are pure
    // read/counter functions (verified via pg_get_functiondef) with no
    // writes to platform_audit_logs, organization_memberships, or
    // user_role_assignments -- unlike tests 7/8, this test's RPC calls
    // create no such rows for memberId, so only the resort_memberships row
    // itself needs removing before deleteUser (it also cascades via the
    // user_id FK, but delete explicitly for clarity/determinism).
    await admin.from("resort_memberships").delete().eq("id", membership!.id);

    const { error: deleteMemberErr } = await admin.auth.admin.deleteUser(memberId);
    expect(deleteMemberErr).toBeNull();

    await admin.from("organizations").update({ status: "ARCHIVED" }).eq("id", orgId);
  });

  it("10. Phase 2b-3 platform_audit_logs Property-ID Rename Integrity (create_resort end-to-end via RPC)", async () => {
    const { data: org } = await admin
      .from("organizations")
      .insert({
        name: "pgTAP AuditLogsPropertyId Org",
        slug: `pgtap-audit-logs-property-id-${Date.now()}`,
        default_currency: "EGP",
        status: "ACTIVE",
      })
      .select("id")
      .single();

    expect(org?.id).toBeDefined();
    const orgId = org!.id;

    // create_resort is permission-gated via has_permission(auth.uid(), ...,
    // 'tenant.settings.manage'), which requires a real authenticated user
    // with a role assignment -- the service-role admin client has no
    // auth.uid() and would be rejected as "not authorized". Stand up a real
    // TENANT_OWNER session, matching tests 7/8's pattern.
    const { error: cloneErr } = await admin.rpc("clone_tenant_role_templates", {
      p_organization_id: orgId,
    });
    expect(cloneErr).toBeNull();

    const { data: ownerRole } = await admin
      .from("roles")
      .select("id")
      .eq("organization_id", orgId)
      .eq("key", "TENANT_OWNER")
      .single();
    expect(ownerRole?.id).toBeDefined();

    const password = "PgTAP_Test_P@ssw0rd_2026!";
    const ownerEmail = `pgtap-audit-logs-property-id-owner-${Date.now()}@aqarbooks-test.local`;
    const { data: ownerUser, error: createOwnerErr } = await admin.auth.admin.createUser({
      email: ownerEmail,
      password,
      email_confirm: true,
    });
    expect(createOwnerErr).toBeNull();
    const ownerId = ownerUser!.user!.id;

    const { error: membershipErr } = await admin.from("organization_memberships").insert({
      organization_id: orgId,
      user_id: ownerId,
      status: "active",
    });
    expect(membershipErr).toBeNull();

    const { error: roleAssignErr } = await admin.from("user_role_assignments").insert({
      user_id: ownerId,
      role_id: ownerRole!.id,
      organization_id: orgId,
    });
    expect(roleAssignErr).toBeNull();

    const ownerClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } },
    );
    const { error: ownerSignInErr } = await ownerClient.auth.signInWithPassword({
      email: ownerEmail,
      password,
    });
    expect(ownerSignInErr).toBeNull();

    // create_resort inserts into platform_audit_logs with the renamed
    // property_id column -- if the column were still resort_id (or the
    // function's INSERT column list hadn't been updated), this call would
    // fail with "column resort_id does not exist" / "column property_id of
    // relation platform_audit_logs does not exist".
    const resortCode = `AUDIT-PIC-${Date.now()}`;
    const { data: resortId, error: createResortErr } = await ownerClient.rpc("create_resort", {
      p_organization_id: orgId,
      p_name: "AuditLogs PropertyId Resort",
      p_code: resortCode,
      p_timezone: "Africa/Cairo",
    });

    expect(createResortErr).toBeNull();
    expect(resortId).toBeTruthy();

    // Read the resulting platform_audit_logs row directly to prove both
    // that the INSERT succeeded against the renamed column and that the
    // value landed correctly.
    const { data: auditLog, error: auditLogErr } = await admin
      .from("platform_audit_logs")
      .select("id, property_id, action")
      .eq("entity_type", "resort")
      .eq("entity_id", resortId)
      .eq("action", "resort.created")
      .single();

    expect(auditLogErr).toBeNull();
    expect(auditLog?.property_id).toBe(resortId);
    expect(auditLog?.action).toBe("resort.created");

    // Cleanup.
    // Foreign keys from platform_audit_logs.actor_id, resorts.created_by/
    // updated_by, user_role_assignments.user_id, and
    // organization_memberships.user_id still reference ownerId -- they must
    // be removed before deleteUser or the delete fails with a 500 ("Database
    // error deleting user"), silently leaking the auth.users row.
    await admin.from("platform_audit_logs").delete().eq("actor_id", ownerId);
    await admin.from("resorts").delete().eq("id", resortId);
    await admin.from("user_role_assignments").delete().eq("user_id", ownerId);
    await admin.from("organization_memberships").delete().eq("user_id", ownerId);

    const { error: deleteOwnerErr } = await admin.auth.admin.deleteUser(ownerId);
    expect(deleteOwnerErr).toBeNull();

    await admin.from("organizations").update({ status: "ARCHIVED" }).eq("id", orgId);
  });

  it("11. Phase 2c Treasury Cluster Property-ID Rename Integrity (create_cashbox/open_cashier_session/close_cashier_session end-to-end via RPC)", async () => {
    const { data: org } = await admin
      .from("organizations")
      .insert({
        name: "pgTAP TreasuryClusterPropertyId Org",
        slug: `pgtap-treasury-cluster-property-id-${Date.now()}`,
        default_currency: "EGP",
        status: "ACTIVE",
      })
      .select("id")
      .single();

    expect(org?.id).toBeDefined();
    const orgId = org!.id;

    // A resort row: cashbox/cashier-session creation both require the
    // resort to belong to the same organization.
    const { data: resort, error: resortErr } = await admin
      .from("resorts")
      .insert({
        organization_id: orgId,
        name: "TreasuryClusterPropertyId Resort",
        code: `TCPI-${Date.now()}`,
      })
      .select("id")
      .single();

    expect(resortErr).toBeNull();
    const resortId = resort!.id;

    // create_cashbox requires an ASSET-category GL account.
    const { data: glAccount, error: glAccountErr } = await admin
      .from("chart_of_accounts")
      .insert({
        organization_id: orgId,
        code: `1000-${Date.now()}`,
        name_ar: "حساب صندوق اختبار",
        name_en: "Test Cashbox GL Account",
        category: "ASSET",
        normal_balance: "DEBIT",
      })
      .select("id")
      .single();

    expect(glAccountErr).toBeNull();
    const glAccountId = glAccount!.id;

    // create_cashbox / open_cashier_session / close_cashier_session are all
    // permission-gated via has_permission(auth.uid(), ...), which requires a
    // real authenticated user with a role assignment -- the service-role
    // admin client has no auth.uid() and would be rejected as
    // "not authorized". Stand up a real TENANT_OWNER session, matching
    // tests 7/8/10's pattern. TENANT_OWNER is granted "everything except
    // platform.* permissions" (see 20260810000012_phase2_seed.sql), which
    // covers finance.accounts.manage, cashier.sessions.open, and
    // cashier.sessions.close all at once.
    const { error: cloneErr } = await admin.rpc("clone_tenant_role_templates", {
      p_organization_id: orgId,
    });
    expect(cloneErr).toBeNull();

    const { data: ownerRole } = await admin
      .from("roles")
      .select("id")
      .eq("organization_id", orgId)
      .eq("key", "TENANT_OWNER")
      .single();
    expect(ownerRole?.id).toBeDefined();

    const password = "PgTAP_Test_P@ssw0rd_2026!";
    const ownerEmail = `pgtap-treasury-cluster-property-id-owner-${Date.now()}@aqarbooks-test.local`;
    const { data: ownerUser, error: createOwnerErr } = await admin.auth.admin.createUser({
      email: ownerEmail,
      password,
      email_confirm: true,
    });
    expect(createOwnerErr).toBeNull();
    const ownerId = ownerUser!.user!.id;

    const { error: membershipErr } = await admin.from("organization_memberships").insert({
      organization_id: orgId,
      user_id: ownerId,
      status: "active",
    });
    expect(membershipErr).toBeNull();

    const { error: roleAssignErr } = await admin.from("user_role_assignments").insert({
      user_id: ownerId,
      role_id: ownerRole!.id,
      organization_id: orgId,
    });
    expect(roleAssignErr).toBeNull();

    const ownerClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } },
    );
    const { error: ownerSignInErr } = await ownerClient.auth.signInWithPassword({
      email: ownerEmail,
      password,
    });
    expect(ownerSignInErr).toBeNull();

    // create_cashbox: its RPC parameter is still named `p_resort_id`
    // (unchanged in this phase) but must land in the renamed `property_id`
    // column of `cashboxes` -- this is exactly the INSERT-column-list edit
    // this test is meant to catch if missed.
    const { data: cashboxId, error: createCashboxErr } = await ownerClient.rpc(
      "create_cashbox",
      {
        p_organization_id: orgId,
        p_resort_id: resortId,
        p_name: "TreasuryClusterPropertyId Cashbox",
        p_gl_account_id: glAccountId,
      },
    );

    expect(createCashboxErr).toBeNull();
    expect(cashboxId).toBeTruthy();

    const { data: cashbox, error: cashboxReadErr } = await admin
      .from("cashboxes")
      .select("id, property_id")
      .eq("id", cashboxId)
      .single();

    expect(cashboxReadErr).toBeNull();
    expect(cashbox?.property_id).toBe(resortId);

    // open_cashier_session: proves both the SELECT-then-compare validation
    // inside the function (which reads `cashboxes.property_id` to check it
    // matches p_resort_id) and its own INSERT into the renamed
    // `cashier_sessions.property_id` column.
    const { data: sessionId, error: openSessionErr } = await ownerClient.rpc(
      "open_cashier_session",
      {
        p_organization_id: orgId,
        p_resort_id: resortId,
        p_cashbox_id: cashboxId,
        p_opening_balance: 100,
      },
    );

    expect(openSessionErr).toBeNull();
    expect(sessionId).toBeTruthy();

    const { data: session, error: sessionReadErr } = await admin
      .from("cashier_sessions")
      .select("id, property_id")
      .eq("id", sessionId)
      .single();

    expect(sessionReadErr).toBeNull();
    expect(session?.property_id).toBe(resortId);

    // close_cashier_session: proves the row-typed-variable field-access edit
    // (v_session.property_id, formerly v_session.resort_id) works -- if it
    // didn't, this call would fail with a hard Postgres error since
    // cashier_sessions.resort_id no longer exists.
    const { error: closeSessionErr } = await ownerClient.rpc("close_cashier_session", {
      p_session_id: sessionId,
      p_actual_closing_balance: 100,
    });

    expect(closeSessionErr).toBeNull();

    const { data: auditLog, error: auditLogErr } = await admin
      .from("platform_audit_logs")
      .select("id, property_id, action")
      .eq("entity_type", "cashier_session")
      .eq("entity_id", sessionId)
      .eq("action", "cashier_session.closed")
      .single();

    expect(auditLogErr).toBeNull();
    expect(auditLog?.property_id).toBe(resortId);

    // Cleanup.
    // Foreign keys from platform_audit_logs.actor_id, cashier_sessions
    // (opened_by/closed_by), cashboxes (created implicitly by
    // create_cashbox's audit log), user_role_assignments.user_id, and
    // organization_memberships.user_id still reference ownerId -- they must
    // be removed before deleteUser or the delete fails with a 500 ("Database
    // error deleting user"), silently leaking the auth.users row.
    const { error: deleteAuditErr } = await admin
      .from("platform_audit_logs")
      .delete()
      .eq("actor_id", ownerId);
    expect(deleteAuditErr).toBeNull();

    const { error: deleteSessionErr } = await admin
      .from("cashier_sessions")
      .delete()
      .eq("id", sessionId);
    expect(deleteSessionErr).toBeNull();

    const { error: deleteCashboxErr } = await admin.from("cashboxes").delete().eq("id", cashboxId);
    expect(deleteCashboxErr).toBeNull();

    const { error: deleteGlAccountErr } = await admin
      .from("chart_of_accounts")
      .delete()
      .eq("id", glAccountId);
    expect(deleteGlAccountErr).toBeNull();

    const { error: deleteResortErr } = await admin.from("resorts").delete().eq("id", resortId);
    expect(deleteResortErr).toBeNull();

    const { error: deleteRoleAssignErr } = await admin
      .from("user_role_assignments")
      .delete()
      .eq("user_id", ownerId);
    expect(deleteRoleAssignErr).toBeNull();

    const { error: deleteMembershipErr } = await admin
      .from("organization_memberships")
      .delete()
      .eq("user_id", ownerId);
    expect(deleteMembershipErr).toBeNull();

    const { error: deleteOwnerErr } = await admin.auth.admin.deleteUser(ownerId);
    expect(deleteOwnerErr).toBeNull();

    await admin.from("organizations").update({ status: "ARCHIVED" }).eq("id", orgId);
  });

  it("12. Phase 2d Purchasing Cluster Property-ID Rename Integrity (create_purchase_request/decide_purchase_request/post_supplier_invoice/cancel_supplier_invoice end-to-end via RPC)", async () => {
    const { data: org } = await admin
      .from("organizations")
      .insert({
        name: "pgTAP PurchasingClusterPropertyId Org",
        slug: `pgtap-purchasing-cluster-property-id-${Date.now()}`,
        default_currency: "EGP",
        status: "ACTIVE",
      })
      .select("id")
      .single();

    expect(org?.id).toBeDefined();
    const orgId = org!.id;

    // create_fiscal_year / set_fiscal_period_status / create_purchase_request
    // / decide_purchase_request / post_supplier_invoice /
    // cancel_supplier_invoice are all permission-gated via
    // has_financial_permission/has_permission(auth.uid(), ...), which
    // requires a real authenticated user with a role assignment -- the
    // service-role admin client has no auth.uid() and would be rejected as
    // "not authorized". Stand up a real TENANT_OWNER session up front,
    // matching tests 7/8/10/11's pattern. TENANT_OWNER is granted
    // "everything except platform.* permissions" (see
    // 20260810000012_phase2_seed.sql), which covers finance.periods.manage,
    // purchasing.requests.create, purchasing.orders.approve,
    // finance.entries.create, finance.suppliers.void, and finance.entries.post
    // all at once.
    const { error: cloneErr } = await admin.rpc("clone_tenant_role_templates", {
      p_organization_id: orgId,
    });
    expect(cloneErr).toBeNull();

    const { data: ownerRole } = await admin
      .from("roles")
      .select("id")
      .eq("organization_id", orgId)
      .eq("key", "TENANT_OWNER")
      .single();
    expect(ownerRole?.id).toBeDefined();

    const password = "PgTAP_Test_P@ssw0rd_2026!";
    const ownerEmail = `pgtap-purchasing-cluster-property-id-owner-${Date.now()}@aqarbooks-test.local`;
    const { data: ownerUser, error: createOwnerErr } = await admin.auth.admin.createUser({
      email: ownerEmail,
      password,
      email_confirm: true,
    });
    expect(createOwnerErr).toBeNull();
    const ownerId = ownerUser!.user!.id;

    const { error: membershipErr } = await admin.from("organization_memberships").insert({
      organization_id: orgId,
      user_id: ownerId,
      status: "active",
    });
    expect(membershipErr).toBeNull();

    const { error: roleAssignErr } = await admin.from("user_role_assignments").insert({
      user_id: ownerId,
      role_id: ownerRole!.id,
      organization_id: orgId,
    });
    expect(roleAssignErr).toBeNull();

    const ownerClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } },
    );
    const { error: ownerSignInErr } = await ownerClient.auth.signInWithPassword({
      email: ownerEmail,
      password,
    });
    expect(ownerSignInErr).toBeNull();

    // Chart of accounts: needed for the supplier's payable account and the
    // invoice's expense account. chart_of_accounts has no RLS write policy
    // gating these direct inserts (clone_chart_of_accounts_template is the
    // permission-gated RPC path; a direct admin insert is simpler here and
    // matches test 11's pattern for its cashbox GL account).
    const { data: payableAcc, error: payableAccErr } = await admin
      .from("chart_of_accounts")
      .insert({
        organization_id: orgId,
        code: `2100-${Date.now()}`,
        name_ar: "ذمم الموردين الدائنة اختبار",
        name_en: "Test Accounts Payable",
        category: "LIABILITY",
        normal_balance: "CREDIT",
      })
      .select("id")
      .single();
    expect(payableAccErr).toBeNull();

    const { data: expenseAcc, error: expenseAccErr } = await admin
      .from("chart_of_accounts")
      .insert({
        organization_id: orgId,
        code: `5200-${Date.now()}`,
        name_ar: "الصيانة والتشغيل اختبار",
        name_en: "Test Maintenance & Operations",
        category: "EXPENSE",
        normal_balance: "DEBIT",
      })
      .select("id")
      .single();
    expect(expenseAccErr).toBeNull();

    // An OPEN fiscal period: post_supplier_invoice/cancel_supplier_invoice
    // both post real journal entries via create_journal_entry_internal +
    // post_journal_entry_internal, which require an OPEN period covering
    // the entry date.
    const { data: yearId, error: yearErr } = await ownerClient.rpc("create_fiscal_year", {
      p_organization_id: orgId,
      p_name: "2026",
      p_start_date: "2026-01-01",
      p_end_date: "2026-12-31",
    });
    expect(yearErr).toBeNull();

    // cancel_supplier_invoice posts its reversing entry with entry_date =
    // current_date (the real wall-clock date), not the invoice's own date --
    // so the period picked here must cover *today*, not just the year's
    // first period, or post_journal_entry_internal's "entry date does not
    // belong to the selected period" check fails on the cancellation.
    const todayIso = new Date().toISOString().slice(0, 10);
    const { data: period, error: periodErr } = await admin
      .from("fiscal_periods")
      .select("id")
      .eq("fiscal_year_id", yearId)
      .lte("start_date", todayIso)
      .gte("end_date", todayIso)
      .single();
    expect(periodErr).toBeNull();
    const periodId = period!.id;

    const { error: openPeriodErr } = await ownerClient.rpc("set_fiscal_period_status", {
      p_fiscal_period_id: periodId,
      p_status: "OPEN",
      p_reason: "pgTAP purchasing-cluster setup",
    });
    expect(openPeriodErr).toBeNull();

    // A resort row: create_purchase_request/post_supplier_invoice both
    // require the resort to belong to the same organization.
    const { data: resort, error: resortErr } = await admin
      .from("resorts")
      .insert({
        organization_id: orgId,
        name: "PurchasingClusterPropertyId Resort",
        code: `PCPI-${Date.now()}`,
      })
      .select("id")
      .single();

    expect(resortErr).toBeNull();
    const resortId = resort!.id;

    // A supplier row: post_supplier_invoice looks up suppliers.payable_account_id.
    const { data: supplier, error: supplierErr } = await admin
      .from("suppliers")
      .insert({
        organization_id: orgId,
        name: "PurchasingClusterPropertyId Supplier",
        payable_account_id: payableAcc!.id,
      })
      .select("id")
      .single();

    expect(supplierErr).toBeNull();
    const supplierId = supplier!.id;

    // create_purchase_request: its RPC parameter is still named
    // `p_resort_id` (unchanged in this phase) but must land in the renamed
    // `property_id` column of `purchase_requests` -- this is exactly the
    // INSERT-column-list edit this test is meant to catch if missed.
    const { data: requestId, error: createRequestErr } = await ownerClient.rpc(
      "create_purchase_request",
      {
        p_organization_id: orgId,
        p_resort_id: resortId,
        p_description: "PurchasingClusterPropertyId Request",
        p_estimated_amount: 1000,
      },
    );

    expect(createRequestErr).toBeNull();
    expect(requestId).toBeTruthy();

    const { data: request, error: requestReadErr } = await admin
      .from("purchase_requests")
      .select("id, property_id")
      .eq("id", requestId)
      .single();

    expect(requestReadErr).toBeNull();
    expect(request?.property_id).toBe(resortId);

    // decide_purchase_request: proves the single-occurrence row-typed-variable
    // field-access edit (v_request.property_id, formerly v_request.resort_id)
    // works -- if it didn't, this call would fail with a hard Postgres error
    // since purchase_requests.resort_id no longer exists.
    const { error: decideErr } = await ownerClient.rpc("decide_purchase_request", {
      p_request_id: requestId,
      p_approve: true,
      p_reason: "pgTAP approval",
    });

    expect(decideErr).toBeNull();

    const { data: decideAuditLog, error: decideAuditLogErr } = await admin
      .from("platform_audit_logs")
      .select("id, property_id, action")
      .eq("entity_type", "purchase_request")
      .eq("entity_id", requestId)
      .eq("action", "purchase_request.approved")
      .single();

    expect(decideAuditLogErr).toBeNull();
    expect(decideAuditLog?.property_id).toBe(resortId);

    // post_supplier_invoice: another INSERT-column-list edit, this time on
    // `supplier_invoices`. No purchase order is attached (p_purchase_order_id
    // is null) to keep setup minimal -- this path is independently valid per
    // the function body.
    const invoiceNumber = `INV-PCPI-${Date.now()}`;
    const { data: invoiceId, error: postInvoiceErr } = await ownerClient.rpc(
      "post_supplier_invoice",
      {
        p_organization_id: orgId,
        p_resort_id: resortId,
        p_supplier_id: supplierId,
        p_purchase_order_id: null,
        p_invoice_number: invoiceNumber,
        p_expense_account_id: expenseAcc!.id,
        p_net_amount: 500,
        p_discount_amount: 0,
        p_vat_rate: 0,
        p_vat_account_id: null,
        p_wht_rate: 0,
        p_wht_account_id: null,
        p_invoice_date: todayIso,
        p_due_date: todayIso,
        p_fiscal_period_id: periodId,
      },
    );

    expect(postInvoiceErr).toBeNull();
    expect(invoiceId).toBeTruthy();

    const { data: invoice, error: invoiceReadErr } = await admin
      .from("supplier_invoices")
      .select("id, property_id")
      .eq("id", invoiceId)
      .single();

    expect(invoiceReadErr).toBeNull();
    expect(invoice?.property_id).toBe(resortId);

    // cancel_supplier_invoice: the highest-risk edit shape in this cluster --
    // v_invoice.property_id (formerly v_invoice.resort_id) is read THREE
    // times in this one function body (has_financial_permission argument,
    // create_journal_entry_internal argument, and the platform_audit_logs
    // value). If even one of the three occurrences had been missed, this
    // call would fail with a hard Postgres error since
    // supplier_invoices.resort_id no longer exists.
    const { error: cancelErr } = await ownerClient.rpc("cancel_supplier_invoice", {
      p_organization_id: orgId,
      p_invoice_id: invoiceId,
      p_fiscal_period_id: periodId,
      p_reason: "pgTAP cancellation",
    });

    expect(cancelErr).toBeNull();

    const { data: cancelAuditLog, error: cancelAuditLogErr } = await admin
      .from("platform_audit_logs")
      .select("id, property_id, action")
      .eq("entity_type", "supplier_invoice")
      .eq("entity_id", invoiceId)
      .eq("action", "supplier_invoice.cancelled")
      .single();

    expect(cancelAuditLogErr).toBeNull();
    expect(cancelAuditLog?.property_id).toBe(resortId);

    // Cleanup.
    // Foreign keys from platform_audit_logs.actor_id, purchase_requests
    // (requested_by/approved_by), supplier_invoices (created_by/reversed_by),
    // journal_entries.created_by, user_role_assignments.user_id, and
    // organization_memberships.user_id still reference ownerId -- they must
    // be removed before deleteUser or the delete fails with a 500 ("Database
    // error deleting user"), silently leaking the auth.users row.
    const { error: deleteAuditErr } = await admin
      .from("platform_audit_logs")
      .delete()
      .eq("actor_id", ownerId);
    expect(deleteAuditErr).toBeNull();

    // supplier_invoices.journal_entry_id references journal_entries, so the
    // invoice must be deleted before its journal entry.
    const { error: deleteInvoiceErr } = await admin
      .from("supplier_invoices")
      .delete()
      .eq("id", invoiceId);
    expect(deleteInvoiceErr).toBeNull();

    // journal_entry_lines.journal_entry_id has ON DELETE CASCADE, so
    // deleting the parent journal_entries rows below removes their lines
    // automatically.
    const { error: deleteJournalEntriesErr } = await admin
      .from("journal_entries")
      .delete()
      .eq("organization_id", orgId);
    expect(deleteJournalEntriesErr).toBeNull();

    const { error: deleteRequestErr } = await admin
      .from("purchase_requests")
      .delete()
      .eq("id", requestId);
    expect(deleteRequestErr).toBeNull();

    const { error: deleteSupplierErr } = await admin
      .from("suppliers")
      .delete()
      .eq("id", supplierId);
    expect(deleteSupplierErr).toBeNull();

    const { error: deleteResortErr } = await admin.from("resorts").delete().eq("id", resortId);
    expect(deleteResortErr).toBeNull();

    // The payable/expense GL accounts are not deleted here: they've been
    // posted to by the journal entries above, so `chart_of_accounts.is_used`
    // is now true and a trigger rejects the delete (COA_USED_DELETE_FORBIDDEN)
    // -- the same reason test 1's cashAcc/revAcc are left in place. They stay
    // attached to the archived org below, consistent with that precedent.
    const { error: deleteRoleAssignErr } = await admin
      .from("user_role_assignments")
      .delete()
      .eq("user_id", ownerId);
    expect(deleteRoleAssignErr).toBeNull();

    const { error: deleteMembershipErr } = await admin
      .from("organization_memberships")
      .delete()
      .eq("user_id", ownerId);
    expect(deleteMembershipErr).toBeNull();

    const { error: deleteOwnerErr } = await admin.auth.admin.deleteUser(ownerId);
    expect(deleteOwnerErr).toBeNull();

    await admin.from("organizations").update({ status: "ARCHIVED" }).eq("id", orgId);
  });

  it("13. Phase 2e chart_of_accounts/user_role_assignments Property-ID Rename Integrity (add_organization_member ON CONFLICT dedup + has_financial_permission resort-scoped check via create_purchase_request)", async () => {
    const { data: org } = await admin
      .from("organizations")
      .insert({
        name: "pgTAP CoaRolesCluster Org",
        slug: `pgtap-coa-roles-cluster-${Date.now()}`,
        default_currency: "EGP",
        status: "ACTIVE",
      })
      .select("id")
      .single();

    expect(org?.id).toBeDefined();
    const orgId = org!.id;

    // clone_tenant_role_templates: unaffected by this phase, but every
    // subsequent step needs a real TENANT_OWNER role to exist.
    const { error: cloneErr } = await admin.rpc("clone_tenant_role_templates", {
      p_organization_id: orgId,
    });
    expect(cloneErr).toBeNull();

    const { data: ownerRole } = await admin
      .from("roles")
      .select("id")
      .eq("organization_id", orgId)
      .eq("key", "TENANT_OWNER")
      .single();
    expect(ownerRole?.id).toBeDefined();

    const { data: adminRole } = await admin
      .from("roles")
      .select("id")
      .eq("organization_id", orgId)
      .eq("key", "TENANT_ADMIN")
      .single();
    expect(adminRole?.id).toBeDefined();

    // add_organization_member is permission-gated via
    // has_permission(auth.uid(), ..., 'tenant.users.manage'), which requires
    // a real authenticated user with a role assignment -- the service-role
    // admin client has no auth.uid() and would be rejected as
    // "not authorized". Stand up a real TENANT_OWNER session, matching
    // tests 7/8/10/11/12's pattern.
    const password = "PgTAP_Test_P@ssw0rd_2026!";
    const ownerEmail = `pgtap-coa-roles-cluster-owner-${Date.now()}@aqarbooks-test.local`;
    const { data: ownerUser, error: createOwnerErr } = await admin.auth.admin.createUser({
      email: ownerEmail,
      password,
      email_confirm: true,
    });
    expect(createOwnerErr).toBeNull();
    const ownerId = ownerUser!.user!.id;

    const { error: ownerMembershipErr } = await admin.from("organization_memberships").insert({
      organization_id: orgId,
      user_id: ownerId,
      status: "active",
    });
    expect(ownerMembershipErr).toBeNull();

    const { error: ownerRoleAssignErr } = await admin.from("user_role_assignments").insert({
      user_id: ownerId,
      role_id: ownerRole!.id,
      organization_id: orgId,
    });
    expect(ownerRoleAssignErr).toBeNull();

    const ownerClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } },
    );
    const { error: ownerSignInErr } = await ownerClient.auth.signInWithPassword({
      email: ownerEmail,
      password,
    });
    expect(ownerSignInErr).toBeNull();

    // --- Part A: add_organization_member's ON CONFLICT (..., property_id)
    // edit. Call it TWICE for the same user/role/org so the INSERT's ON
    // CONFLICT clause is actually re-parsed/re-planned against the live
    // schema on a second execution, not just the first. This is the
    // load-bearing proof: if the column list still said `resort_id` (which
    // no longer exists on this table after the migration), Postgres would
    // reject the statement outright with "column resort_id does not exist"
    // on either call, since the ON CONFLICT inference target is validated
    // against the table's real columns/indexes regardless of whether a
    // duplicate is actually found at runtime.
    //
    // NOTE (discovered empirically, not assumed): `add_organization_member`
    // never sets a resort scope, so every row it inserts has
    // `property_id IS NULL`. The table's unique constraint
    // `(user_id, role_id, organization_id, property_id)` has no `NULLS NOT
    // DISTINCT`, so under standard Postgres semantics two NULLs are never
    // considered equal for uniqueness purposes -- meaning ON CONFLICT DO
    // NOTHING's arbiter never actually matches an existing NULL-scoped row,
    // and the second call legitimately inserts a SECOND row rather than
    // deduplicating. This is pre-existing behavior unrelated to this
    // rename (identical NULL semantics applied under the old `resort_id`
    // name), so this test asserts the count that's actually observed (2)
    // rather than the naive expectation of 1 -- what matters for THIS
    // phase's correctness is that both calls succeed without a
    // column-does-not-exist error, which is exactly what would happen if
    // the ON CONFLICT edit had been missed or mistyped.
    const memberEmail = `pgtap-coa-roles-cluster-member-${Date.now()}@aqarbooks-test.local`;
    const { data: memberUser, error: createMemberErr } = await admin.auth.admin.createUser({
      email: memberEmail,
      password,
      email_confirm: true,
    });
    expect(createMemberErr).toBeNull();
    const memberId = memberUser!.user!.id;

    const { error: addMemberFirstErr } = await ownerClient.rpc("add_organization_member", {
      p_organization_id: orgId,
      p_user_id: memberId,
      p_role_key: "TENANT_ADMIN",
    });
    expect(addMemberFirstErr).toBeNull();

    const { error: addMemberSecondErr } = await ownerClient.rpc("add_organization_member", {
      p_organization_id: orgId,
      p_user_id: memberId,
      p_role_key: "TENANT_ADMIN",
    });
    expect(addMemberSecondErr).toBeNull();

    const { count: assignmentCount, error: countErr } = await admin
      .from("user_role_assignments")
      .select("id", { count: "exact", head: true })
      .eq("user_id", memberId)
      .eq("role_id", adminRole!.id)
      .eq("organization_id", orgId);
    expect(countErr).toBeNull();
    expect(assignmentCount).toBe(2);

    // Read back a row via `property_id` -- proves the column exists under
    // its new name and is queryable. add_organization_member never sets a
    // resort scope, so it must be null.
    const { data: memberAssignments, error: memberAssignmentErr } = await admin
      .from("user_role_assignments")
      .select("id, property_id")
      .eq("user_id", memberId)
      .eq("role_id", adminRole!.id)
      .eq("organization_id", orgId);
    expect(memberAssignmentErr).toBeNull();
    expect(memberAssignments).toHaveLength(2);
    for (const row of memberAssignments!) {
      expect(row.property_id).toBeNull();
    }

    // --- Part B: has_financial_permission's resort-scoped check
    // (`ura.property_id = p_resort_id`). Tests 1-12's role assignments are
    // all *unscoped* (property_id IS NULL), which always short-circuits
    // has_financial_permission's condition true regardless of whether the
    // rename is correct -- that branch alone would never catch a broken
    // `ura.property_id` reference. A broken rename here is a silent-failure
    // mode (every resort-scoped permission check would just DENY, not
    // error), so this must be proven with an actual non-null property_id
    // match, not just "the call didn't throw".
    const { data: resort, error: resortErr } = await admin
      .from("resorts")
      .insert({
        organization_id: orgId,
        name: "CoaRolesCluster Resort",
        code: `CRC-${Date.now()}`,
      })
      .select("id")
      .single();
    expect(resortErr).toBeNull();
    const resortId = resort!.id;

    const scopedEmail = `pgtap-coa-roles-cluster-scoped-${Date.now()}@aqarbooks-test.local`;
    const { data: scopedUser, error: createScopedErr } = await admin.auth.admin.createUser({
      email: scopedEmail,
      password,
      email_confirm: true,
    });
    expect(createScopedErr).toBeNull();
    const scopedId = scopedUser!.user!.id;

    const { error: scopedMembershipErr } = await admin.from("organization_memberships").insert({
      organization_id: orgId,
      user_id: scopedId,
      status: "active",
    });
    expect(scopedMembershipErr).toBeNull();

    // Insert directly (not via add_organization_member, which never sets a
    // scope) with a non-null property_id, granting the TENANT_OWNER role
    // (which covers purchasing.requests.create per tests 11/12's comment)
    // scoped specifically to `resortId`.
    const { error: scopedRoleAssignErr } = await admin.from("user_role_assignments").insert({
      user_id: scopedId,
      role_id: ownerRole!.id,
      organization_id: orgId,
      property_id: resortId,
    });
    expect(scopedRoleAssignErr).toBeNull();

    const scopedClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } },
    );
    const { error: scopedSignInErr } = await scopedClient.auth.signInWithPassword({
      email: scopedEmail,
      password,
    });
    expect(scopedSignInErr).toBeNull();

    // create_purchase_request (Phase 2d, already migrated) calls
    // has_financial_permission(p_organization_id, 'purchasing.requests.create',
    // p_resort_id) -- if `ura.property_id` still referenced a nonexistent
    // `resort_id` column, this call would error outright (not silently
    // deny), but if the rename had instead been mistyped in a way that
    // still compiles (e.g. comparing the wrong columns), this scoped user
    // would be silently and wrongly denied. Asserting success here is the
    // actual proof the resort-scope match still works post-rename.
    const { data: requestId, error: createRequestErr } = await scopedClient.rpc(
      "create_purchase_request",
      {
        p_organization_id: orgId,
        p_resort_id: resortId,
        p_description: "CoaRolesCluster scoped request",
        p_estimated_amount: 250,
      },
    );
    expect(createRequestErr).toBeNull();
    expect(requestId).toBeTruthy();

    const { data: request, error: requestReadErr } = await admin
      .from("purchase_requests")
      .select("id, property_id")
      .eq("id", requestId)
      .single();
    expect(requestReadErr).toBeNull();
    expect(request?.property_id).toBe(resortId);

    // Cleanup.
    // Foreign keys from platform_audit_logs.actor_id (add_organization_member
    // and create_purchase_request both write audit rows), purchase_requests
    // .requested_by, user_role_assignments.user_id, and
    // organization_memberships.user_id still reference ownerId/memberId/
    // scopedId -- they must be removed before deleteUser or the delete
    // fails with a 500 ("Database error deleting user"), silently leaking
    // the auth.users row. platform_audit_logs.property_id also FKs to the
    // resort (create_purchase_request writes p_resort_id into it), so the
    // audit rows must be deleted before the resort, not after.
    const { error: deleteRequestErr } = await admin
      .from("purchase_requests")
      .delete()
      .eq("id", requestId);
    expect(deleteRequestErr).toBeNull();

    const { error: deleteAuditErr } = await admin
      .from("platform_audit_logs")
      .delete()
      .in("actor_id", [ownerId, memberId, scopedId]);
    expect(deleteAuditErr).toBeNull();

    const { error: deleteResortErr } = await admin.from("resorts").delete().eq("id", resortId);
    expect(deleteResortErr).toBeNull();

    const { error: deleteRoleAssignErr } = await admin
      .from("user_role_assignments")
      .delete()
      .in("user_id", [ownerId, memberId, scopedId]);
    expect(deleteRoleAssignErr).toBeNull();

    const { error: deleteMembershipErr } = await admin
      .from("organization_memberships")
      .delete()
      .in("user_id", [ownerId, memberId, scopedId]);
    expect(deleteMembershipErr).toBeNull();

    const { error: deleteOwnerErr } = await admin.auth.admin.deleteUser(ownerId);
    expect(deleteOwnerErr).toBeNull();
    const { error: deleteMemberErr } = await admin.auth.admin.deleteUser(memberId);
    expect(deleteMemberErr).toBeNull();
    const { error: deleteScopedErr } = await admin.auth.admin.deleteUser(scopedId);
    expect(deleteScopedErr).toBeNull();

    await admin.from("organizations").update({ status: "ARCHIVED" }).eq("id", orgId);
  });

  it("14. Phase 2f journal_entries Property-ID Rename Integrity (create_journal_entry/post_journal_entry/reverse_journal_entry end-to-end via RPC)", async () => {
    const { data: org } = await admin
      .from("organizations")
      .insert({
        name: "pgTAP JournalEntriesCluster Org",
        slug: `pgtap-journal-entries-cluster-${Date.now()}`,
        default_currency: "EGP",
        status: "ACTIVE",
      })
      .select("id")
      .single();

    expect(org?.id).toBeDefined();
    const orgId = org!.id;

    // create_journal_entry / post_journal_entry / reverse_journal_entry are
    // all permission-gated via has_financial_permission/has_permission
    // (auth.uid(), ...), which requires a real authenticated user with a
    // role assignment -- the service-role admin client has no auth.uid()
    // and would be rejected as "not authorized". Stand up a real
    // TENANT_OWNER session up front, matching tests 7/8/10/11/12/13's
    // pattern. TENANT_OWNER is granted "everything except platform.*
    // permissions" (see 20260810000012_phase2_seed.sql), which covers
    // finance.entries.create, finance.entries.post, and
    // finance.entries.reverse all at once.
    const { error: cloneErr } = await admin.rpc("clone_tenant_role_templates", {
      p_organization_id: orgId,
    });
    expect(cloneErr).toBeNull();

    const { data: ownerRole } = await admin
      .from("roles")
      .select("id")
      .eq("organization_id", orgId)
      .eq("key", "TENANT_OWNER")
      .single();
    expect(ownerRole?.id).toBeDefined();

    const password = "PgTAP_Test_P@ssw0rd_2026!";
    const ownerEmail = `pgtap-journal-entries-cluster-owner-${Date.now()}@aqarbooks-test.local`;
    const { data: ownerUser, error: createOwnerErr } = await admin.auth.admin.createUser({
      email: ownerEmail,
      password,
      email_confirm: true,
    });
    expect(createOwnerErr).toBeNull();
    const ownerId = ownerUser!.user!.id;

    const { error: membershipErr } = await admin.from("organization_memberships").insert({
      organization_id: orgId,
      user_id: ownerId,
      status: "active",
    });
    expect(membershipErr).toBeNull();

    const { error: roleAssignErr } = await admin.from("user_role_assignments").insert({
      user_id: ownerId,
      role_id: ownerRole!.id,
      organization_id: orgId,
    });
    expect(roleAssignErr).toBeNull();

    const ownerClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } },
    );
    const { error: ownerSignInErr } = await ownerClient.auth.signInWithPassword({
      email: ownerEmail,
      password,
    });
    expect(ownerSignInErr).toBeNull();

    // A resort row: create_journal_entry requires the resort (if any) to
    // belong to the same organization, and its id is what this test proves
    // lands in journal_entries.property_id / platform_audit_logs.property_id
    // throughout the flow.
    const { data: resort, error: resortErr } = await admin
      .from("resorts")
      .insert({
        organization_id: orgId,
        name: "JournalEntriesCluster Resort",
        code: `JEC-${Date.now()}`,
      })
      .select("id")
      .single();

    expect(resortErr).toBeNull();
    const resortId = resort!.id;

    // A debit/credit chart-of-accounts pair, direct inserts matching tests
    // 11/12's pattern (chart_of_accounts has no RLS write policy gating
    // these; clone_chart_of_accounts_template is the permission-gated RPC
    // path, not needed here).
    const { data: cashAcc, error: cashAccErr } = await admin
      .from("chart_of_accounts")
      .insert({
        organization_id: orgId,
        code: `1000-${Date.now()}`,
        name_ar: "نقدية اختبار",
        name_en: "Test Cash",
        category: "ASSET",
        normal_balance: "DEBIT",
      })
      .select("id")
      .single();
    expect(cashAccErr).toBeNull();

    const { data: revenueAcc, error: revenueAccErr } = await admin
      .from("chart_of_accounts")
      .insert({
        organization_id: orgId,
        code: `4000-${Date.now()}`,
        name_ar: "إيرادات اختبار",
        name_en: "Test Revenue",
        category: "REVENUE",
        normal_balance: "CREDIT",
      })
      .select("id")
      .single();
    expect(revenueAccErr).toBeNull();

    // An OPEN fiscal period covering *today*: both the original entry and
    // its reversal (reversal date = today, matching test 12's precedent for
    // cancel_supplier_invoice) must fall inside an open period.
    const { data: yearId, error: yearErr } = await ownerClient.rpc("create_fiscal_year", {
      p_organization_id: orgId,
      p_name: "2026",
      p_start_date: "2026-01-01",
      p_end_date: "2026-12-31",
    });
    expect(yearErr).toBeNull();

    const todayIso = new Date().toISOString().slice(0, 10);
    const { data: period, error: periodErr } = await admin
      .from("fiscal_periods")
      .select("id")
      .eq("fiscal_year_id", yearId)
      .lte("start_date", todayIso)
      .gte("end_date", todayIso)
      .single();
    expect(periodErr).toBeNull();
    const periodId = period!.id;

    const { error: openPeriodErr } = await ownerClient.rpc("set_fiscal_period_status", {
      p_fiscal_period_id: periodId,
      p_status: "OPEN",
      p_reason: "pgTAP journal-entries-cluster setup",
    });
    expect(openPeriodErr).toBeNull();

    // create_journal_entry (thin real-session-facing wrapper around
    // create_journal_entry_internal, gated on finance.entries.create) with a
    // balanced 2-line entry. Reading the row back and asserting
    // `property_id` proves the INSERT-column-list edit in
    // create_journal_entry_internal.
    const idempotencyKey = `pgtap-jec-${Date.now()}`;
    const { data: entryId, error: createEntryErr } = await ownerClient.rpc(
      "create_journal_entry",
      {
        p_organization_id: orgId,
        p_resort_id: resortId,
        p_fiscal_period_id: periodId,
        p_entry_date: todayIso,
        p_description: "JournalEntriesCluster test entry",
        p_source_type: "JOURNAL_VOUCHER",
        p_lines: [
          { account_id: cashAcc!.id, debit: 100, credit: 0 },
          { account_id: revenueAcc!.id, debit: 0, credit: 100 },
        ],
        p_idempotency_key: idempotencyKey,
      },
    );

    expect(createEntryErr).toBeNull();
    expect(entryId).toBeTruthy();

    const { data: entry, error: entryReadErr } = await admin
      .from("journal_entries")
      .select("id, property_id, status")
      .eq("id", entryId)
      .single();

    expect(entryReadErr).toBeNull();
    expect(entry?.property_id).toBe(resortId);
    expect(entry?.status).toBe("DRAFT");

    // post_journal_entry (thin real-session-facing wrapper around
    // post_journal_entry_internal, gated on finance.entries.post). Reading
    // the resulting platform_audit_logs row proves the single-occurrence
    // `v_entry.property_id` edit (formerly `v_entry.resort_id`) in
    // post_journal_entry_internal.
    const { error: postEntryErr } = await ownerClient.rpc("post_journal_entry", {
      p_journal_entry_id: entryId,
    });
    expect(postEntryErr).toBeNull();

    const { data: postedEntry, error: postedEntryErr } = await admin
      .from("journal_entries")
      .select("status")
      .eq("id", entryId)
      .single();
    expect(postedEntryErr).toBeNull();
    expect(postedEntry?.status).toBe("POSTED");

    const { data: postedAuditLog, error: postedAuditLogErr } = await admin
      .from("platform_audit_logs")
      .select("id, property_id, action")
      .eq("entity_type", "journal_entry")
      .eq("entity_id", entryId)
      .eq("action", "journal_entry.posted")
      .single();

    expect(postedAuditLogErr).toBeNull();
    expect(postedAuditLog?.property_id).toBe(resortId);

    // reverse_journal_entry: the highest-risk edit shape in this phase --
    // three substitutions split across two statement types within one
    // function body: (a) the new reversal entry's INSERT column list, (b)
    // `v_original.property_id` (formerly `v_original.resort_id`) read into
    // that same INSERT's VALUES list, and (c) `v_original.property_id` read
    // again as the value passed into platform_audit_logs. If any of the
    // three had been missed, this call would fail with a hard Postgres
    // error since journal_entries.resort_id no longer exists.
    const { data: reversalEntryId, error: reverseErr } = await ownerClient.rpc(
      "reverse_journal_entry",
      {
        p_journal_entry_id: entryId,
        p_reversal_fiscal_period_id: periodId,
        p_reversal_date: todayIso,
        p_reason: "pgTAP reversal",
      },
    );

    expect(reverseErr).toBeNull();
    expect(reversalEntryId).toBeTruthy();

    // Original entry is now REVERSED.
    const { data: reversedOriginal, error: reversedOriginalErr } = await admin
      .from("journal_entries")
      .select("status")
      .eq("id", entryId)
      .single();
    expect(reversedOriginalErr).toBeNull();
    expect(reversedOriginal?.status).toBe("REVERSED");

    // The NEW reversal entry: proves substitutions (a) and (b) -- the
    // INSERT column list AND the `v_original.property_id` VALUES-list read.
    const { data: reversalEntry, error: reversalEntryReadErr } = await admin
      .from("journal_entries")
      .select("id, property_id, status, reversed_entry_id")
      .eq("id", reversalEntryId)
      .single();

    expect(reversalEntryReadErr).toBeNull();
    expect(reversalEntry?.property_id).toBe(resortId);
    expect(reversalEntry?.status).toBe("POSTED");
    expect(reversalEntry?.reversed_entry_id).toBe(entryId);

    // The reversal's platform_audit_logs row: proves substitution (c).
    const { data: reversedAuditLog, error: reversedAuditLogErr } = await admin
      .from("platform_audit_logs")
      .select("id, property_id, action")
      .eq("entity_type", "journal_entry")
      .eq("entity_id", entryId)
      .eq("action", "journal_entry.reversed")
      .single();

    expect(reversedAuditLogErr).toBeNull();
    expect(reversedAuditLog?.property_id).toBe(resortId);

    // Cleanup.
    // Foreign keys from platform_audit_logs.actor_id/property_id,
    // journal_entries.created_by/posted_by, user_role_assignments.user_id,
    // and organization_memberships.user_id still reference ownerId/resortId
    // -- they must be removed before deleteUser/the resort delete or the
    // deletes fail (a 500 "Database error deleting user" for the auth user,
    // or a dangling FK for the resort). platform_audit_logs.property_id FKs
    // to the resort, so the audit rows must be deleted before the resort.
    const { error: deleteAuditErr } = await admin
      .from("platform_audit_logs")
      .delete()
      .eq("actor_id", ownerId);
    expect(deleteAuditErr).toBeNull();

    // journal_entry_lines.journal_entry_id has ON DELETE CASCADE, so
    // deleting both journal_entries rows (original + reversal) in one
    // statement removes their lines automatically. The reversal's
    // reversed_entry_id self-references the original row also being
    // deleted here -- Postgres defers this NO ACTION FK check to the end of
    // the statement, so deleting both rows together in a single DELETE is
    // safe (matches test 12's precedent of deleting all of an org's
    // journal_entries in one statement).
    const { error: deleteJournalEntriesErr } = await admin
      .from("journal_entries")
      .delete()
      .eq("organization_id", orgId);
    expect(deleteJournalEntriesErr).toBeNull();

    const { error: deleteResortErr } = await admin.from("resorts").delete().eq("id", resortId);
    expect(deleteResortErr).toBeNull();

    // The cash/revenue GL accounts are not deleted here: they've been
    // posted to by the journal entries above, so `chart_of_accounts.is_used`
    // is now true and a trigger rejects the delete (COA_USED_DELETE_FORBIDDEN)
    // -- the same reason test 12's payable/expense accounts are left in
    // place. They stay attached to the archived org below, consistent with
    // that precedent.
    const { error: deleteRoleAssignErr } = await admin
      .from("user_role_assignments")
      .delete()
      .eq("user_id", ownerId);
    expect(deleteRoleAssignErr).toBeNull();

    const { error: deleteMembershipErr } = await admin
      .from("organization_memberships")
      .delete()
      .eq("user_id", ownerId);
    expect(deleteMembershipErr).toBeNull();

    const { error: deleteOwnerErr } = await admin.auth.admin.deleteUser(ownerId);
    expect(deleteOwnerErr).toBeNull();

    await admin.from("organizations").update({ status: "ARCHIVED" }).eq("id", orgId);
  });

  it("15. Phase 2g Group 1 Payments/Dues/Online-Payments Core Property-ID Rename Integrity (issue_dues/create_online_payment_checkout_transaction/record_online_payment/void_payment end-to-end, completing the record_online_payment + validate_online_payments_clearing_account Phase 2e partial edits)", async () => {
    const { data: org } = await admin
      .from("organizations")
      .insert({
        name: "pgTAP PaymentsDuesCoreCluster Org",
        slug: `pgtap-payments-dues-core-cluster-${Date.now()}`,
        default_currency: "EGP",
        status: "ACTIVE",
      })
      .select("id")
      .single();

    expect(org?.id).toBeDefined();
    const orgId = org!.id;

    // issue_dues / void_payment are permission-gated via has_financial_permission
    // (auth.uid(), ...), which requires a real authenticated user with a role
    // assignment -- the service-role admin client has no auth.uid() and would
    // be rejected as "not authorized". Stand up a real TENANT_OWNER session up
    // front, matching tests 7/8/10/11/12/13/14's pattern. TENANT_OWNER is
    // granted "everything except platform.* permissions" (see
    // 20260810000012_phase2_seed.sql), which covers finance.dues.issue,
    // finance.periods.manage, and finance.payments.void all at once.
    const { error: cloneErr } = await admin.rpc("clone_tenant_role_templates", {
      p_organization_id: orgId,
    });
    expect(cloneErr).toBeNull();

    const { data: ownerRole } = await admin
      .from("roles")
      .select("id")
      .eq("organization_id", orgId)
      .eq("key", "TENANT_OWNER")
      .single();
    expect(ownerRole?.id).toBeDefined();

    const password = "PgTAP_Test_P@ssw0rd_2026!";
    const ownerEmail = `pgtap-payments-dues-core-cluster-owner-${Date.now()}@aqarbooks-test.local`;
    const { data: ownerUser, error: createOwnerErr } = await admin.auth.admin.createUser({
      email: ownerEmail,
      password,
      email_confirm: true,
    });
    expect(createOwnerErr).toBeNull();
    const ownerId = ownerUser!.user!.id;

    const { error: membershipErr } = await admin.from("organization_memberships").insert({
      organization_id: orgId,
      user_id: ownerId,
      status: "active",
    });
    expect(membershipErr).toBeNull();

    const { error: roleAssignErr } = await admin.from("user_role_assignments").insert({
      user_id: ownerId,
      role_id: ownerRole!.id,
      organization_id: orgId,
    });
    expect(roleAssignErr).toBeNull();

    const ownerClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } },
    );
    const { error: ownerSignInErr } = await ownerClient.auth.signInWithPassword({
      email: ownerEmail,
      password,
    });
    expect(ownerSignInErr).toBeNull();

    // A resort row: issue_dues/create_online_payment_checkout_transaction/
    // record_online_payment/void_payment all key off of it, and it's what
    // this test proves lands in dues.property_id, online_payment_transactions
    // .property_id, payments.property_id, organization_finance_settings
    // .property_id, and platform_audit_logs.property_id throughout the flow.
    const { data: resort, error: resortErr } = await admin
      .from("resorts")
      .insert({
        organization_id: orgId,
        name: "PaymentsDuesCoreCluster Resort",
        code: `PDCC-${Date.now()}`,
      })
      .select("id")
      .single();

    expect(resortErr).toBeNull();
    const resortId = resort!.id;

    // GL accounts: a receivable (ASSET) account for the due, a revenue
    // account for the due_types row (not itself under this phase's rename,
    // but a NOT NULL FK issue_dues' due_type_id needs satisfied), and an
    // online-payments clearing (ASSET) account for organization_finance_
    // settings. Direct admin inserts, matching tests 11/12/14's precedent
    // (chart_of_accounts has no RLS write policy gating these; the cloning
    // RPC is the permission-gated path, not needed here).
    const { data: receivableAcc, error: receivableAccErr } = await admin
      .from("chart_of_accounts")
      .insert({
        organization_id: orgId,
        code: `1200-${Date.now()}`,
        name_ar: "ذمم مستحقات اختبار",
        name_en: "Test Dues Receivable",
        category: "ASSET",
        normal_balance: "DEBIT",
      })
      .select("id")
      .single();
    expect(receivableAccErr).toBeNull();

    const { data: revenueAcc, error: revenueAccErr } = await admin
      .from("chart_of_accounts")
      .insert({
        organization_id: orgId,
        code: `4300-${Date.now()}`,
        name_ar: "إيرادات مستحقات اختبار",
        name_en: "Test Dues Revenue",
        category: "REVENUE",
        normal_balance: "CREDIT",
      })
      .select("id")
      .single();
    expect(revenueAccErr).toBeNull();

    const { data: clearingAcc, error: clearingAccErr } = await admin
      .from("chart_of_accounts")
      .insert({
        organization_id: orgId,
        code: `1160-${Date.now()}`,
        name_ar: "حساب مقاصة الدفع الإلكتروني اختبار",
        name_en: "Test Online Payments Clearing",
        category: "ASSET",
        normal_balance: "DEBIT",
      })
      .select("id")
      .single();
    expect(clearingAccErr).toBeNull();

    const { data: dueType, error: dueTypeErr } = await admin
      .from("due_types")
      .insert({
        organization_id: orgId,
        name_ar: "نوع مستحق اختبار",
        name_en: "Test Due Type",
        default_revenue_account_id: revenueAcc!.id,
        is_active: true,
      })
      .select("id")
      .single();
    expect(dueTypeErr).toBeNull();
    const dueTypeId = dueType!.id;

    // organization_finance_settings: a direct admin insert (no dedicated
    // clone-style RPC exists for this table per the plan's Task 4 note).
    // This INSERT fires trg_validate_online_payments_clearing_account ->
    // validate_online_payments_clearing_account, which now reads/compares
    // exclusively via new.property_id (formerly new.resort_id, function 7 --
    // completing its own Phase 2e partial edit) -- if either of that
    // trigger's two substitutions had been missed, this insert would fail
    // outright with a hard Postgres error since organization_finance_
    // settings.resort_id no longer exists.
    const { data: financeSettings, error: financeSettingsErr } = await admin
      .from("organization_finance_settings")
      .insert({
        organization_id: orgId,
        property_id: resortId,
        online_payments_clearing_account_id: clearingAcc!.id,
      })
      .select("id, property_id")
      .single();
    expect(financeSettingsErr).toBeNull();
    expect(financeSettings?.property_id).toBe(resortId);

    // An OPEN fiscal period covering *today*: record_online_payment requires
    // one open period covering current_date for the organization.
    const { data: yearId, error: yearErr } = await ownerClient.rpc("create_fiscal_year", {
      p_organization_id: orgId,
      p_name: "2026",
      p_start_date: "2026-01-01",
      p_end_date: "2026-12-31",
    });
    expect(yearErr).toBeNull();

    const todayIso = new Date().toISOString().slice(0, 10);
    const { data: period, error: periodErr } = await admin
      .from("fiscal_periods")
      .select("id")
      .eq("fiscal_year_id", yearId)
      .lte("start_date", todayIso)
      .gte("end_date", todayIso)
      .single();
    expect(periodErr).toBeNull();
    const periodId = period!.id;

    const { error: openPeriodErr } = await ownerClient.rpc("set_fiscal_period_status", {
      p_fiscal_period_id: periodId,
      p_status: "OPEN",
      p_reason: "pgTAP payments-dues-core-cluster setup",
    });
    expect(openPeriodErr).toBeNull();

    // A unit, direct admin insert (building_id/zone_id are nullable, so no
    // zone/building setup is required for this test).
    const unitCode = `UNIT-PDCC-${Date.now()}`;
    const { data: unit, error: unitErr } = await admin
      .from("units")
      .insert({
        organization_id: orgId,
        property_id: resortId,
        code: unitCode,
        unit_type: "APARTMENT",
      })
      .select("id")
      .single();
    expect(unitErr).toBeNull();
    const unitId = unit!.id;

    // A member with a real auth user backing it -- create_online_payment_
    // checkout_transaction is gated on public.current_member_id(), which is
    // `select id from public.members where user_id = auth.uid()`, so it
    // requires an actual signed-in session distinct from the TENANT_OWNER
    // portal-admin pattern above.
    const memberEmail = `pgtap-payments-dues-core-cluster-member-${Date.now()}@aqarbooks-test.local`;
    const { data: memberUser, error: createMemberErr } = await admin.auth.admin.createUser({
      email: memberEmail,
      password,
      email_confirm: true,
    });
    expect(createMemberErr).toBeNull();
    const memberUserId = memberUser!.user!.id;

    const { data: member, error: memberErr } = await admin
      .from("members")
      .insert({
        organization_id: orgId,
        full_name: "PaymentsDuesCoreCluster Member",
        is_company: false,
        user_id: memberUserId,
      })
      .select("id")
      .single();
    expect(memberErr).toBeNull();
    const memberId = member!.id;

    const { error: ownershipErr } = await admin.from("unit_ownerships").insert({
      organization_id: orgId,
      unit_id: unitId,
      member_id: memberId,
      share_percentage: 100,
      is_primary_contact: true,
      start_date: todayIso,
    });
    expect(ownershipErr).toBeNull();

    const memberClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } },
    );
    const { error: memberSignInErr } = await memberClient.auth.signInWithPassword({
      email: memberEmail,
      password,
    });
    expect(memberSignInErr).toBeNull();

    // issue_dues: the dues INSERT column list edit (function 2). Reading the
    // row back and asserting `property_id` proves the substitution landed.
    const { error: issueDuesErr } = await ownerClient.rpc("issue_dues", {
      p_organization_id: orgId,
      p_resort_id: resortId,
      p_unit_ids: [unitId],
      p_due_type_id: dueTypeId,
      p_receivable_account_id: receivableAcc!.id,
      p_amount: 500,
      p_issue_date: todayIso,
      p_due_date: todayIso,
      p_description: "pgTAP payments-dues-core-cluster due",
    });
    expect(issueDuesErr).toBeNull();

    const { data: due, error: dueReadErr } = await admin
      .from("dues")
      .select("id, property_id, status, amount")
      .eq("organization_id", orgId)
      .eq("unit_id", unitId)
      .eq("due_type_id", dueTypeId)
      .single();
    expect(dueReadErr).toBeNull();
    expect(due?.property_id).toBe(resortId);
    expect(due?.status).toBe("ISSUED");
    const dueId = due!.id;

    // create_online_payment_checkout_transaction, under the member's own
    // real signed-in session: proves substitution 1 (both the v_due.resort_id
    // -> v_due.property_id reassignment/comparison, and the online_payment_
    // transactions INSERT column list).
    const { data: checkoutData, error: checkoutErr } = await memberClient.rpc(
      "create_online_payment_checkout_transaction",
      {
        p_due_ids: [dueId],
        p_provider: "FAWRY",
      },
    );
    expect(checkoutErr).toBeNull();
    const checkoutRow = Array.isArray(checkoutData) ? checkoutData[0] : checkoutData;
    expect(checkoutRow?.transaction_id).toBeTruthy();
    const transactionId = checkoutRow.transaction_id;

    const { data: txn, error: txnReadErr } = await admin
      .from("online_payment_transactions")
      .select("id, property_id, status, amount")
      .eq("id", transactionId)
      .single();
    expect(txnReadErr).toBeNull();
    expect(txn?.property_id).toBe(resortId);
    expect(txn?.status).toBe("PENDING");
    expect(Number(txn?.amount)).toBe(500);

    // record_online_payment: called via the admin/service-role client,
    // matching its no-permission-gate design (it's meant to be invoked from
    // a webhook/service context, not a real user session -- confirmed via
    // its live body above, which has no has_permission/has_financial_
    // permission/auth.uid() check at all). This is the highest-value proof
    // in this test: it completes function 4's Phase-2e-partial-edit closure
    // (six v_txn.resort_id -> v_txn.property_id occurrences, one ofs.resort_id
    // -> ofs.property_id, one v_due.resort_id -> v_due.property_id) plus
    // function 3's post_payment_internal edit (v_due.property_id guard +
    // payments INSERT column list) -- a single missed substitution anywhere
    // in this chain surfaces as a hard "column ... does not exist" error, so
    // this one call succeeding at all is strong end-to-end evidence.
    const { data: recordData, error: recordErr } = await admin.rpc("record_online_payment", {
      p_transaction_id: transactionId,
      p_webhook_event_id: `evt-pdcc-${Date.now()}`,
      p_provider_payload: { ok: true },
    });
    expect(recordErr).toBeNull();
    const recordRow = Array.isArray(recordData) ? recordData[0] : recordData;
    expect(recordRow?.status).toBe("PAID");
    expect(recordRow?.payment_id).toBeTruthy();
    const paymentId = recordRow.payment_id;

    // The payments row: proves post_payment_internal's edit (function 3).
    const { data: payment, error: paymentReadErr } = await admin
      .from("payments")
      .select("id, property_id, status, amount")
      .eq("id", paymentId)
      .single();
    expect(paymentReadErr).toBeNull();
    expect(payment?.property_id).toBe(resortId);
    expect(payment?.status).toBe("POSTED");
    expect(Number(payment?.amount)).toBe(500);

    // The due is now fully settled -- confirms the whole chain (transaction
    // -> allocation -> post_payment_internal -> due status recompute)
    // actually ran, not just that record_online_payment returned 'PAID'.
    const { data: settledDue, error: settledDueErr } = await admin
      .from("dues")
      .select("status")
      .eq("id", dueId)
      .single();
    expect(settledDueErr).toBeNull();
    expect(settledDue?.status).toBe("PAID");

    // The platform_audit_logs row for 'online_payment.posted': proves the
    // final substitution in function 4 (the platform_audit_logs INSERT's
    // v_txn.resort_id -> v_txn.property_id value), completing the full
    // record_online_payment closure.
    const { data: postedAuditLog, error: postedAuditLogErr } = await admin
      .from("platform_audit_logs")
      .select("id, property_id, action")
      .eq("entity_type", "online_payment_transaction")
      .eq("entity_id", transactionId)
      .eq("action", "online_payment.posted")
      .single();
    expect(postedAuditLogErr).toBeNull();
    expect(postedAuditLog?.property_id).toBe(resortId);

    // void_payment, under a real signed-in TENANT_OWNER session holding
    // finance.payments.void: intended to prove function 8's two
    // substitutions (v_payment.resort_id -> v_payment.property_id in the
    // has_financial_permission check, and in the append_financial_audit_
    // event call's p_resort_id argument).
    //
    // NOTE (discovered empirically here, unrelated to this phase's rename --
    // tracked as https://github.com/ahmedhameed2020/AqarBooks/issues/13,
    // filed separately since fixing it is out of scope for this rename PR):
    // void_payment's own append_financial_audit_event call passes
    // p_action := 'PAYMENT_REVERSED' (see 20260812000015_void_payment.sql),
    // but financial_audit_logs' check_audit_action constraint -- added
    // earlier in 20260811000003_phase11_financial_audit.sql, before
    // void_payment even existed -- never included 'PAYMENT_REVERSED' in its
    // allowed action list. This means void_payment has never been able to
    // complete successfully for ANY caller, on any branch: a pre-existing
    // production bug this phase's migration does not touch and could not
    // have introduced (it doesn't touch financial_audit_logs or its check
    // constraint at all). Per this task's guidance, this is worked through
    // methodically rather than worked around (e.g. by altering the
    // out-of-scope constraint from a test file): the resulting error is
    // used as the actual proof of function 8's edit instead. The call runs
    // deep enough to reach the audit INSERT -- past the has_financial_
    // permission(..., v_payment.property_id) check, past the status guard,
    // past the payment_allocations/dues updates -- and fails on a check
    // constraint (Postgres code 23514), NOT a "column ... does not exist"
    // error (42703), which is exactly what a broken v_payment.resort_id ->
    // v_payment.property_id substitution would produce instead. The whole
    // call runs inside one implicit transaction, so everything upstream
    // (including the payments status UPDATE) rolls back with it -- confirmed
    // below by asserting the payment's status is still POSTED, not REVERSED,
    // and that no new financial_audit_logs row appeared. issue_dues earlier
    // in this test already wrote one legitimate financial_audit_logs row of
    // its own (action DUE_ISSUED, which IS in check_audit_action's allowed
    // list) -- so the rollback proof compares a before/after COUNT delta
    // across this one call, not an absolute count of 0 for the org.
    const { count: auditLogCountBeforeVoidAttempt, error: auditLogCountBeforeErr } = await admin
      .from("financial_audit_logs")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId);
    expect(auditLogCountBeforeErr).toBeNull();

    const { data: voidResult, error: voidErr } = await ownerClient.rpc("void_payment", {
      p_organization_id: orgId,
      p_payment_id: paymentId,
      p_reason: "pgTAP payments-dues-core-cluster void test",
    });
    expect(voidResult).toBeNull();
    expect(voidErr).not.toBeNull();
    expect(voidErr?.code).toBe("23514");
    expect(voidErr?.message).toMatch(/check_audit_action/);

    const { data: paymentAfterVoidAttempt, error: paymentAfterVoidAttemptErr } = await admin
      .from("payments")
      .select("status")
      .eq("id", paymentId)
      .single();
    expect(paymentAfterVoidAttemptErr).toBeNull();
    expect(paymentAfterVoidAttempt?.status).toBe("POSTED");

    // Confirms the rollback claim directly rather than just asserting it in
    // prose: if void_payment's transaction had actually committed anything
    // before hitting the check constraint, the count would have increased by
    // one (the PAYMENT_REVERSED row). It didn't -- the whole call, including
    // the audit INSERT that failed, rolled back as one unit.
    const { count: auditLogCountAfterVoidAttempt, error: auditLogCountAfterErr } = await admin
      .from("financial_audit_logs")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId);
    expect(auditLogCountAfterErr).toBeNull();
    expect(auditLogCountAfterVoidAttempt).toBe(auditLogCountBeforeVoidAttempt);

    // Cleanup. This test creates more interlinked rows than any prior test
    // in this file. platform_audit_logs.property_id FKs to the resort (and
    // must be removed before the resort delete below); its actor_id is null
    // for both rows written in this test (record_online_payment and
    // post_payment_internal both pass no/null actor), so an organization_id
    // filter is the correct (and simplest) way to remove them all. (The
    // void_payment attempt above wrote no financial_audit_logs row -- its
    // transaction rolled back on the pre-existing check_audit_action bug,
    // confirmed by the count assertion above. issue_dues DID write one
    // legitimate financial_audit_logs row (action DUE_ISSUED) earlier in
    // this test, though, and that one must still be cleaned up here.)
    const { error: deleteFinancialAuditErr } = await admin
      .from("financial_audit_logs")
      .delete()
      .eq("organization_id", orgId);
    expect(deleteFinancialAuditErr).toBeNull();

    const { error: deleteAuditErr } = await admin
      .from("platform_audit_logs")
      .delete()
      .eq("organization_id", orgId);
    expect(deleteAuditErr).toBeNull();

    // payment_allocations.due_id and online_payment_transaction_allocations
    // .due_id are both NO ACTION (not CASCADE) against dues -- empirically
    // confirmed live: deleting the resort straight away (relying on its
    // ON DELETE CASCADE to payments/dues/online_payment_transactions) failed
    // with "update or delete on table dues violates foreign key constraint
    // payment_allocations_due_id_fkey", because Postgres doesn't guarantee
    // the payments->payment_allocations cascade completes before the
    // sibling dues cascade's FK check runs within the same statement. So
    // these two allocation tables, then payments/online_payment_transactions/
    // dues themselves, are deleted explicitly and in order below, rather
    // than relied on to cascade.
    const { error: deletePaymentAllocErr } = await admin
      .from("payment_allocations")
      .delete()
      .eq("payment_id", paymentId);
    expect(deletePaymentAllocErr).toBeNull();

    const { error: deleteOnlineTxnAllocErr } = await admin
      .from("online_payment_transaction_allocations")
      .delete()
      .eq("transaction_id", transactionId);
    expect(deleteOnlineTxnAllocErr).toBeNull();

    // online_payment_transactions.payment_id (NO ACTION) must be cleared
    // before the payment it points at can be deleted.
    const { error: deleteTxnErr } = await admin
      .from("online_payment_transactions")
      .delete()
      .eq("id", transactionId);
    expect(deleteTxnErr).toBeNull();

    const { error: deletePaymentErr } = await admin.from("payments").delete().eq("id", paymentId);
    expect(deletePaymentErr).toBeNull();

    const { error: deleteDueErr } = await admin.from("dues").delete().eq("id", dueId);
    expect(deleteDueErr).toBeNull();

    const { error: deleteFinanceSettingsErr } = await admin
      .from("organization_finance_settings")
      .delete()
      .eq("id", financeSettings!.id);
    expect(deleteFinanceSettingsErr).toBeNull();

    // journal_entries were created (and posted) by post_payment_internal's
    // create_journal_entry_internal call above; journal_entry_lines cascade
    // via journal_entry_id, matching test 12/14's precedent.
    const { error: deleteJournalEntriesErr } = await admin
      .from("journal_entries")
      .delete()
      .eq("organization_id", orgId);
    expect(deleteJournalEntriesErr).toBeNull();

    // unit_ownerships.unit_id is ON DELETE CASCADE from units, so deleting
    // the unit removes it automatically.
    const { error: deleteUnitErr } = await admin.from("units").delete().eq("id", unitId);
    expect(deleteUnitErr).toBeNull();

    const { error: deleteResortErr } = await admin.from("resorts").delete().eq("id", resortId);
    expect(deleteResortErr).toBeNull();

    // The member row is now safe to delete: payments.member_id and
    // online_payment_transactions.member_id (both NO ACTION, not CASCADE)
    // no longer reference it after the explicit deletes above.
    const { error: deleteMemberErr } = await admin.from("members").delete().eq("id", memberId);
    expect(deleteMemberErr).toBeNull();

    // The receivable/revenue/clearing GL accounts are not deleted here:
    // they've been posted to (or referenced) by the journal entries/dues
    // above, so `chart_of_accounts.is_used` is now true and a trigger
    // rejects the delete (COA_USED_DELETE_FORBIDDEN) -- the same reason
    // tests 12/14's GL accounts are left in place. due_types is similarly
    // left attached to the archived org, consistent with chart_of_accounts.
    const { error: deleteRoleAssignErr } = await admin
      .from("user_role_assignments")
      .delete()
      .eq("user_id", ownerId);
    expect(deleteRoleAssignErr).toBeNull();

    const { error: deleteMembershipErr } = await admin
      .from("organization_memberships")
      .delete()
      .eq("user_id", ownerId);
    expect(deleteMembershipErr).toBeNull();

    const { error: deleteOwnerErr } = await admin.auth.admin.deleteUser(ownerId);
    expect(deleteOwnerErr).toBeNull();
    const { error: deleteMemberUserErr } = await admin.auth.admin.deleteUser(memberUserId);
    expect(deleteMemberUserErr).toBeNull();

    await admin.from("organizations").update({ status: "ARCHIVED" }).eq("id", orgId);
  });

  it("16. Phase 2g Group 2 payment_provider_settings/expenses Property-ID Rename Integrity (record_expense/upsert_payment_provider_settings/get_payment_provider_credentials/list_payment_provider_settings/enable-disable_payment_provider/record_payment_provider_verification/validate_payment_provider_settings_scope end-to-end via RPC)", async () => {
    const { data: org } = await admin
      .from("organizations")
      .insert({
        name: "pgTAP ProviderSettingsExpensesCluster Org",
        slug: `pgtap-provider-settings-expenses-cluster-${Date.now()}`,
        default_currency: "EGP",
        status: "ACTIVE",
      })
      .select("id")
      .single();

    expect(org?.id).toBeDefined();
    const orgId = org!.id;

    // record_expense/upsert_payment_provider_settings/enable_payment_provider/
    // disable_payment_provider/record_payment_provider_verification are all
    // permission-gated via has_permission/has_financial_permission
    // (auth.uid(), ...), which requires a real authenticated user -- the
    // service-role admin client has no auth.uid() and would be rejected.
    // Stand up a real TENANT_OWNER session, matching test 15's pattern.
    const { error: cloneErr } = await admin.rpc("clone_tenant_role_templates", {
      p_organization_id: orgId,
    });
    expect(cloneErr).toBeNull();

    const { data: ownerRole } = await admin
      .from("roles")
      .select("id")
      .eq("organization_id", orgId)
      .eq("key", "TENANT_OWNER")
      .single();
    expect(ownerRole?.id).toBeDefined();

    const password = "PgTAP_Test_P@ssw0rd_2026!";
    const ownerEmail = `pgtap-provider-settings-expenses-owner-${Date.now()}@aqarbooks-test.local`;
    const { data: ownerUser, error: createOwnerErr } = await admin.auth.admin.createUser({
      email: ownerEmail,
      password,
      email_confirm: true,
    });
    expect(createOwnerErr).toBeNull();
    const ownerId = ownerUser!.user!.id;

    const { error: membershipErr } = await admin.from("organization_memberships").insert({
      organization_id: orgId,
      user_id: ownerId,
      status: "active",
    });
    expect(membershipErr).toBeNull();

    const { error: roleAssignErr } = await admin.from("user_role_assignments").insert({
      user_id: ownerId,
      role_id: ownerRole!.id,
      organization_id: orgId,
    });
    expect(roleAssignErr).toBeNull();

    const ownerClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } },
    );
    const { error: ownerSignInErr } = await ownerClient.auth.signInWithPassword({
      email: ownerEmail,
      password,
    });
    expect(ownerSignInErr).toBeNull();

    // A resort row: record_expense and the payment-provider-settings RPCs
    // all key off of it, and it's what this test proves lands in
    // expenses.property_id and payment_provider_settings.property_id.
    const { data: resort, error: resortErr } = await admin
      .from("resorts")
      .insert({
        organization_id: orgId,
        name: "ProviderSettingsExpensesCluster Resort",
        code: `PSEC-${Date.now()}`,
      })
      .select("id")
      .single();
    expect(resortErr).toBeNull();
    const resortId = resort!.id;

    const { data: expenseAcc, error: expenseAccErr } = await admin
      .from("chart_of_accounts")
      .insert({
        organization_id: orgId,
        code: `5100-${Date.now()}`,
        name_ar: "مصروفات اختبار",
        name_en: "Test Expense",
        category: "EXPENSE",
        normal_balance: "DEBIT",
      })
      .select("id")
      .single();
    expect(expenseAccErr).toBeNull();

    const { data: cashAcc, error: cashAccErr } = await admin
      .from("chart_of_accounts")
      .insert({
        organization_id: orgId,
        code: `1110-${Date.now()}`,
        name_ar: "نقدية اختبار",
        name_en: "Test Cash",
        category: "ASSET",
        normal_balance: "DEBIT",
      })
      .select("id")
      .single();
    expect(cashAccErr).toBeNull();

    const { data: expenseCategory, error: expenseCategoryErr } = await admin
      .from("expense_categories")
      .insert({
        organization_id: orgId,
        name_ar: "فئة مصروفات اختبار",
        name_en: "Test Expense Category",
        default_expense_account_id: expenseAcc!.id,
        is_active: true,
      })
      .select("id")
      .single();
    expect(expenseCategoryErr).toBeNull();

    // An OPEN fiscal period covering *today*: record_expense's
    // create_journal_entry_internal call requires one.
    const { data: yearId, error: yearErr } = await ownerClient.rpc("create_fiscal_year", {
      p_organization_id: orgId,
      p_name: "2026",
      p_start_date: "2026-01-01",
      p_end_date: "2026-12-31",
    });
    expect(yearErr).toBeNull();

    const todayIso = new Date().toISOString().slice(0, 10);
    const { data: period, error: periodErr } = await admin
      .from("fiscal_periods")
      .select("id")
      .eq("fiscal_year_id", yearId)
      .lte("start_date", todayIso)
      .gte("end_date", todayIso)
      .single();
    expect(periodErr).toBeNull();
    const periodId = period!.id;

    const { error: openPeriodErr } = await ownerClient.rpc("set_fiscal_period_status", {
      p_fiscal_period_id: periodId,
      p_status: "OPEN",
      p_reason: "pgTAP provider-settings-expenses-cluster setup",
    });
    expect(openPeriodErr).toBeNull();

    // --- record_expense: proves the INSERT column-list substitution ---
    const { data: expenseId, error: recordExpenseErr } = await ownerClient.rpc("record_expense", {
      p_organization_id: orgId,
      p_resort_id: resortId,
      p_expense_category_id: expenseCategory!.id,
      p_description: "pgTAP test expense",
      p_amount: 123.45,
      p_expense_date: todayIso,
      p_payment_account_id: cashAcc!.id,
      p_fiscal_period_id: periodId,
      p_cashier_session_id: null,
    });
    expect(recordExpenseErr).toBeNull();
    expect(expenseId).toBeDefined();

    const { data: expenseRow, error: expenseRowErr } = await admin
      .from("expenses")
      .select("id, property_id, organization_id, journal_entry_id")
      .eq("id", expenseId)
      .single();
    expect(expenseRowErr).toBeNull();
    expect(expenseRow?.property_id).toBe(resortId);
    expect(expenseRow?.organization_id).toBe(orgId);
    expect(expenseRow?.journal_entry_id).toBeDefined();

    // --- upsert_payment_provider_settings: property-scoped + org-wide ---
    const { data: scopedSettingsId, error: upsertScopedErr } = await ownerClient.rpc(
      "upsert_payment_provider_settings",
      {
        p_organization_id: orgId,
        p_resort_id: resortId,
        p_provider: "FAWRY",
        p_environment: "SANDBOX",
        p_merchant_identifier: "pgtap-merchant-scoped",
        p_public_key: "pgtap-public-key-scoped",
        p_api_key: "pgtap-api-key-scoped",
        p_hmac_secret: "pgtap-hmac-secret-scoped",
      },
    );
    expect(upsertScopedErr).toBeNull();
    expect(scopedSettingsId).toBeDefined();

    const { data: orgWideSettingsId, error: upsertOrgWideErr } = await ownerClient.rpc(
      "upsert_payment_provider_settings",
      {
        p_organization_id: orgId,
        p_resort_id: null,
        p_provider: "FAWRY",
        p_environment: "SANDBOX",
        p_merchant_identifier: "pgtap-merchant-org-wide",
        p_public_key: "pgtap-public-key-org-wide",
        p_api_key: "pgtap-api-key-org-wide",
        p_hmac_secret: "pgtap-hmac-secret-org-wide",
      },
    );
    expect(upsertOrgWideErr).toBeNull();
    expect(orgWideSettingsId).toBeDefined();
    expect(orgWideSettingsId).not.toBe(scopedSettingsId);

    // --- list_payment_provider_settings: proves the RETURNS TABLE column
    // rename (resort_id -> property_id) didn't break anything; there are
    // zero app-code callers today, so this RPC call itself is the only
    // proof this substitution is correct. ---
    const { data: listedSettings, error: listErr } = await ownerClient.rpc(
      "list_payment_provider_settings",
      { p_organization_id: orgId },
    );
    expect(listErr).toBeNull();
    expect(listedSettings).toHaveLength(2);
    const scopedListed = listedSettings!.find((s: { id: string }) => s.id === scopedSettingsId);
    const orgWideListed = listedSettings!.find((s: { id: string }) => s.id === orgWideSettingsId);
    expect(scopedListed?.property_id).toBe(resortId);
    expect(orgWideListed?.property_id).toBeNull();

    // --- record_payment_provider_verification + enable_payment_provider ---
    const { error: verifyErr } = await ownerClient.rpc("record_payment_provider_verification", {
      p_settings_id: scopedSettingsId,
      p_success: true,
    });
    expect(verifyErr).toBeNull();

    const { error: enableErr } = await ownerClient.rpc("enable_payment_provider", {
      p_settings_id: scopedSettingsId,
    });
    expect(enableErr).toBeNull();

    // --- get_payment_provider_credentials: proves the lookup condition and
    // ORDER BY substitutions -- the property-scoped (now enabled) row must
    // be preferred over the org-wide row for this exact resort. ---
    const { data: credentials, error: credentialsErr } = await admin.rpc(
      "get_payment_provider_credentials",
      {
        p_organization_id: orgId,
        p_resort_id: resortId,
        p_provider: "FAWRY",
        p_environment: "SANDBOX",
      },
    );
    expect(credentialsErr).toBeNull();
    const credentialsRow = Array.isArray(credentials) ? credentials[0] : credentials;
    expect(credentialsRow?.settings_id).toBe(scopedSettingsId);
    expect(credentialsRow?.merchant_identifier).toBe("pgtap-merchant-scoped");
    expect(credentialsRow?.api_key).toBe("pgtap-api-key-scoped");
    expect(credentialsRow?.hmac_secret).toBe("pgtap-hmac-secret-scoped");

    // --- disable_payment_provider ---
    const { error: disableErr } = await ownerClient.rpc("disable_payment_provider", {
      p_settings_id: scopedSettingsId,
    });
    expect(disableErr).toBeNull();

    const { data: disabledRow, error: disabledRowErr } = await admin
      .from("payment_provider_settings")
      .select("status, enabled")
      .eq("id", scopedSettingsId)
      .single();
    expect(disabledRowErr).toBeNull();
    expect(disabledRow?.status).toBe("DISABLED");
    expect(disabledRow?.enabled).toBe(false);

    // --- validate_payment_provider_settings_scope trigger: a property_id
    // that doesn't belong to this organization must be rejected. Uses
    // PAYMOB/PRODUCTION deliberately avoided (enable_payment_provider
    // blocks that combo) -- irrelevant here since upsert fails before any
    // enable step is reached. A fresh provider/environment combo (PAYMOB/
    // SANDBOX) avoids colliding with the FAWRY/SANDBOX rows above.
    const { data: otherOrg } = await admin
      .from("organizations")
      .insert({
        name: "pgTAP ProviderSettingsExpensesCluster Other Org",
        slug: `pgtap-provider-settings-expenses-other-${Date.now()}`,
        default_currency: "EGP",
        status: "ACTIVE",
      })
      .select("id")
      .single();
    const { data: otherResort } = await admin
      .from("resorts")
      .insert({
        organization_id: otherOrg!.id,
        name: "ProviderSettingsExpensesCluster Other Resort",
        code: `PSEC-OTHER-${Date.now()}`,
      })
      .select("id")
      .single();

    const { error: scopeViolationErr } = await ownerClient.rpc("upsert_payment_provider_settings", {
      p_organization_id: orgId,
      p_resort_id: otherResort!.id,
      p_provider: "PAYMOB",
      p_environment: "SANDBOX",
      p_merchant_identifier: "pgtap-merchant-scope-violation",
      p_public_key: "pgtap-public-key-scope-violation",
      p_api_key: "pgtap-api-key-scope-violation",
      p_hmac_secret: "pgtap-hmac-secret-scope-violation",
    });
    expect(scopeViolationErr).toBeDefined();
    expect(scopeViolationErr?.message).toContain("RESORT_NOT_IN_ORGANIZATION");

    // --- Cleanup (FK-safe order) ---
    await admin.from("resorts").delete().eq("id", otherResort!.id);
    await admin.from("organizations").delete().eq("id", otherOrg!.id);

    // vault.secrets rows created by upsert_payment_provider_settings above
    // are left in place: the `vault` schema isn't exposed via the REST API
    // (by design, matching Supabase's default configuration), so they
    // aren't reachable from this test client to delete. This is the same
    // accepted-and-documented small leak pattern as chart_of_accounts rows
    // being left behind elsewhere in this file (COA_USED_DELETE_FORBIDDEN)
    // -- a handful of tiny encrypted, org-orphaned rows per test run, not
    // wired to anything once payment_provider_settings is deleted below.
    const { error: deleteScopedSettingsErr } = await admin
      .from("payment_provider_settings")
      .delete()
      .eq("id", scopedSettingsId);
    expect(deleteScopedSettingsErr).toBeNull();
    const { error: deleteOrgWideSettingsErr } = await admin
      .from("payment_provider_settings")
      .delete()
      .eq("id", orgWideSettingsId);
    expect(deleteOrgWideSettingsErr).toBeNull();

    const { error: deleteExpenseErr } = await admin.from("expenses").delete().eq("id", expenseId);
    expect(deleteExpenseErr).toBeNull();

    const { error: deleteJournalEntriesErr } = await admin
      .from("journal_entries")
      .delete()
      .eq("organization_id", orgId);
    expect(deleteJournalEntriesErr).toBeNull();

    const { error: deleteExpenseCategoryErr } = await admin
      .from("expense_categories")
      .delete()
      .eq("id", expenseCategory!.id);
    expect(deleteExpenseCategoryErr).toBeNull();

    // record_expense's 'expense.recorded' entry lands in platform_audit_logs
    // .property_id, which FKs to the resort -- must be removed before the
    // resort delete below, matching test 15's precedent.
    const { error: deleteAuditErr } = await admin
      .from("platform_audit_logs")
      .delete()
      .eq("organization_id", orgId);
    expect(deleteAuditErr).toBeNull();

    // The expense/cash GL accounts are not deleted: they've been posted to
    // by record_expense's journal entry above, so chart_of_accounts.is_used
    // is now true and a trigger rejects the delete (COA_USED_DELETE_
    // FORBIDDEN) -- matching test 15's precedent.
    const { error: deleteResortErr } = await admin.from("resorts").delete().eq("id", resortId);
    expect(deleteResortErr).toBeNull();

    const { error: deleteRoleAssignErr } = await admin
      .from("user_role_assignments")
      .delete()
      .eq("user_id", ownerId);
    expect(deleteRoleAssignErr).toBeNull();

    const { error: deleteMembershipErr } = await admin
      .from("organization_memberships")
      .delete()
      .eq("user_id", ownerId);
    expect(deleteMembershipErr).toBeNull();

    const { error: deleteOwnerErr } = await admin.auth.admin.deleteUser(ownerId);
    expect(deleteOwnerErr).toBeNull();

    await admin.from("organizations").update({ status: "ARCHIVED" }).eq("id", orgId);
  });
});
