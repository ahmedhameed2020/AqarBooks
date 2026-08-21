/**
 * Step 6 guard — the migrations directory must stay empty of SQL.
 *
 * WHY THIS EXISTS
 * Step 6 moved 228 files out of `supabase/migrations/` into
 * `supabase/migrations-archive/2026-08-21-pre-squash/`. Two things keep the
 * Supabase CLI from treating the archived files as live migrations:
 *
 *   1. the archive is outside the directory the CLI scans, and
 *   2. in CLI v2.78.1, files in a subdirectory are invisible anyway --
 *      not listed, not pushed, not even warned about.
 *
 * Both are conditions, not guarantees. (2) is undocumented behaviour of one
 * CLI version; a future release that walked the tree recursively would
 * silently resurrect 228 migrations. (1) holds only for as long as nobody
 * puts a .sql file back.
 *
 * This test is the part that notices when a condition stops being true. It
 * exists because a command exiting 0 proves it ran, not that the directory
 * holds what we intend it to hold.
 *
 * WHAT IT DOES NOT MEAN
 * A passing test here says nothing about production. `supabase_migrations.
 * schema_migrations` still carries 143 rows that no repo version corresponds
 * to, and the CLI reporting "Remote database is up to date" against an empty
 * directory only means there is no local migration left to push. The
 * `supabase db push` prohibition in ADR 0004 stands until Step 7 reconciles
 * the ledger itself.
 *
 * This suite reads the filesystem only. It opens no database connection.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS = "supabase/migrations";
const ARCHIVE = "supabase/migrations-archive";
const ARCHIVED_FILES = join(ARCHIVE, "2026-08-21-pre-squash");

/** Exactly what `supabase/migrations/` is allowed to contain after Step 6. */
const PERMITTED = ["README.md", ".gitkeep"].sort();

/** The Supabase CLI's own rule, read out of the v2.78.1 binary. */
const CLI_MIGRATION_PATTERN = /^([0-9]+)_(.*)\.sql$/;

/**
 * Read the ledger export as lines, tolerating either line ending.
 *
 * The repository has no `-text` attribute on this path, so git normalises it on
 * checkout and a Windows working tree receives CRLF. Splitting on "\n" alone
 * would leave a trailing "\r" on every line and fail the header comparison on a
 * fresh clone while passing on the machine that wrote the file.
 */
function readLedger(): string[] {
  return readFileSync(join(ARCHIVE, "ledger-2026-08-21.tsv"), "utf8")
    .replace(/\r\n/g, "\n")
    .trimEnd()
    .split("\n");
}

describe("Step 6 — migrations directory contains no live migrations", () => {
  it("supabase/migrations holds exactly the permitted files and nothing else", () => {
    const entries = readdirSync(MIGRATIONS).sort();
    expect(entries).toEqual(PERMITTED);
  });

  it("supabase/migrations contains zero .sql files at any depth", () => {
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
      );
    const sql = walk(MIGRATIONS).filter((p) => p.toLowerCase().endsWith(".sql"));
    expect(sql).toEqual([]);
  });

  it("nothing in supabase/migrations would be parsed as a migration by the CLI", () => {
    const parsed = readdirSync(MIGRATIONS).filter((f) =>
      CLI_MIGRATION_PATTERN.test(f),
    );
    expect(parsed).toEqual([]);
  });

  // Anti-vacuity: the three assertions above would all pass if the archive had
  // been deleted rather than moved aside. These prove the history still exists.
  it("the archive still holds all 228 files (the move was not a deletion)", () => {
    expect(existsSync(ARCHIVED_FILES)).toBe(true);
    const archived = readdirSync(ARCHIVED_FILES).filter((f) => f.endsWith(".sql"));
    expect(archived).toHaveLength(228);
  });

  it("the archive manifest and ledger export are present", () => {
    expect(existsSync(join(ARCHIVE, "MANIFEST.md"))).toBe(true);
    expect(existsSync(join(ARCHIVE, "ledger-2026-08-21.tsv"))).toBe(true);

    const tsv = readLedger();
    expect(tsv[0]).toBe("version\tname");
    expect(tsv).toHaveLength(144); // header + 143 ledger rows
  });

  it("the ledger export carries only version and name", () => {
    for (const line of readLedger()) {
      expect(line.split("\t")).toHaveLength(2);
    }
  });
});
