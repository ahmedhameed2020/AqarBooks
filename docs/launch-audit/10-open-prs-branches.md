# 10 — Open PRs and Branches

Master = `a91d809` (2026-09-07). Today 2026-09-11. Branch inspection was done via `git fetch`, `git show`, `git diff`, `git log`, `git merge-tree` on `origin/*` refs; nothing was merged or checked out into the working tree. At the owner's instruction, the `codex/bagosh-staging-deploy` branch is excluded from this review.

## Disposition summary

| PR | Title | Age | Ahead / behind master | Conflicts | Disposition |
|---|---|---|---|---|---|
| #19 | fix(deploy): bring the Worker bundle back under Cloudflare's size limit | 26 d (last push 23 d ago) | 290 / 80, **unrelated history** (its base `1f157cd` is not an ancestor of master; master was re-rooted 2026-08-23) | `git merge-tree` exit 128 (no merge base); GitHub's "clean" is against a stale base | **Superseded and dangerous — safe to close.** |
| #28 | Release B: assisted onboarding + Release A closeout | 16 d | 5 / 8 | 2 trivial (`package.json` `test:all` line; `tests/migration-directory-guard.test.ts` allowlist) | **Still required; contains functionality absent from master; needs rebase.** |
| #29 | copy(auth): reposition login and activation entry as self-service SaaS | 16 d | 2 / 8 | none vs master; conflicts with #28 on the same hunks | **Superseded by #28 / dangerous alone — close or fold into #28.** |

## PR #19 — Worker bundle size
- Intended change (4 files): load `exceljs` at click time from `https://esm.sh/exceljs@4.4.0` via `import(/* webpackIgnore */)` in `property/csv.ts`; move `exceljs` to devDependencies; pin `esbuild`; repair nested `@swc/helpers@0.5.23` in the lockfile; document in `docs/deployment.md`.
- Master has moved past it: `exceljs ^4.4.0` is a normal dependency (package.json L56) statically imported in 10 files (`lib/reports/financial-excel-export.ts`, `finance/commissions/commissions-excel.ts`, `finance/projects/projects-client.tsx`, `finance/assets/assets-client.tsx`, `finance/expenses/expenses-excel.ts`, `finance/banks/banks-client.tsx`, `finance/dunning/dunning-client.tsx`, `finance/exchange-rates/rates-client.tsx`, `finance/dues/dues-client.tsx`, `finance/suppliers/suppliers-client.tsx`) — externalising `csv.ts` alone would save nothing. `esbuild ^0.25.4` devDependency is present. `wrangler.jsonc`, `open-next.config.ts` exist.
- Measured on master today: `wrangler deploy --dry-run` reports **21,501 KiB raw / 4,266 KiB gzipped**. That is above the 3 MiB free-plan cap the PR targets and below the 10 MiB paid cap. Production deploys of master succeed in CI (runs #84, #85 on 2026-09-07), which establishes the account is on Workers Paid. The premise of #19 no longer applies.
- Semantic risk of the approach: third-party JavaScript executed at click time inside an authenticated finance session, no Subresource Integrity, no CSP on master, non-reproducible esm.sh rewriting, breaks offline/strict CSP; untested by its author ("sandbox blocks esm.sh").
- Merging would join unrelated histories and revert ~1.6 M lines across 4,206 files.
- Salvageable: the lockfile observation. Verified today: `npm ci` fails under npm 10 (`EUSAGE`, lock out of sync for `@swc/helpers`); `npm@11 ci` succeeds; `deploy.yml` pins npm 11. See PR-03.

## PR #28 — Assisted onboarding
- Migrations `20260826102930` and `20260826124013` are byte-identical to master's restored copies (sha256 `ec62d236…`, 13,325 B; `fbbba887…`, 1,692 B). After rebase they vanish from the diff.
- Absent from master (entire application layer): `app/[locale]/get-started/**` (11 files), `lib/actions/onboarding-request.ts`, `app/[locale]/(app)/platform/onboarding/**` (4 files), `approveOnboardingRequest`/`rejectOnboardingRequest` in `lib/actions/platform.ts`, dashboard pending-request branch, nav item, `robots.ts` rule, `types.ts` rows, both test files, CTA retargeting to `/get-started?plan=KEY`.
- Dependencies master satisfies: `app/auth/callback/route.ts` honours `?next=`; `serverEnv.NEXT_PUBLIC_SITE_URL`; `check_and_record_rate_limit`; `requirePlatformAdmin`.
- Semantic review: `approve_onboarding_request` (already live) — admin gate, advisory lock, ACTIVE-idempotent, savepoint-isolated, FAILED persisted, slug suffix loop, TENANT_OWNER hard-fail, audit log; columns verified against the baseline. Correct. Weaknesses: NULL-on-failure, no FAILED recovery, silent skip if plan key missing, hard-coded `default_currency='EGP'` and `status='ACTIVE'` (admin-created orgs start `TRIAL`). `onboarding-request.ts`: unprivileged `auth.signUp` with e-mail confirmation, anti-enumeration, honeypot before auth, IP rate limit before signUp, `requester_user_id` bound to session, 23505 → same success redirect. Sound; nits: brittle `"already"` substring match, rate-limit consumed on the idempotent path.
- Required before merge: rebase onto `a91d809`; keep both `test:all` entries; take master's 18-entry guard allowlist; regenerate `types.ts`; `tsc`/`eslint`; run `test:onboarding-request` with a service key against a non-production database; decide ONB-09 (FAILED recovery) and ONB-07 (plan naming).

## PR #29 — Login copy / register redirect
- Changes: login button copy; acquisition block → `/get-started` + tertiary `/demo`; `auth/register/page.tsx` reduced to an unconditional `redirect('/get-started')`.
- Versus master: master's login links `/demo`; master's register keeps `generateMetadata` (noindex), `setRequestLocale`, `getUser()` and `redirect_to` handling — #29 deletes all of these. `/get-started` does not exist on master, so merging #29 alone turns the login CTA and `/auth/register` into 404s. #28 already makes the same two edits with different wording; whichever merges second conflicts on `login-form.tsx` L128-140 and `register/page.tsx`.

## Other remote branches (informational)
`merge/platform-forward`, `feat/health-endpoint`, `ci/deploy-workflow` (all last touched 2026-08-22, ~478 ahead / 80 behind: pre-re-root history, not mergeable), `feat/public-demo-phase-1` (34 ahead / 21 behind, superseded by PR #26), `enhance_page_ui_ux`, `style_table_header_contrast`, `feat/pricing-page-v1` (merged). None carries the 15 missing ledger migrations (see 05-database-migrations.md).

## Findings
| ID | Sev | Finding |
|---|---|---|
| PR-01 | **P1** | #19 shares no history with master; a merge would revert ~1.6 M lines. Close; never merge. |
| PR-02 | **P1** | #19's esm.sh runtime loader is a supply-chain risk (no SRI, no CSP, unverified) and is moot given ten static `exceljs` imports and a paid Workers plan. Reject the approach. |
| PR-03 | P2 | `npm ci` fails under npm 10 on master (verified today); CI works only because it installs npm 11. Regenerate the lockfile or document the npm ≥11 requirement in README/engines. |
| PR-04 | **P1** | #28 is the only implementation of the live `onboarding_requests` schema; 8 behind, 2 trivial conflicts. Rebase and merge, or remove the schema (ONB-02). |
| PR-05 | P3 | #28's migrations are byte-identical to master's; resolve the guard-test conflict toward master's 18-entry list. |
| PR-06 | P2 | Live SQL / #28 hard-codes `default_currency='EGP'`, `status='ACTIVE'` vs admin path `TRIAL` — two lifecycles. Add currency to the request; align initial status via ADR. |
| PR-07 | P2 | #28's `[id]` page shows `failure_reason` but FAILED is terminal with no retry action (ONB-09). |
| PR-08 | P2 | #29 alone breaks acquisition (404s) and drops `redirect_to`/noindex on register. Close as superseded, or rebase after #28 and restore. |
| PR-09 | P3 | #28 and #29 edit the same login/register hunks with different copy; pick one. |
| PR-10 | P3 | #28 CTAs send `?plan=STARTER|PROFESSIONAL|ENTERPRISE` while marketing sells "Essential"; wizard plan labels must map consistently (ONB-07). |
