import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Static guard (no database) for journal_entries update paths.
 *
 * Supabase semantics: an UPDATE denied by RLS returns { error: null, data: [] } unless .select()
 * is requested, so the application must never report success when zero rows changed.
 *
 * Audit result: no application file issues a direct .update()/.upsert()/.delete() on
 * journal_entries. Draft/status changes go through SECURITY DEFINER RPCs
 * (create_journal_entry, submit_journal_entry_for_review, post_journal_entry,
 * reverse_journal_entry) which raise on a missing or ineligible entry. The server actions
 * that call them check `error` before returning ok:true. This file pins that shape so a future
 * direct update cannot slip in without .select() and a zero-row failure branch.
 */

const ROOT = path.resolve(__dirname, "..");
const SCAN_DIRS = ["app", "lib", "components"];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

const sourceFiles = SCAN_DIRS.flatMap((d) => walk(path.join(ROOT, d)));
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");

/** Returns the statement text starting at each .from("journal_entries") up to the next ';'. */
function journalEntryStatements(src: string): string[] {
  const out: string[] = [];
  const re = /\.from\(\s*["']journal_entries["']\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const end = src.indexOf(";", m.index);
    out.push(src.slice(m.index, end === -1 ? undefined : end + 1));
  }
  return out;
}

describe("journal_entries direct writes from application code", () => {
  it("no application file mutates journal_entries through the Supabase client", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles) {
      const src = readFileSync(file, "utf8");
      for (const stmt of journalEntryStatements(src)) {
        if (/\.(update|upsert|delete)\(/.test(stmt)) {
          offenders.push(path.relative(ROOT, file));
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("the draft-changing RPC callers check error before reporting success", () => {
    const src = read("lib/actions/accounting.ts");
    for (const rpc of ["submit_journal_entry_for_review", "post_journal_entry", "reverse_journal_entry"]) {
      const idx = src.indexOf(`supabase.rpc("${rpc}"`);
      expect(idx, `${rpc} call site`).toBeGreaterThan(-1);
      const window = src.slice(idx, idx + 600);
      expect(window, `${rpc} error branch`).toMatch(/if \(error\) return \{ ok: false/);
    }
  });

  it.todo("C4 live: authenticated UPDATE on a draft journal_entries row blocked by RLS returns zero rows and no action reports success (run only in the isolated stack)");
});
