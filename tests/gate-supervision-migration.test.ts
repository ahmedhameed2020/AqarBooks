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
    expect(sql).toContain("create function public.list_gate_current_visitors");
    expect(sql).toContain("create function public.list_gate_access_evidence");
    expect(sql).toMatch(/list_gate_current_visitors[\s\S]*security definer set search_path = ''/i);
    expect(sql).toMatch(/list_gate_access_evidence[\s\S]*security definer set search_path = ''/i);
    expect(sql).toMatch(/has_permission\(auth\.uid\(\),p_organization_id,'operations\.access_events\.view'\)/i);
    expect(sql).toContain("count_only boolean");
    expect(sql.match(/if not found and v_total > 0 then/g)).toHaveLength(2);
    expect(sql).not.toMatch(/p_offset\s*>\s*25000/i);
    expect(sql).toMatch(/revoke all on function public\.list_gate_current_visitors/i);
    expect(sql).toMatch(/revoke all on function public\.list_gate_access_evidence/i);
  });
});
