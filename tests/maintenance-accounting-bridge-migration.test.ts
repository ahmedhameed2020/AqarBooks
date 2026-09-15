import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = path.join(
  process.cwd(),
  "supabase",
  "migrations",
  "20260915050914_maintenance_cost_accounting_bridge.sql",
);

const sql = fs.readFileSync(migrationPath, "utf8");

describe("maintenance accounting bridge migration", () => {
  it("adds only the PR3 operational cost primitive", () => {
    expect(sql).toMatch(/create table if not exists public\.work_order_costs/i);
    expect(sql).not.toMatch(/create table if not exists public\.(dues|expenses|payments|receipts|journal_entries|supplier_invoices|inventory|stock_movements)/i);
    expect(sql).not.toMatch(/create table if not exists public\.(visitor_passes|gates|access_events|vehicles)/i);
  });

  it("keeps operational cost separate from company posting and owner charging", () => {
    expect(sql).toMatch(/financial_status text not null default 'UNPOSTED'/i);
    expect(sql).toMatch(/owner_charge_status text not null default 'NOT_CHARGED'/i);
    expect(sql).toMatch(/work_order_costs_company_posting_exclusive check \(num_nonnulls\(expense_id, supplier_invoice_id\) <= 1\)/i);
    expect(sql).toMatch(/Owner charging is tracked separately/i);
    expect(sql).toMatch(/source_type = 'MAINTENANCE_WORK_ORDER_COST'/i);
  });

  it("routes financial effects through canonical accounting destinations only", () => {
    expect(sql).toMatch(/public\.record_expense\(/i);
    expect(sql).toMatch(/public\.post_supplier_invoice_in_currency\(/i);
    expect(sql).toMatch(/insert into public\.dues/i);
    expect(sql).toMatch(/references public\.expenses \(organization_id, id\)/i);
    expect(sql).toMatch(/references public\.supplier_invoices \(organization_id, id\)/i);
    expect(sql).toMatch(/references public\.dues \(organization_id, id\)/i);
    expect(sql).not.toMatch(/create table if not exists public\.(maintenance_ledger|maintenance_invoices|maintenance_receivables|maintenance_payables)/i);
  });

  it("makes mutations RPC-only and authenticated-only", () => {
    expect(sql).toMatch(/alter table public\.work_order_costs enable row level security/i);
    expect(sql).toMatch(/revoke all privileges on table public\.work_order_costs from public, anon, authenticated/i);
    expect(sql).toMatch(/grant select on table public\.work_order_costs to authenticated/i);
    expect(sql).not.toMatch(/grant (insert|update|delete|all).*public\.work_order_costs to authenticated/i);
    expect(sql).not.toMatch(/grant .*public\.work_order_costs to anon/i);

    expect(sql).toMatch(/create or replace function public\.add_work_order_cost/i);
    expect(sql).toMatch(/create or replace function public\.post_work_order_cost_as_expense/i);
    expect(sql).toMatch(/create or replace function public\.post_work_order_cost_as_supplier_invoice/i);
    expect(sql).toMatch(/create or replace function public\.charge_work_order_cost_to_owner/i);
  });

  it("does not expose helper or audit functions directly", () => {
    expect(sql).toMatch(/revoke all on function public\.assert_work_order_cost_currency\(uuid, text\) from public, anon, authenticated, service_role/i);
    expect(sql).toMatch(/revoke all on function public\.audit_work_order_cost_action\(public\.work_order_costs, uuid, text, jsonb\) from public, anon, authenticated, service_role/i);
    expect(sql).not.toMatch(/grant execute on function public\.assert_work_order_cost_currency/i);
    expect(sql).not.toMatch(/grant execute on function public\.audit_work_order_cost_action/i);
  });

  it("adds narrow maintenance cost permissions without broad admin dependency", () => {
    expect(sql).toMatch(/operations\.maintenance\.costs\.view/i);
    expect(sql).toMatch(/operations\.maintenance\.costs\.manage/i);
    expect(sql).toMatch(/operations\.maintenance\.costs\.post/i);
    expect(sql).toMatch(/operations\.maintenance\.owner_charge/i);
    expect(sql).toMatch(/maintenance_module_enabled/i);
  });
});
