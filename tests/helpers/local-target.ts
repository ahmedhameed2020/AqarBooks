/**
 * Single source of truth for "is this Supabase URL a known local test environment?".
 *
 * Test suites that write data must never reach a hosted project NOR the development stack. Local means: an http URL
 * whose host is loopback AND whose port was opted in explicitly (LOCAL_SUPABASE_API_PORTS, the isolated stack's API
 * port), or port 1, the reserved unroutable port used as a harmless dummy in unit runs. There is NO default port: the
 * Supabase CLI's default 54321 is the development stack and is no longer accepted.
 * The error names only host:port -- never keys, passwords, or the full URL.
 */
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);
const DEFAULT_LOCAL_PORTS = ["1"];

/**
 * Extra loopback API ports may be opted in explicitly (the separate clean demo stack uses 55321):
 * LOCAL_SUPABASE_API_PORTS=55321. Only digits are accepted, and the host check below still applies,
 * so an opt-in can never point a test at a non-loopback address.
 */
function knownLocalPorts(): Set<string> {
  const extra = (process.env.LOCAL_SUPABASE_API_PORTS ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter((p) => /^\d{2,5}$/.test(p));
  // the development stack's API port is never accepted, even when someone lists it
  return new Set([...DEFAULT_LOCAL_PORTS, ...extra.filter((p) => p !== "54321")]);
}

export function describeTarget(url: string): string {
  try {
    const u = new URL(url);
    return `${u.hostname}${u.port ? `:${u.port}` : ""}`;
  } catch {
    return "<unparseable url>";
  }
}

export function isKnownLocalSupabaseUrl(url: unknown): boolean {
  if (typeof url !== "string" || url.length === 0) return false;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol !== "http:") return false;
  if (u.username || u.password) return false;
  return LOOPBACK_HOSTS.has(u.hostname) && knownLocalPorts().has(u.port);
}

export function assertKnownLocalSupabaseUrl(url: unknown): void {
  if (isKnownLocalSupabaseUrl(url)) return;
  const shown = typeof url === "string" ? describeTarget(url) : String(url);
  throw new Error(
    `Refusing to run: test target ${shown} is not a known local Supabase API (expected the isolated stack opted in through LOCAL_SUPABASE_API_PORTS; the development stack is never accepted). ` +
      "Tests that write data run only against the isolated clean stack: use `node scripts/demo-local/run-vitest-local.mjs ...` " +
      "or `npm run demo:e2e -- ...` after `npm run demo:stack-up`.",
  );
}
