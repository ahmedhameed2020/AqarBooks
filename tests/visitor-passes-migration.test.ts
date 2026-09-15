import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = path.join(
  process.cwd(),
  "supabase",
  "migrations",
  "20260915073908_visitor_invitations_secure_qr_passes.sql",
);

const actionPath = path.join(process.cwd(), "lib", "actions", "visitors.ts");
const sql = fs.readFileSync(migrationPath, "utf8");
const actions = fs.readFileSync(actionPath, "utf8");

describe("visitor passes migration", () => {
  it("creates only the PR4 visitor invitation primitives", () => {
    expect(sql).toMatch(/create table if not exists public\.visitor_invitations/i);
    expect(sql).toMatch(/create table if not exists public\.visitor_invitation_secrets/i);

    expect(sql).not.toMatch(/create table if not exists public\.gates/i);
    expect(sql).not.toMatch(/create table if not exists public\.access_events/i);
    expect(sql).not.toMatch(/create table if not exists public\.vehicles/i);
    expect(sql).not.toMatch(/create table if not exists public\.work_orders/i);
    expect(sql).not.toMatch(/create table if not exists public\.(dues|expenses|payments|receipts|journal_entries)/i);
  });

  it("stores only hashed QR bearer secrets outside the visible invitation table", () => {
    const invitationTable = sql.slice(
      sql.indexOf("create table if not exists public.visitor_invitations"),
      sql.indexOf("create table if not exists public.visitor_invitation_secrets"),
    );

    expect(invitationTable).not.toMatch(/token_hash/i);
    expect(sql).toMatch(/visitor_invitation_secrets[\s\S]*token_hash text not null/i);
    expect(sql).toMatch(/visitor_invitation_secrets_hash_shape check \(token_hash ~ '\^\[a-f0-9\]\{64\}\$'\)/i);
    expect(actions).toMatch(/randomBytes\(32\)\.toString\("base64url"\)/);
    expect(actions).toMatch(/createHash\("sha256"\)\.update\(secret\)\.digest\("hex"\)/);
    expect(actions).toMatch(/`AQP1\.\$\{invitationId\}\.\$\{secret\}`/);
    expect(actions).not.toMatch(/guestName.*qrPayload|unitId.*qrPayload|organizationId.*qrPayload/i);
  });

  it("keeps mutations RPC-only and authenticated-only", () => {
    expect(sql).toMatch(/alter table public\.visitor_invitations enable row level security/i);
    expect(sql).toMatch(/alter table public\.visitor_invitation_secrets enable row level security/i);
    expect(sql).toMatch(/revoke all privileges on table public\.visitor_invitations from public, anon, authenticated/i);
    expect(sql).toMatch(/revoke all privileges on table public\.visitor_invitation_secrets from public, anon, authenticated/i);
    expect(sql).toMatch(/grant select on table public\.visitor_invitations to authenticated/i);
    expect(sql).not.toMatch(/grant select on table public\.visitor_invitation_secrets to authenticated/i);
    expect(sql).not.toMatch(/grant .* on table public\.visitor_(invitations|invitation_secrets) to anon/i);
    expect(sql).not.toMatch(/create policy visitor_invitations_insert/i);
    expect(sql).not.toMatch(/create policy visitor_invitations_update/i);
    expect(sql).not.toMatch(/create policy visitor_invitations_delete/i);
  });

  it("ships permissions, entitlements, current ownership, and audit logging", () => {
    expect(sql).toMatch(/operations\.visitors\.view/i);
    expect(sql).toMatch(/operations\.visitors\.manage/i);
    expect(sql).toMatch(/visitor_management/i);
    expect(sql).toMatch(/public\.is_current_member_unit_owner/i);
    expect(sql).toMatch(/public\.current_member_id\(\)/i);
    expect(sql).toMatch(/visitor_invitation\.created/i);
    expect(sql).toMatch(/visitor_invitation\.revoked/i);
  });

  it("does not use admin clients or service role in production visitor actions", () => {
    expect(actions).not.toMatch(/createAdminClient|service[_-]?role|SERVICE_ROLE/i);
  });
});
