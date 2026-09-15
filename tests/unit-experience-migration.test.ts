import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = join("supabase", "migrations", "20260915100016_vehicles_unit_timeline_notifications.sql");
const migration = readFileSync(migrationPath, "utf8");

describe("unit experience migration guard", () => {
  it("adds only PR6 vehicle, timeline projection, and notification primitives", () => {
    expect(migration).toContain("create table if not exists public.vehicles");
    expect(migration).toContain("create table if not exists public.notifications");
    expect(migration).toContain("create or replace function public.get_unit_timeline");
    expect(migration).not.toMatch(/create table if not exists public\.unit_timeline_events/i);
    expect(migration).not.toMatch(/create table if not exists public\.(dashboards|dashboard_widgets|vehicle_access|anpr)/i);
  });

  it("keeps vehicle and notification mutations RPC-only", () => {
    expect(migration).toContain("grant select on table public.vehicles to authenticated");
    expect(migration).toContain("grant select on table public.notifications to authenticated");
    expect(migration).not.toMatch(/grant\s+(insert|update|delete|all privileges)\s+on table public\.(vehicles|notifications)\s+to authenticated/i);
    expect(migration).toContain("grant execute on function public.create_vehicle");
    expect(migration).toContain("grant execute on function public.deactivate_own_vehicle");
    expect(migration).toContain("grant execute on function public.mark_notification_read");
  });

  it("normalizes plates on the server and enforces active uniqueness", () => {
    expect(migration).toContain("create or replace function public.normalize_vehicle_plate");
    expect(migration).toContain("regexp_replace");
    expect(migration).toContain("vehicles_org_normalized_plate_active_key");
    expect(migration).toContain("where is_active");
  });

  it("uses current owner helper and hides sensitive timeline sources", () => {
    expect(migration).toContain("public.is_current_member_unit_owner");
    expect(migration).toContain("mu.visibility = 'MEMBER_VISIBLE'");
    expect(migration).toContain("wu.visibility = 'MEMBER_VISIBLE'");
    expect(migration).toContain("ae.decision = 'ALLOW'");
    expect(migration).not.toMatch(/token_hash|raw_secret|operator_user_id.*summary/i);
  });

  it("makes notifications idempotent and direct creation internal-only", () => {
    expect(migration).toContain("notifications_event_once_key");
    expect(migration).toContain("'MAINTENANCE_UPDATE'");
    expect(migration).toContain("create trigger trg_notify_maintenance_request_update");
    expect(migration).toContain("on conflict (organization_id, recipient_user_id, type, source_type, source_id)");
    expect(migration).toContain("create or replace function public.create_notification_once");
    expect(migration).toContain("revoke all on function public.create_notification_once");
    expect(migration).not.toContain("grant execute on function public.create_notification_once");
  });
});
