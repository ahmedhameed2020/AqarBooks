/**
 * Migration directory guard.
 *
 * WHY THIS EXISTS
 * Step 6 moved 228 files out of `supabase/migrations/` into
 * `supabase/migrations-archive/2026-08-21-pre-squash/`, leaving the directory
 * with no SQL at all. Two things keep the Supabase CLI from treating the
 * archived files as live migrations:
 *
 *   1. the archive is outside the directory the CLI scans, and
 *   2. in CLI v2.78.1, files in a subdirectory are invisible anyway --
 *      not listed, not pushed, not even warned about.
 *
 * Both are conditions, not guarantees. This test is the part that notices when
 * a condition stops being true. It exists because a command exiting 0 proves it
 * ran, not that the directory holds what we intend it to hold.
 *
 * WHAT CHANGED, AND WHY IT IS AN AMENDMENT RATHER THAN A RELAXATION
 * The original assertion was "zero .sql files, ever". That was correct for the
 * interval between Step 6 and the baseline activation, and it was written
 * precisely so that reintroducing a migration could not pass unnoticed.
 *
 * The baseline activation reintroduces exactly one, deliberately:
 *
 *   20260821105505_baseline.sql   956,400 bytes
 *   sha256 cf3de852cecc49d29e5d24c6bbb6afcebf8d65aeb994b684f5fc0a21f02790d7
 *
 * So the assertion is not loosened to "some .sql files are fine". It is
 * re-pointed at a named allowlist of one, pinned by size and digest. Adding a
 * second migration, or altering this one's bytes, still fails -- which is the
 * property the original test was protecting.
 *
 * That file was proven before being admitted: applied on its own to a freshly
 * created, empty Supabase project, it reproduced production's schema, security
 * posture and reference state across all sixteen classes of the recovered
 * Step 5 comparator, with 456 reference rows, one global PLATFORM_SUPER_ADMIN
 * role, and zero rows in all 92 tenant tables.
 *
 * WHAT A PASS HERE DOES NOT MEAN
 * Nothing about production. Until the ledger cutover runs, production's
 * `supabase_migrations.schema_migrations` still holds 143 rows that no repo
 * version corresponds to. `supabase db push` against production remains
 * prohibited by ADR 0004 regardless of this test.
 *
 * This suite reads the filesystem only. It opens no database connection.
 */
import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { readdirSync, existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS = "supabase/migrations";
const ARCHIVE = "supabase/migrations-archive";
const ARCHIVED_FILES = join(ARCHIVE, "2026-08-21-pre-squash");

/** The one migration allowed to be active, pinned by name, size and digest. */
const BASELINE = {
  file: "20260821105505_baseline.sql",
  bytes: 956400,
  sha256: "cf3de852cecc49d29e5d24c6bbb6afcebf8d65aeb994b684f5fc0a21f02790d7",
} as const;

/** Exactly what `supabase/migrations/` is allowed to contain. */
const PERMITTED = ["README.md", ".gitkeep", BASELINE.file].sort();

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

describe("migrations directory holds exactly the approved baseline", () => {
  it("supabase/migrations holds exactly the permitted files and nothing else", () => {
    const entries = readdirSync(MIGRATIONS).sort();
    expect(entries).toEqual(PERMITTED);
  });

  it("exactly one file is parsed as a migration by the CLI, and it is the baseline", () => {
    const parsed = readdirSync(MIGRATIONS).filter((f) =>
      CLI_MIGRATION_PATTERN.test(f),
    );
    expect(parsed).toEqual([BASELINE.file]);
  });

  it("the baseline migration is byte-for-byte the proven candidate", () => {
    const p = join(MIGRATIONS, BASELINE.file);
    const raw = readFileSync(p);
    expect(statSync(p).size).toBe(BASELINE.bytes);
    expect(raw.length).toBe(BASELINE.bytes);
    expect(createHash("sha256").update(raw).digest("hex")).toBe(BASELINE.sha256);
  });

  it("no .sql file exists at any depth other than the baseline", () => {
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
      );
    const sql = walk(MIGRATIONS)
      .filter((p) => p.toLowerCase().endsWith(".sql"))
      .map((p) => p.replace(/\\/g, "/"));
    expect(sql).toEqual([`${MIGRATIONS}/${BASELINE.file}`]);
  });

  // Anti-vacuity: the assertions above would all pass if the archive had been
  // deleted rather than moved aside. These prove the history still exists.
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
