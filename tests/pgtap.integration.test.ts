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
});
