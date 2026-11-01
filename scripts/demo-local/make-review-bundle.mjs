#!/usr/bin/env node
// node scripts/demo-local/make-review-bundle.mjs [outDir]
// Builds ONE secret-free review bundle of the Phase 1 -> 2c work and zips it. Nothing is committed, pushed or uploaded.
//
// What goes in: every file that git reports as modified or untracked under the review prefixes, minus an explicit
// list of unrelated work (the user's Fawry / mobile / tooling changes), plus the acceptance reports, runbooks, the
// seven new migrations, run logs and the main screenshots. What never goes in: anything env/key/credential-shaped.
// Every copied file is scanned (the values of every .env* variable, the local stack's keys, and generic secret
// patterns); a hit aborts the build instead of shipping the file.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { stackEnv, root } from "./lib.mjs";

// Staged OUTSIDE the repository (a copy of the source tree inside it would be picked up by tsc / eslint / vitest);
// only the zip is written under docs/audits.
// An empty or whitespace argument means "the default", never "the current folder".
const outDir = process.argv[2]?.trim() ? process.argv[2].trim() : join(tmpdir(), "aqarbooks-review-bundle");
// Safety: the staging folder is deleted and rewritten, and its files are zipped. It must therefore be a dedicated folder
// under the system temp directory - never the repository, a drive root or anything else.
const outAbs = resolve(outDir);
const tmpAbs = resolve(tmpdir());
if (!outAbs.toLowerCase().startsWith(tmpAbs.toLowerCase() + sep) || outAbs.toLowerCase() === tmpAbs.toLowerCase()) {
  console.error(`refusing to stage the bundle in "${outAbs}": it must be a sub-folder of ${tmpAbs}`);
  process.exit(2);
}
const stageDir = join(outDir, "files");
const zipPath = process.argv[3] ?? join(root, "docs", "audits", "phase2-review-bundle.zip");

const INCLUDE_PREFIXES = [
  "app/", "components/", "lib/", "tests/", "scripts/demo-local/", "supabase/migrations/", "docs/audits/", "docs/runbooks/",
  "package.json", "playwright.config.ts", "vitest.config.ts",
];
// Unrelated work already in the tree (not part of this review): the user's Fawry/payment-provider and mobile changes.
const EXCLUDE_EXACT = new Set([
  "lib/payments/providers/fawry.ts", "lib/actions/online-payment-checkout.ts", "lib/payments/fawry-initiation-policy.ts",
  "tests/payments/fawry-adapter.test.ts", "tests/payments/fawry-initiation.test.ts", "tests/payments/fawry-v1-sql-proposal.test.ts",
]);
const EXCLUDE_PREFIX = ["docs/audits/phase2-review-bundle", "docs/audits/_parts/"];
// Never copied, whatever the path rules say.
const NEVER = [/(^|\/)\.env/i, /\.dev\.vars$/i, /\.pem$/i, /\.key$/i, /\.p12$/i, /id_rsa/i, /(^|\/)\.mcp\.json$/i, /secrets?\./i, /service[-_]?account/i, /node_modules\//, /(^|\/)\.next\//, /(^|\/)\.open-next\//, /test-results\//, /\.zip$/i, /\.log$/i];
const MIGRATION_FROM = "20261009"; // the seven migrations of Phase 1 -> 2c

const git = (args) => spawnSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).stdout;
const norm = (p) => p.split(sep).join("/");

// ---- 1. candidate files -------------------------------------------------------------------------------------------
const porcelain = git(["status", "--porcelain=v1", "-z", "--untracked-files=all"]).split("\0").filter(Boolean);
const changed = new Set();
for (const entry of porcelain) {
  const status = entry.slice(0, 2);
  const path = entry.slice(3);
  if (status.includes("D")) continue;
  changed.add(path);
}
const wanted = [];
const notIncludedUnrelated = [];
for (const p of [...changed].sort()) {
  const inScope = INCLUDE_PREFIXES.some((x) => p === x || p.startsWith(x));
  if (!inScope) { notIncludedUnrelated.push(p); continue; }
  if (EXCLUDE_EXACT.has(p) || EXCLUDE_PREFIX.some((x) => p.startsWith(x))) { notIncludedUnrelated.push(p); continue; }
  if (p.startsWith("supabase/migrations/") && !(basename(p) >= MIGRATION_FROM && basename(p).endsWith(".sql"))) { notIncludedUnrelated.push(p); continue; }
  if (NEVER.some((re) => re.test(p))) { notIncludedUnrelated.push(p); continue; }
  wanted.push(p);
}
// reports + runbooks (docs/audits is untracked as a whole, so list its files explicitly)
const walk = (dir, acc = []) => {
  if (!existsSync(dir)) return acc;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isSymbolicLink()) continue;
    if (e.isDirectory()) walk(p, acc); else acc.push(norm(relative(root, p)));
  }
  return acc;
};
const reports = walk(join(root, "docs", "audits")).filter((p) => p.endsWith(".md") && !p.startsWith("docs/audits/_parts/") && !p.startsWith("docs/audits/phase2-review-bundle"));
const runbooks = walk(join(root, "docs", "runbooks")).filter((p) => p.endsWith(".md"));
// evidence: run logs (copied as .txt so they are not mistaken for configuration) and the main screenshots
const logs = walk(join(root, "docs", "audits", "phase2-evidence")).filter((p) => p.endsWith(".log"));
const MAIN_SCREENS = [
  "01-opening-balance-dialog", "02-issue-due-dialog", "03-receipt-bank-transfer-dialog", "03-receipt-bank-transfer", "05-receipts-after-reversal",
  "08-owner-statement", "10-trial-balance-2026", "11-trial-balance-unclosed-prior-year", "12-income-statement", "13-balance-sheet", "14-cash-flow",
  "15-audit-trail-auditor", "21-reconciliation-unexplained-difference", "22-reconciliation-balanced", "23-reconciliation-finalized",
  "24-fee-journal-entry", "25-fee-journal-posted", "30-issue-due-no-default", "31-issue-due-default-preselected", "40-balance-sheet-prior-years",
  "41-trial-balance-re-prior", "50-receipts-no-reverse-for-accountant", "60-issue-partial-success-warning", "61-finalize-blocked-unhandled-line",
  "70-issue-due-no-fiscal-period", "71-opening-balance-closed-period", "F1-members", "F2-dashboard-units", "F4-cash-forecast-status", "F6-audit-trail",
].map((n) => `docs/audits/phase2-evidence/screens/${n}.png`).filter((p) => existsSync(join(root, p)));

// the portal / maintenance / gates review: its run logs, observation files (JSON / text) and all of its screenshots
const portalEvidence = walk(join(root, "docs", "audits", "portal-review-evidence")).filter((p) => /\.(log|json|txt)$/.test(p));
const portalScreens = walk(join(root, "docs", "audits", "portal-review-evidence", "screens")).filter((p) => p.endsWith(".png"));
const files = [...new Set([...wanted, ...reports, ...runbooks])].filter((p) => !NEVER.some((re) => re.test(p)));
const targets = new Map(files.map((p) => [p, p]));
for (const p of logs) targets.set(p, p.replace(/\.log$/, ".log.txt"));
for (const p of MAIN_SCREENS) targets.set(p, p);
for (const p of portalEvidence) targets.set(p, p.endsWith(".log") ? `${p}.txt` : p);
for (const p of portalScreens) targets.set(p, p);

// ---- 2. secret scan (before anything is written to the bundle) ------------------------------------------------------
const secretValues = new Map();
for (const f of [".env.local", ".env.production", ".env", ".dev.vars"]) {
  const p = join(root, f);
  if (!existsSync(p)) continue;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    const v = m[2].replace(/^['"]|['"]$/g, "");
    // Plain words (e.g. NEXTJS_ENV=development) and the public marketing URL are not secrets; everything else is scanned,
    // including the hosted Supabase URL / anon key (kept out of the bundle even though they are public by design).
    if (v.length >= 8 && !/^[A-Za-z_-]{1,20}$/.test(v) && !/SITE_URL$/.test(m[1])) secretValues.set(`${f}:${m[1]}`, v);
  }
}
try { const s = stackEnv(); for (const k of ["ANON_KEY", "SERVICE_ROLE_KEY", "JWT_SECRET"]) if (s[k]) secretValues.set(`local-stack:${k}`, s[k]); } catch { /* stack not running */ }
const PATTERNS = [
  ["JWT", /eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{10,}/],
  ["supabase key", /sb_(publishable|secret)_[A-Za-z0-9_-]{10,}/],
  ["private key block", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ["AWS key id", /AKIA[0-9A-Z]{16}/],
  ["provider secret", /\b(sk|rk)_(live|test)_[A-Za-z0-9]{16,}/],
  ["bearer/api key literal", /(?:api[_-]?key|secret|token)["']?\s*[:=]\s*["'][A-Za-z0-9_\-+/]{24,}["']/i],
  ["connection string", /postgres(?:ql)?:\/\/[^\s:@]+:[^\s@]{4,}@/i],
];
const FIXTURE_NOTE = /(Demo_Journey_P@ssw0rd_2026!|E2E_Test_P@ssw0rd_2026!)/;
const hits = [];
const fixtureFiles = new Set();
for (const [src] of targets) {
  if (/\.(png|jpg|jpeg|gif|webp)$/i.test(src)) continue;
  const text = readFileSync(join(root, src), "utf8");
  for (const [name, v] of secretValues) if (text.includes(v)) hits.push(`${src}: value of ${name}`);
  for (const [name, re] of PATTERNS) if (re.test(text)) hits.push(`${src}: pattern ${name}`);
  if (FIXTURE_NOTE.test(text)) fixtureFiles.add(src);
}
if (hits.length) {
  console.error("SECRET SCAN FAILED - nothing was written:\n  " + hits.join("\n  "));
  process.exit(1);
}

// ---- 3. stage, manifest, zip ----------------------------------------------------------------------------------------
rmSync(outDir, { recursive: true, force: true });
rmSync(zipPath, { force: true });
mkdirSync(stageDir, { recursive: true });
const rows = [];
for (const [src, dst] of [...targets].sort((a, b) => a[1].localeCompare(b[1]))) {
  const to = join(stageDir, dst);
  mkdirSync(dirname(to), { recursive: true });
  cpSync(join(root, src), to);
  const buf = readFileSync(to);
  rows.push({ path: dst, source: src, bytes: buf.length, sha256: createHash("sha256").update(buf).digest("hex"), kind: changed.has(src) ? (porcelain.find((e) => e.slice(3) === src)?.startsWith("??") ? "new (untracked)" : "modified (tracked)") : "evidence/report" });
}
const manifest = [
  "# Phase 2 review bundle — file list and fingerprints", "",
  `Files: ${rows.length}. SHA-256 is of the file as stored in this bundle (\`files/<path>\`). Verify with \`node scripts/demo-local/verify-review-bundle.mjs\` or any sha256 tool.`, "",
  "| Path | Kind | Bytes | SHA-256 |", "|---|---|---:|---|",
  ...rows.map((r) => `| \`${r.path}\` | ${r.kind} | ${r.bytes} | \`${r.sha256}\` |`),
].join("\n") + "\n";
writeFileSync(join(outDir, "MANIFEST.md"), manifest, "utf8");
writeFileSync(join(outDir, "SHA256SUMS.txt"), rows.map((r) => `${r.sha256}  files/${r.path}`).join("\n") + "\n", "utf8");

const readme = `# Phase 2 → 2c review bundle (secret-free)

Produced locally; nothing committed, pushed, deployed or uploaded. Start with \`files/docs/audits/Phase2-Accounting-Journey-Acceptance-Report-2026-10-10.md\`
and \`files/docs/runbooks/accounting-demo-local.md\`.

## What is inside
* **Reports and runbooks:** \`files/docs/audits/*.md\` (Phase 1, 1.1, 1.2, 2 + the audit), \`files/docs/runbooks/*.md\`.
* **Migrations (7, complete):** \`files/supabase/migrations/20261009120000…\`, \`…130000…\`, \`…140000…\`, \`20261010120000…\`, \`20261011100000…\`, \`20261011100100…\`, \`20261012100000…\`.
* **Code and tests:** every file git reports as modified **or untracked** under \`app/ components/ lib/ tests/ scripts/demo-local/\` plus \`package.json\`, \`playwright.config.ts\`, \`vitest.config.ts\` — including the new files a \`git diff\` patch would miss. The kind (new / modified) is in MANIFEST.md.
* **Results:** \`files/docs/audits/phase2-evidence/*.log.txt\` (run logs; \`.txt\` so they are never mistaken for configuration) and the main screenshots under \`files/docs/audits/phase2-evidence/screens/\`.

## What is deliberately NOT inside
* Any \`.env*\`, \`.dev.vars\`, key, certificate or MCP configuration; \`node_modules\`, \`.next\`, \`.open-next\`, test traces.
* Unrelated work already present in the working tree (the Fawry / payment-provider and mobile changes) — ${notIncludedUnrelated.length} changed paths are outside this review; they are listed in \`NOT-INCLUDED.txt\` by path only.

## Secret scan (run before anything was written)
Every included text file was checked for: the value of every variable in \`.env.local\`, \`.env.production\`, \`.env\`, \`.dev.vars\`; the local clean stack's anon / service-role / JWT keys; JWT-shaped tokens, Supabase \`sb_*\` keys, private-key blocks, AWS key ids, payment-provider secret keys, key/secret/token literals, and connection strings with passwords. **Result: no hit.**
Known, disclosed constants (not secrets): ${fixtureFiles.size} test file(s) contain the fixed password of **disposable local test users** (\`${[...fixtureFiles].join("`, `")}\`). They only work on a local throw-away Supabase stack. Rotate nothing; do not reuse them elsewhere.

## Reproduce
\`npm run demo:stack-up\` → \`node scripts/demo-local/build.mjs --next-only\` → \`node scripts/demo-local/start-prod.mjs\` → \`npm run demo:e2e -- <specs>\` (see the runbook).
`;
writeFileSync(join(outDir, "README.md"), readme, "utf8");
writeFileSync(join(outDir, "NOT-INCLUDED.txt"), notIncludedUnrelated.join("\n") + "\n", "utf8");

const zip = spawnSync("powershell", ["-NoProfile", "-Command", `Compress-Archive -Path '${outDir}\\*' -DestinationPath '${zipPath}' -Force`], { encoding: "utf8" });
if (zip.status !== 0) { console.error(zip.stderr); process.exit(1); }
console.log(`bundle: ${rows.length} files, ${(statSync(zipPath).size / 1024).toFixed(0)} KB → ${zipPath}`);
console.log(`secret scan: no hit; fixture-password constants in ${fixtureFiles.size} file(s); ${notIncludedUnrelated.length} unrelated changed paths excluded`);
