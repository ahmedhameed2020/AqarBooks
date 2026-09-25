import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("gate supervision migration", () => {
  it("installs immutable evidence and permission-checked reconciliation", () => {
    const dir = join(process.cwd(), "supabase/migrations");
    const name = readdirSync(dir).find((file) => file.endsWith("_gate_supervision_evidence.sql"));
    expect(name).toBeTruthy();
    const sql = readFileSync(join(dir, name!), "utf8");
    expect(sql).toContain("create table public.gate_manual_exceptions");
    expect(sql).toContain("create table public.gate_access_reconciliations");
    expect(sql).toContain("reason text not null");
    expect(sql).toContain("RECONCILED_ENTRY");
    expect(sql).toContain("RECONCILED_EXIT");
    expect(sql).not.toMatch(/p_raw_secret|credential_hash|token_hash/);
    expect(sql).toContain("operations.gates.occupancy.reconcile");
    expect(sql).not.toContain("operations.gates.reconcile");
    const manualTable = sql.split("create table public.gate_manual_exceptions (")[1].split(");")[0];
    expect(manualTable).toContain("visitor_invitation_id uuid,");
    expect(manualTable).toContain("property_id uuid not null");
  });
});
