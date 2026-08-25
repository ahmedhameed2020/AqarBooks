import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../lib/supabase/types";
import { DEMO_STORY } from "../../lib/demo/story";
import { buildRepairPlan, type RepairInput, type RepairPlan } from "./repair-plan";

/**
 * Applies the structural repair.
 *
 * WHY CREATE BEFORE END
 * The order is not cosmetic. `end_unit_lease` is a one-way transition on a live
 * contract; creating a Palm Gate lease is additive to units that hold nothing.
 * So the additive half runs first and is verified before anything is ended.
 *
 * If this fails part-way BEFORE step 6, the worst state is a demo tenant with
 * more active leases than the plan intends -- ugly, resumable, and harmless.
 * Had the ends run first and the creates then failed, existing contracts would
 * have been terminated for nothing.
 *
 * WHY THE ENDED LEASES CANNOT LEAK INTO THE FINANCIAL STORY
 * `generate_lease_rent_dues` returns early for any lease whose status is not
 * ACTIVE. The eighteen ended contracts stay as history and can never produce a
 * May–August rent due, which is what makes ending them safe rather than merely
 * tidy.
 */

export type RepairStep = { step: string; detail: string; count?: number };

export type RepairApplyReport = {
  ok: boolean;
  dryRun: boolean;
  steps: RepairStep[];
  failure?: string;
  /** Filled once step 5 has passed. */
  palmGateVerified?: boolean;
};

export type RepairApplyOptions = {
  admin: SupabaseClient<Database>;
  owner: SupabaseClient<Database>;
  organizationId: string;
  dryRun: boolean;
  log: (line: string) => void;
};

/**
 * Stated in the audit trail rather than left to a default.
 *
 * A generic reason would read, months later, as a real commercial termination
 * of eighteen tenancies. It was not: it is a fixture being corrected before any
 * money exists.
 */
export const REPAIR_END_REASON =
  "Demo seed structural correction — tenure redistributed before financial activity";

export const REPAIR_END_DATE = DEMO_STORY.asOfDate;

export async function applyStructuralRepair(
  options: RepairApplyOptions,
): Promise<RepairApplyReport> {
  const { admin, owner, organizationId, dryRun, log } = options;
  const report: RepairApplyReport = { ok: false, dryRun, steps: [] };

  const note = (step: string, detail: string, count?: number) => {
    report.steps.push({ step, detail, count });
    log(`  ${step.padEnd(34)}${count === undefined ? "" : String(count).padStart(4)}  ${detail}`);
  };

  try {
    // -- 1. Re-measure ------------------------------------------------------
    const plan = await readPlan(admin, organizationId);

    if (plan.ownershipsToEnd.length + plan.ownershipsToCreate.length !== 0) {
      throw new Error(
        `Refusing: the plan wants ${plan.ownershipsToEnd.length + plan.ownershipsToCreate.length} ` +
          "ownership changes. This repair moves tenancies only.",
      );
    }
    if (plan.leasesToCreate.length !== plan.leasesToEnd.length) {
      throw new Error(
        `Refusing: ${plan.leasesToCreate.length} creates vs ${plan.leasesToEnd.length} ends. ` +
          "The repair must not change how many tenancies exist.",
      );
    }
    note("1. preconditions re-measured", "ownership churn 0, creates = ends", plan.leasesToCreate.length);

    // Everything the leases need must already exist, and is resolved before any
    // write so a missing reference fails before the first row rather than
    // half-way through.
    const { data: units } = await admin
      .from("units")
      .select("id, code")
      .eq("organization_id", organizationId)
      .range(0, 4999);
    const unitIdByCode = new Map((units ?? []).map((u) => [u.code, u.id]));

    const { data: dueTypes } = await admin
      .from("due_types")
      .select("id, name_en")
      .eq("organization_id", organizationId);
    const rentDueType = (dueTypes ?? []).find((d) => d.name_en === "Unit Rent");

    const { data: accounts } = await admin
      .from("chart_of_accounts")
      .select("id, code")
      .eq("organization_id", organizationId);
    const receivable = (accounts ?? []).find((a) => a.code === "1130");

    if (!rentDueType) throw new Error("The 'Unit Rent' due type is missing.");
    if (!receivable) throw new Error("Receivable account 1130 is missing.");

    // -- 2. Company members -------------------------------------------------
    const { data: existingMembers } = await admin
      .from("members")
      .select("id, email")
      .eq("organization_id", organizationId)
      .range(0, 4999);
    const memberIdByEmail = new Map(
      (existingMembers ?? []).filter((m) => m.email).map((m) => [m.email as string, m.id]),
    );

    const missingMembers = plan.membersToCreate.filter((m) => !memberIdByEmail.has(m.email));

    if (!dryRun && missingMembers.length > 0) {
      const { data: inserted, error } = await admin
        .from("members")
        .insert(
          missingMembers.map((m) => ({
            organization_id: organizationId,
            full_name: m.fullName,
            phone: m.phone,
            email: m.email,
            is_company: m.isCompany,
          })),
        )
        .select("id, email");
      if (error) throw new Error(`members insert failed: ${error.message}`);
      for (const row of inserted ?? []) {
        if (row.email) memberIdByEmail.set(row.email, row.id);
      }
    }
    note(
      "2. commercial members created",
      `${missingMembers.filter((m) => m.isCompany).length} companies`,
      missingMembers.length,
    );

    // -- 3 & 4. Create then activate ---------------------------------------
    // Additive, on units that currently hold nothing. Done before any ending.
    let created = 0;
    let activated = 0;

    for (const lease of plan.leasesToCreate) {
      const unitId = unitIdByCode.get(lease.unitCode);
      const memberId = memberIdByEmail.get(lease.memberEmail);
      if (!unitId) throw new Error(`unresolved unit ${lease.unitCode}`);
      if (!memberId && !dryRun) throw new Error(`unresolved member ${lease.memberEmail}`);

      if (dryRun) {
        created++;
        activated++;
        continue;
      }

      const { data: leaseId, error: createErr } = await owner.rpc("create_unit_lease", {
        p_organization_id: organizationId,
        p_unit_id: unitId,
        p_tenant_member_id: memberId!,
        p_due_type_id: rentDueType.id,
        p_receivable_account_id: receivable.id,
        p_rent_amount: lease.rentAmount,
        p_rent_frequency: lease.rentFrequency,
        p_starts_on: lease.startsOn,
        p_ends_on: lease.endsOn,
        p_security_deposit_amount: lease.rentAmount * 2,
        p_billing_recipient: "TENANT",
      });
      if (createErr) {
        throw new Error(`create_unit_lease(${lease.unitCode}) failed: ${createErr.message}`);
      }
      created++;

      const { error: activateErr } = await owner.rpc("activate_unit_lease", {
        p_lease_id: leaseId as unknown as string,
      });
      if (activateErr) {
        throw new Error(`activate_unit_lease(${lease.unitCode}) failed: ${activateErr.message}`);
      }
      activated++;
    }

    note("3. PG leases created (DRAFT)", "create_unit_lease", created);
    note("4. PG leases activated", "activate_unit_lease", activated);

    // -- 5. Verify BEFORE ending anything -----------------------------------
    if (!dryRun) {
      const check = await verifyPalmGate(admin, organizationId);
      if (!check.ok) {
        throw new Error(
          `Palm Gate verification failed before the ending step: ${check.reason}. ` +
            "Nothing has been ended; resume rather than roll back.",
        );
      }
      report.palmGateVerified = true;
      note("5. Palm Gate verified", check.reason, check.activeLeases);
    } else {
      note("5. Palm Gate verified", "skipped in dry run");
    }

    // -- 6. Only now, end the surplus ---------------------------------------
    let ended = 0;
    for (const lease of plan.leasesToEnd) {
      if (dryRun) {
        ended++;
        continue;
      }
      const { error } = await owner.rpc("end_unit_lease", {
        p_lease_id: lease.leaseId,
        p_ends_on: REPAIR_END_DATE,
        p_end_reason: REPAIR_END_REASON,
      });
      if (error) throw new Error(`end_unit_lease(${lease.unitCode}) failed: ${error.message}`);
      ended++;
    }
    note("6. surplus leases ended", REPAIR_END_REASON, ended);

    report.ok = true;
    return report;
  } catch (err) {
    report.failure = err instanceof Error ? err.message : String(err);
    log("");
    log(`FAILED: ${report.failure}`);
    log("Nothing was cleaned up. Re-run to resume: every step is idempotent.");
    return report;
  }
}

async function readPlan(
  admin: SupabaseClient<Database>,
  organizationId: string,
): Promise<RepairPlan> {
  const { data: properties } = await admin
    .from("properties")
    .select("id, code")
    .eq("organization_id", organizationId);
  const propertyCodeById = new Map((properties ?? []).map((p) => [p.id, p.code]));

  const { data: units } = await admin
    .from("units")
    .select("id, code, property_id")
    .eq("organization_id", organizationId)
    .range(0, 4999);

  const unitCodeById = new Map((units ?? []).map((u) => [u.id, u.code]));

  const { data: leases } = await admin
    .from("unit_leases")
    .select("id, unit_id, tenant_member_id, status, rent_frequency")
    .eq("organization_id", organizationId)
    .range(0, 4999);

  const { data: ownerships } = await admin
    .from("unit_ownerships")
    .select("unit_id, member_id")
    .eq("organization_id", organizationId)
    .range(0, 4999);

  const { data: members } = await admin
    .from("members")
    .select("id, email, is_company")
    .eq("organization_id", organizationId)
    .range(0, 4999);

  const input: RepairInput = {
    unitIdByCode: new Map((units ?? []).map((u) => [u.code, u.id])),
    propertyCodeByUnitCode: new Map(
      (units ?? []).map((u) => [u.code, propertyCodeById.get(u.property_id) ?? "?"]),
    ),
    currentLeases: (leases ?? []).map((l) => ({
      id: l.id,
      unitId: l.unit_id,
      unitCode: unitCodeById.get(l.unit_id) ?? "?",
      tenantMemberId: l.tenant_member_id,
      status: l.status,
      rentFrequency: l.rent_frequency,
    })),
    currentOwnerships: (ownerships ?? []).map((o) => ({
      unitId: o.unit_id,
      unitCode: unitCodeById.get(o.unit_id) ?? "?",
      memberId: o.member_id,
    })),
    currentMembers: (members ?? []).map((m) => ({
      id: m.id,
      email: m.email,
      isCompany: m.is_company,
    })),
  };

  return buildRepairPlan(input);
}

/**
 * Step 5. The gate between the additive half and the destructive half.
 *
 * Read fresh from the database rather than counted from what the loop above
 * believes it did -- the whole point is to check the writes landed, and the
 * loop's own tally cannot answer that.
 */
async function verifyPalmGate(
  admin: SupabaseClient<Database>,
  organizationId: string,
): Promise<{ ok: boolean; reason: string; activeLeases: number }> {
  const { data: properties } = await admin
    .from("properties")
    .select("id, code")
    .eq("organization_id", organizationId);
  const pg = (properties ?? []).find((p) => p.code === "PG");
  if (!pg) return { ok: false, reason: "property PG not found", activeLeases: 0 };

  const { data: units } = await admin
    .from("units")
    .select("id, archived_at")
    .eq("organization_id", organizationId)
    .eq("property_id", pg.id)
    .range(0, 4999);

  const pgUnitIds = new Set((units ?? []).map((u) => u.id));
  const archived = new Set((units ?? []).filter((u) => u.archived_at !== null).map((u) => u.id));

  const { data: leases } = await admin
    .from("unit_leases")
    .select("id, unit_id, status, rent_frequency")
    .eq("organization_id", organizationId)
    .range(0, 4999);

  const pgActive = (leases ?? []).filter(
    (l) => l.status === "ACTIVE" && pgUnitIds.has(l.unit_id),
  );

  const expected = DEMO_STORY.occupancyPlan.find((p) => p.propertyCode === "PG")!.leased;

  if (pgActive.length !== expected) {
    return {
      ok: false,
      reason: `expected ${expected} active PG leases, found ${pgActive.length}`,
      activeLeases: pgActive.length,
    };
  }

  const notQuarterly = pgActive.filter((l) => l.rent_frequency !== "QUARTERLY");
  if (notQuarterly.length > 0) {
    return {
      ok: false,
      reason: `${notQuarterly.length} PG lease(s) are not QUARTERLY`,
      activeLeases: pgActive.length,
    };
  }

  const onArchived = pgActive.filter((l) => archived.has(l.unit_id));
  if (onArchived.length > 0) {
    return {
      ok: false,
      reason: `${onArchived.length} PG lease(s) sit on archived units`,
      activeLeases: pgActive.length,
    };
  }

  const perUnit = new Map<string, number>();
  for (const lease of pgActive) perUnit.set(lease.unit_id, (perUnit.get(lease.unit_id) ?? 0) + 1);
  const doubled = [...perUnit.values()].filter((n) => n > 1).length;
  if (doubled > 0) {
    return {
      ok: false,
      reason: `${doubled} PG unit(s) carry more than one active lease`,
      activeLeases: pgActive.length,
    };
  }

  return {
    ok: true,
    reason: `${pgActive.length} active, all QUARTERLY, one per unit`,
    activeLeases: pgActive.length,
  };
}
