#!/usr/bin/env node
// node scripts/demo-local/stack.mjs up|down|status|verify
// A throwaway, separate Supabase stack (project id aqarbooks_clean, API 55321, DB 55322): auth + rest +
// storage only, no SMTP, no analytics, no realtime. Applies supabase/migrations through `supabase start`.
import { supabase, stackEnv, syncStackProject, root, DB_CONTAINER, stackDir } from "./lib.mjs";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { observeUntilDecided, saveObservations, withCatalog } from "./drift-verdict.mjs";

const cmd = process.argv[2] ?? "status";
if (cmd === "up") {
  syncStackProject();
  console.log(supabase(["start"]).split("\n").filter((l) => /Applying|Started|error/i.test(l)).join("\n"));
} else if (cmd === "migrate") {
  // apply migrations added since `up` (copies the repo migrations, then the usual `supabase migration up`)
  syncStackProject();
  console.log(supabase(["migration", "up", "--local"]));
} else if (cmd === "down") {
  console.log(supabase(["stop", "--no-backup"]));
} else if (cmd === "status") {
  const e = stackEnv();
  console.log(`API ${e.API_URL}  DB ${e.DB_URL}`);
} else if (cmd === "verify") {
  // `supabase db diff` replays the migrations found in the STACK PROJECT folder, not in the repo. A stale or partial copy (2026-10-12: only the
  // 21 migrations from 20261009 on, no baseline) made the shadow-database replay fail at the first migration that needs baseline objects.
  // Re-sync first, and refuse to continue if the folder still does not hold exactly the repo's migrations.
  syncStackProject();
  const repoCount = readdirSync(join(root, "supabase", "migrations")).filter((n) => /^\d{14}_.+\.sql$/.test(n)).length;
  const stackCount = readdirSync(join(stackDir, "supabase", "migrations")).length;
  if (repoCount !== stackCount) { console.error(`stack project folder holds ${stackCount} migrations, the repo has ${repoCount}: refusing to run db diff`); process.exit(1); }
  const e = stackEnv();
  const psql = (sql) => execFileSync("docker", ["exec", DB_CONTAINER, "psql", "-U", "postgres", "-d", "postgres", "-tA", "-c", sql], { encoding: "utf8" }).trim();
  const ledger = psql("select version from supabase_migrations.schema_migrations order by 1").split("\n").filter(Boolean);
  const files = readdirSync(join(root, "supabase", "migrations")).filter((n) => /^\d{14}_/.test(n)).map((n) => n.slice(0, 14)).sort();
  const ledgerMatch = ledger.length === files.length && ledger.every((v, i) => v === files[i]);
  console.log(`ledger ${ledger.length} / files ${files.length} → ${ledgerMatch ? "MATCH" : "MISMATCH"}`);
  // The diff tool is not stable here (docs/audits/phase3-evidence/task9-drift/): it once reported ~1,900 drop+create statements for objects that exist
  // (cause inside the tool NOT identified) and it sometimes cannot start its shadow database. Conservative rule (scripts/demo-local/drift-verdict.mjs):
  // CLEAN only when the first two observations are clean; any difference or tool error followed by clean results is UNSTABLE, never success; the
  // same difference twice is DRIFT_REPRODUCED (the tool repeated its report, not an independent proof). Every raw output is kept in a folder.
  const captureDir = process.env.VERIFY_CAPTURE === "1" ? join(process.env.VERIFY_OUT_DIR ?? tmpdir(), `aqarbooks-verify-capture-${Date.now()}`) : null;
  let seq = 0;
  const diffPlain = () => {
    const raw = supabase(["db", "diff", "--local", "--schema", "public", "-o", "json"]);
    const json = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
    if (json._tag === "Error") return { error: true, text: JSON.stringify(json.error ?? json).slice(0, 2000), raw };
    return { error: false, clean: !json.diff?.trim() && (json.dropStatements ?? []).length === 0, text: (json.diff ?? "").trim(), raw };
  };
  // VERIFY_CAPTURE=1: the same diff, run by capture_run.py, which also reads the live database AND the CLI's shadow straight from the catalogs
  // (catalog_snapshot.sql) while the shadow is alive, so a recurring report is captured on both ends.
  const diffCaptured = () => {
    const label = `obs${++seq}`;
    execFileSync("python", [join(root, "docs", "audits", "phase3-evidence", "task9-drift", "capture_run.py"), label], { encoding: "utf8", env: { ...process.env, CAPTURE_OUT_DIR: captureDir }, stdio: ["ignore", "pipe", "pipe"] });
    const raw = readFileSync(join(captureDir, `cap-${label}.diff.json`), "utf8");
    const cap = JSON.parse(readFileSync(join(captureDir, `cap-${label}.result.json`), "utf8"));
    let tool;
    if (cap.returncode) tool = { error: true, text: raw.slice(0, 2000), raw };
    else {
      const json = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
      tool = { error: false, clean: !json.diff?.trim() && (json.dropStatements ?? []).length === 0, text: (json.diff ?? "").trim(), raw };
    }
    return withCatalog(tool, cap);
  };
  const diffOnce = captureDir ? diffCaptured : diffPlain;
  const result = observeUntilDecided(diffOnce, (n, o) => console.log(`db diff observation ${n}: ${o.error ? "TOOL ERROR " + o.text.slice(0, 160) : o.clean ? "clean" : "differs (" + o.text.split(String.fromCharCode(10)).length + " lines)"}${o.catalog ? " [catalog: " + o.catalog + "]" : ""}`));
  const outDir = saveObservations(result);
  const t = result.tally;
  const summary = `${result.observations.length} observations: ${t.clean} clean, ${t.differing} differing, ${t.error} tool errors; all outputs kept in ${outDir}${captureDir ? "; catalog captures in " + captureDir : ""}`;
  if (result.verdict === "CLEAN") console.log(`db diff (public): CLEAN -- ${summary}`);
  else if (result.verdict === "DRIFT_REPRODUCED") console.log(`db diff: DRIFT_REPRODUCED -- ${result.reason}; ${summary}`);
  else console.log(`db diff: UNSTABLE -- ${result.reason}; ${summary}; nothing is concluded (this is neither clean nor proven drift)`);
  if (!ledgerMatch || result.verdict === "DRIFT_REPRODUCED") process.exit(1);
  if (result.verdict !== "CLEAN") process.exit(2);
  void e;
}
