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
 * Nothing about production. The Step 7 cutover ran on 2026-08-21 and production's
 * `supabase_migrations.schema_migrations` now holds exactly one row, the baseline
 * -- but this suite does not measure that, and a pass here is not evidence of it.
 * `supabase db push` against production remains prohibited by ADR 0004 regardless
 * of this test.
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

/**
 * Every migration allowed to be active, pinned by name, size and digest, in the
 * order the database records them.
 *
 * SECOND AMENDMENT (2026-08-23). The first amendment re-pointed this from
 * "zero .sql files, ever" to a named allowlist of one, when the squashed
 * baseline was admitted. This one extends that allowlist to seven, and the
 * reasoning is unchanged: the assertion is not loosened to "some migrations are
 * fine", it is re-pointed at a longer named list. An eighth file, or a changed
 * byte in any of these, still fails.
 *
 * The six additions were applied through Supabase's apply_migration rather than
 * `supabase db push`, which writes a row to
 * supabase_migrations.schema_migrations but no file. They lived outside this
 * directory for a day precisely so this guard would keep working, which left
 * the repository unable to describe the database. Each filename below is the
 * exact version recorded in that ledger, so the two now agree.
 */
/*
 * THIRD AMENDMENT (2026-08-25). Extends the allowlist to ten with
 * 20260825084639_organizations_is_demo.sql, which adds
 * organizations.is_demo together with the trigger that makes it
 * platform-controlled. Same reasoning as the second amendment: the assertion is
 * not loosened, it is re-pointed at a longer named list, and an eleventh file
 * or a changed byte in any of these still fails.
 *
 * Applied through apply_migration (which writes a ledger row and no file), then
 * copied here byte-identically -- the digest below was computed before the
 * apply and re-verified after the copy. supabase/migrations/*.sql is marked
 * -text in .gitattributes, so the LF endings survive a Windows checkout and the
 * digest means the same thing on every machine.
 */
const MIGRATION_FILES = [
  { file: "20260821105505_baseline.sql", bytes: 956400, sha256: "cf3de852cecc49d29e5d24c6bbb6afcebf8d65aeb994b684f5fc0a21f02790d7" },
  { file: "20260823044325_member_invitation_access_codes.sql", bytes: 11803, sha256: "9f22f46c461ace9ea4ab11929227f2c63ba43eaf1a819196827def58d74555b8" },
  { file: "20260823071129_member_archiving.sql", bytes: 4291, sha256: "8211f77376b27c11607a0689b7ccc0d9fa4d7191b8026805c2e488594f8f0fd2" },
  { file: "20260823075533_unit_archive_reason.sql", bytes: 940, sha256: "20dce1c8b187afb22c29638553f2a31c8da3debf1d4fb6310924aeba453ff7b6" },
  { file: "20260823083604_revert_unit_archive_reason.sql", bytes: 721, sha256: "776f0dce1b31532f13a5b264180a8deb24835122cb08f00b67d09308c86e9ae3" },
  { file: "20260823093809_operational_alerts.sql", bytes: 4593, sha256: "3e2a8e141b301ec73c0ad49370e3fd312ac8d6524536d6ee03d23b4638cf2c2e" },
  { file: "20260823100424_alert_digest_runs.sql", bytes: 1794, sha256: "e8f45da0ee44338dfe7215bea443653d76f5c5112c11d7495a89e6eea8bc0182" },
  { file: "20260823200624_property_reports_permission.sql", bytes: 2295, sha256: "26476ed0642dce52f072486dfe30b51c4513985a6e344c2f94906bb604dace98" },
  { file: "20260823200722_property_reports_permission_widen.sql", bytes: 1488, sha256: "308a37b472e5f59c77ea8ff94363f2cee04e1b186a5dadbd43119b83b92551ce" },
  { file: "20260825084639_organizations_is_demo.sql", bytes: 11904, sha256: "d24b7358734274c79a8eec23ccd444eb17dd78f32ab0e51d0066e87b01bd0f97" },
] as const;

/**
 * 20260823075533 adds units.archive_reason and 20260823083604 drops it again.
 * Keeping the pair rather than cancelling them out is deliberate: production
 * passed through that state, and a history that quietly omits its own mistakes
 * cannot be replayed to the schema that actually exists.
 */
const BASELINE = MIGRATION_FILES[0];

/** Exactly what `supabase/migrations/` is allowed to contain. */
const PERMITTED = ["README.md", ".gitkeep", ...MIGRATION_FILES.map((m) => m.file)].sort();

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

  it("the CLI parses exactly the allowed migrations, in ledger order", () => {
    const parsed = readdirSync(MIGRATIONS)
      .filter((f) => CLI_MIGRATION_PATTERN.test(f))
      .sort();
    expect(parsed).toEqual(MIGRATION_FILES.map((m) => m.file).slice().sort());
  });

  it.each(MIGRATION_FILES.map((m) => [m.file, m] as const))(
    "%s is byte-for-byte what was applied",
    (_name, expected) => {
      const p = join(MIGRATIONS, expected.file);
      const raw = readFileSync(p);
      expect(statSync(p).size).toBe(expected.bytes);
      expect(raw.length).toBe(expected.bytes);
      expect(createHash("sha256").update(raw).digest("hex")).toBe(expected.sha256);
    },
  );

  it("no .sql file exists at any depth beyond the allowed set", () => {
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
      );
    const sql = walk(MIGRATIONS)
      .filter((p) => p.toLowerCase().endsWith(".sql"))
      .map((p) => p.replace(/\\/g, "/"))
      .sort();
    expect(sql).toEqual(
      MIGRATION_FILES.map((m) => `${MIGRATIONS}/${m.file}`).slice().sort(),
    );
  });

  // The staging directory these six sat in must not linger. Leaving it would
  // invite the next migration to be parked there again, which is how the
  // repository stopped describing the database in the first place.
  it("the migrations-pending staging directory is gone", () => {
    expect(existsSync("supabase/migrations-pending")).toBe(false);
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
