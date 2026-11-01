/**
 * Every function the Phase 1 / 1.1 / 1.2 migrations withdraw from clients, checked against the live
 * (local) catalog and by actually calling it from signed-in and anonymous sessions.
 *
 * The list is DERIVED from the REVOKE ... authenticated statements in the two migrations (not
 * hand-maintained), then resolved against pg_proc so every overload/signature is covered. The
 * expected size is pinned so an added or lost REVOKE changes this test.
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { localSupabase, password, sql } from "./helpers/gate-release";

vi.setConfig({ hookTimeout: 120_000, testTimeout: 60_000 });

const migrations = [
  "20261009120000_phase1_financial_report_authz.sql",
  "20261009130000_phase1_1_membership_roles_audit.sql",
  "20261009140000_phase1_2_finance_read_permissions.sql",
]
  .map((f) => readFileSync(path.join(process.cwd(), "supabase", "migrations", f), "utf8").replace(/\r\n/g, "\n"));

/** name(argtypes) for every REVOKE that names `authenticated`, across both migrations. */
function revokedSignatures(): string[] {
  const found = new Set<string>();
  for (const sqlText of migrations) {
    for (const m of sqlText.matchAll(/REVOKE ALL ON FUNCTION\s+public\.(\w+)\(([^)]*)\)\s+FROM\s+([^;]*?);/gi)) {
      if (/authenticated/i.test(m[3])) found.add(`${m[1]}(${m[2].replace(/\s+/g, " ").trim()})`);
    }
  }
  return [...found].sort();
}

type Fn = { sig: string; name: string; returns: string; argnames: string[]; argtypes: string[]; anon: boolean; auth: boolean; service: boolean };
let fns: Fn[] = [];
let userClient: SupabaseClient;
let anonClient: SupabaseClient;

const sample = (type: string) => {
  if (type === "uuid") return randomUUID();
  if (type === "uuid[]") return [];
  if (type === "text") return "x";
  if (type === "numeric" || type === "integer") return 1;
  if (type === "date") return "2026-01-01";
  throw new Error(`no sample for ${type}`);
};

beforeAll(async () => {
  const env = localSupabase();
  const wanted = revokedSignatures();
  // Resolve each signature (by name + identity args) to its live pg_proc row. Functions dropped by a later
  // migration (the 3-argument replace_role_permissions_atomic) are intentionally absent and must not resolve.
  const rows = JSON.parse(sql(`select coalesce(json_agg(json_build_object(
      'sig', p.proname||'('||pg_get_function_identity_arguments(p.oid)||')', 'name', p.proname,
      'returns', p.prorettype::regtype::text,
      'argnames', coalesce(to_json(p.proargnames), '[]'::json),
      'argtypes', (select coalesce(json_agg(t::regtype::text), '[]'::json) from unnest(p.proargtypes::oid[]) t),
      'anon', has_function_privilege('anon', p.oid, 'execute'),
      'auth', has_function_privilege('authenticated', p.oid, 'execute'),
      'service', has_function_privilege('service_role', p.oid, 'execute'))), '[]'::json)
    from pg_proc p where p.pronamespace = 'public'::regnamespace`)) as (Fn & { argnames: string[] })[];
  const norm = (s: string) => s.replace(/\b\w+ (uuid|text|numeric|integer|date)\b/g, "$1").replace(/\s+/g, " ");
  fns = rows.filter((r) => wanted.some((w) => norm(w) === norm(r.sig)));

  const admin = createClient(env.API_URL, env.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const email = `rfm-${randomUUID()}@test.local`;
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error) throw created.error;
  userClient = createClient(env.API_URL, env.ANON_KEY, { auth: { persistSession: false } });
  const login = await userClient.auth.signInWithPassword({ email, password });
  if (login.error) throw login.error;
  anonClient = createClient(env.API_URL, env.ANON_KEY, { auth: { persistSession: false } });
});

describe("functions withdrawn from clients by Phase 1 / 1.1", () => {
  it("the REVOKE statements and the live catalog agree: 17 signatures (13 helpers, role replacement x2, ownership trigger, cron batch)", () => {
    const wanted = revokedSignatures();
    // 13 helpers + replace_role_permissions_atomic (3-argument shim, 4-argument) + enforce_unit_ownership_total()
    // + run_due_schedules() = 17 distinct signatures, every one of which must resolve in the live catalog.
    expect(wanted).toHaveLength(17);
    expect(fns.map((f) => f.sig).sort()).toHaveLength(17);
    expect(fns.map((f) => f.name).sort()).toEqual([
      "check_asset_disposal_readiness", "check_fx_readiness", "compute_input_tax_split", "convert_to_base",
      "creditable_remaining", "depreciable_remaining", "depreciation_for_period", "due_outstanding",
      "enforce_unit_ownership_total", "get_exchange_rate", "project_wip_summary",
      "replace_role_permissions_atomic", "replace_role_permissions_atomic",
      "resolve_due_buyer", "resolve_input_tax_account", "resolve_output_tax_account", "run_due_schedules",
    ].sort());
  });

  it("the 3-argument replace_role_permissions_atomic survives only as a fail-closed shim (no actor, no DML)", () => {
    const body = sql(`select prosrc from pg_proc where proname='replace_role_permissions_atomic' and pronargs=3`);
    expect(body).toMatch(/RAISE EXCEPTION 'SIGNATURE_RETIRED/);
    expect(body).not.toMatch(/(delete|insert|update)/i);
  });

  it("no revoked function is executable by PUBLIC, anon or authenticated; service_role keeps EXECUTE", () => {
    for (const f of fns) {
      expect({ fn: f.sig, anon: f.anon, authenticated: f.auth }, f.sig).toEqual({ fn: f.sig, anon: false, authenticated: false });
      expect(f.service, `${f.sig} service_role`).toBe(true);
    }
    const publicExec = sql(`select count(*) from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
      where p.pronamespace='public'::regnamespace and a.grantee=0 and a.privilege_type='EXECUTE'
      and p.proname in (${[...new Set(fns.map((f) => `'${f.name}'`))].join(",")})`);
    expect(publicExec).toBe("0");
  });

  it("calling each RPC-callable function as a signed-in user and as anon is refused with a permission error", async () => {
    const callable = fns.filter((f) => f.returns !== "trigger");
    expect(callable).toHaveLength(16); // 17 signatures minus the trigger function
    for (const f of callable) {
      const args = Object.fromEntries(f.argtypes.map((t, i) => [f.argnames[i], sample(t)])); // proargnames also lists OUT columns; only the first N are inputs
      for (const [who, client] of [["authenticated", userClient], ["anon", anonClient]] as const) {
        const res = await client.rpc(f.name, args);
        expect(res.error?.code, `${f.sig} as ${who}: ${res.error?.message}`).toBe("42501");
        expect(res.data, `${f.sig} as ${who}`).toBeNull();
      }
    }
  });
});
