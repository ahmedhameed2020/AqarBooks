import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { contentSecurityPolicyReportOnly, securityHeaders } from "../lib/security/headers";

const byKey = (url?: string) => new Map(securityHeaders(url).map((h) => [h.key.toLowerCase(), h.value]));

describe("security headers", () => {
  it("enforces transport and browser-hardening headers on every route", () => {
    const h = byKey("https://example-project.supabase.co");
    expect(h.get("strict-transport-security")).toMatch(/max-age=31536000/);
    expect(h.get("x-content-type-options")).toBe("nosniff");
    expect(h.get("x-frame-options")).toBe("DENY");
    expect(h.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
    expect(h.get("permissions-policy")).toContain("camera=()");
    expect(h.get("content-security-policy-report-only")).toBeTruthy();
  });

  it("starts CSP in report-only mode and never allows eval", () => {
    const csp = contentSecurityPolicyReportOnly("https://example-project.supabase.co");
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("default-src 'self'");
    expect(csp).not.toContain("script-src 'self' 'unsafe-inline'");
  });

  it("allows the project's Supabase HTTP and WebSocket origins only", () => {
    const csp = contentSecurityPolicyReportOnly("https://example-project.supabase.co");
    expect(csp).toContain("https://example-project.supabase.co");
    expect(csp).toContain("wss://example-project.supabase.co");
    expect(csp).not.toContain("*.supabase.co");
  });

  it("is wired in next.config.ts for every path", () => {
    const config = readFileSync(join(process.cwd(), "next.config.ts"), "utf8");
    expect(config).toContain("securityHeaders");
    expect(config).toContain("source: \"/:path*\"");
  });
});
