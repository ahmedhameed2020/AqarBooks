import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationFile = readdirSync(join("supabase", "migrations")).find((file) =>
  file.endsWith("_gate_device_trust.sql"),
);

describe("gate device trust migration guard", () => {
  it("creates the trusted device tables", () => {
    expect(migrationFile).toBeDefined();
    const migration = readFileSync(join("supabase", "migrations", migrationFile!), "utf8").toLowerCase();

    expect(migration).toContain("create table public.gate_device_enrollments");
    expect(migration).toContain("create table public.gate_devices");
    expect(migration).toContain("unique (organization_id, installation_id_hash)");
  });

  it("stores only fixed-length sha-256 hashes and enforces enrollment lifecycle", () => {
    expect(migrationFile).toBeDefined();
    const migration = readFileSync(join("supabase", "migrations", migrationFile!), "utf8").toLowerCase();

    expect(migration).toMatch(/code_hash[^;]+\^\[0-9a-f\]\{64\}\$/s);
    expect(migration).toMatch(/credential_hash[^;]+\^\[0-9a-f\]\{64\}\$/s);
    expect(migration).toContain("interval '15 minutes'");
    expect(migration).toContain("for update");
    expect(migration).toContain("redeemed_at");
    expect(migration).toContain("revoked_at");
  });

  it("installs RLS, explicit grants, audits, and the four RPCs", () => {
    expect(migrationFile).toBeDefined();
    const migration = readFileSync(join("supabase", "migrations", migrationFile!), "utf8").toLowerCase();

    expect(migration).toContain("enable row level security");
    expect(migration).not.toMatch(/grant\s+.+gate_devices.+to\s+anon/i);
    expect(migration).not.toMatch(/grant\s+(insert|update|delete|all privileges)\s+on table public\.gate_device_(enrollments|devices)\s+to authenticated/i);
    expect(migration).toContain("platform_audit_logs");
    expect(migration).toContain("create_gate_device_enrollment(");
    expect(migration).toContain("redeem_gate_device_enrollment(");
    expect(migration).toContain("revoke_gate_device(");
    expect(migration).toContain("verify_gate_device_binding(");
  });

  it("never returns stored enrollment or credential hashes", () => {
    expect(migrationFile).toBeDefined();
    const migration = readFileSync(join("supabase", "migrations", migrationFile!), "utf8").toLowerCase();
    const redeemFunction = migration.slice(
      migration.indexOf("create or replace function public.redeem_gate_device_enrollment"),
      migration.indexOf("create or replace function public.revoke_gate_device"),
    );

    expect(redeemFunction).toContain("returns public.gate_devices");
    expect(redeemFunction).toMatch(
      /v_device\.credential_hash := null;\s*v_device\.installation_id_hash := null;\s*return v_device;/s,
    );
    expect(redeemFunction.indexOf("v_device.credential_hash := null")).toBeLessThan(
      redeemFunction.indexOf("return v_device;"),
    );
  });
});
