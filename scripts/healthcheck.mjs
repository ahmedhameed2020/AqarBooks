// Post-deploy healthcheck for AqarBooks. Read-only HTTP probes; safe for any env.
// Usage: node scripts/healthcheck.mjs [baseUrl]
// Exit 0 only when every probe answers as expected.
const base = (process.argv[2] ?? process.env.HEALTHCHECK_BASE_URL ?? "http://127.0.0.1:3100").replace(/\/$/, "");
const timeout = 15000;

const probes = [
  { path: "/en/login", expect: (s) => s === 200, name: "login page (en)" },
  { path: "/ar/login", expect: (s) => s === 200, name: "login page (ar)" },
  // Anonymous finance access must redirect (307/302) rather than 5xx or 200 with data.
  { path: "/en/admin/finance/periods", expect: (s) => s === 307 || s === 302 || s === 303, name: "finance gate (anon redirect)" },
  { path: "/en/dashboard", expect: (s) => s === 307 || s === 302 || s === 303, name: "dashboard gate (anon redirect)" },
];

const results = [];
let failed = 0;
for (const probe of probes) {
  const started = Date.now();
  try {
    const res = await fetch(`${base}${probe.path}`, { redirect: "manual", signal: AbortSignal.timeout(timeout) });
    const ok = probe.expect(res.status);
    if (!ok) failed++;
    results.push({ probe: probe.name, status: res.status, ok, ms: Date.now() - started });
  } catch (error) {
    failed++;
    results.push({ probe: probe.name, status: "ERROR", ok: false, ms: Date.now() - started, error: String(error?.message ?? error) });
  }
}

const summary = { base, checkedAt: new Date().toISOString(), failed, results };
console.log(JSON.stringify(summary, null, 2));
process.exitCode = failed === 0 ? 0 : 1;
