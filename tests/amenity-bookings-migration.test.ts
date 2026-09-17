import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join("supabase", "migrations", "20260917040349_amenity_bookings.sql"),
  "utf8",
);

describe("amenity bookings migration guard", () => {
  it("creates only the amenity catalogue and booking workflow", () => {
    expect(migration).toContain("create table if not exists public.amenities");
    expect(migration).toContain("create table if not exists public.amenity_bookings");
    expect(migration).not.toMatch(/create table if not exists public\.(social_posts|chat_messages|marketplace)/i);
  });

  it("keeps authenticated mutations RPC-only", () => {
    expect(migration).toContain("grant select on table public.amenities to authenticated");
    expect(migration).toContain("grant select on table public.amenity_bookings to authenticated");
    expect(migration).not.toMatch(/grant\s+(insert|update|delete|all privileges)\s+on table public\.(amenities|amenity_bookings)\s+to authenticated/i);
    expect(migration).toContain("grant execute on function public.create_amenity_booking");
    expect(migration).toContain("grant execute on function public.set_amenity_active");
    expect(migration).toContain("grant execute on function public.cancel_own_amenity_booking");
    expect(migration).toContain("grant execute on function public.decide_amenity_booking");
  });

  it("derives booking tenancy and current ownership on the server", () => {
    expect(migration).toContain("public.current_member_id()");
    expect(migration).toContain("public.is_current_member_unit_owner");
    expect(migration).toContain("v_unit.organization_id <> v_amenity.organization_id");
    expect(migration).toContain("v_unit.property_id <> v_amenity.property_id");
    expect(migration).toContain("public.amenity_booking_enabled");
  });

  it("serializes availability checks to prevent double booking", () => {
    expect(migration).toContain("pg_catalog.pg_advisory_xact_lock");
    expect(migration).toContain("ab.starts_at < v_ends_at");
    expect(migration).toContain("ab.ends_at > v_starts_at");
    expect(migration).toContain("AMENITY_SLOT_UNAVAILABLE");
  });

  it("enables RLS and removes public function execution", () => {
    expect(migration).toContain("alter table public.amenities enable row level security");
    expect(migration).toContain("alter table public.amenity_bookings enable row level security");
    expect(migration).toContain("create policy amenities_select_staff_or_owner");
    expect(migration).toContain("create policy amenity_bookings_select_staff_or_owner");
    expect(migration).toMatch(/revoke all on function public\.create_amenity_booking[\s\S]+from public, anon, authenticated, service_role/i);
    expect(migration).toMatch(/revoke all on function public\.notify_amenity_booking_lifecycle\(\)[\s\S]+from public, anon, authenticated, service_role/i);
  });
});
