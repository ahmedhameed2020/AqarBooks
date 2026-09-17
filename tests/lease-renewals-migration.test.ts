import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join("supabase", "migrations", "20260917183206_lease_renewal_database_contract.sql"),
  "utf8",
);

describe("lease renewal database contract migration", () => {
  it("creates only the request, transition, and expiry-dispatch contract", () => {
    expect(migration).toContain("create table public.lease_renewal_requests");
    expect(migration).toContain("create table public.lease_renewal_transitions");
    expect(migration).toContain("create table public.lease_expiry_dispatches");
    expect(migration).not.toMatch(/create table .*successor/i);
    expect(migration).not.toMatch(/insert into public\.dues|update public\.dues|delete from public\.dues/i);
  });

  it("keeps authenticated mutations RPC-only and transition history append-only", () => {
    expect(migration).toContain("grant select on table public.lease_renewal_requests to authenticated");
    expect(migration).toContain("grant select on table public.lease_renewal_transitions to authenticated");
    expect(migration).not.toMatch(
      /grant\s+(insert|update|delete|all privileges)\s+on table public\.lease_(renewal_requests|renewal_transitions|expiry_dispatches)\s+to authenticated/i,
    );
    expect(migration).toContain("create trigger lease_renewal_transitions_append_only");
    expect(migration).toContain("LEASE_RENEWAL_TRANSITIONS_APPEND_ONLY");
  });

  it("gates the contract by entitlement, active organization, and narrow permissions", () => {
    expect(migration).toContain("'lease_lifecycle'");
    expect(migration).toContain("'property.lease_renewals.view'");
    expect(migration).toContain("'property.lease_renewals.manage'");
    expect(migration).toContain("public.lease_lifecycle_enabled");
    expect(migration).toContain("public.organization_is_active");
    expect(migration).toContain("public.current_member_id()");
    expect(migration).toMatch(/public\.lease_renewal_staff_can_read\(\s*p_organization_id uuid,\s*p_property_id uuid\s*\)/);
    expect(migration).toMatch(/public\.lease_renewal_staff_can_manage\(\s*p_organization_id uuid,\s*p_property_id uuid\s*\)/);
    expect(migration).toContain("ura.property_id is null or ura.property_id = p_property_id");
  });

  it("uses privacy-preserving errors and a current-owner projection", () => {
    expect(migration).toContain("LEASE_RENEWAL_NOT_FOUND");
    expect(migration).toContain("public.get_owned_unit_lease_renewal_status");
    expect(migration).toContain("uo.start_date <= current_date");
    expect(migration).toContain("(uo.end_date is null or uo.end_date >= current_date)");
  });

  it("enables RLS and revokes PUBLIC execution from every new function", () => {
    for (const table of ["lease_renewal_requests", "lease_renewal_transitions", "lease_expiry_dispatches"]) {
      expect(migration).toContain(`alter table public.${table} enable row level security`);
    }
    expect(migration).toMatch(/revoke all on function public\.request_lease_renewal[\s\S]+from public, anon, authenticated, service_role/i);
    expect(migration).toMatch(/revoke all on function public\.decide_lease_renewal[\s\S]+from public, anon, authenticated, service_role/i);
    expect(migration).toMatch(/revoke all on function public\.get_owned_unit_lease_renewal_status[\s\S]+from public, anon, authenticated, service_role/i);
  });

  it("does not widen the legacy unit_leases grants", () => {
    expect(migration).not.toMatch(/grant\s+.*on table public\.unit_leases/i);
    expect(migration).not.toMatch(/revoke\s+.*on table public\.unit_leases/i);
  });
});
