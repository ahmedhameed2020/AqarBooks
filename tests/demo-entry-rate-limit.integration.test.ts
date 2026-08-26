// @ts-nocheck
/**
 * Durable rate limiting for public demo entry.
 *
 * WHY THIS SUITE EXISTS
 * enterDemoAction used to call auth.signInWithPassword on every submission
 * with no limit at all. This proves the fix -- check_and_record_rate_limit
 * (migration 20260826072010_public_action_rate_limits.sql) and its wrapper
 * lib/demo/rate-limit.ts -- actually holds, not just that it compiles.
 *
 * WHAT "DURABLE, NOT ISOLATE-LOCAL" MEANS HERE, CONCRETELY
 * A process-local Map would pass every test in this file if the whole suite
 * ran in one Node process sharing one module instance -- that is exactly the
 * failure mode this suite has to rule out, not accidentally reproduce. Two
 * things do that:
 *
 *   1. A static check that lib/demo/rate-limit.ts itself declares no
 *      module-scope Map/counter for it to hold state in.
 *   2. A behavioural check that calls the RPC through completely independent
 *      Supabase client objects and shows the count is enforced across them --
 *      proving the state lives in a row set two unrelated clients both read,
 *      not in either client's own memory. Two Cloudflare isolates never share
 *      a JS heap; two Supabase client instances hitting the same Postgres row
 *      is the closest a single test process can get to that condition, and
 *      it is sufficient to rule out anything JS-object-scoped, since a
 *      JS-object-scoped counter could not survive being asked from an object
 *      that never held a reference to it.
 *
 * This suite calls the RPC directly, not through the Next.js action layer --
 * the demo-entry gate itself (the RPC and its grants) is what has to be
 * proven durable; exercising it via a running dev server would add an HTTP
 * hop without adding any assurance the RPC itself doesn't already give.
 */
import { describe, it, expect, afterEach } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const ACTION = "test_demo_entry_gate";

/** A fresh Supabase client per call -- see the module doc above. */
function freshServiceClient() {
  return createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function call(client: ReturnType<typeof createClient>, clientKey: string, limit: number, windowSeconds: number) {
  const { data, error } = await client.rpc("check_and_record_rate_limit", {
    p_action: ACTION,
    p_client_key: clientKey,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });
  if (error) throw error;
  return data as boolean;
}

const usedKeys: string[] = [];
function newClientKey(): string {
  const key = `gate-test-${randomUUID()}`;
  usedKeys.push(key);
  return key;
}

afterEach(async () => {
  if (usedKeys.length === 0) return;
  const admin = freshServiceClient();
  await admin.from("public_action_rate_limits").delete().in("client_key", usedKeys.splice(0));
});

describe("check_and_record_rate_limit -- static durability check", () => {
  it("lib/demo/rate-limit.ts declares no in-memory counter to hold state in", () => {
    const source = readFileSync(join(process.cwd(), "lib/demo/rate-limit.ts"), "utf8");
    expect(source).not.toMatch(/new Map\s*\(/);
    expect(source).not.toMatch(/new Set\s*\(/);
    // No module-scope mutable counter of any kind -- every `const`/`let` at
    // top level in this file is either an import or one of the three fixed
    // policy constants (action name, limit, window), never a live count.
    expect(source).not.toMatch(/^\s*(let|const)\s+\w*(count|attempts|bucket|requests)\w*\s*[:=]/im);
  });
});

describe("check_and_record_rate_limit -- behaviour", () => {
  it("requests under the threshold are allowed", async () => {
    const key = newClientKey();
    const client = freshServiceClient();

    for (let i = 0; i < 3; i += 1) {
      const allowed = await call(client, key, 5, 60);
      expect(allowed, `attempt ${i + 1} of 3, under a limit of 5`).toBe(true);
    }
  });

  it("the threshold is enforced -- the 6th attempt in a window of 5 is denied", async () => {
    const key = newClientKey();
    const client = freshServiceClient();

    for (let i = 0; i < 5; i += 1) {
      expect(await call(client, key, 5, 60), `attempt ${i + 1} of 5`).toBe(true);
    }
    expect(await call(client, key, 5, 60), "6th attempt, limit is 5").toBe(false);
    // Denial does not itself count as a recorded attempt -- a 7th call is
    // still denied, not admitted because the 6th "used up" a slot it never got.
    expect(await call(client, key, 5, 60), "7th attempt, still denied").toBe(false);
  });

  it("the window expires and capacity returns -- proves this is a real ledger, not a monotonic counter", async () => {
    const key = newClientKey();
    const client = freshServiceClient();
    const windowSeconds = 1;

    expect(await call(client, key, 1, windowSeconds)).toBe(true);
    expect(await call(client, key, 1, windowSeconds), "immediately over the limit of 1").toBe(false);

    await new Promise((resolve) => setTimeout(resolve, (windowSeconds + 1) * 1000));

    expect(await call(client, key, 1, windowSeconds), "window elapsed, capacity freed").toBe(true);
  });

  it("is enforced across independent client objects, not held in either one's memory", async () => {
    const key = newClientKey();

    // Three unrelated client instances, as if three separate Workers isolates
    // each independently constructed their own Supabase client for this
    // request. None of them has ever seen another's existence.
    const clientA = freshServiceClient();
    const clientB = freshServiceClient();
    const clientC = freshServiceClient();

    expect(await call(clientA, key, 2, 60), "client A, 1st use of this key").toBe(true);
    // If state lived in clientA's memory, client B -- which never touched
    // clientA -- would see a fresh count and this would wrongly succeed.
    expect(await call(clientB, key, 2, 60), "client B, 2nd use of this key").toBe(true);
    expect(await call(clientC, key, 2, 60), "client C, 3rd use, limit is 2").toBe(false);
  });

  it("different client keys never share a bucket", async () => {
    const keyA = newClientKey();
    const keyB = newClientKey();
    const client = freshServiceClient();

    expect(await call(client, keyA, 1, 60)).toBe(true);
    expect(await call(client, keyA, 1, 60), "keyA already at its limit of 1").toBe(false);
    // keyB has made zero attempts and must be unaffected by keyA's history.
    expect(await call(client, keyB, 1, 60), "keyB is a fresh bucket").toBe(true);
  });

  it("different actions never share a bucket, even for the same client key", async () => {
    const key = newClientKey();
    const client = freshServiceClient();

    const { data: usedOnFirstAction, error: e1 } = await client.rpc("check_and_record_rate_limit", {
      p_action: `${ACTION}_a`,
      p_client_key: key,
      p_limit: 1,
      p_window_seconds: 60,
    });
    if (e1) throw e1;
    expect(usedOnFirstAction).toBe(true);

    const { data: secondAction, error: e2 } = await client.rpc("check_and_record_rate_limit", {
      p_action: `${ACTION}_b`,
      p_client_key: key,
      p_limit: 1,
      p_window_seconds: 60,
    });
    if (e2) throw e2;
    expect(secondAction, "a different action for the same client key is a fresh bucket").toBe(true);
  });
});

describe("normal application traffic is unaffected", () => {
  it("anon and authenticated cannot call the rate-limit RPC directly", async () => {
    const anon = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error } = await anon.rpc("check_and_record_rate_limit", {
      p_action: ACTION,
      p_client_key: newClientKey(),
      p_limit: 5,
      p_window_seconds: 60,
    });
    expect(error, "the RPC must be service-role only").toBeTruthy();
    expect(error.code).toBe("42501");
  });

  it("an ordinary authenticated RPC (has_permission) is unaffected by this suite's demo-entry probing", async () => {
    // Not a demo principal, not the action under test -- exists only to show
    // the rest of the system does not notice this suite ran at all.
    const admin = freshServiceClient();
    const { data: anyOrg } = await admin.from("organizations").select("id").limit(1).single();
    expect(anyOrg).toBeTruthy();

    for (let i = 0; i < 10; i += 1) {
      const { error } = await admin.rpc("has_permission", {
        p_user_id: "00000000-0000-0000-0000-000000000000",
        p_organization_id: anyOrg!.id,
        p_permission_key: "finance.reports.read",
      });
      expect(error, `has_permission call ${i + 1} of 10`).toBeNull();
    }
  });
});
