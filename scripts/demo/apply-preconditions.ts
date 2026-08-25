import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../lib/supabase/types";
import { DEMO_STORY } from "../../lib/demo/story";

/**
 * Conditions re-checked at the instant of the apply.
 *
 * WHY THIS IS SEPARATE FROM THE SEED GUARD
 * The guard in demo-guard.ts answers "is this the demo tenant?" and runs for
 * dry runs too. This answers a different and narrower question: "is it still
 * safe to write, right now?"
 *
 * The dry run and the apply are separate invocations, minutes or days apart.
 * Between them a subscription could have been attached, a role reassigned, or
 * the tenant partially seeded by someone else. A report that was true when it
 * was printed is not a licence to write later, so every precondition is
 * re-measured rather than inherited from the dry run.
 *
 * WHY THE EMPTINESS CHECKS ARE HERE AND NOT IN THE GUARD
 * The seed is idempotent and resumes safely, so a partially populated tenant is
 * not inherently unsafe. But a FIRST apply into a tenant that already holds
 * units means something happened that nobody expected, and the right response
 * is to stop and look rather than to merge into it. The caller decides whether
 * emptiness is required; a resume passes `requireEmpty: false`.
 */

export type PreconditionResult = {
  label: string;
  expected: string;
  actual: string;
  pass: boolean;
};

export type PreconditionReport = {
  pass: boolean;
  results: PreconditionResult[];
};

export type PreconditionInput = {
  admin: SupabaseClient<Database>;
  organizationId: string;
  configuredDemoOrganizationId: string | null | undefined;
  expectedSlug: string;
  ownerUserId: string;
  demoUserId: string;
  /** False when resuming an interrupted apply. */
  requireEmpty: boolean;
};

export async function checkApplyPreconditions(
  input: PreconditionInput,
): Promise<PreconditionReport> {
  const { admin, organizationId, configuredDemoOrganizationId, expectedSlug } = input;
  const results: PreconditionResult[] = [];

  const check = (label: string, expected: string, actual: string, pass: boolean) =>
    results.push({ label, expected, actual, pass });

  // --- identity ------------------------------------------------------------
  check(
    "DEMO_ORGANIZATION_ID matches target",
    organizationId,
    configuredDemoOrganizationId ?? "(unset)",
    configuredDemoOrganizationId === organizationId,
  );

  const { data: org, error: orgErr } = await admin
    .from("organizations")
    .select("id, name, slug, status, is_demo")
    .eq("id", organizationId)
    .maybeSingle();

  if (orgErr || !org) {
    check("target organization readable", "1 row", orgErr?.message ?? "not found", false);
    return { pass: false, results };
  }

  check("is_demo", "true", String(org.is_demo), org.is_demo === true);
  check("status", "ACTIVE", org.status, org.status === "ACTIVE");
  check("slug", expectedSlug, org.slug, org.slug === expectedSlug);
  check("name", DEMO_STORY.organization.nameEn, org.name, org.name === DEMO_STORY.organization.nameEn);

  const { data: flagged } = await admin.from("organizations").select("id").eq("is_demo", true);
  check(
    "exactly one demo organization",
    "1",
    String((flagged ?? []).length),
    (flagged ?? []).length === 1,
  );

  const { data: subs } = await admin
    .from("subscriptions")
    .select("id")
    .eq("organization_id", organizationId);
  check("subscription rows", "0", String((subs ?? []).length), (subs ?? []).length === 0);

  // --- accounts ------------------------------------------------------------
  // Role assignments are read through the join rather than assumed from how the
  // tenant was provisioned: the whole point of re-checking is that provisioning
  // happened elsewhere.
  const { data: assignments } = await admin
    .from("user_role_assignments")
    .select("user_id, roles(key, organization_id)")
    .eq("organization_id", organizationId);

  const roleKeyFor = (userId: string): string => {
    const rows = (assignments ?? []).filter((a) => a.user_id === userId);
    const keys = rows
      .map((r) => (r as unknown as { roles?: { key?: string } }).roles?.key)
      .filter(Boolean) as string[];
    return keys.length === 0 ? "(none)" : keys.sort().join(",");
  };

  check("demo account role", "AUDITOR", roleKeyFor(input.demoUserId), roleKeyFor(input.demoUserId) === "AUDITOR");
  check(
    "owner account role",
    "TENANT_OWNER",
    roleKeyFor(input.ownerUserId),
    roleKeyFor(input.ownerUserId) === "TENANT_OWNER",
  );

  for (const [label, userId] of [
    ["owner account not platform admin", input.ownerUserId],
    ["demo account not platform admin", input.demoUserId],
  ] as const) {
    const { data: isAdmin } = await admin.rpc("is_platform_admin", { p_user_id: userId });
    check(label, "false", String(Boolean(isAdmin)), !isAdmin);
  }

  // --- emptiness -----------------------------------------------------------
  if (input.requireEmpty) {
    const tables = [
      "properties",
      "units",
      "members",
      "unit_leases",
      "chart_of_accounts",
      "due_types",
    ] as const;

    for (const table of tables) {
      const { data, error } = await admin
        .from(table)
        .select("id")
        .eq("organization_id", organizationId)
        .limit(1000);
      const count = error ? -1 : (data ?? []).length;
      check(`target ${table}`, "0", error ? error.message : String(count), count === 0);
    }
  }

  // --- template ------------------------------------------------------------
  // The apply clones RESORT_STANDARD, so what the template holds now is what
  // the tenant will hold in a moment. Verified again here because the dry run
  // may have been days ago.
  const untyped = admin as unknown as {
    from: (t: string) => {
      select: (c: string) => {
        eq: (
          col: string,
          v: string,
        ) => Promise<{ data: Array<{ code: string; is_group: boolean }> | null; error: { message: string } | null }>;
      };
    };
  };
  const { data: template, error: tplErr } = await untyped
    .from("coa_template_accounts")
    .select("code, is_group")
    .eq("template_key", "RESORT_STANDARD");

  if (tplErr) {
    check("RESORT_STANDARD readable", "rows", tplErr.message, false);
  } else {
    const byCode = new Map((template ?? []).map((a) => [a.code, a]));
    check("RESORT_STANDARD 4000 group", "group", byCode.get("4000")?.is_group ? "group" : "missing/leaf", byCode.get("4000")?.is_group === true);
    for (const code of ["1130", "4100"]) {
      const account = byCode.get(code);
      check(
        `RESORT_STANDARD ${code} leaf`,
        "leaf",
        account ? (account.is_group ? "group" : "leaf") : "missing",
        Boolean(account) && account!.is_group === false,
      );
    }
    const rental = DEMO_STORY.tenantAccounts.rentalIncome.code;
    check(`${rental} free in target`, "free", byCode.has(rental) ? "in template" : "free", !byCode.has(rental));
  }

  // 4400 must also be free in the TENANT, not only in the template -- a resumed
  // apply may already have created it, which is fine, but a stranger's account
  // holding that code is not.
  const { data: existing4400 } = await admin
    .from("chart_of_accounts")
    .select("id, name_en")
    .eq("organization_id", organizationId)
    .eq("code", DEMO_STORY.tenantAccounts.rentalIncome.code);

  const occupant = (existing4400 ?? [])[0];
  check(
    `${DEMO_STORY.tenantAccounts.rentalIncome.code} in tenant`,
    "absent or Rental Income",
    occupant ? occupant.name_en : "absent",
    !occupant || occupant.name_en === DEMO_STORY.tenantAccounts.rentalIncome.nameEn,
  );

  return { pass: results.every((r) => r.pass), results };
}

export function renderPreconditions(report: PreconditionReport): string {
  const lines = ["APPLY PRECONDITIONS", "-".repeat(72)];
  for (const r of report.results) {
    const mark = r.pass ? "PASS" : "FAIL";
    lines.push(`  ${r.label.padEnd(40)}${r.actual.padEnd(22)}${mark}`);
  }
  lines.push("");
  lines.push(`  ${"OVERALL".padEnd(40)}${"".padEnd(22)}${report.pass ? "PASS" : "FAIL"}`);
  return lines.join("\n");
}
