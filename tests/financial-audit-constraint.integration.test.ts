/**
 * check_audit_action in the live (local) database: every approved action is accepted and
 * unknown / differently-cased / empty actions are still rejected (23514). Also exercises the
 * real writer for the action that regressed: record_member_opening_balance must leave an
 * OPENING_BALANCE_RECORDED chain row (full journal/due assertions live in
 * member-opening-balance.integration.test.ts).
 */
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { localSupabase, sql } from "./helpers/gate-release";

const env = localSupabase();
const admin = createClient(env.API_URL, env.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const org = randomUUID();
const APPROVED = [
  "PAYMENT_CREATED", "PAYMENT_IDEMPOTENT_REPLAY", "PAYMENT_ALLOCATION_CREATED", "PAYMENT_REVERSED",
  "DUE_ISSUED", "DUE_BATCH_ISSUED", "RECURRING_DUES_GENERATED", "RECURRING_DUES_SKIPPED",
  "OPERATION_REJECTED", "LEASE_RENT_DUE_GENERATED", "LEASE_RENT_DUE_SKIPPED", "OPENING_BALANCE_RECORDED",
];

beforeAll(() => {
  sql(`insert into public.organizations(id,name,slug,default_currency,status) values('${org}','FAC','${org}','EGP','ACTIVE')`);
});
afterAll(async () => {
  await admin.from("financial_audit_logs").delete().eq("organization_id", org);
});

const insert = (action: string) =>
  admin.from("financial_audit_logs").insert({ organization_id: org, action, entity_type: "fixture", metadata: {}, event_hash: `fixture-${randomUUID()}` });

describe("check_audit_action", () => {
  it("accepts every approved action", async () => {
    for (const a of APPROVED) {
      const { error } = await insert(a);
      expect(error, `${a}: ${error?.message}`).toBeNull();
    }
  });
  it("is exactly the approved set (no more, no fewer)", () => {
    const def = sql(`select pg_get_constraintdef(oid) from pg_constraint where conname='check_audit_action'`);
    const found = [...def.matchAll(/'([A-Z0-9_]+)'::text/g)].map((m) => m[1]).sort();
    expect(found).toEqual([...APPROVED].sort());
  });
  it.each(["BOGUS_ACTION", "payment_created", "", "PAYMENT_CREATED ", "OPENING_BALANCE"])("still rejects unknown action %j", async (a) => {
    const { error } = await insert(a);
    expect(error?.code).toBe("23514");
    expect(error?.message).toContain("check_audit_action");
  });
});
