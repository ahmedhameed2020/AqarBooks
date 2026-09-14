import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = path.join(
  process.cwd(),
  "supabase",
  "migrations",
  "20260914131953_maintenance_request_core.sql",
);

const sql = fs.readFileSync(migrationPath, "utf8");

describe("maintenance request core migration", () => {
  it("creates only the PR1 maintenance request primitives", () => {
    expect(sql).toMatch(/create table if not exists public\.maintenance_categories/i);
    expect(sql).toMatch(/create table if not exists public\.maintenance_requests/i);
    expect(sql).toMatch(/create table if not exists public\.maintenance_request_updates/i);

    expect(sql).not.toMatch(/create table if not exists public\.work_orders/i);
    expect(sql).not.toMatch(/create table if not exists public\.visitor_passes/i);
    expect(sql).not.toMatch(/create table if not exists public\.gates/i);
    expect(sql).not.toMatch(/create table if not exists public\.access_events/i);
    expect(sql).not.toMatch(/create table if not exists public\.vehicles/i);
    expect(sql).not.toMatch(/create table if not exists public\.(expenses|payments|receipts|journal_entries|dues)/i);
  });

  it("keeps request creation and history writes server-authoritative", () => {
    expect(sql).toMatch(/create or replace function public\.create_maintenance_request/i);
    expect(sql).toMatch(/create or replace function public\.cancel_own_maintenance_request/i);
    expect(sql).toMatch(/create or replace function public\.update_maintenance_request_staff/i);
    expect(sql).toMatch(/create or replace function public\.assert_maintenance_status_transition/i);
    expect(sql).not.toMatch(/grant execute on function public\.assert_maintenance_status_transition/i);

    expect(sql).not.toMatch(/create policy maintenance_requests_insert/i);
    expect(sql).not.toMatch(/create policy maintenance_requests_manage_staff/i);
    expect(sql).not.toMatch(/create policy maintenance_request_updates_insert/i);
    expect(sql).toMatch(/revoke all privileges on table public\.maintenance_requests from public, anon, authenticated/i);
    expect(sql).toMatch(/grant select on table public\.maintenance_requests to authenticated/i);
    expect(sql).not.toMatch(/grant all on table public\.maintenance_requests to authenticated/i);
  });

  it("ships RLS, permissions, and entitlement wiring with the schema", () => {
    expect(sql).toMatch(/alter table public\.maintenance_categories enable row level security/i);
    expect(sql).toMatch(/alter table public\.maintenance_requests enable row level security/i);
    expect(sql).toMatch(/alter table public\.maintenance_request_updates enable row level security/i);
    expect(sql).toMatch(/operations\.maintenance\.view/i);
    expect(sql).toMatch(/operations\.maintenance\.manage/i);
    expect(sql).toMatch(/maintenance_module/i);
    expect(sql).toMatch(/public\.current_member_id\(\)/i);
    expect(sql).toMatch(/public\.is_current_member_unit_owner/i);
  });

  it("keeps maintenance authenticated-only and excludes future ownership", () => {
    expect(sql).not.toMatch(/grant select on table public\.maintenance_(categories|requests|request_updates) to anon/i);
    expect(sql).toMatch(/revoke all on function public\.assert_maintenance_status_transition\(text, text, text\) from authenticated/i);
    expect(sql).toMatch(/revoke all on function public\.seed_default_maintenance_categories\(\) from authenticated/i);
    expect(sql).toMatch(/uo\.start_date is null or uo\.start_date <= current_date/i);
    expect(sql).toMatch(/uo\.end_date is null or uo\.end_date >= current_date/i);
    expect(sql).toMatch(/p_member_id = public\.current_member_id\(\)/i);
  });

  it("makes repeated member cancellation invalid instead of silently writing duplicate history", () => {
    expect(sql).toMatch(/if v_request\.status = 'CANCELLED' then\s+raise exception 'INVALID_MAINTENANCE_TRANSITION'/i);
  });
});
