import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationNames = readdirSync(join("supabase", "migrations")).filter((name) =>
  name.endsWith("_online_payment_production_foundation.sql"),
);

describe("online payment production foundation migration", () => {
  it("has exactly one migration source", () => {
    expect(migrationNames).toHaveLength(1);
  });

  const migration = migrationNames.length === 1
    ? readFileSync(join("supabase", "migrations", migrationNames[0]), "utf8").toLowerCase()
    : "";

  it("snapshots environment, currency, settings, and merchant on every transaction", () => {
    for (const column of [
      "environment",
      "currency",
      "provider_settings_id",
      "provider_merchant_identifier_snapshot",
    ]) {
      expect(migration).toContain(`add column ${column}`);
    }
    expect(migration).toContain("environment in ('sandbox', 'production')");
    expect(migration).toContain("foreign key (provider_settings_id)");
  });

  it("creates an append-only, replay-safe event inbox", () => {
    expect(migration).toContain("create table public.online_payment_events");
    expect(migration).toContain("payload_hash");
    expect(migration).toContain("retryable_error");
    expect(migration).toMatch(/unique[\s\S]+provider[\s\S]+environment[\s\S]+event_identifier/);
    expect(migration).toContain("online_payment_events_append_only");
  });

  it("keeps claiming and completion service-only", () => {
    expect(migration).toMatch(
      /revoke all on function public\.claim_online_payment_events[\s\S]+from public, anon, authenticated/,
    );
    expect(migration).toMatch(
      /grant execute on function public\.claim_online_payment_events[\s\S]+to service_role/,
    );
  });
});
