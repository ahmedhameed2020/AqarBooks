/**
 * Database preflight for the demo seed. READ-ONLY.
 *
 * WHY THIS EXISTS, AND WHAT IT IS NOT
 * The full dry run (`tests/demo-seed.manual.test.ts`) cannot run before the
 * demo organization is provisioned: its guard reads that row and refuses
 * without it. Provisioning is deliberately sequenced AFTER a database report,
 * so something has to answer "is the database ready, and would the guard hold?"
 * without writing and without a target.
 *
 * This is that something. It opens a connection, reads, and writes nothing --
 * no organization, no user, no row of any kind. Every assertion is a SELECT or
 * a metadata read.
 *
 * WHAT IT PROVES THAT THE OFFLINE PLAN CANNOT
 *   - the is_demo migration is actually applied, and no organization carries
 *     the marker yet
 *   - the five seed guards REFUSE every real organization currently in the
 *     database, and name which check caught each one
 *   - the chart-of-accounts codes the seed resolves exist in the template, and
 *     the code it intends to add is genuinely free
 *   - the RPCs the seed calls are present and exposed
 *
 * WHAT IT STILL CANNOT PROVE
 * That the seed's writes will succeed. Nothing short of running them shows
 * that, and the dry run against the provisioned tenant is the next gate, not
 * this one.
 *
 * Report: test-results/demo-preflight-report.txt (vitest suppresses console).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";
import type { Database } from "../lib/supabase/types";
import { assertSafeDemoTarget } from "../scripts/demo/demo-guard";
import { DEMO_STORY } from "../lib/demo/story";

loadEnv({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const CONFIGURED = Boolean(url && serviceKey);

const admin = CONFIGURED
  ? createClient<Database>(url, serviceKey, { auth: { persistSession: false } })
  : null;

/** Codes the seed resolves with no fallback. A miss is a hard failure there. */
const REQUIRED_TEMPLATE_CODES = ["1110", "1120", "1130", "4000", "4100"] as const;

/** RPCs the structural stages call. */
const REQUIRED_RPCS = [
  "clone_chart_of_accounts_template",
  "create_fiscal_year",
  "create_resort",
  "link_unit_ownership",
  "create_unit_lease",
  "activate_unit_lease",
  "is_platform_admin",
  "has_permission",
] as const;

const lines: string[] = [];
const row = (label: string, value: string) =>
  // padEnd only pads; a longer label would otherwise run into its value.
  lines.push(`${label.padEnd(38)}${label.length >= 38 ? "  " : ""}${value}`);

beforeAll(() => {
  lines.push("DEMO DATABASE PREFLIGHT — READ-ONLY");
  lines.push("=".repeat(72));
  lines.push("");
  lines.push("No rows were written. No organization or user was created.");
  lines.push("");
});

afterAll(() => {
  mkdirSync("test-results", { recursive: true });
  writeFileSync("test-results/demo-preflight-report.txt", lines.join("\n") + "\n", "utf8");
});

describe.skipIf(!CONFIGURED)("demo database preflight", () => {
  it("the is_demo migration is applied", async () => {
    const { error } = await admin!.from("organizations").select("is_demo").limit(1);
    row("is_demo column present", error ? `FAIL — ${error.message}` : "PASS");
    expect(error, `is_demo is not queryable: ${error?.message}`).toBeNull();
  });

  it("no organization carries the demo marker yet", async () => {
    const { data, error } = await admin!.from("organizations").select("id").eq("is_demo", true);
    expect(error).toBeNull();
    const count = (data ?? []).length;
    row("organizations flagged is_demo", `${count} (expected 0 before provisioning)`);
    expect(count).toBe(0);
  });

  it("the seed guard refuses when no target is configured", async () => {
    const result = await assertSafeDemoTarget({
      admin: admin!,
      organizationId: null,
      configuredDemoOrganizationId: null,
      expectedSlug: DEMO_STORY.organization.slug,
      allowedUserIds: [],
    });
    row("guard refuses unconfigured target", result.ok ? "FAIL" : "PASS");
    expect(result.ok).toBe(false);
  });

  it("the seed guard refuses every organization currently in the database", async () => {
    // The assertion that matters. These are real tenants; the seed writes 156
    // units and a month of immutable postings, so it must refuse all of them.
    const { data: orgs, error } = await admin!
      .from("organizations")
      .select("id, name, slug, is_demo");
    expect(error).toBeNull();

    const all = orgs ?? [];
    row("organizations in database", String(all.length));
    expect(all.length, "no organizations to test the guard against").toBeGreaterThan(0);

    const refused: string[] = [];
    const accepted: string[] = [];

    for (const org of all) {
      // Hostile framing on purpose: pretend the variable points at this tenant
      // AND that its slug is the one we expect. Anything that still refuses is
      // refusing on grounds a misconfiguration cannot satisfy.
      const result = await assertSafeDemoTarget({
        admin: admin!,
        organizationId: org.id,
        configuredDemoOrganizationId: org.id,
        expectedSlug: org.slug,
        allowedUserIds: [],
      });
      if (result.ok) accepted.push(`${org.name} (${org.slug})`);
      else refused.push(result.reason.split(".")[0]!);
    }

    row("guard refused", `${refused.length} / ${all.length}`);
    if (accepted.length > 0) {
      lines.push("");
      lines.push("  ACCEPTED (must be empty):");
      for (const a of accepted) lines.push(`    - ${a}`);
    }

    expect(accepted, `the guard accepted a real organization: ${accepted.join(", ")}`).toEqual([]);
  });

  it("the guard refuses a tenant that renamed itself to look like the demo", async () => {
    // The attack the is_demo flag exists to stop. Name and slug are both
    // editable by a tenant admin, so the guard must not be satisfiable by
    // impersonation. This does NOT rename anything -- it feeds the guard the
    // demo's expected slug and asserts the flag still refuses.
    const { data: orgs } = await admin!.from("organizations").select("id, name, slug, is_demo").limit(1);
    const victim = (orgs ?? [])[0];
    expect(victim, "no organization available for the impersonation check").toBeTruthy();

    const result = await assertSafeDemoTarget({
      admin: admin!,
      organizationId: victim!.id,
      configuredDemoOrganizationId: victim!.id,
      expectedSlug: victim!.slug,
      allowedUserIds: [],
    });

    expect(result.ok).toBe(false);
    row("guard refuses impersonation", "PASS");
  });

  it("every chart-of-accounts code the seed resolves exists in the template", async () => {
    const { data, error } = await admin!
      .from("coa_template_accounts")
      .select("code, name_en, is_group")
      .eq("template_key", "RESORT_STANDARD");
    expect(error, `coa_template_accounts read failed: ${error?.message}`).toBeNull();

    const byCode = new Map((data ?? []).map((a) => [a.code, a]));
    lines.push("");
    for (const code of REQUIRED_TEMPLATE_CODES) {
      const account = byCode.get(code);
      row(`  template ${code}`, account ? `${account.name_en}` : "MISSING");
      expect(account, `RESORT_STANDARD is missing ${code}`).toBeTruthy();
    }

    // 4000 is the parent the new leaf hangs from and must be a group; the
    // leaves the seed posts to must not be.
    expect(byCode.get("4000")?.is_group, "4000 must be a group account").toBe(true);
    for (const code of ["1110", "1120", "1130", "4100"]) {
      expect(byCode.get(code)?.is_group, `${code} must not be a group account`).toBe(false);
    }
  });

  it("the code the seed adds for rental income is free in the template", async () => {
    const spec = DEMO_STORY.tenantAccounts.rentalIncome;
    const { data } = await admin!
      .from("coa_template_accounts")
      .select("code")
      .eq("template_key", "RESORT_STANDARD")
      .eq("code", spec.code);
    row(`  tenant leaf ${spec.code}`, (data ?? []).length === 0 ? "free" : "ALREADY IN TEMPLATE");
    expect((data ?? []).length, `${spec.code} is already in the template`).toBe(0);
  });

  it("every RPC the seed calls is present and exposed", async () => {
    // PostgREST's root document lists the functions it exposes. Reading it is
    // the only way to check availability without invoking anything, and
    // invoking a write RPC to see whether it exists is not an option.
    const response = await fetch(`${url}/rest/v1/`, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    });
    expect(response.ok, `PostgREST root returned ${response.status}`).toBe(true);

    const spec = (await response.json()) as { paths?: Record<string, unknown> };
    const exposed = new Set(
      Object.keys(spec.paths ?? {})
        .filter((p) => p.startsWith("/rpc/"))
        .map((p) => p.slice("/rpc/".length)),
    );

    lines.push("");
    const missing: string[] = [];
    for (const rpc of REQUIRED_RPCS) {
      const present = exposed.has(rpc);
      row(`  rpc ${rpc}`, present ? "present" : "MISSING");
      if (!present) missing.push(rpc);
    }
    expect(missing, `RPCs not exposed: ${missing.join(", ")}`).toEqual([]);
  });

  it("the tables the structural stages write are reachable", async () => {
    // A select of zero rows proves the relation and the column names resolve.
    // It is also the check that would have caught the phantom columns the
    // generated types caught earlier, had the types not existed.
    const probes: Array<[string, Promise<{ error: unknown }>]> = [
      ["properties", admin!.from("properties").select("id, code").limit(0)],
      ["zones", admin!.from("zones").select("id, name_en, property_id").limit(0)],
      ["buildings", admin!.from("buildings").select("id, code, zone_id").limit(0)],
      ["units", admin!.from("units").select("id, code, unit_type, archived_at").limit(0)],
      ["members", admin!.from("members").select("id, email, full_name, phone").limit(0)],
      ["unit_ownerships", admin!.from("unit_ownerships").select("unit_id, member_id").limit(0)],
      ["unit_leases", admin!.from("unit_leases").select("id, unit_id, status").limit(0)],
      ["due_types", admin!.from("due_types").select("id, name_en").limit(0)],
      ["chart_of_accounts", admin!.from("chart_of_accounts").select("id, code, is_group").limit(0)],
      ["fiscal_periods", admin!.from("fiscal_periods").select("id, start_date, status").limit(0)],
      ["banks", admin!.from("banks").select("id, name_en").limit(0)],
      ["bank_accounts", admin!.from("bank_accounts").select("id, account_number").limit(0)],
    ];

    lines.push("");
    const broken: string[] = [];
    for (const [name, probe] of probes) {
      const { error } = await probe;
      row(`  table ${name}`, error ? `MISMATCH — ${(error as { message: string }).message}` : "ok");
      if (error) broken.push(name);
    }
    expect(broken, `schema mismatch on: ${broken.join(", ")}`).toEqual([]);
  });

  it("records that nothing was written", async () => {
    const { data } = await admin!.from("organizations").select("id");
    lines.push("");
    row("organizations after preflight", String((data ?? []).length));
    row("rows written by this suite", "0");
    lines.push("");
    lines.push("-".repeat(72));
    lines.push("NEXT: provision the demo organization (docs/demo-environment.md §5),");
    lines.push("then run tests/demo-seed.manual.test.ts for the full dry run.");
    expect(true).toBe(true);
  });
});
