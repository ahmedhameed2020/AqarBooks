#!/usr/bin/env node
// node scripts/demo-local/verify-review-bundle.mjs [bundle.zip | bundleDir]
// Recomputes the SHA-256 of every file listed in SHA256SUMS.txt and reports mismatches / missing / extra files.
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import { root } from "./lib.mjs";

let dir = process.argv[2] ?? join(root, "docs", "audits", "phase2-review-bundle.zip");
if (dir.toLowerCase().endsWith(".zip")) {
  const target = mkdtempSync(join(tmpdir(), "aqar-bundle-verify-"));
  const r = spawnSync("powershell", ["-NoProfile", "-Command", `Expand-Archive -Path '${dir}' -DestinationPath '${target}' -Force`], { encoding: "utf8" });
  if (r.status !== 0) { console.error(r.stderr); process.exit(1); }
  dir = target;
}
const listed = readFileSync(join(dir, "SHA256SUMS.txt"), "utf8").split("\n").filter(Boolean).map((l) => {
  const [hash, ...rest] = l.split("  ");
  return [rest.join("  "), hash];
});
let bad = 0;
for (const [path, hash] of listed) {
  const p = join(dir, path);
  if (!existsSync(p)) { console.log(`MISSING  ${path}`); bad++; continue; }
  if (createHash("sha256").update(readFileSync(p)).digest("hex") !== hash) { console.log(`MISMATCH ${path}`); bad++; }
}
const present = [];
const walk = (d) => { for (const e of readdirSync(d, { withFileTypes: true })) { const p = join(d, e.name); if (e.isDirectory()) walk(p); else present.push(relative(dir, p).split(sep).join("/")); } };
walk(join(dir, "files"));
const known = new Set(listed.map(([p]) => p));
for (const p of present) if (!known.has(p)) { console.log(`EXTRA    ${p}`); bad++; }
console.log(bad ? `FAILED: ${bad} problem(s)` : `OK: ${listed.length} files verified`);
process.exit(bad ? 1 : 0);
