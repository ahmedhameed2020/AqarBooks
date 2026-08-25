import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../lib/supabase/types";

/**
 * The August common-area service charge for New Horizon.
 *
 * WHY THE LEVY HEADER IS AN INSERT AND EVERYTHING ELSE IS AN RPC
 * There is no `create_service_charge_levy`. The header is an ordinary
 * RLS-gated row; the two operations that matter -- working out each unit's
 * share and turning those shares into receivables -- are
 * `compute_service_charge_allocations` and `issue_service_charge_levy`, and
 * both are called here rather than reproduced. The split is not a gap: the
 * header is a statement of intent, and the parts that must not be got wrong
 * are the ones behind the functions.
 *
 * THE TOTAL IS AN INPUT; EVERY SHARE IS DERIVED
 * 185,000.00 is the budget being recovered. No unit's share is chosen. The
 * allocation is by area, largest-remainder, and it sums to the budget to the
 * piastre by construction -- `issue_service_charge_levy` refuses to issue if it
 * does not, so an off-by-a-piastre split cannot become receivables.
 *
 * WHY CAM COMES BEFORE COLLECTIONS
 * A service charge is a receivable like any other and the collection plan has
 * to see it. Billing CAM after collections would leave 91 fresh receivables
 * that nobody in the demo ever pays, and an aging report where the service
 * charge is permanently outstanding says something false about the product.
 */

export const CAM_TOTAL = 185_000;
export const CAM_PERIOD_START = "2026-08-01";
export const CAM_PERIOD_END = "2026-08-31";
export const CAM_NAME = "رسوم الخدمة — أغسطس 2026 / August 2026 Common Area Service Charge";

export type CamReport = {
  ok: boolean;
  dryRun: boolean;
  levyId: string | null;
  propertyCode: string;
  eligibleUnits: number;
  basisSum: number;
  allocatedTotal: number;
  levyTotal: number;
  duesIssued: number;
  alreadyIssued: boolean;
  failure?: string;
};

export type CamOptions = {
  admin: SupabaseClient<Database>;
  owner: SupabaseClient<Database>;
  organizationId: string;
  propertyCode: string;
  dryRun: boolean;
  log: (line: string) => void;
};

type UntypedRpc = {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
};

export async function applyCam(options: CamOptions): Promise<CamReport> {
  const { admin, owner, organizationId, propertyCode, dryRun, log } = options;

  const report: CamReport = {
    ok: false,
    dryRun,
    levyId: null,
    propertyCode,
    eligibleUnits: 0,
    basisSum: 0,
    allocatedTotal: 0,
    levyTotal: CAM_TOTAL,
    duesIssued: 0,
    alreadyIssued: false,
  };

  try {
    const { data: properties } = await admin
      .from("properties")
      .select("id, code")
      .eq("organization_id", organizationId);
    const property = (properties ?? []).find((p) => p.code === propertyCode);
    if (!property) throw new Error(`no property ${propertyCode}`);

    const { data: periods } = await admin
      .from("fiscal_periods")
      .select("id, start_date, status")
      .eq("organization_id", organizationId);
    const august = (periods ?? []).find((p) => p.start_date.slice(0, 7) === "2026-08");
    if (august?.status !== "OPEN") {
      throw new Error(`2026-08 is ${august?.status ?? "missing"}, not OPEN`);
    }

    const { data: units } = await admin
      .from("units")
      .select("id, code, area, is_active")
      .eq("organization_id", organizationId)
      .eq("property_id", property.id)
      .eq("is_active", true)
      .range(0, 4999);
    const eligible = units ?? [];
    report.eligibleUnits = eligible.length;
    report.basisSum = Math.round(eligible.reduce((s, u) => s + Number(u.area ?? 0), 0) * 100) / 100;

    // A unit with no area cannot take an area-based share, and treating it as
    // zero would quietly move its cost onto its neighbours.
    const missingArea = eligible.filter((u) => u.area === null);
    if (missingArea.length > 0) {
      throw new Error(
        `${missingArea.length} active ${propertyCode} unit(s) have no area; an AREA basis ` +
          `cannot allocate to them and zero is not the same as unknown: ` +
          missingArea.slice(0, 5).map((u) => u.code).join(", "),
      );
    }

    const { data: dueTypes } = await admin
      .from("due_types")
      .select("id, name_en, default_revenue_account_id, is_active")
      .eq("organization_id", organizationId);
    const camType = (dueTypes ?? []).find(
      (d) => d.is_active && d.name_en.toLowerCase().includes("service charge"),
    );
    if (!camType) throw new Error("no active service-charge due type");

    const { data: accounts } = await admin
      .from("chart_of_accounts")
      .select("id, code")
      .eq("organization_id", organizationId);
    const receivable = (accounts ?? []).find((a) => a.code === "1130");
    if (!receivable) throw new Error("no 1130 receivable account");

    // Resume rather than duplicate: a levy for this property and period already
    // exists if an earlier run got this far.
    const { data: existing } = await admin
      .from("service_charge_levies")
      .select("id, status, total_amount")
      .eq("organization_id", organizationId)
      .eq("property_id", property.id)
      .eq("period_start", CAM_PERIOD_START)
      .range(0, 99);
    const prior = (existing ?? [])[0];

    if (prior?.status === "ISSUED") {
      report.levyId = prior.id;
      report.alreadyIssued = true;
      const { data: allocations } = await admin
        .from("service_charge_allocations")
        .select("share_amount, due_id")
        .eq("levy_id", prior.id)
        .range(0, 9999);
      report.allocatedTotal =
        Math.round((allocations ?? []).reduce((s, a) => s + Number(a.share_amount), 0) * 100) / 100;
      report.duesIssued = (allocations ?? []).filter((a) => a.due_id).length;
      log(`  levy already ISSUED with ${report.duesIssued} dues; nothing to do`);
      report.ok = true;
      return report;
    }

    if (dryRun) {
      log(`  would levy ${CAM_TOTAL.toFixed(2)} across ${report.eligibleUnits} ${propertyCode} units`);
      log(`  area basis sum ${report.basisSum.toFixed(2)} m2`);
      report.ok = true;
      return report;
    }

    let levyId = prior?.id ?? null;
    if (!levyId) {
      const { data: inserted, error } = await owner
        .from("service_charge_levies")
        .insert({
          organization_id: organizationId,
          property_id: property.id,
          name: CAM_NAME,
          period_start: CAM_PERIOD_START,
          period_end: CAM_PERIOD_END,
          total_amount: CAM_TOTAL,
          allocation_basis: "AREA",
          due_type_id: camType.id,
          receivable_account_id: receivable.id,
          issue_date: CAM_PERIOD_START,
          due_date: CAM_PERIOD_START,
        })
        .select("id")
        .single();
      if (error) throw new Error(`levy insert failed: ${error.message}`);
      levyId = inserted!.id;
    }
    report.levyId = levyId;

    const { data: computed, error: computeError } = await (owner as unknown as UntypedRpc).rpc(
      "compute_service_charge_allocations",
      { p_levy_id: levyId },
    );
    if (computeError) throw new Error(`compute_service_charge_allocations: ${computeError.message}`);
    const row = ((computed ?? []) as Array<{
      unit_count: number;
      allocated_total: number;
      levy_total: number;
    }>)[0];
    report.allocatedTotal = Math.round(Number(row?.allocated_total ?? 0) * 100) / 100;
    report.levyTotal = Math.round(Number(row?.levy_total ?? CAM_TOTAL) * 100) / 100;

    log(`  allocated ${report.allocatedTotal.toFixed(2)} across ${row?.unit_count ?? 0} units`);

    // Checked here as well as inside issue_service_charge_levy. The function
    // refuses an unbalanced split, but a refusal at that point would leave a
    // computed allocation set sitting under a DRAFT levy with no explanation.
    if (Math.abs(report.allocatedTotal - CAM_TOTAL) >= 0.005) {
      throw new Error(
        `allocation sums to ${report.allocatedTotal.toFixed(2)} against a levy of ` +
          `${CAM_TOTAL.toFixed(2)}; refusing to issue`,
      );
    }

    const { data: issued, error: issueError } = await (owner as unknown as UntypedRpc).rpc(
      "issue_service_charge_levy",
      { p_levy_id: levyId },
    );
    if (issueError) throw new Error(`issue_service_charge_levy: ${issueError.message}`);
    report.duesIssued = Number(issued ?? 0);

    report.ok = true;
    return report;
  } catch (err) {
    report.failure = err instanceof Error ? err.message : String(err);
    return report;
  }
}

export type Check = { label: string; expected: string; actual: string; pass: boolean };

export async function verifyCam(
  admin: SupabaseClient<Database>,
  organizationId: string,
  levyId: string,
): Promise<{ pass: boolean; checks: Check[]; text: string }> {
  const checks: Check[] = [];
  const detail: string[] = [];
  const add = (label: string, exp: string | number | boolean, act: string | number | boolean) =>
    checks.push({ label, expected: String(exp), actual: String(act), pass: String(exp) === String(act) });

  const { data: levy } = await admin
    .from("service_charge_levies")
    .select("id, status, total_amount, property_id, issue_date, due_date, receivable_account_id")
    .eq("id", levyId)
    .single();

  const { data: allocations } = await admin
    .from("service_charge_allocations")
    .select("id, unit_id, basis_value, share_amount, due_id")
    .eq("levy_id", levyId)
    .range(0, 9999);

  const dueIds = (allocations ?? []).map((a) => a.due_id).filter(Boolean) as string[];
  const { data: dues } = await admin
    .from("dues")
    .select("id, amount, status, issue_date, due_date, journal_entry_id, property_id")
    .in("id", dueIds.length > 0 ? dueIds : ["00000000-0000-0000-0000-000000000000"])
    .range(0, 9999);
  const dueById = new Map((dues ?? []).map((d) => [d.id, d]));

  const { data: entries } = await admin
    .from("journal_entries")
    .select("id, status")
    .eq("organization_id", organizationId)
    .range(0, 9999);
  const entryById = new Map((entries ?? []).map((e) => [e.id, e]));

  const { data: accounts } = await admin
    .from("chart_of_accounts")
    .select("id, code")
    .eq("organization_id", organizationId);
  const codeById = new Map((accounts ?? []).map((a) => [a.id, a.code]));

  const allocatedTotal =
    Math.round((allocations ?? []).reduce((s, a) => s + Number(a.share_amount), 0) * 100) / 100;
  const duesTotal =
    Math.round((dues ?? []).reduce((s, d) => s + Number(d.amount), 0) * 100) / 100;

  const problems: string[] = [];
  for (const a of allocations ?? []) {
    if (!a.due_id) {
      problems.push(`allocation ${a.id}: no due`);
      continue;
    }
    const due = dueById.get(a.due_id);
    if (!due) {
      problems.push(`allocation ${a.id}: due missing`);
      continue;
    }
    if (Number(due.amount).toFixed(2) !== Number(a.share_amount).toFixed(2)) {
      problems.push(`${a.due_id}: due ${due.amount} != share ${a.share_amount}`);
    }
    if (!due.journal_entry_id) {
      problems.push(`${a.due_id}: not posted`);
      continue;
    }
    const entry = entryById.get(due.journal_entry_id);
    if (entry?.status !== "POSTED") problems.push(`${a.due_id}: journal ${entry?.status}`);
  }
  add("every share became a posted due", 0, problems.length);
  detail.push(...problems.slice(0, 10).map((p) => `    ${p}`));

  // The residual is the whole point of a largest-remainder split: it must be
  // zero, not "small". A demo whose service charge is a piastre out invites the
  // one question the product cannot afford to answer badly.
  add("levy status", "ISSUED", levy?.status ?? "missing");
  add("allocation sum = levy total", Number(levy?.total_amount ?? 0).toFixed(2), allocatedTotal.toFixed(2));
  add("dues issued = allocations", (allocations ?? []).length, (dues ?? []).length);
  add("dues total = levy total", Number(levy?.total_amount ?? 0).toFixed(2), duesTotal.toFixed(2));
  add("rounding residual", "0.00", (allocatedTotal - Number(levy?.total_amount ?? 0)).toFixed(2));

  const camEntryIds = (dues ?? []).map((d) => d.journal_entry_id).filter(Boolean) as string[];
  const { data: camLines } = await admin
    .from("journal_entry_lines")
    .select("journal_entry_id, account_id, debit, credit")
    .in("journal_entry_id", camEntryIds.length > 0 ? camEntryIds : ["00000000-0000-0000-0000-000000000000"])
    .range(0, 9999);

  let dr = 0;
  let cr = 0;
  const wrong: string[] = [];
  for (const line of camLines ?? []) {
    const d = Number(line.debit ?? 0);
    const c = Number(line.credit ?? 0);
    dr += d;
    cr += c;
    const code = codeById.get(line.account_id);
    if (d > 0 && code !== "1130") wrong.push(`debit to ${code}`);
    if (c > 0 && code !== "4100") wrong.push(`credit to ${code}`);
  }
  add("Dr 1130 / Cr 4100 on every CAM line", 0, wrong.length);
  add("CAM debits = CAM credits", dr.toFixed(2), cr.toFixed(2));
  add("CAM revenue = levy total", Number(levy?.total_amount ?? 0).toFixed(2), cr.toFixed(2));

  const lines = ["CAM VERIFICATION (read from the ledger)", "-".repeat(72)];
  for (const c of checks) {
    lines.push(
      `  ${c.label.padEnd(44)}${c.actual.padStart(14)}   expected ${c.expected.padStart(14)}   ${c.pass ? "PASS" : "FAIL"}`,
    );
  }
  if (detail.filter(Boolean).length > 0) lines.push("", ...detail.filter(Boolean));

  const pass = checks.every((c) => c.pass);
  lines.push("", `AUGUST CAM   ${pass ? "PASS" : "FAIL"}`);
  return { pass, checks, text: lines.join("\n") };
}
