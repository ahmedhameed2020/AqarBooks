// Read-only migration manifest: ordered list + sha256 of every migration file.
// Use it to review what is pending against a production ledger before applying.
// Usage: node scripts/migration-manifest.mjs [--json]
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const DIR = "supabase/migrations";
const files = readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort();
const rows = files.map((file) => {
  const body = readFileSync(join(DIR, file));
  return { version: file.slice(0, 14), file, sha256: createHash("sha256").update(body).digest("hex").slice(0, 16) };
});

if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ count: rows.length, migrations: rows }, null, 2));
} else {
  console.log(`migrations: ${rows.length}`);
  for (const row of rows) console.log(`${row.version}  ${row.sha256}  ${row.file}`);
}
