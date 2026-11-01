// Pure build-environment checks, shared by the CLI verifier and the unit tests.
// A bundle is only acceptable when it was built for the expected Supabase project.

const FOREIGN_PROJECT_HOST = /^[a-z0-9]{16,}\.supabase\.(co|in)$/;
const DEV_MARKERS = ["127.0.0.1:58461", "localhost:3176", "localhost:3100", "ataslxkcflxuilpgyepm"];

export function hostOf(url) {
  return String(url || "")
    .replace(/^https?:\/\//, "")
    .split("/")[0]
    .split(":")[0]
    .toLowerCase();
}

/**
 * @param {{ chunks: { path: string; body: string }[]; expectedUrl: string }} input
 * @returns {{ ok: boolean; matches: number; foreignHosts: string[]; problems: string[] }}
 */
export function checkBundleEnv({ chunks, expectedUrl, requireProduction = true }) {
  const expectedHost = hostOf(expectedUrl);
  const problems = [];

  if (!expectedHost) problems.push("expected URL is empty");
  if (requireProduction && /placeholder|localhost|127\.0\.0\.1/i.test(expectedHost)) {
    problems.push(`expected URL looks non-production (${expectedHost})`);
  }

  const foreign = new Set();
  let matches = 0;
  const expectedIsLocal = expectedHost === "127.0.0.1" || expectedHost === "localhost";

  for (const chunk of chunks) {
    const body = chunk.body;
    if (body.includes(expectedUrl) || body.includes(expectedHost)) matches++;
    for (const m of body.matchAll(/https?:\/\/([a-z0-9.-]+)/g)) {
      const host = m[1].toLowerCase();
      if (FOREIGN_PROJECT_HOST.test(host) && host !== expectedHost) foreign.add(host);
    }
    if (!expectedIsLocal) {
      for (const marker of DEV_MARKERS) {
        if (body.includes(marker) && !expectedUrl.includes(marker) && !expectedHost.includes(marker)) {
          problems.push(`development marker ${marker} in ${chunk.path}`);
        }
      }
    }
  }

  if (matches === 0) problems.push(`expected host ${expectedHost} is not present in any chunk`);
  if (foreign.size > 0) problems.push(...[...foreign].map((h) => `foreign Supabase project host ${h}`));

  return { ok: problems.length === 0, matches, foreignHosts: [...foreign], problems };
}
