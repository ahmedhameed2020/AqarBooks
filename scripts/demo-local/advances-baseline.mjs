#!/usr/bin/env node
// node scripts/demo-local/advances-baseline.mjs snapshot [--tag before] | compare <snapshot.json>
// Local baseline for the customer-advances upgrade test, taken on the ISOLATED stack only (DB_CONTAINER from lib.mjs; the
// development stack can never be selected there). Every query runs in a read-only session. Running the test suites that
// precede a snapshot creates fixtures, so this is a "local baseline", not a read-only audit.
//   snapshot  writes the full dump to the system temp folder and a small summary (counts + digests) next to the evidence.
//   compare   re-reads the same views/functions and fails when any legacy figure differs from the snapshot.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DB_CONTAINER, root } from "./lib.mjs";

const psql = (sql) =>
  execFileSync("docker", ["exec", "-e", "PGOPTIONS=-c default_transaction_read_only=on", DB_CONTAINER, "psql", "-U", "postgres", "-d", "postgres", "-tA", "-c", sql], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 }).trim();
const json = (sql) => JSON.parse(psql(`select coalesce(json_agg(t),'[]') from (${sql}) t`));
const digest = (v) => createHash("sha256").update(JSON.stringify(v)).digest("hex");

function take() {
  const tables = ["organizations", "units", "dues", "payments", "payment_allocations", "journal_entries", "journal_entry_lines"];
  const counts = Object.fromEntries(tables.map((t) => [t, Number(psql(`select count(*) from public.${t}`))]));
  const data = {
    units_with_financials: json("select * from public.units_with_financials order by id"),
    members_with_financials: json("select * from public.members_with_financials order by id"),
    due_outstanding: json("select d.id, d.status, d.amount, public.due_outstanding(d.id) as outstanding from public.dues d order by d.id"),
    payments: json("select id, organization_id, member_id, unit_id, amount, status, payment_date, unallocated_amount, journal_entry_id, reversal_journal_entry_id, reversed_at from public.payments order by id"),
    payment_allocations: json("select id, payment_id, due_id, amount, reversed_at from public.payment_allocations order by id"),
  };
  return { counts, data, digests: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, digest(v)])) };
}

const [cmd, arg] = process.argv.slice(2);
if (cmd === "snapshot") {
  if (psql("show transaction_read_only") !== "on") throw new Error("session is not read-only");
  const s = take();
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dir = join(tmpdir(), "aqarbooks-advances-baseline");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `snapshot-${stamp}.json`);
  writeFileSync(file, JSON.stringify({ container: DB_CONTAINER, takenAt: new Date().toISOString(), ...s }));
  const out = join(root, "docs", "audits", "phase3-evidence");
  mkdirSync(out, { recursive: true });
  const summary = { container: DB_CONTAINER, takenAt: new Date().toISOString(), counts: s.counts, digests: s.digests, fullDump: file.replaceAll("\\", "/") };
  writeFileSync(join(out, "advances-baseline-summary.json"), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
} else if (cmd === "compare") {
  // Rows are compared one by one and only for ids that existed in the snapshot: the stack keeps receiving test fixtures, so a
  // whole-table digest would flag new rows that are not a change to legacy data. Differences are named, not just counted.
  const before = JSON.parse(readFileSync(arg, "utf8"));
  const now = take();
  const keyOf = (r) => r.id;
  const diffs = [];
  for (const k of Object.keys(before.data)) {
    const current = new Map(now.data[k].map((r) => [keyOf(r), JSON.stringify(r)]));
    let changed = 0, gone = 0;
    for (const r of before.data[k]) {
      if (!current.has(keyOf(r))) gone++;
      else if (current.get(keyOf(r)) !== JSON.stringify(r)) { changed++; diffs.push(`${k}:${keyOf(r)}`); }
    }
    console.log(`${k}: ${before.data[k].length} rows in the snapshot, ${changed} changed, ${gone} gone, ${now.data[k].length - before.data[k].length + gone} new since`);
  }
  console.log(diffs.length ? `DIFFERENT (${diffs.length}): ${diffs.slice(0, 20).join(", ")}` : "IDENTICAL: every legacy row matches the snapshot");
  process.exit(diffs.length ? 1 : 0);
} else {
  console.error("usage: advances-baseline.mjs snapshot | compare <snapshot.json>");
  process.exit(2);
}
