import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../lib/supabase/types";
import {
  planQuarterAlignment,
  quarterBillingForecast,
  duplicateActiveKeys,
  coversQuarter,
  isQuarterStart,
  isQuarterEnd,
  type AlignmentLease,
  type AlignmentPlan,
  type AlignmentTarget,
} from "./quarter-alignment";

/**
 * Applies the quarter alignment to the demo tenant's commercial leases.
 *
 * SHAPE OF THE WRITE, AND WHY IT IS SHAPED THAT WAY
 * `unit_leases` has no UPDATE path for its term -- `Insert: never` and
 * `Update: never` in the generated types, and the only date-moving RPC is
 * `end_unit_lease`, which also flips the row to ENDED. So a term change is a
 * replacement: create a DRAFT, end the old ACTIVE row, activate the DRAFT.
 *
 * ALL THIRTEEN DRAFTS ARE CREATED AND VERIFIED BEFORE ANY LEASE IS ENDED.
 * A DRAFT is inert -- `unit_leases_no_overlapping_active` constrains ACTIVE
 * rows only, so a draft can sit under a live lease on the same unit without
 * conflict. Front-loading the fallible part means a failure during preparation
 * leaves every tenancy exactly as it was.
 *
 * THE SWAP IS PER LEASE, NOT PER PHASE.
 * end-then-activate runs for one lease before the next one is touched. These
 * are two RPC calls with no transaction around them, so a failure between them
 * leaves that unit without an ACTIVE lease. Ending all thirteen first would
 * turn one failure into thirteen units with no live tenancy; doing it one at a
 * time bounds the damage to the unit being worked on, and the run stops there.
 *
 * IDEMPOTENCE
 * A resumed run recognises its own work: a target whose old row is already
 * ENDED and whose replacement is already ACTIVE is complete and skipped, and a
 * DRAFT that already matches the intended term is reused rather than duplicated.
 * A second apply over a finished alignment writes nothing.
 */

export type SwapOutcome = {
  unitCode: string;
  oldLeaseId: string;
  newLeaseId: string | null;
  from: string;
  to: string;
  reason: AlignmentTarget["reason"];
  state: "PENDING" | "DRAFT_READY" | "SWAPPED" | "ALREADY_DONE" | "FAILED";
  detail?: string;
};

export type AlignmentReport = {
  ok: boolean;
  dryRun: boolean;
  plan: AlignmentPlan;
  created: number;
  ended: number;
  activated: number;
  swaps: SwapOutcome[];
  forecast: { q2: { leases: number; amount: number }; q3: { leases: number; amount: number } };
  failure?: string;
};

export type AlignmentOptions = {
  admin: SupabaseClient<Database>;
  owner: SupabaseClient<Database>;
  organizationId: string;
  dryRun: boolean;
  log: (line: string) => void;
};

export const ALIGNMENT_REASON =
  "Demo fixture normalization — quarterly lease aligned to full-period billing boundaries before commercial financial activity";

/**
 * `lease_rent_generation_runs` is absent from the curated lib/supabase/types.ts,
 * so the typed client cannot name it. The escape is deliberately narrow -- one
 * read, one shape -- rather than hand-editing the generated types and widening
 * the gap between that file and a real regeneration. The same narrow escape is
 * used in scripts/demo/apply-f1-may-rent.ts for the two missing functions.
 */
type GenerationRunRow = { id: string; lease_id: string; period: string };

type UntypedTableRead = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (
        column: string,
        value: string,
      ) => {
        range: (
          from: number,
          to: number,
        ) => Promise<{ data: GenerationRunRow[] | null; error: { message: string } | null }>;
      };
    };
  };
};

/** Reads the real rows the plan is built from. Nothing is derived from a UUID. */
export async function readAlignmentLeases(
  admin: SupabaseClient<Database>,
  organizationId: string,
): Promise<AlignmentLease[]> {
  const { data: properties, error: pErr } = await admin
    .from("properties")
    .select("id, code")
    .eq("organization_id", organizationId)
    .range(0, 4999);
  if (pErr) throw new Error(`properties read failed: ${pErr.message}`);
  const propertyCode = new Map((properties ?? []).map((p) => [p.id, p.code]));

  const { data: units, error: uErr } = await admin
    .from("units")
    .select("id, code")
    .eq("organization_id", organizationId)
    .range(0, 4999);
  if (uErr) throw new Error(`units read failed: ${uErr.message}`);
  const unitCode = new Map((units ?? []).map((u) => [u.id, u.code]));

  const { data: leases, error: lErr } = await admin
    .from("unit_leases")
    .select(
      "id, unit_id, property_id, tenant_member_id, due_type_id, receivable_account_id, rent_amount, rent_frequency, security_deposit_amount, billing_recipient, starts_on, ends_on, status",
    )
    .eq("organization_id", organizationId)
    .order("starts_on", { ascending: true })
    .order("id", { ascending: true })
    .range(0, 4999);
  if (lErr) throw new Error(`unit_leases read failed: ${lErr.message}`);

  return (leases ?? []).map((l) => ({
    id: l.id,
    unitId: l.unit_id,
    unitCode: unitCode.get(l.unit_id) ?? l.unit_id,
    propertyId: l.property_id,
    propertyCode: propertyCode.get(l.property_id) ?? l.property_id,
    tenantMemberId: l.tenant_member_id,
    dueTypeId: l.due_type_id,
    receivableAccountId: l.receivable_account_id,
    rentAmount: Number(l.rent_amount),
    rentFrequency: l.rent_frequency,
    securityDepositAmount: Number(l.security_deposit_amount),
    billingRecipient: l.billing_recipient,
    startsOn: l.starts_on,
    endsOn: l.ends_on,
    status: l.status,
  }));
}

/**
 * Everything that must be true before a single row is written.
 *
 * Returns the reasons it is NOT safe. An empty array is the only thing that
 * lets the apply proceed.
 */
export async function alignmentPreflight(
  admin: SupabaseClient<Database>,
  organizationId: string,
  leases: AlignmentLease[],
  plan: AlignmentPlan,
): Promise<string[]> {
  const blocks: string[] = [];

  // 1. No commercial financial rows may already depend on these terms. Moving a
  //    lease that has been billed would orphan the due from its own contract.
  const quarterlyIds = new Set(
    leases.filter((l) => l.rentFrequency === "QUARTERLY").map((l) => l.id),
  );
  const { data: dues, error: dErr } = await admin
    .from("dues")
    .select("id, source_type, source_id")
    .eq("organization_id", organizationId)
    .range(0, 4999);
  if (dErr) blocks.push(`dues read failed: ${dErr.message}`);
  const quarterlyDues = (dues ?? []).filter(
    (d) => d.source_type === "LEASE_RENT" && d.source_id && quarterlyIds.has(d.source_id),
  );
  if (quarterlyDues.length > 0) {
    blocks.push(`${quarterlyDues.length} dues already reference a quarterly lease`);
  }

  const { data: runs, error: rErr } = await (admin as unknown as UntypedTableRead)
    .from("lease_rent_generation_runs")
    .select("id, lease_id, period")
    .eq("organization_id", organizationId)
    .range(0, 4999);
  if (rErr) blocks.push(`lease_rent_generation_runs read failed: ${rErr.message}`);
  const quarterlyRuns = (runs ?? []).filter((r) => quarterlyIds.has(r.lease_id));
  if (quarterlyRuns.length > 0) {
    blocks.push(`${quarterlyRuns.length} generation runs already reference a quarterly lease`);
  }

  // 2. The plan must be complete: nothing the rule could not handle.
  if (plan.unalignable.length > 0) {
    for (const u of plan.unalignable) blocks.push(`unalignable ${u.lease.unitCode}: ${u.why}`);
  }

  // 3. Every replacement must be a legal range, and must lie inside its original.
  for (const t of plan.targets) {
    if (t.newEndsOn !== null && t.newStartsOn > t.newEndsOn) {
      blocks.push(`${t.lease.unitCode}: empty replacement range`);
    }
    if (t.newStartsOn < t.lease.startsOn) {
      blocks.push(`${t.lease.unitCode}: replacement starts before the original`);
    }
    if (t.newEndsOn !== null && t.lease.endsOn !== null && t.newEndsOn > t.lease.endsOn) {
      blocks.push(`${t.lease.unitCode}: replacement ends after the original`);
    }
    if (t.endOldOn < t.lease.startsOn) {
      blocks.push(`${t.lease.unitCode}: end_unit_lease would be refused (${t.endOldOn})`);
    }
  }

  // 4. Stable keys must stay unique inside the ACTIVE set AFTER the swap.
  //    Superseded ENDED rows are excluded deliberately -- see the note on
  //    duplicateActiveKeys.
  const activeAfter = [
    ...leases
      .filter((l) => l.status === "ACTIVE" && !plan.targets.some((t) => t.lease.id === l.id))
      .map((l) => ({
        propertyCode: l.propertyCode,
        unitCode: l.unitCode,
        startsOn: l.startsOn,
        rentFrequency: l.rentFrequency,
      })),
    ...plan.targets.map((t) => ({
      propertyCode: t.lease.propertyCode,
      unitCode: t.lease.unitCode,
      startsOn: t.newStartsOn,
      rentFrequency: t.lease.rentFrequency,
    })),
  ];
  for (const key of duplicateActiveKeys(activeAfter)) {
    blocks.push(`stable key would collide inside the ACTIVE set: ${key}`);
  }

  return blocks;
}

export async function applyQuarterAlignment(
  options: AlignmentOptions,
): Promise<AlignmentReport> {
  const { admin, owner, organizationId, dryRun, log } = options;

  const leases = await readAlignmentLeases(admin, organizationId);
  const plan = planQuarterAlignment(leases);

  const report: AlignmentReport = {
    ok: false,
    dryRun,
    plan,
    created: 0,
    ended: 0,
    activated: 0,
    swaps: plan.targets.map((t) => ({
      unitCode: t.lease.unitCode,
      oldLeaseId: t.lease.id,
      newLeaseId: null,
      from: `${t.lease.startsOn}..${t.lease.endsOn ?? "open"}`,
      to: `${t.newStartsOn}..${t.newEndsOn ?? "open"}`,
      reason: t.reason,
      state: "PENDING",
    })),
    forecast: {
      q2: quarterBillingForecast(plan, "2026-Q2"),
      q3: quarterBillingForecast(plan, "2026-Q3"),
    },
  };

  try {
    const blocks = await alignmentPreflight(admin, organizationId, leases, plan);
    if (blocks.length > 0) {
      report.failure = `preflight refused:\n  ${blocks.join("\n  ")}`;
      return report;
    }

    if (dryRun) {
      log(`  would create   ${plan.targets.length} DRAFT replacements`);
      log(`  would swap     ${plan.targets.length} leases, one at a time`);
      report.ok = true;
      return report;
    }

    // ---- phase A: prepare every replacement, touching no live lease --------
    for (const [i, target] of plan.targets.entries()) {
      const swap = report.swaps[i];

      const existing = leases.find(
        (l) =>
          l.unitId === target.lease.unitId &&
          l.id !== target.lease.id &&
          l.startsOn === target.newStartsOn &&
          l.endsOn === target.newEndsOn &&
          l.rentAmount === target.lease.rentAmount &&
          l.rentFrequency === target.lease.rentFrequency &&
          (l.status === "DRAFT" || l.status === "ACTIVE"),
      );
      if (existing) {
        swap.newLeaseId = existing.id;
        swap.state = existing.status === "ACTIVE" ? "ALREADY_DONE" : "DRAFT_READY";
        continue;
      }

      const { data, error } = await owner.rpc("create_unit_lease", {
        p_organization_id: organizationId,
        p_unit_id: target.lease.unitId,
        p_tenant_member_id: target.lease.tenantMemberId,
        p_due_type_id: target.lease.dueTypeId,
        p_receivable_account_id: target.lease.receivableAccountId,
        p_rent_amount: target.lease.rentAmount,
        p_rent_frequency: target.lease.rentFrequency,
        p_starts_on: target.newStartsOn,
        p_ends_on: target.newEndsOn,
        p_security_deposit_amount: target.lease.securityDepositAmount,
        p_billing_recipient: target.lease.billingRecipient,
      });
      if (error) {
        swap.state = "FAILED";
        swap.detail = `create_unit_lease: ${error.message}`;
        report.failure = `preparing ${target.lease.unitCode} failed: ${error.message}`;
        return report;
      }
      swap.newLeaseId = data as unknown as string;
      swap.state = "DRAFT_READY";
      report.created++;
    }

    // ---- phase B: verify every draft before ending anything ----------------
    const verifyBlocks = await verifyDrafts(admin, organizationId, plan, report);
    if (verifyBlocks.length > 0) {
      report.failure = `draft verification refused:\n  ${verifyBlocks.join("\n  ")}`;
      return report;
    }
    log(`  ${report.swaps.filter((s) => s.state === "DRAFT_READY").length} drafts verified`);

    // ---- phase C: swap, one lease at a time --------------------------------
    for (const [i, target] of plan.targets.entries()) {
      const swap = report.swaps[i];
      if (swap.state === "ALREADY_DONE") continue;

      const current = await currentStatus(admin, target.lease.id);

      if (current === "ACTIVE") {
        const { error } = await owner.rpc("end_unit_lease", {
          p_lease_id: target.lease.id,
          p_ends_on: target.endOldOn,
          p_end_reason: ALIGNMENT_REASON,
        });
        if (error) {
          swap.state = "FAILED";
          swap.detail = `end_unit_lease: ${error.message}`;
          report.failure =
            `${target.lease.unitCode}: ending the old lease failed (${error.message}). ` +
            "Nothing after this lease was touched; the run is resumable.";
          return report;
        }
        report.ended++;
      }

      const { error: actErr } = await owner.rpc("activate_unit_lease", {
        p_lease_id: swap.newLeaseId!,
      });
      if (actErr) {
        swap.state = "FAILED";
        swap.detail = `activate_unit_lease: ${actErr.message}`;
        report.failure =
          `${target.lease.unitCode}: the old lease is ENDED but its replacement did NOT ` +
          `activate (${actErr.message}). This unit has no ACTIVE lease right now. ` +
          "Nothing after this lease was touched; re-run to resume from here.";
        return report;
      }
      report.activated++;
      swap.state = "SWAPPED";
    }

    report.ok = true;
    return report;
  } catch (error) {
    report.failure = error instanceof Error ? error.message : String(error);
    return report;
  }
}

async function currentStatus(
  admin: SupabaseClient<Database>,
  leaseId: string,
): Promise<string | null> {
  const { data } = await admin.from("unit_leases").select("status").eq("id", leaseId).single();
  return data?.status ?? null;
}

/**
 * Every draft must be a faithful copy of its original except for the dates.
 *
 * Read back from the database rather than trusted from the RPC's return value:
 * the point is to confirm what was stored, not what was sent.
 */
async function verifyDrafts(
  admin: SupabaseClient<Database>,
  organizationId: string,
  plan: AlignmentPlan,
  report: AlignmentReport,
): Promise<string[]> {
  const blocks: string[] = [];
  const ids = report.swaps.map((s) => s.newLeaseId).filter((id): id is string => Boolean(id));
  if (ids.length !== plan.targets.length) {
    blocks.push(`${plan.targets.length - ids.length} replacements were never created`);
    return blocks;
  }

  const { data, error } = await admin
    .from("unit_leases")
    .select(
      "id, unit_id, tenant_member_id, due_type_id, receivable_account_id, rent_amount, rent_frequency, security_deposit_amount, billing_recipient, starts_on, ends_on, status",
    )
    .eq("organization_id", organizationId)
    .in("id", ids);
  if (error) return [`draft read failed: ${error.message}`];

  const byId = new Map((data ?? []).map((r) => [r.id, r]));

  for (const [i, target] of plan.targets.entries()) {
    const row = byId.get(report.swaps[i].newLeaseId!);
    const where = target.lease.unitCode;
    if (!row) {
      blocks.push(`${where}: replacement row not readable`);
      continue;
    }
    if (row.status !== "DRAFT" && row.status !== "ACTIVE") {
      blocks.push(`${where}: replacement is ${row.status}`);
    }
    if (row.starts_on !== target.newStartsOn) {
      blocks.push(`${where}: starts_on ${row.starts_on} != ${target.newStartsOn}`);
    }
    if ((row.ends_on ?? null) !== target.newEndsOn) {
      blocks.push(`${where}: ends_on ${row.ends_on} != ${target.newEndsOn}`);
    }
    // Everything below must be IDENTICAL. A replacement that quietly changed
    // the tenant or the rent would rewrite the narrative, not normalise it.
    const same: Array<[string, unknown, unknown]> = [
      ["unit", row.unit_id, target.lease.unitId],
      ["tenant", row.tenant_member_id, target.lease.tenantMemberId],
      ["due type", row.due_type_id, target.lease.dueTypeId],
      ["AR account", row.receivable_account_id, target.lease.receivableAccountId],
      ["rent", Number(row.rent_amount), target.lease.rentAmount],
      ["frequency", row.rent_frequency, target.lease.rentFrequency],
      ["deposit", Number(row.security_deposit_amount), target.lease.securityDepositAmount],
      ["billing recipient", row.billing_recipient, target.lease.billingRecipient],
    ];
    for (const [label, got, want] of same) {
      if (got !== want) blocks.push(`${where}: ${label} changed (${String(got)} != ${String(want)})`);
    }
  }

  return blocks;
}

/**
 * Post-alignment verification, read entirely from the database.
 *
 * Nothing here is compared against a number carried in from the plan: the
 * counts and the Q2 total are recomputed from the rows that now exist. A
 * forecast that agreed with itself would prove nothing.
 */
export async function verifyAlignment(
  admin: SupabaseClient<Database>,
  organizationId: string,
): Promise<{ text: string; ok: boolean; q2: { leases: number; amount: number } }> {
  const leases = await readAlignmentLeases(admin, organizationId);
  const activeQuarterly = leases.filter(
    (l) => l.status === "ACTIVE" && l.rentFrequency === "QUARTERLY",
  );

  const misalignedStart = activeQuarterly.filter((l) => !isQuarterStart(l.startsOn));
  const misalignedEnd = activeQuarterly.filter((l) => l.endsOn !== null && !isQuarterEnd(l.endsOn));
  const q2Covering = activeQuarterly.filter((l) => coversQuarter(l, "2026-Q2"));
  const q2Partial = activeQuarterly.filter(
    (l) =>
      !coversQuarter(l, "2026-Q2") &&
      l.startsOn <= "2026-06-30" &&
      (l.endsOn ?? "9999-12-31") >= "2026-04-01",
  );
  const q2Amount = q2Covering.reduce((s, l) => s + l.rentAmount, 0);

  const dupes = duplicateActiveKeys(
    leases
      .filter((l) => l.status === "ACTIVE")
      .map((l) => ({
        propertyCode: l.propertyCode,
        unitCode: l.unitCode,
        startsOn: l.startsOn,
        rentFrequency: l.rentFrequency,
      })),
  );

  const commercial: Record<string, number> = {};
  for (const table of ["dues", "payments", "journal_entries"] as const) {
    const { count } = await admin
      .from(table)
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId);
    commercial[table] = count ?? -1;
  }

  const ok =
    misalignedStart.length === 0 &&
    misalignedEnd.length === 0 &&
    q2Partial.length === 0 &&
    dupes.length === 0;

  const lines = [
    "VERIFICATION (read from the database, not from the plan)",
    "-".repeat(72),
    `  ACTIVE quarterly leases       ${activeQuarterly.length}`,
    `  misaligned starts             ${misalignedStart.length}`,
    `  misaligned ends               ${misalignedEnd.length}`,
    `  partial for 2026-Q2           ${q2Partial.length}`,
    `  fully covering 2026-Q2        ${q2Covering.length}`,
    `  2026-Q2 amount                ${q2Amount.toFixed(2)}`,
    `  duplicate ACTIVE stable keys  ${dupes.length}`,
    "",
    `  dues                          ${commercial.dues}`,
    `  payments                      ${commercial.payments}`,
    `  journal entries               ${commercial.journal_entries}`,
  ];
  for (const d of dupes) lines.push(`    COLLISION ${d}`);
  for (const l of misalignedStart) lines.push(`    START ${l.unitCode} ${l.startsOn}`);
  for (const l of misalignedEnd) lines.push(`    END   ${l.unitCode} ${l.endsOn}`);

  return { text: lines.join("\n"), ok, q2: { leases: q2Covering.length, amount: q2Amount } };
}
