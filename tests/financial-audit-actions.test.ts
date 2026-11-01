/**
 * check_audit_action must allow every action a writer in the migrations can emit, and nothing
 * else. 20261001123000 rebuilt the constraint from a shorter list than the one 20260903172101
 * had, which silently broke record_member_opening_balance (OPENING_BALANCE_RECORDED). This
 * static test reads the migration files (no database) and pins the contract.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const dir = path.join(process.cwd(), "supabase", "migrations");
const files = readdirSync(dir).filter((f) => /^\d{14}_.+\.sql$/.test(f)).sort();
const read = (f: string) => readFileSync(path.join(dir, f), "utf8").replace(/\r\n/g, "\n");

/** Allowed set = the list in the LAST migration that (re)creates the constraint. */
function latestAllowList() {
  for (const f of [...files].reverse()) {
    const sql = read(f);
    const m = /ADD CONSTRAINT\s+check_audit_action\s+CHECK\s*\(\s*action\s*=\s*ANY\s*\(\s*ARRAY\s*\[([\s\S]*?)\]/i.exec(sql);
    if (m) return { file: f, actions: new Set([...m[1].matchAll(/'([A-Z][A-Z0-9_]+)'/g)].map((x) => x[1])) };
  }
  throw new Error("no migration defines check_audit_action");
}

/** Every literal action a migration passes to append_financial_audit_event (named or positional). */
function emittedActions() {
  const out = new Map<string, string>();
  for (const f of files) {
    const sql = read(f);
    for (const call of sql.matchAll(/append_financial_audit_event\s*\(([\s\S]*?)\)\s*;/g)) {
      const args = call[1];
      const named = /p_action\s*:=\s*'([A-Z][A-Z0-9_]+)'/.exec(args);
      if (named) { out.set(named[1], f); continue; }
      const positional = args.split(",")[1]?.trim().match(/^'([A-Z][A-Z0-9_]+)'$/);
      if (positional) out.set(positional[1], f);
    }
    for (const v of sql.matchAll(/v_action\s*:=\s*CASE[\s\S]*?END\s*;/gi)) {
      for (const lit of v[0].matchAll(/THEN\s+'([A-Z][A-Z0-9_]+)'|ELSE\s+'([A-Z][A-Z0-9_]+)'/g)) out.set(lit[1] ?? lit[2], f);
    }
  }
  return out;
}

describe("financial audit action allow-list", () => {
  const { file, actions } = latestAllowList();

  it("the latest definition is the Phase 1.1 migration", () => {
    expect(file).toBe("20261009130000_phase1_1_membership_roles_audit.sql");
  });

  it("allows every action any migration's writer emits", () => {
    const missing = [...emittedActions()].filter(([a]) => !actions.has(a)).map(([a, f]) => `${a} (${f})`);
    expect(missing).toEqual([]);
  });

  it("keeps every historical baseline value and the later additions", () => {
    for (const a of [
      "PAYMENT_CREATED", "PAYMENT_IDEMPOTENT_REPLAY", "PAYMENT_ALLOCATION_CREATED",
      "DUE_ISSUED", "DUE_BATCH_ISSUED", "RECURRING_DUES_GENERATED", "RECURRING_DUES_SKIPPED",
      "OPERATION_REJECTED", "LEASE_RENT_DUE_GENERATED", "LEASE_RENT_DUE_SKIPPED",
      "OPENING_BALANCE_RECORDED", "PAYMENT_REVERSED",
    ]) expect(actions.has(a), a).toBe(true);
    expect(actions.size).toBe(12);
  });
});
