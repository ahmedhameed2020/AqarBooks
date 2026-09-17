import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(join("supabase", "migrations", "20260917040349_amenity_bookings.sql"), "utf8");
const staffPage = readFileSync(join("app", "[locale]", "(app)", "operations", "amenities", "page.tsx"), "utf8");
const staffClient = readFileSync(join("app", "[locale]", "(app)", "operations", "amenities", "staff-amenities-client.tsx"), "utf8");
const portalPage = readFileSync(join("app", "[locale]", "portal", "(member)", "amenities", "page.tsx"), "utf8");
const portalClient = readFileSync(join("app", "[locale]", "portal", "(member)", "amenities", "portal-amenities-client.tsx"), "utf8");
const actions = readFileSync(join("lib", "actions", "amenities.ts"), "utf8");

describe("amenity booking closure guards", () => {
  it("does not distinguish missing resources from unauthorized resources in sensitive RPCs", () => {
    expect(migration).not.toContain("raise exception 'PROPERTY_NOT_FOUND'");
    expect(migration).not.toContain("raise exception 'AMENITY_NOT_FOUND'");
    expect(migration).toMatch(/create or replace function public\.create_amenity[\s\S]+raise exception 'AMENITY_NOT_AUTHORIZED'/);
    expect(migration).toMatch(/create or replace function public\.update_amenity[\s\S]+raise exception 'AMENITY_NOT_AUTHORIZED'/);
    expect(migration).toMatch(/create or replace function public\.set_amenity_active[\s\S]+raise exception 'AMENITY_NOT_AUTHORIZED'/);
    expect(migration).toMatch(/create or replace function public\.create_amenity_booking[\s\S]+raise exception 'AMENITY_BOOKING_NOT_AUTHORIZED'/);
    expect(migration).toMatch(/create or replace function public\.decide_amenity_booking[\s\S]+raise exception 'AMENITY_BOOKING_NOT_AUTHORIZED'/);
  });

  it("serializes booking creation with amenity updates and rechecks active state", () => {
    const bookingFunction = migration.match(/create or replace function public\.create_amenity_booking[\s\S]+?\n\$\$;/)?.[0] ?? "";
    const updateFunction = migration.match(/create or replace function public\.update_amenity[\s\S]+?\n\$\$;/)?.[0] ?? "";
    const activeFunction = migration.match(/create or replace function public\.set_amenity_active[\s\S]+?\n\$\$;/)?.[0] ?? "";

    expect(bookingFunction).toContain("pg_catalog.pg_advisory_xact_lock");
    expect(updateFunction).toContain("pg_catalog.pg_advisory_xact_lock");
    expect(activeFunction).toContain("pg_catalog.pg_advisory_xact_lock");
    expect(bookingFunction.match(/select \* into v_amenity/g)).toHaveLength(2);
    expect(migration).toContain("or not public.organization_is_active(v_booking.organization_id)");
  });

  it("filters booking-unit choices to current ownerships", () => {
    expect(portalPage).toContain('.lte("start_date", today)');
    expect(portalPage).toContain('.or(`end_date.is.null,end_date.gte.${today}`)');
  });

  it("formats staff and owner booking timestamps in the property timezone", () => {
    expect(staffPage).toContain("propertyTimezone");
    expect(portalPage).toContain("propertyTimezone");
    expect(staffClient).toContain("timeZone: b.propertyTimezone");
    expect(portalClient).toContain("timeZone: booking.propertyTimezone");
  });

  it("provides the staff edit action and explicit form labels", () => {
    expect(actions).toContain("export async function updateAmenityAction");
    expect(staffClient).toContain("await updateAmenityAction");
    expect(staffClient).toContain('htmlFor="amenity-opens"');
    expect(staffClient).toContain('htmlFor="amenity-closes"');
    expect(portalClient).toContain('htmlFor="portal-amenity-start"');
  });

  it("renders explicit query failures instead of silently converting them to empty lists", () => {
    expect(staffPage).toContain("[StaffAmenitiesPage] data query failed:");
    expect(portalPage).toContain("[PortalAmenitiesPage] data query failed:");
  });
});
