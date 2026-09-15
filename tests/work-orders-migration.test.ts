import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = path.join(
  process.cwd(),
  "supabase",
  "migrations",
  "20260914203712_maintenance_work_orders.sql",
);

const sql = fs.readFileSync(migrationPath, "utf8");

describe("maintenance work orders migration", () => {
  it("adds only the PR2 work order primitives", () => {
    expect(sql).toMatch(/create table if not exists public\.work_orders/i);
    expect(sql).toMatch(/create table if not exists public\.work_order_updates/i);

    expect(sql).not.toMatch(/create table if not exists public\.visitor_passes/i);
    expect(sql).not.toMatch(/create table if not exists public\.gates/i);
    expect(sql).not.toMatch(/create table if not exists public\.access_events/i);
    expect(sql).not.toMatch(/create table if not exists public\.vehicles/i);
    expect(sql).not.toMatch(/create table if not exists public\.(dues|expenses|payments|receipts|journal_entries|inventory|stock_movements)/i);
  });

  it("keeps work order mutations RPC-only for authenticated users", () => {
    expect(sql).toMatch(/alter table public\.work_orders enable row level security/i);
    expect(sql).toMatch(/alter table public\.work_order_updates enable row level security/i);
    expect(sql).toMatch(/revoke all privileges on table public\.work_orders from public, anon, authenticated/i);
    expect(sql).toMatch(/revoke all privileges on table public\.work_order_updates from public, anon, authenticated/i);
    expect(sql).toMatch(/grant select on table public\.work_orders to authenticated/i);
    expect(sql).toMatch(/grant select on table public\.work_order_updates to authenticated/i);
    expect(sql).not.toMatch(/grant (insert|update|delete|all).*public\.work_orders to authenticated/i);
    expect(sql).not.toMatch(/grant (insert|update|delete|all).*public\.work_order_updates to authenticated/i);

    expect(sql).toMatch(/create or replace function public\.create_work_order/i);
    expect(sql).toMatch(/create or replace function public\.assign_work_order/i);
    expect(sql).toMatch(/create or replace function public\.schedule_work_order/i);
    expect(sql).toMatch(/create or replace function public\.complete_work_order/i);
  });

  it("implements the PR2 state machine without request assignment semantics", () => {
    expect(sql).toMatch(/p_previous_status = 'DRAFT' and p_next_status = 'ASSIGNED'/i);
    expect(sql).toMatch(/p_previous_status = 'ASSIGNED' and p_next_status in \('SCHEDULED', 'IN_PROGRESS'\)/i);
    expect(sql).toMatch(/p_previous_status = 'SCHEDULED' and p_next_status = 'IN_PROGRESS'/i);
    expect(sql).toMatch(/p_previous_status = 'IN_PROGRESS' and p_next_status in \('WAITING', 'COMPLETED'\)/i);
    expect(sql).toMatch(/p_previous_status = 'WAITING' and p_next_status = 'IN_PROGRESS'/i);
    expect(sql).toMatch(/p_previous_status in \('DRAFT', 'ASSIGNED', 'SCHEDULED'\) and p_next_status = 'CANCELLED'/i);
    expect(sql).not.toMatch(/ASSIGNED[\s\S]{0,160}maintenance_requests/i);
  });

  it("ships narrow permissions and reuses maintenance entitlement", () => {
    expect(sql).toMatch(/operations\.work_orders\.view/i);
    expect(sql).toMatch(/operations\.work_orders\.manage/i);
    expect(sql).toMatch(/operations\.work_orders\.assign/i);
    expect(sql).toMatch(/operations\.work_orders\.complete/i);
    expect(sql).toMatch(/maintenance_module_enabled/i);
    expect(sql).not.toMatch(/work_orders_module|work_order_module/i);
  });

  it("keeps accounting and attachments out of PR2 schema", () => {
    expect(sql).not.toMatch(/insert into public\.(dues|expenses|payments|receipts|journal_entries|supplier_invoices)/i);
    expect(sql).not.toMatch(/from public\.(dues|expenses|payments|receipts|journal_entries|supplier_invoices)/i);
    expect(sql).not.toMatch(/insert into storage\.buckets/i);
    expect(sql).not.toMatch(/create table if not exists public\.maintenance_request_attachments/i);
  });
});
