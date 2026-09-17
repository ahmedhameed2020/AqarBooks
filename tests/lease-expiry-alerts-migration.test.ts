import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join("supabase", "migrations", "20260917195950_lease_expiry_alerts.sql"),
  "utf8",
);

describe("lease expiry alert migration", () => {
  it("extends notifications without changing the PR9.1 migration", () => {
    expect(migration).toContain("'LEASE_EXPIRY_REMINDER'");
    expect(migration).toContain("'lease_expiry_dispatch'");
    expect(migration).toContain("create or replace function public.notification_feature_enabled");
    expect(migration).toContain("public.lease_lifecycle_enabled");
    expect(migration).toContain("public.unit_experience_enabled");
  });

  it("uses dispatch insertion as the notification idempotency boundary", () => {
    expect(migration).toContain("insert into public.lease_expiry_dispatches");
    expect(migration).toContain("on conflict (lease_id, lease_ends_on, threshold_days, recipient_user_id) do nothing");
    expect(migration).toContain("returning id into v_dispatch_id");
    expect(migration).toContain("perform public.create_notification_once");
  });

  it("keeps the sweep service-role only", () => {
    expect(migration).toMatch(/revoke all on function public\.run_lease_expiry_alerts\(date\) from public, anon, authenticated, service_role/i);
    expect(migration).toContain("grant execute on function public.run_lease_expiry_alerts(date) to service_role");
    expect(migration).not.toContain("grant execute on function public.run_lease_expiry_alerts(date) to authenticated");
  });

  it("contains no successor lease, dues, renewal decisions, or timeline behavior", () => {
    expect(migration).not.toMatch(/insert into public\.unit_leases|update public\.unit_leases/i);
    expect(migration).not.toMatch(/insert into public\.dues|update public\.dues|delete from public\.dues/i);
    expect(migration).not.toMatch(/decide_lease_renewal|get_unit_timeline/i);
  });
});
