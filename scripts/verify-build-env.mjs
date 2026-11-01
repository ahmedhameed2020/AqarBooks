// Verifies that the CURRENT .next build was produced with the expected public
// Supabase URL. NEXT_PUBLIC_* values are inlined at build time, so a build made
// with the wrong .env silently points the app at another project.
// Usage: node scripts/verify-build-env.mjs <expectedUrlSubstring>
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const expected = process.argv[2] ?? process.env.EXPECTED_SUPABASE_URL;
if (!expected) {
  console.error("usage: node scripts/verify-build-env.mjs <expectedUrlSubstring>");
  process.exit(2);
}

const dir = ".next/static";
let files = [];
try {
  files = readdirSync(dir, { recursive: true }).filter((f) => typeof f === "string" && f.endsWith(".js"));
} catch {
  console.error("no .next/static found; run a build first");
  process.exit(2);
}

let matches = 0;
const otherUrls = new Set();
for (const rel of files) {
  const body = readFileSync(join(dir, rel), "utf8");
  if (body.includes(expected)) matches++;
  for (const m of body.matchAll(/https?:\/\/[a-z0-9.-]+/g)) {
    if (!m[0].includes(expected.replace(/^https?:\/\//, ""))) otherUrls.add(new URL(m[0]).host);
  }
}

// Project refs look like <20 lowercase chars>.supabase.co. Domain literals
// (supabase.com), the placeholder fallback, and the expected host are not leaks.
const PROJECT_HOST = /^[a-z0-9]{16,}\.supabase\.(co|in)$/;
const expectedHost = expected.replace(/^https?:\/\//, "").split("/")[0].split(":")[0];
const foreignSupabase = [...otherUrls].filter(
  (h) => PROJECT_HOST.test(h) && h !== expectedHost,
);
console.log(JSON.stringify({ expected, chunksWithExpectedUrl: matches, foreignSupabaseHosts: foreignSupabase }, null, 2));
if (matches === 0 || foreignSupabase.length > 0) {
  console.error("BUILD ENV MISMATCH: the bundle does not match the expected project (or also references another one)");
  process.exit(1);
}
console.log("build env OK");
