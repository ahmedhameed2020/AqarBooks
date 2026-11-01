// Read-only migration readiness check. No database writes, no deployment.
// Usage: node scripts/migration-readiness.mjs [--json]
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const DIR = "supabase/migrations";
const files = readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort();
const stamps = new Map();
const problems = [];

for (const file of files) {
  const match = file.match(/^(\d{14})_/);
  if (!match) problems.push({ file, issue: "name does not start with a 14-digit timestamp" });
  const stamp = match?.[1] ?? "?";
  if (stamps.has(stamp)) problems.push({ file, issue: `duplicate timestamp prefix with ${stamps.get(stamp)}` });
  else stamps.set(stamp, file);
  const body = readFileSync(join(DIR, file), "utf8");
  if (!body.trim()) problems.push({ file, issue: "empty file" });
  if (!/;(?:\s|$)/.test(body)) problems.push({ file, issue: "no semicolon-terminated statement found" });
}

const sorted = files.every((f, i) => i === 0 || f >= files[i - 1]);
if (!sorted) problems.push({ file: "(directory)", issue: "files are not in lexicographic order" });

const latest = files.slice(-5);
const report = { count: files.length, sorted, duplicates: files.length - stamps.size, problems, latest };
if (process.argv.includes("--json")) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`migrations: ${report.count}`);
  console.log(`lexicographic order: ${sorted ? "OK" : "BROKEN"}`);
  console.log(`duplicate timestamps: ${report.duplicates}`);
  console.log(`latest 5: ${latest.join(", ")}`);
  for (const p of problems) console.log(`PROBLEM ${p.file}: ${p.issue}`);
}
process.exitCode = problems.length === 0 ? 0 : 1;
