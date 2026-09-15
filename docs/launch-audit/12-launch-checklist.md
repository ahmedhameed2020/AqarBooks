# 12 — Go-Live Checklist (objective yes/no gates)

Status as of this audit (commit `a91d809`, 2026-09-11). A gate passes only with the named evidence attached to the launch record.

## A. Security and tenant isolation
| # | Gate | Evidence required | Status |
|---|---|---|---|
| A1 | `changeUserRoleAction`, `inviteUserAction`, `updateUserStatusAction`, `removeUserAction`, `updateRolePermissionsAction`, `createRoleAction` require `tenant.users.manage`/`tenant.roles.manage`, verify role∈org, reject platform/system roles, and call the demo guard | code + negative integration test as CASHIER (QA-05) | **NO** |
| A2 | `is_platform_admin` requires `ura.organization_id IS NULL`; DB constraint forbids platform role in org-scoped assignments | migration + pgTAP case | **NO** |
| A3 | Production `user_role_assignments` audited for platform-role rows with non-null org; none found or all remediated | SQL result attached | UNKNOWN |
| A4 | `npm run test:security` green against production with the allowlist reconciled to migrations `20260825124342` and `20260825231151` | test output | **NO** (allowlist stale) |
| A5 | Cross-tenant isolation integration test for dues, payments, journals, members, units via a staff session of org B | test file + green run | **NO** |
| A6 | `app/auth/callback` `next` parameter validated same-origin | code + test | **NO** |
| A7 | AI routes gated by `has_permission` and kill switch; org derived from session | code | **NO** |
| A8 | Storage bucket + policies present in `supabase/migrations` and asserted in a test | migration + test | **NO** |

## B. Accounting integrity
| # | Gate | Evidence required | Status |
|---|---|---|---|
| B1 | Ledger reports include `REVERSED` entries (or equivalent) so a reversal nets to zero; pgTAP case post → reverse → trial balance unchanged | migration + test | **NO** |
| B2 | `void_payment` succeeds, reverses the receipt journal, updates due/allocation status, and is reachable from the payments screen with a reason | migration + action + test (positive, replacing `pgtap:2566`) | **NO** |
| B3 | Due void/cancel with GL reversal exists, or a written credit-note-only policy is adopted and credit notes reduce collectible balance | code/ADR + test | **NO** |
| B4 | Over-allocation via duplicate `due_id` impossible | function fix + pgTAP | **NO** |
| B5 | Posting into a period with no OPEN fiscal period is refused or explicitly deferred with a visible queue for dues and credit notes | code + test | **NO** |
| B6 | Idempotency key generated once per form instance; two submissions yield one payment | code + test | **NO** |
| B7 | Concurrent double reversal impossible (`FOR UPDATE` + unique on reversed entry) | migration + two-client test | **NO** |
| B8 | Hash-chained audit covers payments, voids, reversals, period changes, role changes | code + test | **NO** |
| B9 | Single balance definition shared by view, aging, dashboard, statements, portal; excludes REVERSED payments, VOID/DRAFT dues, includes credit notes | code + reconciliation test | **NO** |
| B10 | Property P&L and VAT return sourced from the ledger with a period filter | code | **NO** |
| B11 | Σdebit = Σcredit, immutability of posted entries, gap-free numbering | existing (pgTAP phase3, unique indexes) | YES (manual SQL) |

## C. Database and migrations
| # | Gate | Evidence required | Status |
|---|---|---|---|
| C1 | Live `schema_migrations` listed read-only and attached; equals the 18 repo files plus an explicit, named list of ledger-only rows | SQL output | UNKNOWN |
| C2 | `statements` of the 15 ledger-only migrations exported to a protected artifact | artifact hash recorded | **NO** |
| C3 | Successor ADR to 0004 signed; process = file merged → applied via preview branch in CI → never from an unmerged branch | ADR + workflow | **NO** |
| C4 | Fresh database built from the 18 files passes the Step-5 comparator against production | comparator output | UNKNOWN |
| C5 | `lib/supabase/types.ts` regenerated; no phantom or missing objects | diff | **NO** |
| C6 | `supabase/migrations/README.md` accurate | file | **NO** |

## D. Build, deployment, operations
| # | Gate | Evidence required | Status |
|---|---|---|---|
| D1 | `tsc --noEmit` clean | this audit | YES |
| D2 | `eslint` zero errors and a lint stage in CI | CI run | **NO** (162 errors) |
| D3 | `opennextjs-cloudflare build` + `wrangler deploy --dry-run` pass; Workers Paid dependency documented | this audit + doc | YES / **NO** (doc) |
| D4 | `CRON_SECRET` set in GitHub and Cloudflare; lease-rent and alert-digest workflows produce HTTP 200 and fail on missing secret | job log | **NO** |
| D5 | Rollback procedure documented and rehearsed once | doc + run | **NO** |
| D6 | Preview/staging environment deploys from PRs | workflow | **NO** |
| D7 | `/api/health` reports release SHA and non-placeholder secrets; smoke check calls it | code + CI | **NO** |
| D8 | Error reporting with alerting configured (Sentry or Logpush + alert) | dashboard screenshot | **NO** |
| D9 | `npm ci` works on the documented npm version; `engines` or README states it | file | **NO** |

## E. Testing
| # | Gate | Evidence required | Status |
|---|---|---|---|
| E1 | Integration and E2E suites target a non-production database and refuse the production ref | config + guard | **NO** |
| E2 | `npm run test:all` green in CI on PRs | CI run | **NO** |
| E3 | pgTAP placeholders replaced with real receivables/treasury/purchasing/reports cases | file | **NO** |
| E4 | Critical workflow E2E: issue due → pay (cashier) → print receipt → void → statement, both locales, mobile viewport | spec + run | **NO** |
| E5 | Ledger-vs-files migration drift check runs nightly | workflow | **NO** |

## F. Onboarding and commercial
| # | Gate | Evidence required | Status |
|---|---|---|---|
| F1 | One documented onboarding model; either PR #28 merged (rebased) or `onboarding_requests` retired by migration + ADR | PR/migration | **NO** |
| F2 | Platform onboarding proven end-to-end on staging: submit → approve → owner login → first configuration; retry after failure proven idempotent | E2E run | **NO** |
| F3 | Owner invitation atomic or recoverable (no orphaned auth users) | code + test | **NO** |
| F4 | Plan limits enforced (units/users/resorts) or capacity tiers removed from the pricing page | code or copy | **NO** |
| F5 | Pricing/landing claims with no implementation removed (late fees, sinking reserve, intercompany, anomaly alerts, ticketing, work orders, automated dunning links, "certified" wording) | copy diff | **NO** |
| F6 | PR #19 and #29 closed with rationale | GitHub | **NO** |

## G. Backup and recovery
| # | Gate | Evidence required | Status |
|---|---|---|---|
| G1 | Provider backup tier/PITR confirmed and documented with RPO/RTO | doc + screenshot | **NO** |
| G2 | One restore rehearsal onto a branch completed and recorded, including schema bootstrap from Git | record | **NO** |
| G3 | Off-platform dump scheduled (DB + storage) | workflow | **NO** |
| G4 | `verify_financial_audit_chain` scheduled and alerting on failure | workflow | **NO** |

## H. Support and documentation
| # | Gate | Evidence required | Status |
|---|---|---|---|
| H1 | Runbooks: incident, rollback, migration apply, leftover-test-org purge, secret rotation (demo password, cron secret) | docs | **NO** |
| H2 | README with architecture, env setup (`.env.example`), test instructions | file | **NO** |
| H3 | Support can answer from the UI: who reversed a receipt, who changed a permission, why onboarding failed | audit pages with filters | **NO** |
| H4 | Error/not-found/loading boundaries in both locales | files | **NO** |

## Summary gate
- No unresolved P0 findings: **NO** (6 open).
- Required P1 findings resolved: **NO** (35 open).
