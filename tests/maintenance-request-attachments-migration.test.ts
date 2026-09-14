import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = path.join(
  process.cwd(),
  "supabase",
  "migrations",
  "20260914200226_maintenance_request_attachments.sql",
);

const sql = fs.readFileSync(migrationPath, "utf8");
const productionAttachmentFiles = [
  "lib/actions/maintenance.ts",
  "app/[locale]/portal/(member)/maintenance/maintenance-attachments-client.tsx",
  "app/[locale]/portal/(member)/maintenance/new/new-maintenance-request-form.tsx",
  "app/[locale]/portal/(member)/maintenance/[requestId]/page.tsx",
  "app/[locale]/(app)/operations/maintenance/[requestId]/page.tsx",
];

describe("maintenance request attachments migration", () => {
  it("adds only the PR1B attachment primitives", () => {
    expect(sql).toMatch(/create table if not exists public\.maintenance_request_attachments/i);
    expect(sql).toMatch(/insert into storage\.buckets/i);
    expect(sql).toMatch(/'maintenance-attachments'/i);

    expect(sql).not.toMatch(/create table if not exists public\.work_orders/i);
    expect(sql).not.toMatch(/create table if not exists public\.visitor_passes/i);
    expect(sql).not.toMatch(/create table if not exists public\.gates/i);
    expect(sql).not.toMatch(/create table if not exists public\.access_events/i);
    expect(sql).not.toMatch(/create table if not exists public\.vehicles/i);
    expect(sql).not.toMatch(/create table if not exists public\.(dues|expenses|payments|receipts|journal_entries)/i);
  });

  it("keeps the storage bucket private and constrained", () => {
    expect(sql).toMatch(/false,\s*10485760,\s*array\['image\/jpeg', 'image\/png', 'image\/webp', 'application\/pdf'\]::text\[\]/i);
    expect(sql).toMatch(/set public = false/i);
    expect(sql).not.toMatch(/image\/svg\+xml/i);
    expect(sql).not.toMatch(/text\/html/i);
    expect(sql).not.toMatch(/application\/javascript/i);
    expect(sql).not.toMatch(/public\s*=\s*true/i);
  });

  it("makes metadata writes RPC-only for authenticated users", () => {
    expect(sql).toMatch(/alter table public\.maintenance_request_attachments enable row level security/i);
    expect(sql).toMatch(/revoke all privileges on table public\.maintenance_request_attachments from public, anon, authenticated/i);
    expect(sql).toMatch(/grant select on table public\.maintenance_request_attachments to authenticated/i);
    expect(sql).not.toMatch(/grant (insert|update|delete|all).*maintenance_request_attachments to authenticated/i);

    expect(sql).toMatch(/create or replace function public\.begin_maintenance_attachment_upload/i);
    expect(sql).toMatch(/create or replace function public\.finalize_maintenance_attachment_upload/i);
    expect(sql).toMatch(/create or replace function public\.abort_maintenance_attachment_upload/i);
  });

  it("derives canonical object paths on the server", () => {
    expect(sql).toMatch(/organization_id::text \|\| '\/' \|\|[\s\S]*maintenance_request_id::text \|\| '\/' \|\|[\s\S]*id::text/i);
    expect(sql).toMatch(/v_request\.organization_id::text \|\| '\/' \|\| v_request\.id::text \|\| '\/' \|\| v_attachment_id::text/i);
    expect(sql).not.toMatch(/p_storage_path/i);
    expect(sql).not.toMatch(/begin_maintenance_attachment_upload\([\s\S]*p_organization_id/i);
    expect(sql).not.toMatch(/begin_maintenance_attachment_upload\([\s\S]*p_uploaded_by/i);
  });

  it("ships storage policies and keeps ready evidence immutable", () => {
    expect(sql).toMatch(/create policy maintenance_attachments_storage_insert_pending/i);
    expect(sql).toMatch(/create policy maintenance_attachments_storage_select_ready/i);
    expect(sql).toMatch(/create policy maintenance_attachments_storage_delete_pending_or_failed/i);
    expect(sql).not.toMatch(/for update\s+to authenticated/i);
    expect(sql).not.toMatch(/a\.status = 'READY'[\s\S]{0,160}delete/i);
  });

  it("does not use a service-role admin client in production maintenance attachment paths", () => {
    const offenders = productionAttachmentFiles.filter((file) => {
      const source = fs.readFileSync(path.join(process.cwd(), file), "utf8");
      return /createAdminClient|@\/lib\/supabase\/admin/.test(source);
    });

    expect(offenders).toEqual([]);
  });
});
