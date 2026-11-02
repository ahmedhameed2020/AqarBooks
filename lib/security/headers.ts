/**
 * Security headers for the deployed Worker.
 *
 * CSP starts as Report-Only on purpose: Next injects inline bootstrap scripts,
 * so an enforcing policy needs a nonce pipeline (middleware) that is a separate
 * change. The report-only policy still forbids eval, objects and framing, and
 * any violation shows up in the browser console without breaking pages.
 *
 * Keep this module pure: the unit test asserts the policy and next.config.ts
 * wires it for every route.
 */

const SUPABASE_FALLBACK = "https://ataslxkcflxuilpgyepm.supabase.co";

function connectSources(supabaseUrl?: string): string[] {
  const http = (supabaseUrl || SUPABASE_FALLBACK).replace(/\/$/, "");
  const ws = http.replace(/^http/, "ws");
  return [http, ws];
}

export function contentSecurityPolicyReportOnly(supabaseUrl?: string): string {
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    // No 'unsafe-eval' and no 'unsafe-inline': violations are reported first.
    "script-src 'self'",
    // Next injects inline <style> for styled components and font fallbacks.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src 'self' ${connectSources(supabaseUrl).join(" ")}`,
  ].join("; ");
}

export type SecurityHeader = { key: string; value: string };

export function securityHeaders(supabaseUrl?: string): SecurityHeader[] {
  return [
    { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
    { key: "Content-Security-Policy-Report-Only", value: contentSecurityPolicyReportOnly(supabaseUrl) },
  ];
}
