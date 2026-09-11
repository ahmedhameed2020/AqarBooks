# 09 — Deployment, Cloudflare, Observability, Backup & DR

## 1. Deployment architecture (as found)
- Next.js 16.3 App Router → `@opennextjs/cloudflare` → single Worker `aqarbooks` (`wrangler.jsonc`: `nodejs_compat`, `ASSETS` binding, observability enabled; no `env.*`, no KV/R2/D1/Durable Objects).
- `open-next.config.ts` sets `buildCommand: "npx next build"` to avoid the documented recursion trap (npm `build` = `opennextjs-cloudflare build`).
- `middleware.ts` (not `proxy.ts`) so it stays on the edge runtime; documented.
- CI: `.github/workflows/deploy.yml` on push to `master`: npm 11 → `npm ci` → `opennextjs-cloudflare build` → `deploy -- --keep-vars` → curl smoke-check of six public routes. Concurrency group prevents parallel deploys. No tests, no lint, no typecheck in CI.
- Scheduled jobs are GitHub Actions cron → HTTPS POST to `/api/cron/lease-rent` and `/api/cron/alert-digest` with `Authorization: Bearer $CRON_SECRET`.
- `scripts/guard-deploy.mjs` blocks `npm run deploy` outside `GITHUB_ACTIONS` (soft guard; `npx opennextjs-cloudflare deploy` still works from a laptop).
- Env: `NEXT_PUBLIC_*` inlined at build from the committed `.env.production`; `SUPABASE_SERVICE_ROLE_KEY` and other secrets read lazily from `process.env` at request time (`lib/env/server.ts`). Placeholder fallbacks exist for every secret.

## 2. Measured facts
| Check | Result |
|---|---|
| `opennextjs-cloudflare build` on `a91d809` | success |
| `wrangler deploy --dry-run` | **21,501 KiB raw / 4,265.87 KiB gzip** |
| Cloudflare limits | 3 MiB gzip on Free, 10 MiB on Paid |
| Production deploys of this size | succeed (Actions runs #84, #85 on 2026-09-07) → the account is on **Workers Paid**; PR #19's premise (free-plan cap) is moot |
| `exceljs` in worker | statically imported in `lib/reports/financial-excel-export.ts` and 10 client files; `recharts` also bundled |
| Runtime CDN-loaded packages | none on master (the esm.sh approach exists only in PR #19) |
| `CRON_SECRET` in GitHub Actions | **unset** — both scheduled jobs warn and exit 0; the cron endpoints have never been called by the scheduler (job logs 2026-09-09/10/11) |
| Health endpoint | none (`app/api/` has only `ai/`, `cron/`, `webhooks/`) |
| Version stamp | `lib/ai/kill-switch.ts:31` reads `CF_PAGES_COMMIT_SHA || VERCEL_GIT_COMMIT_SHA || "c2e4770"`; neither var exists on this deploy path, so every release self-reports `c2e4770` |
| Rollback procedure | none documented (`wrangler rollback`/`versions` not mentioned anywhere) |
| Preview/staging environment | none in `wrangler.jsonc` or CI |

## 3. Runtime secrets inventory
Read via `process.env` in `lib/`/`app/`: `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, `RESEND_API_KEY`, `RESEND_FROM`, `NEXT_PUBLIC_SITE_URL`, `DEMO_USER_EMAIL`, `DEMO_USER_PASSWORD`, `DEMO_ORGANIZATION_ID`, `DEMO_ORGANIZATION_SLUG`, `GEMINI_API_KEY`/`GOOGLE_API_KEY`, `AI_GATEWAY_URL`/`CLOUDFLARE_AI_GATEWAY_URL`, `AI_MODEL_*`, `AI_KILL_SWITCH_ALL`, `PAYMOB_*` (4), `FAWRY_*` (3), `CF_PAGES_COMMIT_SHA`/`VERCEL_GIT_COMMIT_SHA`. Documented in `docs/deployment.md`: three. No `.env.example`/`.dev.vars.example`.

## 4. Deployment findings
| ID | Sev | Finding |
|---|---|---|
| DEP-04 | **P1** | Scheduled rent generation and alert digest have never executed in production; `CRON_SECRET` unset in Actions; workflows warn and exit 0 so the badge stays green. Set the secret in GitHub **and** Cloudflare; make the workflow fail after a grace date; document it. |
| DEP-01 | P1 | No rollback story; a red smoke check leaves the broken version live. Document `wrangler rollback`; add `workflow_dispatch` input to redeploy a SHA. |
| DEP-02 | P1 | No preview/staging environment; `docs/deployment.md` describes a Workers-Builds path CI does not use and quotes "~2.3 MB gzipped" (actual 4.27 MiB). |
| DEP-03 | P1 | Placeholder env fallbacks let a mis-configured deploy boot green; the smoke check exercises only public pages and 307s. `--keep-vars` is the only thing preserving secrets. Add a health check asserting non-placeholder secrets. |
| DEP-05 | P2 | No health endpoint, no release SHA, no tags/CHANGELOG. Inject `GITHUB_SHA` at build; expose `/api/health`. |
| DEP-06 | P2 | npm ≥11 requirement lives only in a workflow comment; `npm ci` on npm 10 fails (verified). Add `engines`/README note or regenerate the lock. |
| DEP-07 | P2 | `guard-deploy.mjs` is soft and bypassable by the direct CLI. |
| DEP-08 | P2 | Bundle depends on Workers Paid (4.27 MiB gzip); not documented as a plan dependency. `exceljs` could be dynamically imported in export handlers to reduce size. |

## 5. Observability & support
- Logging: `console.error` 42 (lib) + 29 (app), `console.warn` 3; no logger, no request/correlation id, no error-reporting SDK; only Workers Logs (sampled, short retention).
- Business alerts (`lib/alerts/operational-alerts.ts`) e-mailed via Resend by the digest — which never runs (DEP-04). No system/error alerting.
- Audit writers: hash-chained `financial_audit_logs` via `append_financial_audit_event` for dues issuance, installment plans, rent/recurring generation, opening balances (payments and voids not emitted — ACC-07). `platform_audit_logs` written by ~65 RPCs (post/reverse journal, payments, expenses, period status, onboarding) and TS inserts in member/unit lifecycle. **Not audited:** `user_role_assignments`, `role_permissions`, `organization_memberships.status` (written by service role from `users.ts`/`roles.ts`), COA edits via PostgREST.
- Pages: `platform/audit` last 200 rows, no actor/filters/pagination; `finance/reports/audit-trail` last 100 rows, defaults missing reason to "Standard operational update".

| Support question | Answerable today? |
|---|---|
| Who reversed this receipt? | Receipts cannot be reversed (ACC-01). Journal reversals: yes via `platform_audit_logs.actor_id`, only within the last 100/200 rows on screen; otherwise SQL. |
| Why did this balance change? | Partially: `safe_change_summary` on payments/dues; no link from a balance delta to events; no snapshots. |
| Who changed this permission? | **No.** |
| Why did onboarding fail? | Only `console.error` in Workers Logs; onboarding-request rows have no UI. |
| Why does this report differ from the ledger? | Not diagnosable without SQL (six independent balance formulas; ACC-13, RPT-02). |
| Which release introduced this regression? | **No** (constant SHA, no tags). |

| ID | Sev | Finding |
|---|---|---|
| OBS-01 | P1 | No error reporting/alerting for exceptions in server actions/routes. |
| OBS-02 | P1 | Permission/role/membership changes unaudited. |
| OBS-03 | P2 | Audit pages unpaginated/unfiltered; platform page hides actor. |
| OBS-04 | P2 | No request id / structured logs. |
| OBS-05 | P2 | `verify_financial_audit_chain` is never scheduled or called; tests delete chain rows. |

## 6. Backup, recovery, business continuity
- `lib/backup/*` = five pure modules (hashing, 104-table classification, restore-target guard that hard-denies the production ref, storage-completeness state machine, verification-gate verdict). **No extractor, no restore runner, no gate producers, no Storage capture, no signing.** `docs/backup-recovery/phase1-implementation-report.md` §11 and status block: "Schema bootstrap drill NOT RUN, Recovery drill NOT RUN, Production TB&R NOT DEPLOYED". Nothing outside tests imports `lib/backup`.
- ADR 0006 leaves retention and **RPO/RTO undecided**. No mention of Supabase PITR or daily-backup tier, no restore rehearsal record, no runbook. `member-documents` bucket has no backup plan.
- The migration history itself is not reproducible (DB-01), so a rebuild from Git is impossible even with a data dump.

| ID | Sev | Finding |
|---|---|---|
| DR-01 | **P0** | No runnable backup or restore exists; continuity depends on undocumented, unverified provider-level backups. Confirm/enable PITR, document RPO/RTO, run and record one restore rehearsal onto a branch, schedule an off-platform dump (e.g. to R2). |
| DR-02 | P2 | Storage bucket has no backup path. |
| DR-03 | P2 | Audit-chain verification never scheduled; a restore would not be validated. |

## 7. Performance
| ID | Sev | Finding |
|---|---|---|
| PERF-01 | P1 | Hard `.limit(300)` with no pagination and no "showing 300" indicator on `finance/dues/page.tsx:113`, `payments/page.tsx:113`, `journals/page.tsx:86`, `expenses/page.tsx:102`, `suppliers/page.tsx:117`; rows beyond 300 vanish from lists, client totals and CSV. |
| PERF-02 | P1 | Unbounded, un-scoped support queries on every render: `payment_allocations` with no org filter/limit on dues (`:114-116`), payments (`:114`), dashboard (`tenant-dashboard.tsx:109`), aging (`:71`); all `dues` on payments/dashboard/owner-statement/property-pnl; all `journal_entry_lines` for the org on journals (`:90-93`). Linear in tenant age. |
| PERF-03 | P2 | Client-side filtering of full datasets in 35 `*-client.tsx` files. |
| PERF-04 | P2 | `exceljs` statically imported into 12 client components and `recharts` into dashboard charts; contributes to the 4.27 MiB worker. Use dynamic import in export handlers. |
| PERF-05 | P3 | Dashboard: 2 sequential awaits + 12 parallel queries + 6 monthly `get_trial_balance` calls = 18 round-trips per render; exports silently cap at 5,000 rows (`members-export.ts:34`, `units-export.ts:45`). |

## 8. Documentation & maintainability
| ID | Sev | Finding |
|---|---|---|
| DOC-01 | P1 | `README.md` is create-next-app boilerplate; no architecture overview, env setup, or test instructions; no `.env.example`. |
| DOC-02 | P1 | Tribal knowledge with no canonical doc: apply-migration-then-copy-then-update-guard process; `db push` ban vs stale README; `CRON_SECRET` in both GitHub and Cloudflare; `DEMO_*` env; npm 11; Workers Paid dependency. |
| DOC-03 | P2 | No runbooks (incident, rollback, on-call, purge of leftover test orgs). ADRs mix Arabic (0004, 0006) and English (0001-0003) with no index; numbering skips 0005. |
| DOC-04 | P2 | Accounting model scattered across `docs/decisions/*` and `docs/reviews/*`; no single statement of which statuses each report excludes. |
| DOC-05 | P3 | `docs/deployment.md` stale on bundle size and build path. |

## 9. Reporting reconciliation
| Surface | Source | Formula |
|---|---|---|
| Trial balance, ledger, cash flow, cash position, WIP | SQL RPCs | `je.status = 'POSTED'` (ACC-02) |
| Unit/member balances (lists, exports, portal) | views | dues `status <> 'VOID'` (DRAFT included) − POSTED allocations |
| Tenant dashboard KPIs | TS `tenant-dashboard.tsx:163-182` | dues ∉ {PAID,VOID,DRAFT} − POSTED allocations; revenue/expense from `get_trial_balance` |
| Aging | TS `lib/finance/aging.ts` | dues ∈ {ISSUED,PARTIALLY_PAID,OVERDUE} − POSTED allocations |
| Owner statement | TS `owner-statement/page.tsx:76-129` | all dues, no status filter − POSTED allocations, `Math.max(0,…)` |
| Property P&L | TS `property-pnl/page.tsx:79-130` | raw dues amounts (any status, gross of VAT) as revenue; raw `supplier_invoices.amount` (any status) as expense |
| Portal statement | TS `portal/(member)/statement/page.tsx:43-68` | dues `<> 'VOID'`; payments with **no status filter** |

| ID | Sev | Finding |
|---|---|---|
| RPT-01 | **P0** | = ACC-02: reversals net to −1× in every ledger report. |
| RPT-02 | P1 | Four independent TS "outstanding" definitions disagree with the SQL view and each other; a DRAFT or VOID due shows three different balances across the members list, dashboard and owner statement. |
| RPT-03 | P1 | Property P&L is not ledger-based and will never tie to the income statement. |
| RPT-04 | P1 | Portal statement shows REVERSED payments as credits; unrecognized dues (no journal) sit in dues-based balances but not in AR control; `payments.unallocated_amount` credits AR in the ledger but reduces no unit balance. |
| RPT-05 | P2 | Dashboard overdue uses string date compare against server `new Date()`; aging uses `daysOverdue`; boundary day differs by timezone. |

## 10. Addendum — integrations observed on PR #32 (2026-09-11)
Opening the audit PR triggered two checks not described anywhere in the repository:
- **`Workers Builds: aqarbooks`** — Cloudflare's git integration is connected to the *production* Worker service and builds every pushed branch (it ran on this docs-only branch). This is a second deploy path beside `.github/workflows/deploy.yml`; per Cloudflare's defaults a non-production branch runs `wrangler versions upload`, and the production branch setting is UNKNOWN. If it is set to `master`, every merge is deployed twice (Actions with `--keep-vars`, Workers Builds without), and a Workers Builds deploy without `--keep-vars` can drop runtime secrets. **DEP-09 (P1 / UNKNOWN — verify the integration's production branch and disable one path.)**
- **`Supabase Preview`** — the Supabase GitHub integration is connected to the production project (`details_url` points at project `ataslxkcflxuilpgyepm`). It was skipped on this PR (no migration files changed). If "deploy migrations on merge to the production branch" is enabled, merging any change under `supabase/migrations/` would run the equivalent of `supabase db push` against production — the operation ADR 0004 prohibits — and would attempt to re-apply files whose versions are already in the ledger. **DB-13 (P1 / UNKNOWN — verify the integration's settings; disable production deploys until the migration process ADR is signed.)**
