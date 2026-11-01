import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * /api/ai/journal-propose must prove identity, organization membership and the journal permission
 * BEFORE any chart-of-accounts read or provider call. Every refusal below asserts that the AI
 * module and the network were never touched.
 */
vi.mock("server-only", () => ({}));

const ORG = "11111111-1111-4111-8111-111111111111";
const OTHER_ORG = "22222222-2222-4222-8222-222222222222";

let user: { id: string } | null = { id: "user-1" };
let proof: { ok: true; userId: string } | { ok: false; error: string } = { ok: true, userId: "user-1" };
let orgRow: { id: string; status: string } | null = { id: ORG, status: "ACTIVE" };
let demoIds: string[] = [];
let aiAvailable = true;
const proposeMock = vi.fn();
const proveMock = vi.fn();
const queried: string[] = [];

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: vi.fn(async () => user) }));
vi.mock("@/lib/auth/authorize", () => ({
  proveTenantPermission: (...a: unknown[]) => {
    proveMock(...a);
    return Promise.resolve(proof);
  },
}));
vi.mock("@/lib/ai/availability", () => ({ isAiAvailable: () => aiAvailable }));
vi.mock("@/lib/demo/config", () => ({ isDemoOrganization: (id: string) => demoIds.includes(id) }));
vi.mock("@/lib/ai/journal-copilot", () => ({
  proposeJournalEntryDraft: (...a: unknown[]) => {
    proposeMock(...a);
    return Promise.resolve({ lines: [], marker: "proposal" });
  },
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: (table: string) => {
      queried.push(table);
      const chain: Record<string, unknown> = {};
      for (const m of ["select", "eq", "order"]) chain[m] = () => chain;
      chain.maybeSingle = async () => ({ data: orgRow, error: null });
      chain.then = (resolve: (v: unknown) => unknown) =>
        resolve({ data: [{ id: "a1", code: "1100", name_ar: "x", name_en: "x", category: "ASSET" }], error: null });
      return chain;
    },
  }),
}));

const fetchSpy = vi.spyOn(globalThis, "fetch");
const { POST } = await import("@/app/api/ai/journal-propose/route");

const call = (body: unknown) =>
  POST(
    new Request("http://localhost/api/ai/journal-propose", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
const valid = { organizationId: ORG, description: "paid plumber", amount: 100, locale: "en" };
const noExternalCall = () => {
  expect(proposeMock).not.toHaveBeenCalled();
  expect(fetchSpy).not.toHaveBeenCalled();
};

beforeEach(() => {
  user = { id: "user-1" };
  proof = { ok: true, userId: "user-1" };
  orgRow = { id: ORG, status: "ACTIVE" };
  demoIds = [];
  aiAvailable = true;
  queried.length = 0;
  proposeMock.mockClear();
  proveMock.mockClear();
  fetchSpy.mockClear();
  delete process.env.AI_JOURNAL_COPILOT_DISABLED;
});

describe("refusals happen before any provider call", () => {
  it("401 without a session", async () => {
    user = null;
    const res = await call(valid);
    expect(res.status).toBe(401);
    expect(proveMock).not.toHaveBeenCalled();
    expect(queried).toEqual([]);
    noExternalCall();
  });

  it.each([
    ["malformed JSON", "{not json"],
    ["missing organizationId (no fallback to the user id)", { description: "x" }],
    ["organizationId that is not a uuid", { ...valid, organizationId: "user-1" }],
    ["description over the cap", { ...valid, description: "x".repeat(1001) }],
    ["negative amount", { ...valid, amount: -5 }],
    ["unknown locale", { ...valid, locale: "fr" }],
  ])("400 for %s", async (_name, body) => {
    const res = await call(body);
    expect(res.status).toBe(400);
    expect(proveMock).not.toHaveBeenCalled();
    noExternalCall();
  });

  it("400 EMPTY_DESCRIPTION keeps its specific code", async () => {
    const res = await call({ ...valid, description: "   " });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("EMPTY_DESCRIPTION");
  });

  it("403 when the tenant proof fails (not a member / suspended / invited / no permission)", async () => {
    for (const error of ["unauthorized", "forbidden"]) {
      proof = { ok: false, error };
      const res = await call(valid);
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: "FORBIDDEN" });
    }
    expect(proveMock).toHaveBeenCalledWith(ORG, "finance.entries.create", "user-1");
    expect(queried).toEqual([]); // no tenant data was read for an unproven caller
    noExternalCall();
  });

  it("403 for another organization's id", async () => {
    proof = { ok: false, error: "unauthorized" };
    const res = await call({ ...valid, organizationId: OTHER_ORG });
    expect(res.status).toBe(403);
    expect(proveMock).toHaveBeenCalledWith(OTHER_ORG, "finance.entries.create", "user-1");
    noExternalCall();
  });

  it("403 for an inactive or invisible organization", async () => {
    orgRow = { id: ORG, status: "SUSPENDED" };
    expect((await call(valid)).status).toBe(403);
    orgRow = null;
    expect((await call(valid)).status).toBe(403);
    noExternalCall();
  });

  it("503 for the public demo organization, even for an authorized member", async () => {
    demoIds = [ORG];
    const res = await call(valid);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "AI_DISABLED" });
    expect(queried).not.toContain("chart_of_accounts");
    noExternalCall();
  });

  it("503 when no AI provider is configured: nothing is read and nothing is called", async () => {
    aiAvailable = false;
    const res = await call(valid);
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe("AI_DISABLED");
    expect(queried).not.toContain("chart_of_accounts");
    noExternalCall();
  });

  it("503 when the operational kill switch is on", async () => {
    process.env.AI_JOURNAL_COPILOT_DISABLED = "true";
    const res = await call(valid);
    expect(res.status).toBe(503);
    expect(queried).not.toContain("chart_of_accounts");
    noExternalCall();
  });
});

describe("authorized, enabled request", () => {
  it("reads only the proven organization's accounts and calls the proposer with that organization", async () => {
    const res = await call(valid);
    expect(res.status).toBe(200);
    expect((await res.json()).proposal.marker).toBe("proposal");
    expect(proposeMock).toHaveBeenCalledTimes(1);
    const arg = proposeMock.mock.calls[0][0] as { organizationId: string; availableAccounts: unknown[] };
    expect(arg.organizationId).toBe(ORG);
    expect(arg.availableAccounts).toHaveLength(1);
    // the proof ran first, the account read second
    expect(proveMock.mock.invocationCallOrder[0]).toBeLessThan(proposeMock.mock.invocationCallOrder[0]);
  });
});
