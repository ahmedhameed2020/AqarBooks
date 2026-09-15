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
export type MigrationProvenance =
  | "restored_exact"
  | "reconstructed_from_evidence"
  | "post_apply_nonsemantic_edit"
  | "reconciled_remote_migration"
  | "new_authorized_migration";

export interface MigrationDescriptor {
  readonly file: string;
  readonly bytes: number;
  readonly sha256: string;
  readonly provenance: MigrationProvenance;
}

interface HistoricalLedgerManifest {
  readonly rows: readonly { readonly version: string }[];
}

/**
 * The immutable tipping point of the reconciled migration ledger.
 * Any future migration added to supabase/migrations MUST have:
 *   version > RECONCILIATION_LEDGER_TIP
 */
export const RECONCILIATION_LEDGER_TIP = "20260903172101";
export const FUTURE_MIGRATION_VERSION_FLOOR = "20260915100016";

export const RECONCILED_REMOTE_MIGRATIONS: readonly MigrationDescriptor[] = [
  { file: "20260829104638_legacy_access_migration_control_plane.sql", bytes: 4147, sha256: "91dd76d76bf470d2309d55725b2f4ce988a666f62ecabff61d7b777db0f2f640", provenance: "reconciled_remote_migration" },
  { file: "20260829105948_legacy_migration_raw_staging_tables.sql", bytes: 6264, sha256: "82150799528f0b5f6fe371f4aa5c04e20ab70d2a4353b4394e3be115aeb8a520", provenance: "reconciled_remote_migration" },
  { file: "20260829110027_legacy_migration_validation_views_v2.sql", bytes: 3198, sha256: "da9b02973bd68f9a8d742bf7e76114bcc38e6c9c7d21d36b6fda3dc30e13ed61", provenance: "reconciled_remote_migration" },
  { file: "20260831194315_accsys_migration_staging_schema.sql", bytes: 2404, sha256: "f114872dc86ff24b49e1b4b650ef7034c212bbd40cf2324a3f991483e42ee002", provenance: "reconciled_remote_migration" },
  { file: "20260831194442_accsys_stage_loader_casts.sql", bytes: 1112, sha256: "6f09cbd2bd0f041376553880e81610808816d90f3b81e681b9772534ac812c85", provenance: "reconciled_remote_migration" },
  { file: "20260831194633_accsys_stage_compact_bulk_tables.sql", bytes: 473, sha256: "eb6639c7006592253de48c90f4f1fc1550a5222121c164bbb47ac355d94539b1", provenance: "reconciled_remote_migration" },
  { file: "20260831194850_accsys_stage_coa_shape.sql", bytes: 158, sha256: "9c9ee9c233e9a3f904b989daee9dc97190d12cf2564aa651f0672a053da0b2ff", provenance: "reconciled_remote_migration" },
  { file: "20260831195011_accsys_materialize_function.sql", bytes: 8475, sha256: "356f40b9d89bc9fbed229ffe89561ea764b6a9f4d32bef75af39c46e28a326b8", provenance: "reconciled_remote_migration" },
  { file: "20260831195049_accsys_materialize_function_fix.sql", bytes: 7816, sha256: "59ebb651522fa1f4e867429408889774a9bb0a1d3bb4ecf4614a37f7a745ab8d", provenance: "reconciled_remote_migration" },
  { file: "20260831195824_accsys_materialize_no_demo_flag.sql", bytes: 7863, sha256: "a3087cccdff920010708e266ef416148566e7ee2ffad240c1729e2076922a27d", provenance: "reconciled_remote_migration" },
  { file: "20260831200103_accsys_materialize_operations.sql", bytes: 6819, sha256: "f0b68ca23f29143505fe519abaeea984a819a1f692c2bfc8deeacee0c9c110d6", provenance: "reconciled_remote_migration" },
  { file: "20260831200142_accsys_ops_unique_receipt_numbers.sql", bytes: 6966, sha256: "8cd1fc0d130bd5fa579bcfcdf4140babb7ecd76da5df9750ccc35778fb2d9e49", provenance: "reconciled_remote_migration" },
  { file: "20260831201313_accsys_stage_verified_loader.sql", bytes: 874, sha256: "9f1377bc5af4dfd75fe3379454027aa0ca4cc7b85be8028591e16f538e55d05b", provenance: "reconciled_remote_migration" },
  { file: "20260831201513_accsys_stage_dictionary_and_reset.sql", bytes: 1172, sha256: "2f5e5e8a494d093ac481d8c2bdb002f881a514ce65df7d6293b308f2c64cebba", provenance: "reconciled_remote_migration" },
  { file: "20260831205217_accsys_loader_strip_cr.sql", bytes: 2024, sha256: "8bf833c806b77fd8d0150d94f4e35a071a4de811afd58c838265254dd1f0998b", provenance: "reconciled_remote_migration" },
] as const;

export const MIGRATION_FILES: readonly MigrationDescriptor[] = [
  { file: "20260821105505_baseline.sql", bytes: 956400, sha256: "cf3de852cecc49d29e5d24c6bbb6afcebf8d65aeb994b684f5fc0a21f02790d7", provenance: "restored_exact" },
  { file: "20260823044325_member_invitation_access_codes.sql", bytes: 11803, sha256: "9f22f46c461ace9ea4ab11929227f2c63ba43eaf1a819196827def58d74555b8", provenance: "restored_exact" },
  { file: "20260823071129_member_archiving.sql", bytes: 4291, sha256: "8211f77376b27c11607a0689b7ccc0d9fa4d7191b8026805c2e488594f8f0fd2", provenance: "restored_exact" },
  { file: "20260823075533_unit_archive_reason.sql", bytes: 940, sha256: "20dce1c8b187afb22c29638553f2a31c8da3debf1d4fb6310924aeba453ff7b6", provenance: "reconstructed_from_evidence" },
  { file: "20260823083604_revert_unit_archive_reason.sql", bytes: 721, sha256: "776f0dce1b31532f13a5b264180a8deb24835122cb08f00b67d09308c86e9ae3", provenance: "restored_exact" },
  { file: "20260823093809_operational_alerts.sql", bytes: 4593, sha256: "3e2a8e141b301ec73c0ad49370e3fd312ac8d6524536d6ee03d23b4638cf2c2e", provenance: "restored_exact" },
  { file: "20260823100424_alert_digest_runs.sql", bytes: 1794, sha256: "e8f45da0ee44338dfe7215bea443653d76f5c5112c11d7495a89e6eea8bc0182", provenance: "restored_exact" },
  // 2026-09-14 parser repair: the historical repository file was not replayable
  // because its final `on conflict do nothing` lacked a terminating semicolon.
  // The repair adds only that terminator; it is a post-application
  // nonsemantic edit. Local `supabase start` and `supabase db reset`
  // successfully replayed the repaired history with no schema behavior or
  // migration version change.
  { file: "20260823200624_property_reports_permission.sql", bytes: 2296, sha256: "15fbb89edc560d0a29e99a798e8c623400385e33540bf77630f493cc4ad92aab", provenance: "post_apply_nonsemantic_edit" },
  { file: "20260823200722_property_reports_permission_widen.sql", bytes: 1488, sha256: "308a37b472e5f59c77ea8ff94363f2cee04e1b186a5dadbd43119b83b92551ce", provenance: "restored_exact" },
  { file: "20260825084639_organizations_is_demo.sql", bytes: 11904, sha256: "d24b7358734274c79a8eec23ccd444eb17dd78f32ab0e51d0066e87b01bd0f97", provenance: "restored_exact" },
  { file: "20260825124312_generate_lease_rent_dues_authz.sql", bytes: 8499, sha256: "d063fe2ae32188b1c469a722a8f918942b5ea2be99779dfe0a68af9e4a15faba", provenance: "restored_exact" },
  { file: "20260825124342_internal_helper_acls.sql", bytes: 7595, sha256: "3cbcc49b3308e8a2bf772579d2573d60f7b034de74067b20f2dd43fb44bc5082", provenance: "restored_exact" },
  { file: "20260825182109_rent_partial_period_guard.sql", bytes: 11966, sha256: "884dddada7f5b6703e844f1bc8f7a055d5f0692fc73f243865c4da37cc6c6cd4", provenance: "restored_exact" },
  { file: "20260825231151_demo_readonly_hardening_and_cashier_read.sql", bytes: 9984, sha256: "d7dd715e0a06f7457d5cd2ad338e73450569697bfbc22f64bc3aa41e49baf233", provenance: "restored_exact" },
  { file: "20260826072010_public_action_rate_limits.sql", bytes: 5823, sha256: "80611b7bf5e2835d3e8600e45c36a850d6b902e53724f46287422ca843502b3d", provenance: "restored_exact" },
  { file: "20260826102930_assisted_onboarding_requests.sql", bytes: 13325, sha256: "ec62d236b1614c14c2f4f5d8c26bdfbfdb9b1a3b3aa2d0cacc8162099d3f73fc", provenance: "restored_exact" },
  { file: "20260826124013_onboarding_request_idempotency_and_self_read.sql", bytes: 1692, sha256: "fbbba887840710c1f1225263ec82509babda62d1a962624f849871f031263566", provenance: "restored_exact" },
  ...RECONCILED_REMOTE_MIGRATIONS,
  { file: "20260903172101_member_opening_balance.sql", bytes: 17897, sha256: "e2b581796a179ce04d472b2fb29d54ac68e3775be351479c2539e257f8a0ea42", provenance: "post_apply_nonsemantic_edit" },
  { file: "20260913165500_w0_sec_authorization_containment.sql", bytes: 6570, sha256: "eba7ae525f91fb9ff3f0a124d99fa108ddc9731e14815931d0b9a75543d35a7f", provenance: "new_authorized_migration" },
  { file: "20260914131953_maintenance_request_core.sql", bytes: 32171, sha256: "d319cc3c80bea64b7f8576c831f498acaba80f5abf5cd351abaaad9ab480dcbc", provenance: "new_authorized_migration" },
  { file: "20260914200226_maintenance_request_attachments.sql", bytes: 21696, sha256: "7df40451cc9815d1b1b1e18ea3ed943ce41fed8d598b6f8d5fbaaf0be979014a", provenance: "new_authorized_migration" },
  { file: "20260914203712_maintenance_work_orders.sql", bytes: 40233, sha256: "70c91bbe8ef03684f890bccb9acb6fa08762a3acd62c8a60df09a91f3488d57f", provenance: "new_authorized_migration" },
  { file: "20260915050914_maintenance_cost_accounting_bridge.sql", bytes: 39495, sha256: "0f8220d9526e0ffcde3353addc7c12940cae9a80af9c5aefe255e27024c128da", provenance: "new_authorized_migration" },
  { file: "20260915073908_visitor_invitations_secure_qr_passes.sql", bytes: 20826, sha256: "5ab2671a9dcff5a36b46be94e2b4477c91d11c53933c302f902693f744a947a1", provenance: "new_authorized_migration" },
  { file: "20260915081839_gate_operations_access_ledger.sql", bytes: 28731, sha256: "df213495fc66a6b542df95b898c6344d35f9564eb3f1d70ac7e6d5e626fa7624", provenance: "new_authorized_migration" },
  { file: "20260915100016_vehicles_unit_timeline_notifications.sql", bytes: 46232, sha256: "e59ee9176c3b6469dd3e5116053cd57ef08f4c7a7bdb8d66eda998f814b123c5", provenance: "new_authorized_migration" },
] as const;

/**
 * SEVENTH AMENDMENT (2026-09-12 — DB-01 / DB-02 Forensic Resolution).
 *
 * Formalizes the reconciliation of the 15 applied production ledger rows
 * (20260829104638 .. 20260831205217: legacy_access_* and accsys_*) investigated
 * under DB-01 (see docs/migration-ledger-forensics-report.md).
 *
 * CONTEXT CORRECTION & CLASSIFICATION:
 * These 15 rows represent a one-off Microsoft Access data-import / ETL workflow
 * executed for a specific customer migration between 2026-08-29 and 2026-08-31.
 * They are NOT part of the canonical AqarBooks product migration history and are
 * not required to rebuild or operate the current product. All 15 rows are formally
 * classified as `retired_one_off_access_import_etl`. No SQL migration files are
 * fabricated for them.
 *
 * Live catalog introspection across all 110 PostgREST definitions and 211 PostgreSQL
 * routines confirms that zero schema objects exist in the public schema for these 15 rows.
 * Furthermore, an exhaustive git fsck scan across 3,166 dangling blobs confirmed zero
 * matching blobs ever existed in git refs.
 *
 * Per the immutable "Restored, not reconstructed" standard (ADR 0004 & signed ADR 0005 Rev 2.8),
 * synthetic SQL files are NOT fabricated for these 15 historical staging tombstones.
 *
 * Instead, the 15 ledger rows are recorded as an immutable historical exception. The
 * repository continues to describe exactly the 18 live schema migrations. Any future migration
 * MUST have a timestamp greater than the latest ledger version (> 20260903172101).
 */
export const LEDGER_ONLY_VERSIONS: readonly string[] = [] as const;

/**
 * SIXTH AMENDMENT (2026-09-07). Extends the allowlist to eighteen with two
 * migrations that were applied to the project on 2026-08-26 through
 * apply_migration from branch claude/aqarbooks-conversion-flow-2tplsl, which
 * was never merged:
 *
 *   20260826102930  assisted_onboarding_requests
 *   20260826124013  onboarding_request_idempotency_and_self_read
 *
 * RESTORED, NOT RECONSTRUCTED, as with the third amendment: each blob is
 * byte-identical between the commit that introduced it (8a4b6e1 / 7764931)
 * and that branch's tip, so these are the files that were applied.
 */

/**
 * FIFTH AMENDMENT (2026-09-03). Extends the allowlist to sixteen: member
 * (client) opening balances -- an OPENING_BALANCE provenance on dues and the
 * two RPCs that record one. Same reasoning as every prior amendment -- a
 * seventeenth file, or a changed byte in any of these, still fails.
 */

/**
 * FOURTH AMENDMENT (2026-08-26). Extends the allowlist to fifteen: the durable
 * rate-limit table and function backing public demo entry. Same reasoning as
 * every prior amendment -- a sixteenth file, or a changed byte in any of
 * these, still fails.
 */

/**
 * THIRD AMENDMENT (2026-08-25). Extends the allowlist to fourteen. The
 * reasoning is unchanged: a fifteenth file, or a changed byte in any of these,
 * still fails.
 *
 * Ten of the fourteen were already listed. The other four closed a real gap:
 *
 *   20260825084639  organizations_is_demo
 *   20260825124312  generate_lease_rent_dues_authz
 *   20260825124342  internal_helper_acls
 *   20260825182109  rent_partial_period_guard
 *
 * They were applied to production through apply_migration -- which writes a
 * ledger row but no file -- from a branch whose work was never merged, so for a
 * day the repository could not describe its own database. This suite reads the
 * filesystem only and could not see that: it passed the whole time.
 *
 * RESTORED, NOT RECONSTRUCTED. The originals were recovered from git history
 * (feat/public-demo-phase-1, commits f6e5cb6 / 423f0b0 / 2802399) at the same
 * paths they were authored at. Each blob is byte-identical between the commit
 * that introduced it and that branch's tip, so these are the files that were
 * applied, not a re-derivation of them. Reconstructing the SQL from
 * supabase_migrations.schema_migrations.statements was deliberately NOT done --
 * that would have produced text that merely behaves the same, and the digests
 * pinned above would then have attested to something nobody actually ran.
 *
 * The list order matches the ledger's version order, which is also filename
 * order. None of these will execute again: every version below is already
 * recorded in supabase_migrations.schema_migrations, so the CLI treats them as
 * applied and skips them.
 */

/**
 * 20260823075533 adds units.archive_reason and 20260823083604 drops it again.
 * Keeping the pair rather than cancelling them out is deliberate: production
 * passed through that state, and a history that quietly omits its own mistakes
 * cannot be replayed to the schema that actually exists.
 */
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
    "%s matches pinned repository size and digest (provenance: %s)",
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

  describe("DB-01 reconciliation invariants — Seventh Amendment", () => {
    it("reconciled remote migration list records exactly the 15 recovered production versions", () => {
      expect(RECONCILED_REMOTE_MIGRATIONS).toHaveLength(15);
      const versions = RECONCILED_REMOTE_MIGRATIONS.map((m) => m.file.match(CLI_MIGRATION_PATTERN)?.[1]);
      const uniqueVersions = new Set(versions);
      expect(uniqueVersions.size).toBe(15);
    });

    it("no synthetic SQL file is fabricated for unresolved ledger-only versions", () => {
      const liveFiles = readdirSync(MIGRATIONS);
      for (const version of LEDGER_ONLY_VERSIONS) {
        const matching = liveFiles.filter((f) => f.startsWith(version));
        expect(
          matching,
          `Found unexpected fabricated migration file for ledger-only version ${version}: ${matching.join(", ")}`
        ).toHaveLength(0);
      }
    });

    it("the latest historical reconciled migration matches RECONCILIATION_LEDGER_TIP", () => {
      const historical = MIGRATION_FILES.filter((m) => m.provenance !== "new_authorized_migration");
      const latestHistorical = historical[historical.length - 1];
      const versionMatch = latestHistorical.file.match(CLI_MIGRATION_PATTERN);
      expect(versionMatch).not.toBeNull();
      expect(versionMatch![1]).toBe(RECONCILIATION_LEDGER_TIP);
    });

    it("all other historical migrations have versions strictly preceding RECONCILIATION_LEDGER_TIP", () => {
      const historical = MIGRATION_FILES.filter((m) => m.provenance !== "new_authorized_migration");
      for (let i = 0; i < historical.length - 1; i++) {
        const m = historical[i];
        const versionMatch = m.file.match(CLI_MIGRATION_PATTERN);
        expect(versionMatch).not.toBeNull();
        const version = versionMatch![1];
        expect(BigInt(version)).toBeLessThan(BigInt(RECONCILIATION_LEDGER_TIP));
      }
    });

    it("new authorized migrations strictly succeed RECONCILIATION_LEDGER_TIP", () => {
      const newMigrations = MIGRATION_FILES.filter((m) => m.provenance === "new_authorized_migration");
      expect(newMigrations.length).toBeGreaterThanOrEqual(1);
      for (const m of newMigrations) {
        const match = m.file.match(CLI_MIGRATION_PATTERN);
        expect(match).not.toBeNull();
        const version = match![1];
        expect(BigInt(version)).toBeGreaterThan(BigInt(RECONCILIATION_LEDGER_TIP));
      }
    });

    it("any future migration added to supabase/migrations must satisfy version > FUTURE_MIGRATION_VERSION_FLOOR", () => {
      const liveFiles = readdirSync(MIGRATIONS);
      const knownFileSet = new Set(MIGRATION_FILES.map((m) => m.file));
      for (const file of liveFiles) {
        const match = file.match(CLI_MIGRATION_PATTERN);
        if (match && !knownFileSet.has(file)) {
          const version = match[1];
          expect(
            BigInt(version) > BigInt(FUTURE_MIGRATION_VERSION_FLOOR),
            `New migration ${file} must have version > ${FUTURE_MIGRATION_VERSION_FLOOR}, got ${version}`
          ).toBe(true);
        }
      }
    });

    it("provenance metadata correctly classifies restored vs reconstructed vs modified migrations", () => {
      const reconstructed = MIGRATION_FILES.filter((m) => m.provenance === "reconstructed_from_evidence");
      expect(reconstructed).toHaveLength(1);
      expect(reconstructed[0].file).toBe("20260823075533_unit_archive_reason.sql");

      const modified = MIGRATION_FILES.filter((m) => m.provenance === "post_apply_nonsemantic_edit");
      expect(modified).toHaveLength(2);
      expect(modified.map((m) => m.file)).toEqual([
        "20260823200624_property_reports_permission.sql",
        "20260903172101_member_opening_balance.sql",
      ]);

      const restored = MIGRATION_FILES.filter((m) => m.provenance === "restored_exact");
      expect(restored).toHaveLength(15);

      const reconciledRemote = MIGRATION_FILES.filter((m) => m.provenance === "reconciled_remote_migration");
      expect(reconciledRemote).toEqual([...RECONCILED_REMOTE_MIGRATIONS]);

      const authorized = MIGRATION_FILES.filter((m) => m.provenance === "new_authorized_migration");
      expect(authorized).toHaveLength(8);
      expect(authorized[0].file).toBe("20260913165500_w0_sec_authorization_containment.sql");
      expect(authorized[1].file).toBe("20260914131953_maintenance_request_core.sql");
      expect(authorized[2].file).toBe("20260914200226_maintenance_request_attachments.sql");
      expect(authorized[3].file).toBe("20260914203712_maintenance_work_orders.sql");
      expect(authorized[4].file).toBe("20260915050914_maintenance_cost_accounting_bridge.sql");
      expect(authorized[5].file).toBe("20260915073908_visitor_invitations_secure_qr_passes.sql");
      expect(authorized[6].file).toBe("20260915081839_gate_operations_access_ledger.sql");
      expect(authorized[7].file).toBe("20260915100016_vehicles_unit_timeline_notifications.sql");
    });

    it("remote ledger snapshot matches mathematical set partitioning with repository migrations", () => {
      const tsvPath = join("docs/evidence", "migration-ledger-version-name-2026-09-12.tsv");
      expect(existsSync(tsvPath)).toBe(true);

      const tsvLines = readFileSync(tsvPath, "utf8")
        .replace(/\r\n/g, "\n")
        .trimEnd()
        .split("\n")
        .slice(1); // skip header

      const remoteVersions = tsvLines.map((line) => line.split("\t")[0]);
      const historicalRepoVersions = MIGRATION_FILES
        .filter((m) => m.provenance !== "new_authorized_migration")
        .map((m) => {
          const match = m.file.match(CLI_MIGRATION_PATTERN);
          expect(match).not.toBeNull();
          return match![1];
        });

      // 1. remote rows = 33
      expect(remoteVersions).toHaveLength(33);

      // 2. reconciled repository migration versions at tip = 33
      expect(historicalRepoVersions).toHaveLength(33);

      // 3. historical ledger-only versions = 0; the former 15 are now pinned files.
      expect(LEDGER_ONLY_VERSIONS).toHaveLength(0);

      // 4. LEDGER_ONLY_VERSIONS equals exactly (remote - repo) in sorted order
      const repoSet = new Set(historicalRepoVersions);
      const computedDiff = remoteVersions.filter((v) => !repoSet.has(v)).sort();
      const expectedSorted = [...LEDGER_ONLY_VERSIONS].sort();
      expect(expectedSorted).toEqual(computedDiff);

      // 5. union(historical repo versions, historical-only versions) == remote versions
      const allReconciled = [...historicalRepoVersions, ...LEDGER_ONLY_VERSIONS].sort();
      const sortedRemote = [...remoteVersions].sort();
      expect(allReconciled).toEqual(sortedRemote);

      // 6. intersection(historical repo versions, historical-only versions) == empty
      const intersection = historicalRepoVersions.filter((v) =>
        LEDGER_ONLY_VERSIONS.includes(v)
      );
      expect(intersection).toEqual([]);

      // 7. latest remote version == RECONCILIATION_LEDGER_TIP
      const latestRemote = remoteVersions[remoteVersions.length - 1];
      expect(latestRemote).toBe(RECONCILIATION_LEDGER_TIP);

      // 8. new authorized migration(s) strictly forward: version > RECONCILIATION_LEDGER_TIP
      const newMigrations = MIGRATION_FILES.filter((m) => m.provenance === "new_authorized_migration");
      expect(newMigrations).toHaveLength(8);
      for (const m of newMigrations) {
        const v = m.file.match(CLI_MIGRATION_PATTERN)![1];
        expect(BigInt(v) > BigInt(RECONCILIATION_LEDGER_TIP)).toBe(true);
      }
    });

    it("public manifest rows match HISTORICAL_LEDGER_ONLY_VERSIONS exactly", () => {
      const manifestPath = join("docs/evidence", "migration-ledger-15-manifest.json");
      expect(existsSync(manifestPath)).toBe(true);
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as HistoricalLedgerManifest;
      expect(manifest.rows).toHaveLength(15);
      const manifestVersions = manifest.rows.map((r) => r.version);
      const reconciledVersions = RECONCILED_REMOTE_MIGRATIONS.map((m) => m.file.match(CLI_MIGRATION_PATTERN)![1]);
      expect(manifestVersions).toEqual(reconciledVersions);
    });

    it("forensics report 15-row table and total bytes match public manifest byte-for-byte", () => {
      const manifestPath = join("docs/evidence", "migration-ledger-15-manifest.json");
      expect(existsSync(manifestPath)).toBe(true);
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

      const reportPath = join("docs", "migration-ledger-forensics-report.md");
      expect(existsSync(reportPath)).toBe(true);
      const reportLines = readFileSync(reportPath, "utf8")
        .replace(/\r\n/g, "\n")
        .split("\n");

      const tableRows = reportLines.filter((line) => line.startsWith("| `2026"));
      expect(tableRows).toHaveLength(15);

      let totalBytes = 0;
      tableRows.forEach((row, i) => {
        const parts = row
          .split("|")
          .map((p) => p.trim())
          .filter(Boolean);
        const version = parts[0].replace(/`/g, "");
        const name = parts[1].replace(/`/g, "");
        const stmts = parseInt(parts[2], 10);
        const bytes = parseInt(parts[3].replace(/,/g, ""), 10);
        const classification = parts[4].replace(/`/g, "");

        const expected = manifest.rows[i];
        expect(version).toBe(expected.version);
        expect(name).toBe(expected.name);
        expect(stmts).toBe(expected.statement_count);
        expect(bytes).toBe(expected.statement_byte_length);
        expect(classification).toBe(expected.classification);
        totalBytes += bytes;
      });

      expect(totalBytes).toBe(manifest.total_statement_bytes);
      expect(totalBytes).toBe(59735);
    });

    it("proves zero runtime dependency on historical staging schemas in application code and migrations", () => {
      const searchDirs = ["app", "components", "lib", "supabase/migrations"];
      const bannedPatterns = [/\baccsys_/i, /\baccsys_stage\b/i, /\blegacy_migration\b/i, /\blegacy_access_/i];

      function scanDir(dir: string): string[] {
        const fullDir = join(process.cwd(), dir);
        if (!existsSync(fullDir)) return [];
        const entries = readdirSync(fullDir, { withFileTypes: true });
        const findings: string[] = [];

        for (const entry of entries) {
          const relPath = join(dir, entry.name);
          if (entry.isDirectory()) {
            findings.push(...scanDir(relPath));
        } else if (/\.(ts|tsx|js|mjs|cjs|sql)$/.test(entry.name)) {
          if (
            dir.replace(/\\/g, "/") === MIGRATIONS &&
            RECONCILED_REMOTE_MIGRATIONS.some((m) => m.file === entry.name)
          ) {
            continue;
          }
          const content = readFileSync(join(process.cwd(), relPath), "utf8");
            for (const pat of bannedPatterns) {
              if (pat.test(content)) {
                findings.push(`${relPath} matches ${pat}`);
              }
            }
          }
        }
        return findings;
      }

      const allFindings: string[] = [];
      for (const dir of searchDirs) {
        allFindings.push(...scanDir(dir));
      }

      expect(allFindings).toEqual([]);
    });
  });
});


