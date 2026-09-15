# 05 — Database Schema & Migration Drift

Audit of commit `a91d809` (master). Read-only; no database was contacted. **The live production ledger (`supabase_migrations.schema_migrations`) could not be read in this session**: the production project (ref in `.env.production`) is not attached to the available Supabase connection, and the one attached AqarBooks project (a staging project) is INACTIVE. Every "applied" status below is what the repository itself records, and is marked accordingly.

## 1. Migration Drift Report

### 1.1 Files in `supabase/migrations/` (18)
All 18 files match the byte size and SHA-256 pinned in `tests/migration-directory-guard.test.ts:66-84` (recomputed locally, 0 mismatches). `supabase/baseline/*.sql` match `supabase/baseline/MANIFEST.md`.

| Version | Name | In repo | Applied — claimed by | Live ledger |
|---|---|---|---|---|
| 20260821105505 | baseline | yes | `supabase/migrations/README.md:41-58` (Step 7 cutover, re-measured 2026-08-22) | UNKNOWN — verification required |
| 20260823044325 | member_invitation_access_codes | yes | guard 2nd amendment; commit d52c9da | UNKNOWN |
| 20260823071129 | member_archiving | yes | same | UNKNOWN |
| 20260823075533 | unit_archive_reason | yes (**reconstructed** in d52c9da) | same | UNKNOWN |
| 20260823083604 | revert_unit_archive_reason | yes | same | UNKNOWN |
| 20260823093809 | operational_alerts | yes | same | UNKNOWN |
| 20260823100424 | alert_digest_runs | yes | same | UNKNOWN |
| 20260823200624 / 200722 | property_reports_permission (+widen) | yes | commit cfcc9de | UNKNOWN |
| 20260825084639 / 124312 / 124342 / 182109 | organizations_is_demo, lease-rent authz, internal helper ACLs, partial-period guard | yes (restored from `feat/public-demo-phase-1`) | guard 3rd amendment; commit 5285d87 | UNKNOWN |
| 20260825231151 | demo_readonly_hardening_and_cashier_read | yes | commit cb992bf | UNKNOWN |
| 20260826072010 | public_action_rate_limits | yes | guard 4th amendment; commit d63bdd4 | UNKNOWN |
| 20260826102930 / 124013 | assisted_onboarding_requests (+idempotency/self-read) | yes (restored from the PR #28 branch, byte-identical) | guard 6th amendment; commit 2a6d7d6 | UNKNOWN |
| 20260903172101 | member_opening_balance | yes (renamed by 12c778e; header edited after apply) | guard 5th amendment | UNKNOWN |

### 1.2 Applied but missing from the repository — **15 ledger rows with no file anywhere**
Source: `tests/migration-directory-guard.test.ts:108-116` and commit `2a6d7d6`: ledger rows `20260829104638 .. 20260831205217` ("the legacy-access control plane and the accsys_* staging series") exist in production with no file in any branch. Only the two endpoint versions are named anywhere in the repo; the 13 intermediate versions and all 15 names are unknown to the repository. `git log --all -S accsys` and `-S legacy_access` return only the guard comment and that commit. No SQL text for these objects exists in Git. The guard test's own comment states the session that wrote it could not read `schema_migrations.statements` to recover them.

**Unrecoverable schema-history gap: CONFIRMED at repository level.** Whatever tables, functions, policies and grants those 15 migrations created exist only in the live database and in the ledger's `statements` column. Production cannot be rebuilt from Git; a future ledger rewrite (like the 2026-08-21 cutover) would erase the only copy.

Mitigating evidence: an extraction of every `.rpc("name")` (109 distinct) and `.from("table")` (79 distinct) literal in `lib/` and `app/` shows **all 109 RPCs are defined** in the 18 migration files, and only 3 tables are undefined (`ai_audit_logs`, `ai_human_corrections`, `tenant_accounting_policies`, see DB-06). The application on master therefore does not depend on objects the missing migrations created — the gap is a reproducibility and governance problem, not a runtime one for this codebase.

### 1.3 Pre-cutover ledger (143 rows)
`supabase/migrations-archive/ledger-2026-08-21.tsv` (144 lines incl. header). Superseded: deleted and replaced by the single baseline row on 2026-08-21. 35 of those rows never had a repo file of that name (archive `MANIFEST.md`).

### 1.4 Archive (228 files)
`supabase/migrations-archive/2026-08-21-pre-squash/`: historical evidence only; 221 CLI-parseable, 7 not; 107 applied-by-name, 120 without a ledger row, 1 not a migration. Nine true CLI-visible version collisions (`20260811000007`, `20260812000001/2/3`, `20260813000004`, `20260816000001` ×3, `20260819000001`, `20260831000001`, `20260831000002`). Seven CLI-invisible filenames (`…b_`/`…c_` suffixes, `seed-platform-admin.sql`). Future-dated authoring versions (`20260901000001…20260930000007`) would interleave with real versions if ever copied back.

## 2. Ordering and reproducibility
Filenames strictly increasing. Dependency check of the 17 post-baseline files: `083604`→`075533` column; `093809/100424`→`is_org_member`; `200722`→permission row from `200624`; `124342/231151`→`organizations.is_demo` from `084639` (231151 re-adds it idempotently); `182109`→authz block from `124312`; `102930`→`clone_tenant_role_templates`, `is_platform_admin`, and the revoke in `231151`; `124013`→`onboarding_requests`; `172101` drops/recreates `dues_source_type_check` (baseline:11807) and `check_audit_action` (baseline:12041). All nine helper functions referenced are defined in the baseline. None references `legacy_import`/`accsys`. Cosmetic: `20260823083604:1` cites the pre-rename name `20260823000003`.

Fresh-database replay is expected to work in order, with these non-idempotent spots on re-application: `CREATE POLICY` (no IF NOT EXISTS in Postgres) in 093809/100424/102930/124013; permission INSERTs in 200624/200722.

`lib/supabase/types.ts` drift (ticket `docs/tickets/supabase-types-regeneration.md` open since 2026-08-18): 13 migration tables absent (`coa_template_accounts, document_sequences, lease_rent_generation_runs, onboarding_request_events, onboarding_requests, online_payment_transaction_allocations, payment_provider_settings, public_action_rate_limits, resort_memberships, role_template_permissions, role_templates, tenant_branding, tenant_feature_flags`); 64 functions absent (incl. `approve_onboarding_request`, `reject_onboarding_request`, `void_payment`, `verify_financial_audit_chain`); phantoms with no migration: table `supplier_invoice_attachments`, functions `create_bank`, `create_bank_account`, `issue_due`.

## 3. Re-application safety and destructive statements
8/17 files wrap in `BEGIN…COMMIT` (044325, 071129, 093809, 200624, 200722, 084639, 124342, 172101); the other 9 rely on `apply_migration`'s implicit transaction.

| File | Destructive statements (all guarded) |
|---|---|
| 044325 | `drop function if exists create_member_invitation(uuid)` :47; `accept_member_invitation` two signatures :149-150 (replacement) |
| 083604 | `alter table units drop column if exists archive_reason` :13 (column verified empty per header :10) |
| 084639 | `drop trigger if exists trg_organizations_is_demo_immutable` :193, recreated |
| 231151 | `drop policy if exists` ×4 (:62, :75, :121, :122), recreated |
| 072010 | `delete from public_action_rate_limits` :91 — inside the function (TTL purge), not migration-time |
| 172101 | `drop constraint if exists dues_source_type_check` :54, `check_audit_action` :64, both re-added widened |
No `TRUNCATE`, no unguarded `DROP TABLE`, no migration-time data deletes. `231151:53-54` grants EXECUTE to **anon** on `is_demo_organization`, `is_demo_principal` (intentional; not reflected in the security guard allowlist — see SEC-03).

## 4. Duplicates, renames, malformed names
Current directory: 18 unique versions, no duplicates. Renames/restores in history: `12c778e` (opening balance renamed to its ledger version; header note added after apply), `d52c9da` (6 files from `migrations-pending/` with invented `20260823000001-6` names renamed to ledger versions; one reconstructed), `5285d87` (4 restored), `2a6d7d6` (2 restored).

## 5. Baseline schema quality (`20260821105505_baseline.sql`, 21,847 lines)
| Object | Count |
|---|---|
| Tables | 101 (107 after post-baseline) — 101/101 RLS enabled |
| Functions | 203 (211 names after post-baseline); `SECURITY DEFINER` occurrences 179 |
| Triggers 49 · Policies 167 · Views 3 (all `security_invoker=true`) · Extensions 5 | |
| UNIQUE constraints / unique indexes | 57 / 20 · EXCLUDE 2 |
| Inline CHECK 264 · FKs 342 (79 are `organization_id → organizations ON DELETE CASCADE`) · Indexes 143 | |

79 tables carry `organization_id`; all 79 have the FK; 65 have an org-leading index; **14 do not**: `bank_statement_lines, banks, buildings, cash_transactions, cashboxes, document_sequences (covered by UNIQUE), due_generation_runs, einvoice_submission_attempts, lease_rent_generation_runs, service_charge_allocations, unit_handover_snags, unit_ownerships, units, zones`.

Critical tables:
| Table | Unique / natural keys | Gaps |
|---|---|---|
| `dues` | none; `idx_dues_source(source_type,source_id)` non-unique; CHECKs amount>0, due≥issue, enums | no DB natural key (period uniqueness lives in function logic) |
| `payments` | `(org, idempotency_key)`, `(org, receipt_number)`, `(org, receipt_no)` partial uniques; amount/method/status/reversal CHECKs | two receipt columns (`receipt_number bigint` written by `record_payment` B:6749-6757; `receipt_no text` legacy; app refs 26 vs 11) |
| `payment_allocations` | none (non-unique idx on due_id/payment_id ± reversed_at) | no `organization_id`; no unique on active (payment_id, due_id) |
| `journal_entries` | `(org, idempotency_key)` UNIQUE, `(org, entry_number)` partial unique | — |
| `journal_entry_lines` | `(journal_entry_id, line_number)` UNIQUE | no org column |
| `receipts` | table does not exist (receipts = payments rows) | — |
| `cashier_sessions` | one OPEN per cashbox partial unique | `cash_transactions` no org index |
| `organizations` | `slug` UNIQUE | — |
| `organization_memberships` | `(org, user_id)` UNIQUE | — |
| `members` | `user_id` UNIQUE globally (B:13869) | one login ↔ one org |
| `units` | `(property_id, code)` UNIQUE | no org index |
| `unit_ownerships` | none (share 0<x≤100, end≥start CHECKs) | duplicate/overlapping ownership and >100 % aggregate not prevented |
| `unit_leases` | EXCLUDE no-overlap active | — |
| `document_sequences` | `UNIQUE NULLS NOT DISTINCT (org, property_id, sequence_type)` | — |
| `onboarding_requests` | partial unique `one_actionable_per_requester` (124013:24); status/plan CHECKs; RLS admin + self | fine |

## 6. `db push` prohibition, the guard test, and today's de-facto process
ADR 0004 bans `supabase db push` against production; its 2026-08-22 amendment states the condition was met by the Step 7 cutover but the ban stands until a successor ADR is signed — **not signed as of this audit** (`docs/adr/` has 0001-0004 and 0006 only). No CI workflow runs any Supabase command; `scripts/guard-deploy.mjs` gates only Cloudflare deploys.

De-facto process reconstructed from guard amendments and commits d52c9da/5285d87/12c778e/2a6d7d6: (1) author SQL on a branch; (2) apply to **production** with MCP `apply_migration` (server assigns the version, writes ledger row + `statements`, no file); (3) hand-copy the file into `supabase/migrations/` under that version; (4) add `{file, bytes, sha256}` to the guard and update the security allowlist if grants/RLS/SECDEF changed; (5) commit and merge.

Risks: the database moves before the repo (four recorded drift incidents); the guard reads the filesystem only and cannot see ledger-only rows; nothing prevents applying from an unmerged branch (2 of 4 incidents); no staging step (`test:all` writes to production per `docs/security-remediation-2026-08-20.md` §7 and `deploy.yml`); `config.toml` has no `[db] major_version`; the digest attests to committed text, which in 12c778e differs from the applied text.

## 7. Findings
| ID | Sev | Finding |
|---|---|---|
| DB-01 | **P0** | 15 applied migrations (`20260829104638..20260831205217`) exist in no git ref; their DDL is unrecoverable from the repository. Production cannot be rebuilt from Git. Evidence: guard test :108-116; commit 2a6d7d6; `git log --all -S`. Direction: export `version,name,statements` for those rows now into a protected artifact; restore as files only when byte-verifiable; add a ledger-vs-filesystem integration test. |
| DB-02 | **P1** | Live ledger unverifiable in this session; all "applied" claims rest on documentation last measured 2026-09-07, which already showed ledger > repo. Direction: read-only `select version,name from supabase_migrations.schema_migrations` and attach to the launch record. |
| DB-03 | **P1** | Apply-first/file-later process structurally produces drift; successor ADR to 0004 unsigned since 2026-08-22. Direction: sign the ADR; file merged before apply; apply via preview branch in CI; restrict `apply_migration` against the production project id. |
| DB-04 | P2 | Stale docs/headers: `supabase/migrations/README.md:3` "exactly one migration" (18 exist) and :81-84; baseline header cites non-existent `scripts/generate-baseline-migration`; `20260823083604:1`; `types.ts:2667-2668`; `tests/payments/payment-provider-verification-race.test.ts:4`. |
| DB-05 | P2 | `types.ts` drift: 13 tables + 64 functions missing; 4 phantoms. Ticket open since 2026-08-18. |
| DB-06 | P2 | App targets 3 non-existent tables (`lib/ai/governance.ts:50,74`, `lib/ai/policy-memory.ts:13`) with `(supabase as any)` inside `try/catch`; supabase-js returns errors rather than throwing, so the AI audit trail is never written and nothing reports it. |
| DB-07 | P2 | Archive: 9 version collisions, 7 CLI-invisible names, future-dated versions; protection depends solely on the guard test and the CLI ignoring subdirectories. |
| DB-08 | P2 | Schema integrity gaps: `unit_ownerships` no uniqueness; `payment_allocations` no org column / unique; `dues` no natural key; 14 org tables without org index; dual receipt columns on `payments`. Evidence: baseline 11681-11690, 12422-12431, 14245, 14313-14325, 14573-14601, 14753-14765. |
| DB-09 | P3 | One pinned file reconstructed (`20260823075533`, d52c9da), one edited after apply (`20260903172101`, 12c778e) contradict the guard's "restored, not reconstructed" standard; record as exceptions and verify against `statements` when exported. |
| DB-10 | P3 | Anon EXECUTE on two demo helpers; 9 non-transactional files; unguarded `CREATE POLICY`. |
| DB-11 | P3 | `members.user_id` globally unique (B:13869): one auth user cannot be an owner in two organizations. Product decision. |
| DB-12 | P3 | `supabase/config.toml` lacks `[db] major_version`; baseline proven on PG 17.6. |
