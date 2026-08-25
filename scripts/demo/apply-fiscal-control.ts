import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../lib/supabase/types";

/**
 * F0 — fiscal control.
 *
 * WHAT THIS STAGE IS AND IS NOT
 * It moves period statuses and nothing else. No due, no payment, no journal
 * line. It exists because every financial RPC that follows is gated on a period
 * being OPEN, so the periods have to be arranged before the first transaction
 * rather than as a side effect of one.
 *
 * WHY ONLY JANUARY THROUGH MAY IN THIS STEP
 * The narrative posts May, June, July and August activity, opening each month,
 * writing into it, reconciling and closing it before moving on. Opening June
 * now would leave a period open that nothing is going to write into for a
 * while, and an OPEN period with no activity is an invitation to post into the
 * wrong month. So this step arranges exactly what May needs: the months before
 * it closed, and May itself open.
 *
 * WHY IT IS A DELTA
 * `set_fiscal_period_status` writes an audit row on every call, including one
 * that sets a period to the status it already has. A re-run that "reapplied"
 * the same twelve statuses would leave twelve meaningless audit entries each
 * time and make the trail useless for the thing it is there for. So a period
 * already at its target is skipped, and a second run performs no writes at all.
 */

export type FiscalTarget = {
  /** YYYY-MM, matched against the period covering that month. */
  period: string;
  status: "PLANNED" | "OPEN" | "CLOSED" | "LOCKED";
  reason: string;
};

/**
 * This step only. June through December are deliberately absent: a target that
 * is not listed is not touched, which is what makes the stage safe to run
 * repeatedly while the narrative advances month by month.
 */
export const F0_TARGETS: FiscalTarget[] = [
  { period: "2026-01", status: "CLOSED", reason: "Demo historical period initialization" },
  { period: "2026-02", status: "CLOSED", reason: "Demo historical period initialization" },
  { period: "2026-03", status: "CLOSED", reason: "Demo historical period initialization" },
  { period: "2026-04", status: "CLOSED", reason: "Demo historical period initialization" },
  {
    period: "2026-05",
    status: "OPEN",
    reason: "Demo financial narrative – May 2026 open for historical activity",
  },
];

export type FiscalChange = {
  period: string;
  from: string;
  to: string;
  applied: boolean;
  reason: string;
};

export type FiscalControlReport = {
  ok: boolean;
  dryRun: boolean;
  changes: FiscalChange[];
  /** Periods already at target, skipped without a call. */
  unchanged: Array<{ period: string; status: string }>;
  /** Periods present in the tenant but not named by F0_TARGETS. */
  untouched: Array<{ period: string; status: string }>;
  failure?: string;
};

export async function applyFiscalControl(options: {
  admin: SupabaseClient<Database>;
  owner: SupabaseClient<Database>;
  organizationId: string;
  dryRun: boolean;
}): Promise<FiscalControlReport> {
  const { admin, owner, organizationId, dryRun } = options;
  const report: FiscalControlReport = {
    ok: false,
    dryRun,
    changes: [],
    unchanged: [],
    untouched: [],
  };

  try {
    const { data: periods, error } = await admin
      .from("fiscal_periods")
      .select("id, name, start_date, end_date, status")
      .eq("organization_id", organizationId)
      .order("start_date");

    if (error) throw new Error(`fiscal_periods read failed: ${error.message}`);
    if (!periods || periods.length === 0) throw new Error("the tenant has no fiscal periods");

    // Matched on the month the period COVERS rather than on its name: names are
    // free text and a rename would silently retarget the wrong month.
    const byMonth = new Map<string, (typeof periods)[number]>();
    for (const period of periods) {
      byMonth.set(period.start_date.slice(0, 7), period);
    }

    const targeted = new Set(F0_TARGETS.map((t) => t.period));
    for (const period of periods) {
      const month = period.start_date.slice(0, 7);
      if (!targeted.has(month)) {
        report.untouched.push({ period: month, status: period.status });
      }
    }

    for (const target of F0_TARGETS) {
      const period = byMonth.get(target.period);
      if (!period) {
        throw new Error(`no fiscal period covers ${target.period}`);
      }

      if (period.status === target.status) {
        report.unchanged.push({ period: target.period, status: period.status });
        continue;
      }

      if (!dryRun) {
        const { error: rpcError } = await owner.rpc("set_fiscal_period_status", {
          p_fiscal_period_id: period.id,
          p_status: target.status,
          p_reason: target.reason,
        });
        if (rpcError) {
          throw new Error(
            `set_fiscal_period_status(${target.period} -> ${target.status}) failed: ${rpcError.message}`,
          );
        }
      }

      report.changes.push({
        period: target.period,
        from: period.status,
        to: target.status,
        applied: !dryRun,
        reason: target.reason,
      });
    }

    report.ok = true;
    return report;
  } catch (err) {
    report.failure = err instanceof Error ? err.message : String(err);
    return report;
  }
}

export type FiscalVerification = { pass: boolean; text: string };

/**
 * Verifies the resulting state and its audit trail, read fresh.
 *
 * The audit check is not decoration. `set_fiscal_period_status` is the only
 * sanctioned way to move a period, and the audit row is the evidence it was
 * used -- a status that changed without a matching row would mean someone
 * updated the table directly.
 */
export async function verifyFiscalControl(
  admin: SupabaseClient<Database>,
  organizationId: string,
): Promise<FiscalVerification> {
  const lines: string[] = [];
  let pass = true;

  const { data: periods } = await admin
    .from("fiscal_periods")
    .select("id, start_date, status")
    .eq("organization_id", organizationId)
    .order("start_date");

  const { data: audit } = await admin
    .from("platform_audit_logs")
    .select("entity_id, action, reason, safe_change_summary, created_at")
    .eq("organization_id", organizationId)
    .eq("action", "fiscal_period.status_changed")
    .order("created_at");

  const auditByPeriod = new Map<string, number>();
  for (const row of audit ?? []) {
    if (!row.entity_id) continue;
    auditByPeriod.set(row.entity_id, (auditByPeriod.get(row.entity_id) ?? 0) + 1);
  }

  lines.push("FISCAL PERIOD STATE");
  lines.push("-".repeat(72));

  const targetByMonth = new Map(F0_TARGETS.map((t) => [t.period, t.status]));

  for (const period of periods ?? []) {
    const month = period.start_date.slice(0, 7);
    const expected = targetByMonth.get(month);
    const audits = auditByPeriod.get(period.id) ?? 0;

    if (expected) {
      const ok = period.status === expected;
      if (!ok) pass = false;
      // A targeted period must carry at least one audit row: it changed, and
      // the RPC is the only thing that should have changed it.
      const audited = audits > 0;
      if (!audited) pass = false;
      lines.push(
        `  ${month}   ${period.status.padEnd(8)} expected ${expected.padEnd(8)} audit rows ${String(audits).padStart(2)}   ${ok && audited ? "PASS" : "FAIL"}`,
      );
    } else {
      // Untargeted periods must be untouched, which means no audit row at all.
      const ok = period.status === "PLANNED" && audits === 0;
      if (!ok) pass = false;
      lines.push(
        `  ${month}   ${period.status.padEnd(8)} untouched          audit rows ${String(audits).padStart(2)}   ${ok ? "PASS" : "FAIL"}`,
      );
    }
  }

  lines.push("");
  lines.push("AUDIT TRAIL");
  lines.push("-".repeat(72));
  lines.push(`  fiscal_period.status_changed rows   ${(audit ?? []).length}`);

  const withoutReason = (audit ?? []).filter((r) => !r.reason || r.reason.trim() === "");
  if (withoutReason.length > 0) pass = false;
  lines.push(
    `  rows carrying a reason              ${(audit ?? []).length - withoutReason.length} / ${(audit ?? []).length}   ${withoutReason.length === 0 ? "PASS" : "FAIL"}`,
  );

  for (const row of audit ?? []) {
    const summary = row.safe_change_summary as { new_status?: string } | null;
    lines.push(`    ${String(summary?.new_status ?? "?").padEnd(8)}${row.reason ?? ""}`);
  }

  lines.push("");
  lines.push(`FISCAL CONTROL   ${pass ? "PASS" : "FAIL"}`);
  return { pass, text: lines.join("\n") };
}

export function renderFiscalControl(report: FiscalControlReport): string {
  const lines: string[] = [];
  lines.push(`F0 FISCAL CONTROL ${report.dryRun ? "— DRY RUN" : "— APPLY"}`);
  lines.push("=".repeat(72));
  lines.push("");

  if (report.changes.length === 0) {
    lines.push("  No change required. Every targeted period is already at its target.");
  } else {
    for (const change of report.changes) {
      lines.push(
        `  ${change.period}   ${change.from.padEnd(8)} -> ${change.to.padEnd(8)} ${change.applied ? "applied" : "would apply"}`,
      );
      lines.push(`             ${change.reason}`);
    }
  }

  if (report.unchanged.length > 0) {
    lines.push("");
    lines.push("  Already at target (no call made, no audit row written):");
    for (const row of report.unchanged) lines.push(`    ${row.period}   ${row.status}`);
  }

  if (report.untouched.length > 0) {
    lines.push("");
    lines.push("  Not targeted by this step, deliberately left alone:");
    lines.push(
      `    ${report.untouched.map((r) => r.period).join(", ")}   all ${[...new Set(report.untouched.map((r) => r.status))].join("/")}`,
    );
  }

  if (report.failure) {
    lines.push("");
    lines.push(`FAILED: ${report.failure}`);
    lines.push("Nothing was rolled back. Re-run to resume: the stage is a delta.");
  }

  return lines.join("\n");
}
