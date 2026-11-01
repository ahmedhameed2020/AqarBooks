import { describe, expect, it } from "vitest";
import { sql } from "./helpers/gate-release";

/**
 * Guards the class of defect behind G2: a later migration rebuilt notifications_source_type_check from a fixed list and
 * silently dropped 'amenity_booking', which the amenity lifecycle trigger still inserts (every amenity decision then failed).
 *   - the constraint keeps every type it had before 20261015100000 and has 'amenity_booking';
 *   - every source type that a trigger/function literally passes to create_notification_once is allowed by the constraint,
 *     so adding a notifier without extending the list (or shrinking the list) fails here, not in production.
 * Isolated stack only (the isolation gate refuses anything else before the first query).
 */
const BEFORE_2F = [
  "maintenance_request", "maintenance_request_update", "work_order", "work_order_update", "work_order_cost",
  "visitor_invitation", "access_event", "due", "payment", "vehicle", "lease_expiry_dispatch", "gate_manual_exception",
];
const allowed = (): string[] => {
  const def = sql(`select pg_get_constraintdef(oid) from pg_constraint where conrelid='public.notifications'::regclass and conname='notifications_source_type_check'`);
  return [...def.matchAll(/'([^']+)'/g)].map((m) => m[1]);
};

describe("notifications_source_type_check", () => {
  it("keeps every previously allowed type and restores amenity_booking", () => {
    const list = allowed();
    for (const t of BEFORE_2F) expect(list, t).toContain(t);
    expect(list).toContain("amenity_booking");
  });

  it("allows every source type that a function passes to create_notification_once", () => {
    const swept = sql(`select coalesce(string_agg(distinct m[1], ',' order by m[1]), '')
      from pg_proc p, lateral regexp_matches(pg_get_functiondef(p.oid), '''([a-z_]+)'',\\s*(?:new|old|v_[a-z_]+)\\.id,\\s*''/', 'g') as m
      where p.pronamespace = 'public'::regnamespace and p.prokind = 'f' and pg_get_functiondef(p.oid) ilike '%create_notification_once%'`)
      .split(",").filter(Boolean);
    expect(swept.length).toBeGreaterThan(5); // the sweep really found the notifiers
    expect(swept).toContain("amenity_booking");
    const list = allowed();
    expect(swept.filter((t) => !list.includes(t)), "source types used by functions but rejected by the constraint").toEqual([]);
  });
});

describe("notifications_type_check", () => {
  const BEFORE = [
    "REQUEST_RECEIVED", "MAINTENANCE_UPDATE", "WORK_ORDER_SCHEDULED", "WORK_STARTED", "WORK_COMPLETED", "OWNER_CHARGE_CREATED",
    "VISITOR_INVITATION_CREATED", "VISITOR_ENTERED", "VISITOR_EXITED", "INVITATION_REVOKED", "DUE_CREATED", "PAYMENT_CONFIRMED",
    "RECEIPT_AVAILABLE", "VEHICLE_REGISTERED", "VEHICLE_DEACTIVATED", "LEASE_EXPIRY_REMINDER", "VISITOR_SECURITY_ALERT", "VISITOR_MANUAL_EXCEPTION",
  ];
  it("keeps every previous type and allows the four amenity booking types the lifecycle trigger produces", () => {
    const def = sql(`select pg_get_constraintdef(oid) from pg_constraint where conrelid='public.notifications'::regclass and conname='notifications_type_check'`);
    const list = [...def.matchAll(/'([^']+)'/g)].map((m) => m[1]);
    for (const t of [...BEFORE, "AMENITY_BOOKING_REQUESTED", "AMENITY_BOOKING_CONFIRMED", "AMENITY_BOOKING_REJECTED", "AMENITY_BOOKING_CANCELLED"]) expect(list, t).toContain(t);
  });
});
