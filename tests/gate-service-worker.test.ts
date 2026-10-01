import { readFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GET as getGateScannerManifest } from "@/app/gate-scanner.webmanifest/route";
import { registerGateScannerServiceWorker } from "@/lib/gates/service-worker";

const workerPath = path.resolve(process.cwd(), "public/gate-scanner-sw.js");

async function createWorkerHarness() {
  const handlers = new Map<string, (event: Record<string, unknown>) => void>();
  const cache = {
    addAll: vi.fn().mockResolvedValue(undefined),
    match: vi.fn(),
    put: vi.fn().mockResolvedValue(undefined),
  };
  const cacheStorage = {
    open: vi.fn().mockResolvedValue(cache),
    keys: vi.fn().mockResolvedValue([]),
    delete: vi.fn().mockResolvedValue(true),
  };
  const fetchMock = vi.fn();
  const workerSelf = {
    location: { origin: "https://scanner.test", href: "https://scanner.test/gate-scanner-sw.js?build=test-build" },
    clients: { claim: vi.fn().mockResolvedValue(undefined) },
    skipWaiting: vi.fn().mockResolvedValue(undefined),
    addEventListener(type: string, handler: (event: Record<string, unknown>) => void) {
      handlers.set(type, handler);
    },
  };

  vm.runInNewContext(await readFile(workerPath, "utf8"), {
    caches: cacheStorage,
    fetch: fetchMock,
    Promise,
    Response,
    self: workerSelf,
    Set,
    URL,
  });

  function dispatchFetch(request: Record<string, unknown>) {
    let responsePromise: Promise<unknown> | null = null;
    const lifetimePromises: Promise<unknown>[] = [];
    const event = {
      request,
      respondWith(value: Promise<unknown> | unknown) {
        responsePromise = Promise.resolve(value);
      },
      waitUntil(value: Promise<unknown>) {
        lifetimePromises.push(Promise.resolve(value));
      },
    };
    handlers.get("fetch")?.(event);
    return { responsePromise, lifetimePromises };
  }

  return { cache, cacheStorage, dispatchFetch, fetchMock, handlers, workerSelf };
}

describe("gate scanner service worker", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps sensitive and offline scan traffic network-only without touching caches", async () => {
    const harness = await createWorkerHarness();
    const networkOnlyRequests = [
      { method: "GET", mode: "navigate", url: "https://scanner.test/en/operations/gate" },
      { method: "POST", mode: "cors", url: "https://scanner.test/en/operations/gate" },
      { method: "GET", mode: "cors", url: "https://external.test/chunk.js" },
      { method: "GET", mode: "cors", url: "https://scanner.test/api/gates" },
      { method: "GET", mode: "cors", url: "https://scanner.test/auth/v1/token" },
      { method: "GET", mode: "cors", url: "https://scanner.test/rest/v1/access_events" },
      { method: "GET", mode: "cors", url: "https://scanner.test/rpc/process_visitor_gate_scan" },
    ];

    for (const request of networkOnlyRequests) {
      harness.fetchMock.mockResolvedValueOnce({ ok: true });
      const dispatched = harness.dispatchFetch({
        destination: "",
        referrer: "https://scanner.test/en/operations/gate",
        ...request,
      });
      await dispatched.responsePromise;
    }

    harness.fetchMock.mockRejectedValueOnce(new TypeError("offline"));
    const offlineScan = harness.dispatchFetch({
      destination: "",
      method: "POST",
      mode: "cors",
      referrer: "https://scanner.test/en/operations/gate",
      url: "https://scanner.test/en/operations/gate",
    });
    await expect(offlineScan.responsePromise).rejects.toThrow("offline");

    expect(harness.fetchMock).toHaveBeenCalledTimes(networkOnlyRequests.length + 1);
    expect(harness.cacheStorage.open).not.toHaveBeenCalled();
    expect(harness.cache.match).not.toHaveBeenCalled();
    expect(harness.cache.put).not.toHaveBeenCalled();
  });

  it("uses stale-while-revalidate only for allowlisted scanner assets", async () => {
    const harness = await createWorkerHarness();
    const cachedResponse = { source: "cache" };
    const freshResponse = {
      ok: true,
      type: "basic",
      clone: vi.fn(() => ({ source: "network-clone" })),
    };
    harness.cache.match.mockResolvedValue(cachedResponse);
    harness.fetchMock.mockResolvedValue(freshResponse);

    const scannerChunk = harness.dispatchFetch({
      destination: "script",
      method: "GET",
      mode: "cors",
      referrer: "https://scanner.test/en/operations/gate",
      url: "https://scanner.test/_next/static/chunks/gate-scanner.js",
    });
    await expect(scannerChunk.responsePromise).resolves.toBe(cachedResponse);
    await Promise.all(scannerChunk.lifetimePromises);
    expect(harness.cacheStorage.open).toHaveBeenCalledTimes(1);
    expect(harness.cache.match).toHaveBeenCalledTimes(1);
    expect(harness.cache.put).toHaveBeenCalledTimes(1);

    harness.cacheStorage.open.mockClear();
    harness.cache.match.mockClear();
    harness.cache.put.mockClear();
    harness.fetchMock.mockClear();
    const unrelatedChunk = harness.dispatchFetch({
      destination: "script",
      method: "GET",
      mode: "cors",
      referrer: "https://scanner.test/en/finance/accounts",
      url: "https://scanner.test/_next/static/chunks/accounts.js",
    });
    expect(unrelatedChunk.responsePromise).toBeNull();
    expect(harness.cacheStorage.open).not.toHaveBeenCalled();
    expect(harness.fetchMock).not.toHaveBeenCalled();
  });
  it("serves only a static unavailable shell on offline scanner navigation", async () => {
    const harness = await createWorkerHarness();
    harness.fetchMock.mockRejectedValue(new Error("offline"));
    harness.cache.match.mockResolvedValue(new Response("UNVERIFIED_OFFLINE"));
    const response = await harness.dispatchFetch({ method: "GET", mode: "navigate", url: "https://scanner.test/en/operations/gate" }).responsePromise as Response;
    expect(await response.text()).toBe("UNVERIFIED_OFFLINE");
    expect(harness.cache.match).toHaveBeenCalledWith("/gate-scanner-offline.html");
    expect(harness.cache.put).not.toHaveBeenCalled();
  });

  it("activation removes only obsolete scanner-prefixed caches", async () => {
    const harness = await createWorkerHarness();
    harness.cacheStorage.keys.mockResolvedValue([
      "aqarbooks-gate-scanner-old",
      "aqarbooks-gate-scanner-test-build",
      "aqarbooks-main-shell-v9",
    ]);
    const lifetimePromises: Promise<unknown>[] = [];

    harness.handlers.get("activate")?.({
      waitUntil(value: Promise<unknown>) {
        lifetimePromises.push(value);
      },
    });
    await Promise.all(lifetimePromises);

    expect(harness.cacheStorage.delete).toHaveBeenCalledTimes(1);
    expect(harness.cacheStorage.delete).toHaveBeenCalledWith("aqarbooks-gate-scanner-old");
    expect(harness.cacheStorage.delete).not.toHaveBeenCalledWith("aqarbooks-main-shell-v9");
    expect(harness.workerSelf.clients.claim).toHaveBeenCalledTimes(1);
  });

  it("contains no sensitive cache keys or payload fields", async () => {
    const scannerWorkerSource = await readFile(workerPath, "utf8");

    expect(scannerWorkerSource).toContain("CACHE_VERSION");
    expect(scannerWorkerSource).not.toMatch(/\/rest\/v1|\/auth\/v1|\/api\//);
    expect(scannerWorkerSource).not.toMatch(/qrPayload|deviceCredential|access_events|guestName/);
  });

  it("registers the scanner worker without using the HTTP cache", async () => {
    const registration = { scope: "https://example.test/" } as ServiceWorkerRegistration;
    const register = vi.fn().mockResolvedValue(registration);
    vi.stubGlobal("window", {});
    vi.stubGlobal("navigator", { serviceWorker: { register } });

    await expect(registerGateScannerServiceWorker()).resolves.toBe(registration);
    expect(register).toHaveBeenCalledWith("/gate-scanner-sw.js?build=development", {
      scope: "/",
      updateViaCache: "none",
    });
  });

  it("serves a scanner-specific install manifest", async () => {
    const response = getGateScannerManifest();

    expect(response.headers.get("content-type")).toContain("application/manifest+json");
    await expect(response.json()).resolves.toMatchObject({
      name: "AqarBooks Gate Scanner",
      start_url: "/en/operations/gate",
      display: "standalone",
    });
  });
});
