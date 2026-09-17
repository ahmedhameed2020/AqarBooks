import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join("supabase", "migrations", "20260918010000_lease_renewal_successor_activation.sql"),
  "utf8",
).toLowerCase();

describe("lease renewal successor activation migration", () => {
  it("links each approved request and source lease to one successor", () => {
    expect(migration).toContain("add column successor_lease_id uuid");
    expect(migration).toContain("add column renewed_from_lease_id uuid");
    expect(migration).toContain("unique (successor_lease_id)");
    expect(migration).toContain("unique (renewed_from_lease_id)");
  });

  it("serializes approval and creates the active successor atomically", () => {
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toMatch(/select l\.\*[\s\S]+for update/);
    expect(migration).toMatch(/insert into public\.unit_leases[\s\S]+status[\s\S]+['"]active['"]/);
    expect(migration).toMatch(/update public\.lease_renewal_requests[\s\S]+successor_lease_id/);
    expect(migration).toContain("lease_renewal_invalid_state");
  });

  it("does not create or mutate accounting dues during approval", () => {
    expect(migration).not.toMatch(/insert into public\.dues/);
    expect(migration).not.toMatch(/update public\.dues/);
    expect(migration).not.toMatch(/delete from public\.dues/);
    expect(migration).not.toMatch(/generate_lease_rent_dues\s*\(/);
  });

  it("keeps the existing authenticated RPC surface narrow", () => {
    expect(migration).toMatch(
      /revoke all on function public\.decide_lease_renewal\(uuid, text, text\)\s+from public, anon, authenticated, service_role/,
    );
    expect(migration).toMatch(
      /grant execute on function public\.decide_lease_renewal\(uuid, text, text\)\s+to authenticated, service_role/,
    );
    expect(migration).not.toMatch(/grant\s+.*on table public\.unit_leases/i);
  });
});
