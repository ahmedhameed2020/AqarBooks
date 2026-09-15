import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = join("supabase", "migrations", "20260915081839_gate_operations_access_ledger.sql");
const migration = readFileSync(migrationPath, "utf8");
const actions = readFileSync(join("lib", "actions", "gates.ts"), "utf8");

describe("gate operations migration guard", () => {
  it("creates only gate operations tables and no future access domains", () => {
    expect(migration).toContain("create table if not exists public.gates");
    expect(migration).toContain("create table if not exists public.visitor_access_state");
    expect(migration).toContain("create table if not exists public.access_events");
    expect(migration).not.toMatch(/create table if not exists public\.(vehicles|vehicle_access|gate_hardware)/i);
  });

  it("keeps gate and event mutations RPC-only for authenticated users", () => {
    expect(migration).toContain("grant select on table public.gates to authenticated");
    expect(migration).toContain("grant select on table public.visitor_access_state to authenticated");
    expect(migration).toContain("grant select on table public.access_events to authenticated");
    expect(migration).not.toMatch(/grant\s+(insert|update|delete|all privileges)\s+on table public\.(gates|visitor_access_state|access_events)\s+to authenticated/i);
    expect(migration).toContain("grant execute on function public.process_visitor_gate_scan(uuid, uuid, text, text, uuid) to authenticated");
  });

  it("uses a unique client_scan_id for idempotency and records append-only events", () => {
    expect(migration).toContain("access_events_org_client_scan_id_key");
    expect(migration).toContain("on public.access_events (organization_id, client_scan_id)");
    expect(migration).toContain("on conflict (organization_id, client_scan_id) do nothing");
    expect(migration).not.toMatch(/create policy .*access_events.*for update/is);
    expect(migration).not.toMatch(/create policy .*access_events.*for delete/is);
    expect(migration).not.toMatch(/create trigger trg_access_events/is);
  });

  it("does not persist or log raw QR secrets or token hashes in access evidence", () => {
    const accessEventsDefinition = migration.slice(
      migration.indexOf("create table if not exists public.access_events"),
      migration.indexOf("create unique index if not exists access_events_org_client_scan_id_key"),
    );
    expect(accessEventsDefinition).not.toMatch(/secret|token|hash/i);
    expect(migration).not.toMatch(/safe_change_summary[^;]*(raw_secret|token_hash|p_raw_secret)/is);
    expect(actions).not.toContain("createAdminClient");
  });

  it("enforces direction, pass states, property scoping, and current visitor feature entitlement", () => {
    expect(migration).toContain("constraint gates_direction_mode_check check (direction_mode in ('ENTRY', 'EXIT', 'BOTH'))");
    expect(migration).toContain("DIRECTION_NOT_ALLOWED");
    expect(migration).toContain("PROPERTY_MISMATCH");
    expect(migration).toContain("PASS_ALREADY_USED");
    expect(migration).toContain("ALREADY_INSIDE");
    expect(migration).toContain("NOT_INSIDE");
    expect(migration).toContain("public.visitor_management_enabled(p_organization_id)");
  });

  it("exposes only the intended gate permission keys", () => {
    expect(migration).toContain("operations.gates.view");
    expect(migration).toContain("operations.gates.manage");
    expect(migration).toContain("operations.gates.scan");
    expect(migration).toContain("operations.access_events.view");
    expect(migration).not.toContain("operations.vehicles");
  });
});
