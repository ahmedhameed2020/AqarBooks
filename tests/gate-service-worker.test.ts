import { readFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GET as getGateScannerManifest } from "@/app/gate-scanner.webmanifest/route";
import { registerGateScannerServiceWorker } from "@/lib/gates/service-worker";

const workerPath = path.resolve(process.cwd(), "public/gate-scanner-sw.js");

describe("gate scanner service worker", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("versions and purges its scanner-only cache", async () => {
    const scannerWorkerSource = await readFile(workerPath, "utf8");

    expect(scannerWorkerSource).toContain("CACHE_VERSION");
    expect(scannerWorkerSource).toContain("caches.delete");
    expect(scannerWorkerSource).toContain("/_next/static/");
    expect(scannerWorkerSource).toContain("request.referrer");
    expect(scannerWorkerSource).toContain("/icon-192.png");
    expect(scannerWorkerSource).toContain("/icon-512.png");
  });

  it("keeps authenticated navigation and sensitive request families network-only", async () => {
    const scannerWorkerSource = await readFile(workerPath, "utf8");

    expect(scannerWorkerSource).toContain('request.method !== "GET"');
    expect(scannerWorkerSource).toContain('request.mode === "navigate"');
    expect(scannerWorkerSource).toContain('"/api"');
    expect(scannerWorkerSource).toContain('"/auth"');
    expect(scannerWorkerSource).toContain('"/rest"');
    expect(scannerWorkerSource).toContain('"/rpc"');
    expect(scannerWorkerSource).not.toMatch(/\/rest\/v1|\/auth\/v1|\/api\//);
    expect(scannerWorkerSource).not.toMatch(/qrPayload|deviceCredential|access_events|guestName/);
  });

  it("registers the scanner worker without using the HTTP cache", async () => {
    const registration = { scope: "https://example.test/" } as ServiceWorkerRegistration;
    const register = vi.fn().mockResolvedValue(registration);
    vi.stubGlobal("window", {});
    vi.stubGlobal("navigator", { serviceWorker: { register } });

    await expect(registerGateScannerServiceWorker()).resolves.toBe(registration);
    expect(register).toHaveBeenCalledWith("/gate-scanner-sw.js", {
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
