// Verifies that the CURRENT .next build was produced with the expected public
// Supabase project. NEXT_PUBLIC_* values are inlined at build time, so a build
// made with the wrong env silently points the app at another project.
// Usage: node scripts/verify-build-env.mjs <expectedUrl>
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { checkBundleEnv } from "./lib/build-env-check.mjs";

const args = process.argv.slice(2);
const allowLocal = args.includes("--allow-local");
const expected = args.find((a) => !a.startsWith("--")) ?? process.env.EXPECTED_SUPABASE_URL;
if (!expected) {
  console.error("usage: node scripts/verify-build-env.mjs [--allow-local] <expectedUrl>");
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

const chunks = files.map((rel) => ({ path: rel, body: readFileSync(join(dir, rel), "utf8") }));
const result = checkBundleEnv({ chunks, expectedUrl: expected, requireProduction: !allowLocal });
console.log(JSON.stringify({ expected, allowLocal, chunks: files.length, ...result }, null, 2));
process.exitCode = result.ok ? 0 : 1;
