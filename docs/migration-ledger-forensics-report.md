# DB-01 / DB-02: Migration Ledger Forensics & Live Catalog Audit Report

**Date:** 2026-09-12  
**Status:** Read-Only Forensics Complete — Zero Mutation  
**Target Database:** Production `ataslxkcflxuilpgyepm`  
**Git Baseline:** Branch `remediation/w0-db01-migration-ledger-reconciliation` (off `master` at `a91d809`)

---

## 1. Executive Summary

A comprehensive, non-mutating forensic investigation was conducted to resolve **DB-01 (P0)** and **DB-02 (P1)** from the pre-launch audit baseline (PR #32, `docs/launch-audit/05-database-migrations.md`).

### Key Findings
1. **Zero Git Trace**:
   - An exhaustive scan across 104 dangling commits, 3,166 dangling blobs (`git fsck --lost-found`), all 33 PRs, remote branches, and reflogs confirmed that the 15 missing migration files (`20260829104638..20260831205217`: `legacy_access_*` and `accsys_*`) were **never committed to any git ref**.
2. **Zero Live Schema Presence in `public`**:
   - Introspection of the live PostgREST schema definitions (110 definitions total) and the complete PostgreSQL function inventory (211 functions via `security_function_grant_inventory`) confirmed that **zero tables, zero views, and zero routines** corresponding to `legacy_access_*` or `accsys_*` exist in the `public` schema of `ataslxkcflxuilpgyepm`.
3. **Complete Ledger Parity of Core Domain**:
   - The live database's 110 schema definitions map 1-to-1 with:
     - The 104 baseline tables/views established on 2026-08-21;
     - The 3 views (`members_with_financials`, `units_with_financials`, `resorts`);
     - The 3 tables introduced by post-baseline migrations through 2026-08-26 (`public_action_rate_limits`, `onboarding_requests`, `onboarding_request_events`).
4. **Ledger Status**:
   - The 15 versions in `supabase_migrations.schema_migrations` are historical applied records from the August 29–31 staging/ETL imports.
   - Because they are recorded as applied, the Supabase CLI will never attempt to re-execute them.

---

## 2. Live Catalog Discovery & Verification

### 2.1 PostgREST OpenAPI Introspection
Querying `GET https://ataslxkcflxuilpgyepm.supabase.co/rest/v1/` with the service-role key returned:
- **Total Definitions**: 110 tables and views.
- **Legacy / Accsys Matches**: 0 definitions found.
- **Probe of 25 Suspected Candidate Names**: All 25 returned `PGRST205: Could not find the table in the schema cache`.

### 2.2 Function & RPC Inventory
Querying `security_function_grant_inventory` returned:
- **Total Routines**: 211 functions.
- **Legacy / Accsys Matches**: 0 functions found.
- The 211 functions exactly match the expected count from the baseline plus post-baseline migrations (up to `20260903172101_member_opening_balance.sql`).

### 2.3 Table Classification Mapping Comparison
Comparing live definitions against `lib/backup/table-classification.ts` (104 tables mapped on 2026-08-24):
- **Missing Tables**: 0 (all 104 mapped tables exist).
- **Additional Definitions**: Exactly 6 items:
  1. `members_with_financials` (baseline view)
  2. `units_with_financials` (baseline view)
  3. `resorts` (Phase 2a compatibility view)
  4. `public_action_rate_limits` (migration `20260826072010`)
  5. `onboarding_requests` (migration `20260826102930`)
  6. `onboarding_request_events` (migration `20260826102930`)

**Conclusion:** The live database catalog is completely clean of any lingering `accsys_*` or `legacy_access_*` schema objects in `public`.

---

## 3. Discrepancy Breakdown

| Migration Range | Description | In Repo (`supabase/migrations`) | In DB Ledger (`schema_migrations`) | Objects Live in `public` |
|---|---|---|---|---|
| `20260821105505` | Squashed Baseline | ✅ Yes (1 file) | ✅ Yes | ✅ 101 tables + 3 views |
| `20260823044325` .. `20260826072010` | Post-baseline migrations | ✅ Yes (14 files) | ✅ Yes | ✅ All objects present |
| `20260826102930` .. `20260826124013` | Assisted onboarding | ✅ Yes (2 files, PR #31) | ✅ Yes | ✅ `onboarding_requests*` |
| `20260829104638` .. `20260829110027` | Legacy Access Migration (3 rows) | ❌ No | ✅ Yes | ❌ None |
| `20260831194315` .. `20260831205217` | AccSys Staging/Loader (12 rows) | ❌ No | ✅ Yes | ❌ None |
| `20260903172101` | Member Opening Balance | ✅ Yes (1 file, PR #30) | ✅ Yes | ✅ `OPENING_BALANCE` enum |

Total files in repo: **18**  
Total rows in database ledger: **33** (18 in repo + 15 ledger-only rows)

---

## 4. Architectural & Safety Principles

### "Restored, Not Reconstructed"
Per ADR 0004 and the repository's established standards, the migration directory guard (`tests/migration-directory-guard.test.ts`) strictly forbids inventing SQL files whose digests attest to text nobody actually ran.

Because:
1. No git commit ever contained the SQL for these 15 migrations;
2. No live schema objects exist in production for these 15 migrations;
3. The migrations were temporary ETL/staging tools used once during August data migration;

Fabricating 15 synthetic `.sql` files with placeholder or guessed SQL would create false cryptographic attestation and violate the project's integrity standard.

---

## 5. Recommended Reconciliation Strategy

1. **Formalize Historical Ledger Exception**:
   - Update `tests/migration-directory-guard.test.ts` (Seventh Amendment) to explicitly document the 15 ledger-only rows as an immutable historical record.
   - Assert that the repository contains exactly the 18 verified, live-describing migration files.
   - Assert that any future migration must strictly follow a version timestamp greater than the latest ledger version (`> 20260903172101`).
2. **Adopt ADR 0005**:
   - Bring the signed ADR 0005 Rev 2.8 (`docs/adr/0005-migration-workflow-after-reconciliation.md`, signed by Ahmed Abdelhamid on 2026-08-22) into `master`.
   - This formally binds the team to strict migration discipline: `|AUTH| = 1`, no manual SQL edits on production, preflight/postflight verification, and compensating migrations.
3. **Sequencing W0-SEC DDL**:
   - The approved W0-SEC DDL (`supabase/remediations/w0-sec-authorization-containment.sql`) can now be assigned a deterministic version timestamp:
     `20260912190000_w0_sec_authorization_containment.sql`
   - This timestamp is strictly greater than both `20260831205217` (last accsys migration) and `20260903172101` (member opening balance), ensuring zero ledger collision.
