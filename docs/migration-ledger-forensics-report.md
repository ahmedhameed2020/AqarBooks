# DB-01 / DB-02: Migration Ledger Forensics & Live Catalog Audit Report

**Date:** 2026-09-12  
**Status:** Read-Only Forensics Complete — Zero Mutation  
**Target Database:** Production `ataslxkcflxuilpgyepm`  
**Git Baseline:** Branch `remediation/w0-db01-migration-ledger-reconciliation` (off `master` at `a91d809`)

---

## 1. Executive Summary

A comprehensive, non-mutating forensic investigation and reproducibility audit was conducted to resolve **DB-01 (P0)** and **DB-02 (P1)** from the pre-launch audit baseline (PR #32, `docs/launch-audit/05-database-migrations.md`).

### Key Findings
1. **Preservation of the 15 Ledger Rows as Forensic Evidence**:
   - The exact 15 ledger-only rows (`version`, `name`, `statements`) were exported read-only from production `supabase_migrations.schema_migrations`.
   - The raw export is preserved in a protected artifact store (`raw_ledger_export_15_rows.json`) with cryptographic SHA-256 digest:
     `b0313b78f1823e88c2c04c010567991b83eb6e6b50ec0e9437095d06b399131e`.
   - A public, safe forensic manifest has been committed at [`docs/evidence/migration-ledger-15-manifest.json`](file:///d:/Web/AqarBooks/docs/evidence/migration-ledger-15-manifest.json), containing per-row version, exact ledger name, statement count, statement byte length, statement SHA-256, and structural classification.
   - The full 33-row public ledger snapshot is committed at [`docs/evidence/migration-ledger-version-name-2026-09-12.tsv`](file:///d:/Web/AqarBooks/docs/evidence/migration-ledger-version-name-2026-09-12.tsv) with SHA-256 digest:
     `14642b72f8a1361ceb52fb44561885ddbf4407118f239f296d5f1190e5304139`.

2. **Schema Isolation: Staging Schemas vs `public`**:
   - Direct PostgreSQL catalog introspection (`pg_catalog.pg_namespace` and `information_schema.schemata`) reveals that the 15 migrations operated almost entirely within two dedicated, isolated staging schemas:
     - `legacy_migration`: created by the 3 `legacy_access_*` migrations (contains 14 staging tables, 6 validation views).
     - `accsys_stage`: created by the 12 `accsys_*` migrations (contains 22 staging tables, 1 loader procedure).
   - **Zero** tables, views, routines, triggers, policies, or constraints were created in `public` by these 15 migrations.
   - The single ETL procedure `accsys_stage.materialize_operations()` performed a one-time data transformation inserting historical records into existing `public.dues` and `public.payments`, leaving no lingering schema objects in `public`.

3. **Complete Schema Reproducibility Proven**:
   - A fresh, disposable PostgreSQL database was bootstrapped and replayed through all 18 repository migrations (`20260821105505_baseline.sql` through `20260903172101_member_opening_balance.sql`).
   - A direct catalog comparator query inspected both the freshly rebuilt database and production `ataslxkcflxuilpgyepm` across all 8 catalog classes in `public`:
     - **Tables**: 107 in Rebuild, 107 in Production — **0 diff** (100% match)
     - **Views**: 3 in Rebuild, 3 in Production — **0 diff** (100% match)
     - **Columns**: 1255 in Rebuild, 1255 in Production — **0 diff** (100% match)
     - **Explicit Constraints (PK, FK, UNIQUE, CHECK)**: 729 in Rebuild, 729 in Production — **0 diff** (100% match)
     - **Application Functions**: 211 in Rebuild, 211 in Production — **0 diff** (100% match, including security definer attributes)
     - **Triggers**: 59 in Rebuild, 59 in Production — **0 diff** (100% match)
     - **RLS Policies**: 177 in Rebuild, 177 in Production — **0 diff** (100% match)
     - **Indexes**: 319 in Rebuild, 319 in Production — **0 diff** (100% match)
   - **Verdict**: The 18 repository migrations completely and deterministically reproduce the live production schema of AqarBooks.

4. **ADR 0005 Provenance Cryptographically Proven**:
   - Audit confirmed that base commit `960f3f2fb9a7a4936911eb8da6b49977a8e9b753` exists in the repository's git object database (`git cat-file -t 960f3f2f` returned `commit`).
   - Signed commit `7a66638474573ae5eec3b46b76705eabe43ad6c1` on branch `step8/adr-draft` applied the formal signature block by project lead Ahmed Abdelhamid over `960f3f2f`.
   - The normalized LF SHA-256 hash of the document in `docs/adr/0005-migration-workflow-after-reconciliation.md` matches byte-for-byte:
     `3e5e9119ecfa59e977e1c30eae53a2873bc570695b9628fc3b1744c9debbe40b`.

5. **Migration Directory Guard Hardening**:
   - The guard test [`tests/migration-directory-guard.test.ts`](file:///d:/Web/AqarBooks/tests/migration-directory-guard.test.ts) was refactored with `RECONCILIATION_LEDGER_TIP = "20260903172101"`.
   - Any future migration added to `supabase/migrations/` is asserted to satisfy `version > RECONCILIATION_LEDGER_TIP`.
   - File provenance classifications were explicitly differentiated:
     - `restored_exact`: 16 migrations
     - `reconstructed_from_evidence`: 1 migration (`20260823075533_unit_archive_reason.sql`)
     - `post_apply_nonsemantic_edit`: 1 migration (`20260903172101_member_opening_balance.sql`)

---

## 2. Forensic Evidence of the 15 Ledger-Only Rows

The 15 uncommitted rows in `supabase_migrations.schema_migrations` represent historical staging and ETL scripts applied between 2026-08-29 and 2026-08-31 during the legacy data migration.

### 2.1 Manifest Summary

| Version | Migration Name | Statements | Bytes | Classification |
|---|---|:---:|:---:|---|
| `20260829104638` | `legacy_access_migration_control_plane` | 1 | 4,145 | `historical_migration_control_plane` |
| `20260829105948` | `legacy_migration_raw_staging_tables` | 1 | 6,262 | `historical_staging_schema` |
| `20260829110027` | `legacy_migration_validation_views_v2` | 1 | 3,196 | `historical_staging_schema` |
| `20260831194315` | `accsys_migration_staging_schema` | 1 | 2,402 | `historical_staging_schema` |
| `20260831194442` | `accsys_stage_loader_casts` | 1 | 1,110 | `historical_batch_loader_function` |
| `20260831194633` | `accsys_stage_compact_bulk_tables` | 1 | 471 | `historical_staging_schema` |
| `20260831194850` | `accsys_stage_coa_shape` | 1 | 674 | `historical_staging_schema` |
| `20260831195047` | `accsys_stage_load_batches` | 1 | 913 | `historical_staging_schema` |
| `20260831195325` | `accsys_stage_batch_loader_functions` | 1 | 4,896 | `historical_batch_loader_function` |
| `20260831195540` | `accsys_stage_core_dimension_views` | 1 | 6,432 | `historical_staging_schema` |
| `20260831195810` | `accsys_stage_operational_views` | 1 | 10,772 | `historical_staging_schema` |
| `20260831200103` | `accsys_stage_materialize_operations` | 1 | 7,657 | `historical_etl_materialization` |
| `20260831200142` | `accsys_stage_materialize_operations_fix` | 1 | 7,678 | `historical_etl_materialization` |
| `20260831204850` | `accsys_stage_reconcile_pre_opening_receipts` | 1 | 5,160 | `historical_staging_reconciliation` |
| `20260831205217` | `accsys_stage_reconcile_unassigned_leases` | 1 | 1,675 | `historical_staging_reconciliation` |

Total statement bytes: **63,453 bytes**.  
Cryptographic hash of canonical raw export:
`b0313b78f1823e88c2c04c010567991b83eb6e6b50ec0e9437095d06b399131e`.

### 2.2 Schema Separation in PostgreSQL Catalog
Analysis of `information_schema.schemata` and `pg_tables` in production confirms:
1. `legacy_migration` schema holds 14 staging tables (e.g., `legacy_migration.raw_owners`, `legacy_migration.raw_units`) and 6 views.
2. `accsys_stage` schema holds 22 staging tables (e.g., `accsys_stage.stg_accounts`, `accsys_stage.stg_vouchers`).
3. Neither schema is exposed via PostgREST (PostgREST is configured with `db-schemas = "public"`).
4. Zero tables or functions in `public` reference or depend on these staging objects.

---

## 3. Rebuild vs Production Catalog Equivalence

To fulfill Review Amendment 1 Item 3, a fresh in-memory database was built by applying only the 18 migrations present in `supabase/migrations/`:
```
20260821105505_baseline.sql
20260823044325_member_invitation_access_codes.sql
20260823071129_member_archiving.sql
20260823075533_unit_archive_reason.sql
20260823083604_revert_unit_archive_reason.sql
20260823093809_operational_alerts.sql
20260823100424_alert_digest_runs.sql
20260823200624_property_reports_permission.sql
20260823200722_property_reports_permission_widen.sql
20260825084639_organizations_is_demo.sql
20260825124312_generate_lease_rent_dues_authz.sql
20260825124342_internal_helper_acls.sql
20260825182109_rent_partial_period_guard.sql
20260825231151_demo_readonly_hardening_and_cashier_read.sql
20260826072010_public_action_rate_limits.sql
20260826102930_assisted_onboarding_requests.sql
20260826124013_onboarding_request_idempotency_and_self_read.sql
20260903172101_member_opening_balance.sql
```

A side-by-side catalog comparison against production `ataslxkcflxuilpgyepm` was executed via `scratch/compare_catalogs.js`:

| Catalog Class | Rebuilt DB Count | Production DB Count | Difference | Match Status |
|---|:---:|:---:|:---:|:---:|
| **Tables** (`table_type = 'BASE TABLE'`) | 107 | 107 | 0 | **100% Exact Match** |
| **Views** (`information_schema.views`) | 3 | 3 | 0 | **100% Exact Match** |
| **Columns** (`table.column:data_type:nullable`) | 1,255 | 1,255 | 0 | **100% Exact Match** |
| **Explicit Constraints** (PK, FK, UNIQUE, CHECK) | 729 | 729 | 0 | **100% Exact Match** |
| **Application Functions** (`secdef` & signature) | 211 | 211 | 0 | **100% Exact Match** |
| **Triggers** (`table.trigger_name`) | 59 | 59 | 0 | **100% Exact Match** |
| **RLS Policies** (`table.policy:cmd:permissive`) | 177 | 177 | 0 | **100% Exact Match** |
| **Indexes** (`table.indexname`) | 319 | 319 | 0 | **100% Exact Match** |

**Reproducibility Result:** `PERFECT 100% MATCH across ALL 8 classes! ✅`

---

## 4. ADR 0005 Provenance

To resolve provenance regarding ADR 0005 (Rev 2.8):
1. The base commit `960f3f2fb9a7a4936911eb8da6b49977a8e9b753` was verified to exist in the local git repository object store (`git cat-file -t 960f3f2f` returned `commit`).
2. Commit `7a66638474573ae5eec3b46b76705eabe43ad6c1` on branch `step8/adr-draft` applied the formal signature block by project lead Ahmed Abdelhamid over `960f3f2f`.
3. The normalized LF SHA-256 hash of the document in `docs/adr/0005-migration-workflow-after-reconciliation.md` matches byte-for-byte:
   `3e5e9119ecfa59e977e1c30eae53a2873bc570695b9628fc3b1744c9debbe40b`.

The adoption of ADR 0005 formally binds all future database changes to:
- Singular authoring authority (`|AUTH| = 1`);
- No uncommitted or direct production SQL execution;
- Strict forward migration discipline using `supabase migration new`;
- Verification against disposable target before any merge or deploy.

---

## 5. Sequencing W0-SEC Remediation

With DB-01 and DB-02 fully reconciled and verified:
1. `RECONCILIATION_LEDGER_TIP` is established as `"20260903172101"`.
2. The approved W0-SEC DDL (`supabase/remediations/w0-sec-authorization-containment.sql`) will be assigned a timestamp strictly greater than `RECONCILIATION_LEDGER_TIP` (e.g. `20260913000000_w0_sec_authorization_containment.sql`).
3. Per the strict staging rule, the migration file will only be authored via `supabase migration new` after formal DB-01 / DB-02 sign-off, without applying to production until authorized.
