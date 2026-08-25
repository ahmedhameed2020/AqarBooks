/**
 * Driver for the structural repair.
 *
 * Dry run (writes nothing):
 *     npx vitest run tests/demo-repair.manual.test.ts
 *
 * Apply:
 *     DEMO_REPAIR_APPLY=1 npx vitest run tests/demo-repair.manual.test.ts
 *
 * Like the seed driver, an apply with a missing prerequisite THROWS rather than
 * skipping -- a skipped apply prints a green "1 skipped" and is
 * indistinguishable from one that succeeded.
 *
 * Report: test-results/demo-repair-apply.txt
 */
import { describe, it, expect } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";
import type { Database } from "../lib/supabase/types";
import { applyStructuralRepair } from "../scripts/demo/apply-repair";
import { verifyStructural, renderStructural } from "../scripts/demo/verify-structural";
import { DEMO_STORY } from "../lib/demo/story";

loadEnv({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const organizationId = process.env.DEMO_ORGANIZATION_ID!;
const ownerEmail = process.env.DEMO_OWNER_EMAIL!;

const APPLY = process.env.DEMO_REPAIR_APPLY === "1";

const MISSING = [
  ["NEXT_PUBLIC_SUPABASE_URL", url],
  ["SUPABASE_SERVICE_ROLE_KEY", serviceKey],
  ["DEMO_ORGANIZATION_ID", organizationId],
  ["DEMO_OWNER_EMAIL", ownerEmail],
]
  .filter(([, v]) => !v)
  .map(([n]) => n);

const CONFIGURED = MISSING.length === 0;

if (APPLY && !CONFIGURED) {
  throw new Error(
    `DEMO_REPAIR_APPLY=1 was set but these are missing: ${MISSING.join(", ")}. ` +
      "Refusing to skip.",
  );
}

describe.skipIf(!CONFIGURED)("demo structural repair", () => {
  it(
    APPLY ? "applies the structural repair" : "rehearses the structural repair without writing",
    async () => {
      const lines: string[] = [];
      const admin = createClient<Database>(url, serviceKey, { auth: { persistSession: false } });

      lines.push(`DEMO STRUCTURAL REPAIR ${APPLY ? "— APPLY" : "— DRY RUN"}`);
      lines.push("=".repeat(76));
      lines.push("");

      // Owner session via the service-role key rather than a password: the key
      // can already mint a session for any account, so requiring a production
      // password in addition would add a credential without adding security.
      const owner: SupabaseClient<Database> = createClient<Database>(url, anonKey, {
        auth: { persistSession: false },
      });

      const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
        type: "magiclink",
        email: ownerEmail,
      });
      expect(linkErr, `generateLink failed: ${linkErr?.message}`).toBeNull();
      const { error: otpErr } = await owner.auth.verifyOtp({
        token_hash: link!.properties!.hashed_token,
        type: "magiclink",
      });
      expect(otpErr, `owner session failed: ${otpErr?.message}`).toBeNull();

      const { data: who } = await owner.auth.getUser();
      const { data: canManage } = await owner.rpc("has_permission", {
        p_user_id: who.user!.id,
        p_organization_id: organizationId,
        p_permission_key: "property.leases.manage",
      });
      expect(canManage, "owner session lacks property.leases.manage").toBe(true);

      const report = await applyStructuralRepair({
        admin,
        owner,
        organizationId,
        dryRun: !APPLY,
        log: (line) => lines.push(line),
      });

      // Structural verification reads the database, never the applier's own
      // account of what it did.
      if (APPLY && report.ok) {
        const structural = await verifyStructural(admin, organizationId);
        lines.push("");
        lines.push(renderStructural(structural));

        const distribution = await verifyDistribution(admin, organizationId);
        lines.push("");
        lines.push(distribution.text);

        mkdirSync("test-results", { recursive: true });
        writeFileSync("test-results/demo-repair-apply.txt", lines.join("\n") + "\n", "utf8");

        await owner.auth.signOut();
        expect(structural.pass, "structural verification failed").toBe(true);
        expect(distribution.pass, "distribution verification failed").toBe(true);
        return;
      }

      mkdirSync("test-results", { recursive: true });
      writeFileSync("test-results/demo-repair-apply.txt", lines.join("\n") + "\n", "utf8");
      await owner.auth.signOut();

      expect(report.failure ?? null, report.failure ?? "").toBeNull();
      expect(report.ok).toBe(true);
    },
    300_000,
  );
});

/** Per-property distribution, read fresh, against the declared plan. */
async function verifyDistribution(
  admin: SupabaseClient<Database>,
  organizationId: string,
): Promise<{ pass: boolean; text: string }> {
  const { data: properties } = await admin
    .from("properties")
    .select("id, code")
    .eq("organization_id", organizationId);
  const codeById = new Map((properties ?? []).map((p) => [p.id, p.code]));

  const { data: units } = await admin
    .from("units")
    .select("id, property_id, unit_type, archived_at")
    .eq("organization_id", organizationId)
    .range(0, 4999);

  const { data: leases } = await admin
    .from("unit_leases")
    .select("unit_id, status, rent_frequency")
    .eq("organization_id", organizationId)
    .range(0, 4999);

  const { data: ownerships } = await admin
    .from("unit_ownerships")
    .select("unit_id")
    .eq("organization_id", organizationId)
    .range(0, 4999);

  const { data: members } = await admin
    .from("members")
    .select("id, is_company")
    .eq("organization_id", organizationId)
    .range(0, 4999);

  const activeLeaseUnits = new Set(
    (leases ?? []).filter((l) => l.status === "ACTIVE").map((l) => l.unit_id),
  );
  const ownedUnits = new Set((ownerships ?? []).map((o) => o.unit_id));

  const lines = ["ACTIVE STOCK", "-".repeat(76)];
  let pass = true;

  const totals = { active: 0, occupied: 0, leased: 0, owner: 0, vacant: 0 };

  for (const declared of DEMO_STORY.occupancyPlan) {
    const inProperty = (units ?? []).filter(
      (u) => codeById.get(u.property_id) === declared.propertyCode && u.archived_at === null,
    );
    const leased = inProperty.filter((u) => activeLeaseUnits.has(u.id)).length;
    const owner = inProperty.filter((u) => ownedUnits.has(u.id) && !activeLeaseUnits.has(u.id)).length;
    const occupied = leased + owner;
    const vacant = inProperty.length - occupied;

    const rowOk = occupied === declared.occupied && leased === declared.leased;
    if (!rowOk) pass = false;

    lines.push(
      `  ${declared.propertyCode}  ${String(inProperty.length).padStart(3)} active | ` +
        `${String(occupied).padStart(3)} occupied | ${String(leased).padStart(3)} leased | ` +
        `${String(owner).padStart(3)} owner | ${String(vacant).padStart(3)} vacant   ` +
        `${rowOk ? "PASS" : `FAIL (expected ${declared.occupied}/${declared.leased})`}`,
    );

    totals.active += inProperty.length;
    totals.occupied += occupied;
    totals.leased += leased;
    totals.owner += owner;
    totals.vacant += vacant;
  }

  lines.push("");
  lines.push("TOTAL");
  lines.push("-".repeat(76));
  for (const [label, value, expected] of [
    ["active", totals.active, 148],
    ["occupied", totals.occupied, 121],
    ["owner-resident", totals.owner, 72],
    ["active leases", totals.leased, 49],
    ["vacant", totals.vacant, 27],
  ] as const) {
    const ok = value === expected;
    if (!ok) pass = false;
    lines.push(`  ${label.padEnd(18)}${String(value).padStart(5)}   expected ${expected}   ${ok ? "PASS" : "FAIL"}`);
  }

  const commercialUnits = (units ?? []).filter(
    (u) => u.archived_at === null && (u.unit_type === "OFFICE" || u.unit_type === "SHOP"),
  );
  const commercialLeased = commercialUnits.filter((u) => activeLeaseUnits.has(u.id));
  const quarterly = (leases ?? []).filter(
    (l) => l.status === "ACTIVE" && l.rent_frequency === "QUARTERLY",
  );
  const companies = (members ?? []).filter((m) => m.is_company);

  lines.push("");
  lines.push("COMMERCIAL");
  lines.push("-".repeat(76));
  for (const [label, value, expected] of [
    ["active commercial units", commercialUnits.length, 27],
    ["occupied commercial", commercialLeased.length, 18],
    ["quarterly leases", quarterly.length, 18],
    ["company tenants", companies.length, 14],
  ] as const) {
    const ok = value === expected;
    if (!ok) pass = false;
    lines.push(`  ${label.padEnd(26)}${String(value).padStart(5)}   expected ${expected}   ${ok ? "PASS" : "FAIL"}`);
  }

  const ended = (leases ?? []).filter((l) => l.status === "ENDED").length;
  lines.push("");
  lines.push("REPAIR");
  lines.push("-".repeat(76));
  lines.push(`  leases ended              ${String(ended).padStart(5)}   expected 18   ${ended === 18 ? "PASS" : "FAIL"}`);
  if (ended !== 18) pass = false;
  lines.push(`  ownership links           ${String(ownedUnits.size).padStart(5)}   expected 72   ${ownedUnits.size === 72 ? "PASS" : "FAIL"}`);
  if (ownedUnits.size !== 72) pass = false;

  lines.push("");
  lines.push(`DISTRIBUTION   ${pass ? "PASS" : "FAIL"}`);

  return { pass, text: lines.join("\n") };
}
