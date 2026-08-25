/**
 * The public demo's own test suite.
 *
 * WHAT THIS SUITE IS FOR
 * The demo's safety rests on three layers (UI, server action, database role).
 * Two of them can be tested without a database, and the third -- the write
 * barrier across 141 server actions -- is the one most likely to decay
 * silently, because it decays by someone adding a 142nd action and not
 * thinking about the demo at all. `demo write barrier coverage` below is
 * therefore a filesystem test, deliberately: it asks the repository whether
 * every mutating action is guarded, and it fails when a new one is not.
 *
 * It opens no database connection and makes no network call.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DEMO_STORY } from "../lib/demo/story";
import { generateUnits, generateMembers, DEMO_SEED_VERSION } from "../scripts/demo/demo-fixtures";
import {
  checkDemoAiRateLimit,
  clientKeyFromRequest,
  __resetDemoRateLimitState,
  DEMO_RATE_LIMIT_POLICY,
} from "../lib/demo/rate-limit";

// ---------------------------------------------------------------------------
describe("demo story constants", () => {
  it("building unit counts sum to the advertised unit total", () => {
    const total = DEMO_STORY.buildings.reduce((sum, b) => sum + b.count, 0);
    expect(total).toBe(DEMO_STORY.headline.units);
  });

  it("archived stock reconciles the total with the advertised active count", () => {
    const archived = DEMO_STORY.buildings.reduce((sum, b) => sum + b.archived, 0);
    expect(DEMO_STORY.headline.units - archived).toBe(DEMO_STORY.headline.activeUnits);
  });

  it("advertises exactly the properties and buildings it defines", () => {
    // The public entry page prints these numbers before a visitor signs in. If
    // a fixture is added and the headline is not updated, the page promises a
    // portfolio the seed does not build.
    expect(DEMO_STORY.properties).toHaveLength(DEMO_STORY.headline.properties);
    expect(DEMO_STORY.buildings).toHaveLength(DEMO_STORY.headline.buildings);
  });

  it("every building belongs to a defined property", () => {
    const codes = new Set(DEMO_STORY.properties.map((p) => p.code));
    for (const building of DEMO_STORY.buildings) {
      expect(codes.has(building.propertyCode)).toBe(true);
    }
  });

  it("dates the operating month consistently", () => {
    const { year, month, start, end, openingDate } = DEMO_STORY.period;
    expect(start).toBe(`${year}-${String(month).padStart(2, "0")}-01`);
    expect(end > start).toBe(true);
    // Opening balances must predate the period they open.
    expect(openingDate < start).toBe(true);
  });
});

// ---------------------------------------------------------------------------
describe("demo fixtures", () => {
  it("are deterministic across runs", () => {
    // The seed is re-runnable and the entry page quotes its scale. A fixture
    // that changed between runs would make "demo-seed-v1" meaningless.
    expect(JSON.stringify(generateUnits())).toBe(JSON.stringify(generateUnits()));
    expect(DEMO_SEED_VERSION).toBe("demo-seed-v1");
  });

  it("produce exactly the advertised number of units, with unique codes", () => {
    const units = generateUnits();
    expect(units).toHaveLength(DEMO_STORY.headline.units);
    expect(new Set(units.map((u) => u.code)).size).toBe(units.length);
  });

  it("archive exactly the shortfall between total and active units", () => {
    const units = generateUnits();
    const active = units.filter((u) => !u.archived);
    expect(active).toHaveLength(DEMO_STORY.headline.activeUnits);
  });

  it("hit the occupancy target on active stock only", () => {
    const units = generateUnits();
    const active = units.filter((u) => !u.archived);
    const occupied = active.filter((u) => u.tenure !== "VACANT");
    expect(occupied.length / active.length).toBeCloseTo(DEMO_STORY.targets.occupancy, 2);
    // An archived unit with a tenant would be a contradiction on screen.
    expect(units.filter((u) => u.archived && u.tenure !== "VACANT")).toHaveLength(0);
  });

  it("never gives commercial stock a resident owner", () => {
    const units = generateUnits();
    const wrong = units.filter(
      (u) => (u.unitType === "OFFICE" || u.unitType === "SHOP") && u.tenure === "OWNER_RESIDENT",
    );
    expect(wrong).toHaveLength(0);
  });

  it("assigns a member to every occupied unit and to no vacant one", () => {
    const units = generateUnits();
    const { members, assignment } = generateMembers(units);

    const occupied = units.filter((u) => !u.archived && u.tenure !== "VACANT");
    for (const unit of occupied) {
      expect(assignment.get(unit.code)).toBeTruthy();
    }
    for (const unit of units.filter((u) => u.tenure === "VACANT")) {
      expect(assignment.has(unit.code)).toBe(false);
    }

    // Multi-unit holders are the point of the every-fifth rule; without them
    // the member statement never shows more than one unit.
    expect(members.length).toBeLessThan(occupied.length);
  });

  it("keeps every generated contact undeliverable", () => {
    // A demo must not be able to email or call a real person. RFC 2606 reserves
    // .invalid permanently, so these addresses can never resolve.
    const { members } = generateMembers(generateUnits());
    for (const member of members) {
      expect(member.email.endsWith("@demo.aqarbooks.invalid")).toBe(true);
    }
    expect(new Set(members.map((m) => m.email)).size).toBe(members.length);
  });
});

// ---------------------------------------------------------------------------
describe("demo AI rate limit", () => {
  beforeEach(() => __resetDemoRateLimitState());

  it("allows up to the burst cap, then refuses", () => {
    const key = "203.0.113.7";
    for (let i = 0; i < DEMO_RATE_LIMIT_POLICY.BURST_MAX; i++) {
      expect(checkDemoAiRateLimit(key).allowed).toBe(true);
    }
    const refused = checkDemoAiRateLimit(key);
    expect(refused.allowed).toBe(false);
    expect(refused.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("does not let a refused caller extend its own penalty", () => {
    // Refusals are not recorded. If they were, a client that kept retrying
    // would keep pushing its own window forward and never recover.
    const key = "203.0.113.8";
    const t0 = 1_000_000;
    for (let i = 0; i < DEMO_RATE_LIMIT_POLICY.BURST_MAX; i++) {
      checkDemoAiRateLimit(key, t0);
    }
    for (let i = 0; i < 20; i++) {
      expect(checkDemoAiRateLimit(key, t0 + 1000).allowed).toBe(false);
    }
    // Once the burst window has passed, the caller is served again.
    const after = t0 + DEMO_RATE_LIMIT_POLICY.BURST_WINDOW_MS + 1;
    expect(checkDemoAiRateLimit(key, after).allowed).toBe(true);
  });

  it("enforces the sustained cap across many burst windows", () => {
    const key = "203.0.113.9";
    let now = 2_000_000;
    let served = 0;
    // Step a full burst window each time, so the burst rule never fires and
    // only the hourly ceiling can stop this.
    for (let i = 0; i < DEMO_RATE_LIMIT_POLICY.SUSTAINED_MAX + 10; i++) {
      if (checkDemoAiRateLimit(key, now).allowed) served++;
      now += DEMO_RATE_LIMIT_POLICY.BURST_WINDOW_MS;
    }
    expect(served).toBeLessThanOrEqual(DEMO_RATE_LIMIT_POLICY.SUSTAINED_MAX);
  });

  it("limits each client independently", () => {
    const a = "203.0.113.10";
    const b = "203.0.113.11";
    for (let i = 0; i < DEMO_RATE_LIMIT_POLICY.BURST_MAX; i++) checkDemoAiRateLimit(a);
    expect(checkDemoAiRateLimit(a).allowed).toBe(false);
    expect(checkDemoAiRateLimit(b).allowed).toBe(true);
  });

  it("prefers CF-Connecting-IP and never trusts a client-supplied override", () => {
    // Cloudflare overwrites CF-Connecting-IP at the edge, so it cannot be
    // spoofed. x-forwarded-for can be, and is only a local-dev fallback.
    const spoofed = new Request("https://example.test", {
      headers: { "cf-connecting-ip": "198.51.100.1", "x-forwarded-for": "1.2.3.4" },
    });
    expect(clientKeyFromRequest(spoofed)).toBe("198.51.100.1");

    // Unidentifiable traffic shares one bucket rather than being exempt.
    expect(clientKeyFromRequest(new Request("https://example.test"))).toBe("unknown");
  });
});

// ---------------------------------------------------------------------------
describe("demo write barrier coverage", () => {
  /**
   * Actions that must keep working inside the demo, or that mutate nothing.
   * This list is the ONLY sanctioned way to be unguarded, and adding to it is a
   * deliberate act that shows up in review -- which is the point.
   */
  const SANCTIONED_UNGUARDED = new Set([
    // Entering and leaving the demo.
    "enterDemoAction",
    "exitDemoAction",
    // The conversion path: these are why the demo exists, they run for
    // anonymous visitors, and they write only to lead tables.
    "submitDemoLeadAction",
    "submitContactRequestAction",
    // A visitor must be able to leave the shared account for their own.
    "signIn",
    "signOut",
    // Read-only queries that happen to be server actions.
    "getMemberDependenciesAction",
    "getUnitDependenciesAction",
    "getUnitEditContextAction",
    "getMemberPortalStatusAction",
    "listOwnDocumentsAction",
    "getOwnDocumentLinkAction",
    "getOwnPaymentReceiptAction",
    "exportMembersCsvAction",
    "exportUnitsCsvAction",
    // Owner-portal paths run under a portal member identity, not a user
    // membership, so the demo context never resolves them as demo at all.
    "createOnlinePaymentCheckoutAction",
  ]);

  const ACTIONS_DIR = "lib/actions";

  function everyAction(): Array<{ file: string; name: string; body: string }> {
    const found: Array<{ file: string; name: string; body: string }> = [];
    for (const file of readdirSync(ACTIONS_DIR).filter((f) => f.endsWith(".ts"))) {
      const source = readFileSync(join(ACTIONS_DIR, file), "utf8");
      const parts = source.split(/^export async function /m).slice(1);
      for (const part of parts) {
        const name = /^([A-Za-z0-9_]+)/.exec(part)?.[1];
        if (name) found.push({ file, name, body: part.slice(0, 1500) });
      }
    }
    return found;
  }

  it("finds the action modules (guards against a silent zero-match pass)", () => {
    // Without this, a renamed directory would make every assertion below pass
    // vacuously -- the failure mode a coverage test must not have.
    expect(everyAction().length).toBeGreaterThan(100);
  });

  it("guards every mutating server action", () => {
    const unguarded = everyAction()
      .filter((a) => !SANCTIONED_UNGUARDED.has(a.name))
      .filter((a) => !a.body.includes("denyIfDemo()"))
      .map((a) => `${a.file}:${a.name}`);

    expect(unguarded).toEqual([]);
  });

  it("keeps the sanctioned list honest", () => {
    // An entry that no longer names a real action is stale and hides the fact
    // that something was renamed -- possibly out from under its guard.
    const names = new Set(everyAction().map((a) => a.name));
    const stale = [...SANCTIONED_UNGUARDED].filter((n) => !names.has(n));
    expect(stale).toEqual([]);
  });

  it("guards every AI route", () => {
    const dir = "app/api/ai";
    const routes = readdirSync(dir);
    expect(routes.length).toBeGreaterThan(0);
    for (const route of routes) {
      const source = readFileSync(join(dir, route, "route.ts"), "utf8");
      expect(source, `${route} is missing the demo AI gate`).toContain("demoAiGate(");
    }
  });
});
