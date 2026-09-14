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

    expect(sql).not.toMatch(/create policy maintenance_requests_insert/i);
    expect(sql).not.toMatch(/create policy maintenance_request_updates_insert/i);
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
});
