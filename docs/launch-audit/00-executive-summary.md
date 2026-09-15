# 00 — Executive Summary: AqarBooks Pre-Launch Audit

**Repository:** `ahmedhameed2020/AqarBooks` · **Commit audited:** `a91d809` (master, 2026-09-07; currently deployed to production by Actions run #85) · **Audit date:** 2026-09-11 · **Branch used for reports:** `claude/beautiful-edison-8yg73p` (identical to master before this audit).

Method: read-only static tracing of UI → server action → RPC → RLS → tables → accounting effect → audit → reports, plus safe local validation (typecheck, lint, credential-free tests, OpenNext build, Wrangler dry-run), GitHub Actions history, and open-PR comparison. The production Supabase ledger was **not reachable** from this session; live-state items are marked UNKNOWN. At the owner's request the `codex/bagosh-staging-deploy` branch was excluded. No application code was modified; no migrations applied; nothing deployed or merged.

## Launch Verdict: **NO-GO**

AqarBooks is not ready to be sold to real customers or trusted with their financial data at this commit. The database design is comparatively strong (RLS on every table, permission-checked SECURITY DEFINER RPCs, balanced-posting guard, gap-free numbering, versioned immutable tax rules, idempotent online payments), but six release-stopping defects sit above and around it:

1. **Platform takeover from any tenant membership (SEC-01).** The tenant-admin role-change action authorizes on "has any membership row", then writes with the service-role client; the seeded global `PLATFORM_SUPER_ADMIN` role id is readable by everyone and `is_platform_admin` does not check the assignment's organization. Any tenant user — and the shared public-demo login if it is enabled — can become platform admin and read or mutate every tenant.
2. **Reversals corrupt every ledger report (ACC-02).** Reports filter `status = 'POSTED'`; reversal marks the original `REVERSED`, so trial balance, GL, P&L, balance sheet, cash flow and dashboard KPIs move by −1× instead of 0.
3. **Customer receipts cannot be voided (ACC-01/ACC-03).** `void_payment` always fails on an audit-action CHECK, never reverses the GL, and has no UI; the test suite asserts the failure.
4. **Production schema history is unrecoverable from Git (DB-01).** Fifteen applied migrations exist in no branch.
5. **No backup or restore exists beyond unverified provider defaults (DR-01).**
6. **Operational automation has never run (DEP-04).** The daily rent-generation and alert-digest jobs exit "green" every day because the cron secret was never configured.

Beyond these, there is no working customer signup path on master (the onboarding schema is live but its UI is only in unmerged PR #28), plans are marketing-only with zero enforcement, the marketing/pricing pages promise seven capabilities that have no code, and the integration test suites can only be run against production with a service-role key that creates and deletes rows.

## Scores (0–100)
| Area | Score | Basis |
|---|---|---|
| Architecture | 60 | Coherent layers (actions → SECDEF RPCs → RLS), but six independent balance formulas, business logic split across TS and SQL, dead routes/actions, stale docs |
| Security | 25 | Strong DB posture undone by service-role actions with no permission checks (SEC-01/02), open redirect, stale frozen-baseline guard not run in CI |
| Multi-Tenancy | 40 | 101/101 tables RLS, org-derived RPC checks; but SEC-01 breaks isolation completely, few cross-tenant tests |
| Accounting Integrity | 35 | Balanced posting and immutability enforced; reversal reporting, payment void, credit-note/collection reconciliation and audit coverage broken |
| Functional Completeness | 55 | Most finance modules wired; no due/payment reversal UI, no signup, AI governance cosmetic, Paymob UI-only |
| Database / Migrations | 30 | Proven baseline, but 15 applied migrations lost, apply-first process, stale README, types drift |
| Testing | 35 | Broad domain integration coverage for tax/FX/assets; placeholders in core pgTAP, no role-escalation/reversal/duplicate tests, suites target production, none in CI |
| SaaS Onboarding | 20 | Eight competing mechanisms; only manual admin provisioning works; plans unenforced |
| Deployment | 55 | Build and dry-run pass, CI deploys with smoke check; needs Workers Paid, no rollback, no staging, placeholder-env deploys, crons dead |
| Operations / Observability | 25 | No error reporting, no request ids, role changes unaudited, audit pages unfiltered, constant release SHA |
| Disaster Recovery | 10 | Decision logic only; drills not run; RPO/RTO undecided |
| **Overall Launch Readiness** | **30** | |

## Finding counts (deduplicated across auditors)
| Severity | Count |
|---|---|
| P0 | 6 |
| P1 | 35 |
| P2 | 53 |
| P3 | 31 |

## Top launch blockers
SEC-01 (platform takeover) · ACC-02 (reversal double-count) · ACC-01/ACC-03 (payment void impossible) · DB-01 (15 migrations lost) · DR-01 (no backup/restore) · DEP-04 (crons never ran).

## Highest-risk unknowns
Live migration ledger contents; whether the public demo is enabled in production; whether any production row already carries the platform role with an organization; Supabase PITR/backup tier and storage policies; Auth configuration (SMTP, redirect allow-list).

## Recommended remediation order
Wave 0: fix tenant-admin authorization and `is_platform_admin` → fix reversal report predicates → repair and expose payment void → export the lost migration statements and list the live ledger → enable PITR and run one restore drill → configure the cron secret. Wave 1 (before first paying customer): allocation/idempotency fixes, due void and credit-note reconciliation, single balance formula, audit-chain coverage, tests moved off production and into CI, decide and land PR #28 / close #19 and #29, AI route gating, rollback/health/staging, error reporting, pricing-claim cleanup. Detail in `11-remediation-plan.md`; objective gates in `12-launch-checklist.md`.

## Validation performed
`tsc --noEmit` clean · `eslint` 162 errors / 3,609 warnings · credential-free vitest 13/16 files pass (3 need a live database) · `opennextjs-cloudflare build` pass · `wrangler deploy --dry-run` 4,266 KiB gzip (Workers Paid required; production deploys succeed) · `npm ci` fails on npm 10, works on npm 11 · `test:all`, E2E and pgTAP not run (production-only credentials).

## Reports
| File | Purpose |
|---|---|
| `00-executive-summary.md` | This document |
| `01-launch-blockers.md` | P0 and P1 findings with evidence |
| `02-feature-gap-matrix.md` | 52 capabilities classified |
| `03-accounting-integrity.md` | Accounting engine, invariants, audit trail |
| `04-security-multitenancy.md` | Auth, RBAC, RLS, SECURITY DEFINER inventory, secrets |
| `05-database-migrations.md` | Migration Drift Report, schema quality |
| `06-business-workflows.md` | End-to-end workflow traces, nav, i18n, permissions |
| `07-saas-onboarding-commercial.md` | Onboarding path, plans, demo |
| `08-testing-quality.md` | Validation results, test inventory, gaps |
| `09-deployment-operations.md` | Cloudflare, CI, observability, backup/DR, performance, docs, reporting reconciliation |
| `10-open-prs-branches.md` | Disposition of PRs #19, #28, #29 |
| `11-remediation-plan.md` | Waves 0–3 ordered by dependency |
| `12-launch-checklist.md` | Objective yes/no gates with current status |
