#!/usr/bin/env node
// node scripts/demo-local/scan-bundle.mjs
// Checks a local build for values configured in .env.local / .env.production / .env. Each value (>= 8 chars) is
// searched for in .next and .open-next. Prints variable NAMES and counts only - never a value. Hits are classified:
//   code          found in compiled/bundled output  -> a leak, unless the value is also a literal in tracked source
//   source-const  found in compiled output, but the same literal is in tracked source (a constant, not the env)
//   env-copy      found only inside a verbatim copy of an .env* file that the build placed in its output
// Exit 1 only for "code" hits. env-copy hits are reported so they are not shipped by accident.
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { spawnSync } from "node:child_process";
import { root } from "./lib.mjs";

const values = new Map();
for (const f of [".env.local", ".env.production", ".env"]) {
  const p = join(root, f);
  if (!existsSync(p)) continue;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const v = m[2].replace(/^['"]|['"]$/g, "");
    if (v.length >= 8) values.set(`${f}:${m[1]}`, v);
  }
}
const inTrackedSource = (v) => spawnSync("git", ["grep", "-q", "-F", v, "--", "*.ts", "*.tsx", "*.mjs", "*.json"], { cwd: root }).status === 0;
const sourceConst = new Set([...values].filter(([, v]) => inTrackedSource(v)).map(([k]) => k));

const hits = { code: new Map(), "source-const": new Map(), "env-copy": new Map() };
let files = 0;
const walk = (dir) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isSymbolicLink()) continue;
    if (e.isDirectory()) { if (e.name === "cache") continue; walk(p); continue; }
    if (statSync(p).size > 30 * 1024 * 1024) continue;
    files++;
    let text;
    try { text = readFileSync(p, "latin1"); } catch { continue; }
    const isEnvCopy = basename(p).startsWith(".env");
    for (const [k, v] of values) {
      if (!text.includes(v)) continue;
      const cls = isEnvCopy ? "env-copy" : sourceConst.has(k) ? "source-const" : "code";
      hits[cls].set(k, (hits[cls].get(k) ?? 0) + 1);
    }
  }
};
for (const d of [".next", ".open-next"]) if (existsSync(join(root, d))) walk(join(root, d));

console.log(`scanned ${files} files for ${values.size} configured values`);
for (const [cls, m] of Object.entries(hits)) console.log(`${cls}: ${m.size ? [...m].map(([k, n]) => `${k} (${n})`).join(", ") : "none"}`);
process.exit(hits.code.size ? 1 : 0);
