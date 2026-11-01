# Phase 2 — proving the financial cycle and preparing an honest accounting demo (local)

Date: 2026-10-10 · Branch `fix/phase1-financial-report-authz` · Follows the Phase 1, 1.1 and 1.2 reports in this folder.
Status: **implemented and verified locally only (updated after the completion round, §0b). Nothing committed, pushed or deployed; production was never contacted; the development database was not touched or cleaned; real payment code was not modified.**
Local success is not evidence that production is fixed; see §8 (deployment blockers).

How to run it yourself: `docs/runbooks/accounting-demo-local.md`. Evidence: `docs/audits/phase2-evidence/` (screens + run logs).

## 0. Result in one paragraph
On a clean, separate local Supabase built only from `supabase/migrations`, a fictional organization (Palm Village Owners Association) went through the whole cycle **through the UI as an accountant**: opening balance 10,000 (2025-12-31) → due 2,000 → receipt 1,500 → receipt 500 → full reversal of the 500. **Net collected 1,500, outstanding 10,500**, identical in dues, receipts, owner statement, general ledger, trial balance, income statement, balance sheet, cash flow, aging and the audit trail. The run found one real accounting defect — **every ledger-based report dropped the reversed original receipt** — which is fixed (migration `20261010120000`) and proven by a negative control. Trial balance now carries prior balances (opening + movement = closing). A bank collection + reconciliation scenario, duplicate-prevention checks and the demo-defect fixes are covered by tests. **Final combined browser/DB run on the production build: 65 of 65 passed (§5). Four follow-up rounds (§0b, §0g, §0h, §0i) added the approved receivable account, the real bank-fee entry, the owner-portal review, the RE-PRIOR proof, the production build and the reversal-permission proof.**

## 0b. Completion round (items A1–A7) — what changed after the first acceptance
This round answers seven follow-up requests. **Where it contradicts §1–§9 below, this section wins** (the superseded text is marked).

| # | Request | Result |
|---|---|---|
| A1 | The issue-due dialog must not default the receivable to 1110 Cash | **Fixed and proven.** There was no organization setting for "the receivables account", the dialog preselected the first asset account by code (1110), the server action fell back to the due type's *revenue* account and then to *any* asset account, and `issue_dues` accepted any account id (even another organization's). Now: setting `organization_finance_settings.receivable_account_id` (per property, validated by trigger), read by `get_default_receivable_account` (holders of `finance.dues.issue` or `finance.accounts.manage`), set by `set_default_receivable_account` (`finance.accounts.manage`, audited); the dialog preselects only the approved account, otherwise it is empty with a notice and an owner-only "approve as default" checkbox; the action never infers; `issue_dues` refuses a missing, foreign, non-asset, group or inactive account. UI tests no longer select 1130 by hand in S2, B1, D2. |
| A2 | Bank collection must be a real Bank Transfer | **Completed in round 2 (§0g-3):** the receipt dialog and server action now offer Bank Transfer; the scenario creates it in the dialog and the receipts list, filter and KPI classify it. (In round 1 it was held back because a test pinned an MVP restriction; that decision was then made explicit and the test rewritten as behaviour.) |
| A3 | The 15 fee must be a real entry; book and bank must agree at 1,985 | **Scenario rewritten.** Importing the −15 statement line alone made the *arithmetic* difference 0 while the books still said 1,985 vs 2,000 − it did not record the expense (B5b proves exactly that). Now the accountant creates `Dr 5410 Bank charges 15 / Cr 1120 15` (2026-03-31) in the journal UI and submits it; **the owner posts it** (maker-checker: the accountant has no `finance.entries.post`); auto-match then links the −15 line to that entry's 1120 credit line; summary book 1,985 = closing 1,985, unmatched 0/0, difference 0; finalize → RECONCILED with no line left unmatched. An unexplained difference blocks finalizing in the UI **and** the database (`RECONCILIATION_NOT_BALANCED`). *Gap logged:* the shipped chart has no bank-charges account (5410 was added as master data). The finalize gap (a zero difference hiding an unbooked line) is closed in §0g-1 — strictly, with no deferral exception. |
| A4 | Ten owner-portal functions in the grants baseline | **Reviewed function by function; no authorization or isolation defect exists.** See §0c. The baseline now lists them as a separately documented group tied to a new real-session test; the failure is gone. |
| A5 | What is RE-PRIOR? | **A computed display line, not a ledger entry** (see §0d). It exposed a real defect in the *balance sheet*, which labelled the cumulative result of all unclosed years "Current Period Earnings"; fixed (prior years and current fiscal year are separate lines, cut at the fiscal year like the trial balance). |
| A6 | Production build + the seven files that failed to load | **Done.** §0e. |
| A7 | Who may reverse a receipt | **Proven without widening any template** (§0f). |

### 0g. Round 2c — finalize, partial success, Bank Transfer, final build, review bundle
**1. Bank reconciliation finalize (database) — strict.** `get_bank_reconciliation_summary` treats an unmatched bank line as a reconciling item, so importing an unbooked bank fee made the difference zero and `finalize_bank_reconciliation` accepted it (B5b proves the state: book 2,000, bank 1,985, difference 0). Migration `20261012100000_phase2c_bank_reconciliation_unhandled_lines.sql`: `finalize_bank_reconciliation` now refuses (`RECONCILIATION_UNHANDLED_LINES`) when **any statement line is not matched to a booked entry**. *Databases that already applied the earlier 2c text are upgraded by `20261014100000` (§0i).* *Review feedback applied in round 3:* the first version of this round also offered an audited "explain a line instead of matching it" exception; that let a user justify deferring a March fee to April and still finalize with the fee outside the books — the audit trail would have shown who and why, but not that the reconciliation was right. **That exception was removed entirely** (no explain functions, no resolution columns, no trigger), and general exceptions are postponed until their types and controls are defined. The only way through is the accounting path: create the fee entry, post it (maker-checker), match the line. Book-only items (cheques/deposits in transit) remain ordinary reconciling items. UI: the Finalize button is disabled with a note while a line is unmatched. Proof (`accounting-bank-unhandled-lines.spec.ts`, 4 tests + B5b): **X1** a zero-difference statement with an unbooked fee is refused by the database and the button is disabled; **X2** there is no explain/defer control on the screen, no `explain_*` function in the database (`PGRST202`) and no column to write; **X3** the "it will be booked in April" route is rejected in every form — leaving the line (refused), deleting it (difference −15, `RECONCILIATION_NOT_BALANCED`), falsifying the statement's closing balance (difference +15, refused) — and the books still lack the fee; **X4** a submitted-but-unposted fee entry still does not allow finalizing; once the owner posts it and the line is matched, finalize succeeds with book = bank = −15 and nothing unmatched. The main scenario (B1–B8) still ends with book = bank = 1,985.

**2. `issueDueAction` partial success.** The issue and the optional "approve as default" are two database calls and cannot be one transaction from the app, so the order is kept and the contract fixed: if the due was issued and **only** the setting failed, the action returns success carrying `data.warning = "DEFAULT_NOT_SAVED"` (never an error), the dialog closes, the page refreshes with the due listed, and a warning toast ("Due issued, but the default account was not saved") offers **Retry saving**, which calls `saveDefaultReceivableAccountAction` — it saves the setting only and issues nothing. Proof (`accounting-issue-partial-success.spec.ts`, 3 tests; the failure is a real injected fault, a trigger on the settings table scoped to the test organization): the due is issued and posted (1 due, 1 entry), no default stored, warning shown, no error text; an identical re-issue is skipped by the duplicate guard (still 1 due, 1 entry); after the fault is removed Retry stores the default, audited once, still 1 due / 1 entry; the dialog then preselects 1130. **A real defect found by the test:** the Retry control dispatched the server action twice (two POSTs 0.9 s apart, two audit rows). The handler is now guarded against concurrent and repeated dispatch (one attempt at a time, never again after success).

**3. Bank Transfer in the receipt form.** The dialog now offers Bank transfer and `recordPaymentAction` accepts `BANK_TRANSFER`; the database already allowed it (`payments_method_check`) and the receipts list, filter, badge, dashboard label and bank-collections KPI already handled it. The old pinned test (a source-text assertion that the dialog must *not* contain it) was replaced by **behaviour tests**: `tests/receipt-methods-contract.test.ts` (12 tests) calls the real server action with a mocked client — each of CASH / BANK_TRANSFER / CHEQUE / ONLINE is forwarded unchanged to `record_payment`, no method defaults to CASH, and OTHER, CRYPTO, wrong case and "BANK TRANSFER" are refused before any database call; `final-hardening-migration` keeps its other assertions and now only checks that the option exists in source. UI proof (B2 in `accounting-bank-reconciliation.spec.ts`): the receipt is created **in the dialog** with Bank transfer (no RPC stand-in), `payments.method = BANK_TRANSFER`, the entry debits 1120, the list row says "Transfer" and not "Cheque", the Bank-transfer filter finds it, and the bank-collections figure equals 2,000.

**4. Acceptance re-run on the final production build:** 59/59 browser/DB tests (§5).

**5. Review bundle:** `docs/audits/phase2-review-bundle/` and `.zip` — see its `README.md`, `MANIFEST.md` (every file with size and SHA-256) and `NOT-INCLUDED.txt`; generated by `scripts/demo-local/make-review-bundle.mjs`, verified by `verify-review-bundle.mjs`.

### 0h. Round 3 — no due or opening balance without its journal entry; strict bank finalize; honest "already exists"
**1. Opening balances and dues without a valid fiscal period (the accounting gap).** `post_due_to_ledger` returns `NULL` when no OPEN period covers the issue date, and both `issue_dues` and `record_member_opening_balance` ignored that and kept the due — the customer balance and the ledger silently disagreed. Migration `20261013100000_phase2d_dues_require_open_period.sql`: a helper `assert_open_fiscal_period_for_date` is called before the insert in both functions and raises `FISCAL_PERIOD_MISSING` (no period covers the date: no year defined, or outside every period) or `FISCAL_PERIOD_NOT_OPEN` (a period covers it but is PLANNED / CLOSED / LOCKED; the message names the period and its status). After the insert both functions verify that the due really received its journal entry and raise `DUE_NOT_POSTED` / `OPENING_BALANCE_NOT_POSTED` otherwise. Because each function is a single transaction the refusal is **atomic**: no due, no entry, no audit row — and for the first opening balance of an organization, not even the "opening balance" due type or the 3900 equity account the function creates first. A batch `issue_dues` over several units creates none if the date is invalid. Dues created by other paths (leases, recurring schedules, installments) keep their existing "recognize later" behaviour; they are not in scope (G9).
Proof (`accounting-open-period-required.spec.ts`, 6 tests): **O0** the first opening balance refused with the due type and account rolled back; **O1** control — with an OPEN period both operations post a POSTED entry linked from the due; **O2/O3** a date in no period (2023), in a PLANNED period (2024; opening balances cannot be future-dated) and in a CLOSED period (2026-04) is refused for both operations — through the RPC and, for one case each, through the dialogs, which show the cause — and the snapshot of dues / entries / audit rows / due types / accounts is identical before and after, including for a two-unit batch; **O4** once the period is opened the same operation succeeds and posts. Order note found while testing: the "opening balance already recorded" guard fires before the period check.

**2. Issue result: "already exists", not "issued".** `issue_dues` reports `issued_count` and `skipped_count`. `issueDueAction` now returns `outcome = ALREADY_EXISTS` when nothing was issued and an identical due was skipped, and the dialog shows an info message "Due already exists" (no "Due Issued Successfully"); if the optional default also failed to save, the warning says "Due already exists, and the default account was not saved". Tests: D2 (second identical submit shows "Due already exists", still 2 dues / 2 entries) and I2.

**3. Bank finalize** — see §0g-1 (strict; the explanation exception removed).

**4. Re-run on the final production build:** 65/65 browser/DB tests (§5). **5. Review bundle** regenerated (zip only; the staging folder is outside the repository — a copy of the source tree inside it had been picked up by `tsc`).

### 0i. Round 4 — upgrade path for databases that applied the superseded 2c
**The gap.** Migration `20261012100000` (2c) was edited after review to remove the "explain a line" exception. Editing a migration does not change a database that already applied the old text: such a database would keep the `resolution*` columns, the guard trigger, the explain / unexplain functions **and the permissive `finalize_bank_reconciliation`** — i.e. the loophole. **Fix:** a forward migration `20261014100000_phase2e_bank_reconciliation_strict_upgrade.sql` that converges any such database to the strict design, and is a no-op on a database built from the current files:
1. one audit row `finance.bank_statement_line.explanation_retired` for every line that is still explained at upgrade time (original reason in `reason`; original actor and time in the summary) — the explanation columns are about to be dropped, so their content is kept in the audit trail;
2. drops the guard trigger and function, `explain_bank_statement_line`, `unexplain_bank_statement_line`, the coherence constraint and the four columns (`IF EXISTS` throughout);
3. re-creates `finalize_bank_reconciliation` strictly.
Never touched: statements, statement lines (date, description, reference, amount, match), RECONCILED statements, and every existing audit row (including the earlier `explained` / `explanation_removed` events).

**Proof, in place, without rebuilding the database** (`tests/bank-reconciliation-upgrade.integration.test.ts`, 7 tests). The superseded 2c is reproduced **exactly** in `scripts/demo-local/fixtures/phase2c-superseded-explain-exception.sql` (9,106 bytes, sha256 `75a9fde2…`, identical to the file shipped in the earlier review bundle — checked by hash when it was reconstructed). The test puts the clean database into that old state, creates data in it, applies the upgrade migration **as written**, and shows:
* *negative control:* under the old rules a statement whose only line is an explained, unbooked fee **was finalized** (two such statements are RECONCILED before the upgrade) — this is the defect;
* the explain / unexplain / guard functions, the trigger, the constraint and the four columns are gone; `finalize_bank_reconciliation` no longer mentions `resolution`;
* statements and lines are byte-for-byte unchanged (compared field by field), and both RECONCILED statements stay RECONCILED;
* the three earlier `explained` audit rows are intact, and exactly three `explanation_retired` rows exist (one per line that was explained), each with the original reason and the original actor;
* the DRAFT statement whose fee line had been explained has **difference 0 and one unmatched line, and finalize now refuses it** (`RECONCILIATION_UNHANDLED_LINES`) until the fee entry is created, submitted, posted by the owner and matched — then the same statement finalizes;
* calling `explain_bank_statement_line` now returns `PGRST202` (the function does not exist);
* the migration is idempotent (applied twice; no new audit rows, no error).
Then the migration was applied through the normal path (`npm run demo:stack-migrate`): **ledger 69 / files 69 → MATCH and `db diff` finds no schema changes**, i.e. the upgraded database equals a from-scratch replay of the files. Finally the stack was **rebuilt from scratch** (2c strict → 2d → 2e no-op): the explanation columns and functions are absent, and the whole browser set passed again (65/65).
*Caveat:* the old state was produced by re-applying the exact old migration text to the local clean database, not by rolling a copy of a real tenant database forward; the test therefore proves the migration against the old *schema and functions*, with synthetic data.

### 0c. The ten owner-portal functions (A4)
Signatures, `SECURITY DEFINER` and `search_path` were read from the live DB. Anonymous has no EXECUTE on any of them; the tables behind them (`member_portal_access`, `member_activation_tokens`) have RLS on, no policies and no client grants (`authenticated`/`anon` cannot select or update them — tested).
| Function | Guard | Verified with real sessions (`tests/owner-portal-functions-authz.integration.test.ts`, 15 tests) |
|---|---|---|
| `get_member_portal_access`, `request_member_activation`, `revoke_member_activation`, `begin_member_temp_access`, `finish_member_temp_access` | `_member_portal_authorize(member, 'members.portal.invite')` → `has_permission(auth.uid(), the member's own organization, key)` | refused with `42501` for: staff of another organization, the owner of that very member, another owner of the same organization, an authenticated user with no membership, **suspended** staff, **invited** staff, staff without the key (auditor), anonymous; an unknown member id gives the **identical** refusal (no existence oracle); org-A staff on an org-B member refused |
| `suspend_member_portal`, `reactivate_member_portal`, `begin_member_signout` | same, key `members.portal.manage` | same matrix; invite-only staff refused on manage functions and manage-only staff refused on invite functions |
| `finish_member_temp_access` (extra) | the Auth identity must be the alias reserved for *this* member's client number | wrong Auth user → `AUTH_USER_MISMATCH`; other organization's staff refused; 9,999 hours clamps to 168 |
| `my_portal_access`, `complete_portal_first_login` | act only on `members.user_id = auth.uid()` (unique) | owner 1 sees only own client number/phone hint, owner 2 only theirs; unlinked user → `linked:false`; staff-only user → `has_staff_access:true`; anonymous refused; completing owner 1's login changes **only** owner 1's row (owner 2's row byte-identical); unchanged password, bad phone, suspended and expired-temporary-password are all refused |
Observations kept as findings, not defects (G5): `get_member_portal_access.shared_identity` reports one boolean about whether the owner's Auth identity is active staff in *any* organization (needed to avoid banning a shared identity). Result: **no defect proven, so nothing was "fixed"**; the 10 names were added to the baseline only after this evidence, in their own documented group; the two Phase 2b functions were added the same way. *Consequence:* the baseline now describes a fully migrated schema, so the old drifted development DB would be reported as "functions removed" by that suite until migration `20261004120000` (and the Phase 1–2b migrations) are applied to it.

### 0d. RE-PRIOR (A5) — `tests/e2e/re-prior-year-boundary.spec.ts`
* **Nature:** a computed row (`is_synthetic = true`, `account_id = NULL`) of `get_trial_balance_with_opening`; the function is read-only. It is not an account, not an entry, and cannot be referenced by a journal line (no null `account_id` lines exist).
* **P1** counts of entries, lines, accounts, financial-audit rows and fiscal years are identical before and after calling the RPC and loading the trial-balance and balance-sheet screens. **P2** no double counting: 2025 trial balance closes revenue 1,000 / expense 200 / RE-PRIOR none; 2026-01-01..02-28 opens revenue 0 / expense 0 / RE-PRIOR credit 800 (= the 2025 result, once); cash opens at its 2025 closing 800; Σ(P&L closing) + RE-PRIOR = 1,050 = 800 + 250; every column balances; a March period still opens RE-PRIOR at 800 with income year-to-date 300. **P3** balance sheet: 2025-12-31 — assets 800, current-year result 800, no prior line, *Balanced*; 2026-02-28 — assets 1,450 = retained earnings 400 + prior years 800 + current-year result 250, prior line shown, *Balanced*; trial balance and balance sheet agree from the data. **P4** no fiscal year or period was closed or locked; still exactly five entries. **No automatic year-end close exists or was run.** Screens `40`, `41`.

### 0e. Production build and the seven files (A6)
* **Build:** `node scripts/demo-local/build.mjs` runs the project's real `opennextjs-cloudflare build` (which runs `next build` first) with the same isolated environment as the app (every variable named in `.env*` blanked; only the local clean stack's URL/keys). **Both builds succeed** (compiled, TypeScript passed, 225/225 static pages, OpenNext worker written). Nothing was deployed or uploaded. `node scripts/demo-local/scan-bundle.mjs` searched 8,557 output files for every configured value: **no value in compiled code**; the only hits are (a) constants that are literally in tracked source (`DEMO_ORGANIZATION_ID`, the public site URL, the demo slug) and (b) the **verbatim copies of the git-ignored `.env.production`** that Next/OpenNext place in the output folders (hosted public `NEXT_PUBLIC_SUPABASE_URL`/anon key and site URL; no service key). It is how the project's build is configured, not something introduced here; it matters for *deployment*: those output folders must be rebuilt with the real environment before any publish, and the `.env.production` copy inside them is hosted configuration (public keys only). `.dev.vars` holds only `NEXTJS_ENV`. The app uses `next/font/google`; if the font files are not cached the build downloads public font files (no credentials); I did not capture network traffic during the build to say which happened. The browser suites then ran **against the production build** (`start-prod.mjs`).
* **Disk incident:** the D: drive filled up twice. (1) While writing `20261011100100…sql` the file was left **zero bytes** and the migration ledger recorded it; I found it by the shell's "No space left on device", re-created the file and rebuilt the clean stack from the files (ledger 66/66, no drift). (2) A dev-server run wrote its Turbopack cache until the disk was full (`os error 112`), so six browser tests timed out; that run is discarded and the suites were re-run against the **production build** instead (it writes almost nothing). Removed to make room, all generated by this work or regenerable: `.next` (dev cache), `test-results`, and the `.open-next` output — which the local build had overwritten with a bundle built against the *local* database, so it was deleted rather than left where it could be deployed by mistake (**rebuild it with the real environment before any deploy**). Nothing of the user's was deleted: `.worktrees` (4.1 GB) and `mobile` (4.0 GB) were left alone; D: still has well under 1 GB free, which will break the next large build.
* **The seven files, each run separately on the clean stack with dummy payment settings (`run-vitest-local.mjs --each`; log `phase2-evidence/seven-files-run.log`):**
| File | Result | Note |
|---|---|---|
| `tests/pilot-rehearsal.manual.test.ts` | **PASS 9/9** | creates and deletes its own fake rules/organization on the local stack |
| `tests/sandbox-pilot.manual.test.ts` | **FAIL 6 of 9** | **ENVIRONMENT/DATA:** by design it needs the *approved production tax rules* already in the database (`RULE_MISSING`); `tax_rule_versions` has 0 rows on the clean stack. Cannot pass locally without importing hosted data, which is not allowed. Not a defect. |
| `tests/payments/fawry-v1-sql-proposal.test.ts` | **PASS 13/13** | (user's untracked Fawry file; ran as is) |
| `tests/payments/payment-provider-settings-reverify.test.ts` | **PASS 3/3** | membership fixture fix |
| `tests/payments/payment-provider-verification-race.test.ts` | **PASS 2/2** | membership fixture fix |
| `tests/payments/resolve-credentials.test.ts` | **PASS 6/6** | with dummy provider values; `FAWRY_BASE_URL` = a closed loopback port, no external call |
| `tests/security/w0-sec-postgres-invariants.test.ts` | **PASS 14/14** | `hookTimeout` raised to 60 s in `vitest.config.ts` (PGlite cold start flaked at 10 s) |
**Six of seven pass; the seventh cannot run without production data.** The suite as a whole is therefore *not* described as green.

### 0f. Reversing a receipt (A7) — `tests/e2e/accounting-void-permission.spec.ts`
Key `finance.payments.void`. Shipped templates holding it: **TENANT_OWNER and FINANCE_MANAGER only** (asserted). The shipped ACCOUNTANT template and the organization's cloned `ACCOUNTANT` role do not. **No template was widened.** W2: a user with the shipped ACCOUNTANT role sees no "Reverse" control (screen `50`), `void_payment` returns `42501`, the receipt stays POSTED, and entries/audit rows are unchanged. W3: a user *explicitly granted* the key (role `ACCOUNTANT_WITH_VOID`, a non-system role created by the fixture for the demo only) reverses receipt #1 in the UI — REVERSED, one mirror entry, one `PAYMENT_REVERSED` audit row; a FINANCE_MANAGER reverses #2 through the RPC. W4: the auditor, another organization's void-capable user and anonymous are refused; the other organization's user gets `PAYMENT_NOT_FOUND` for a payment of this organization (no cross-tenant action). *Finding G4:* for a payment id that does not exist the function answers `PAYMENT_NOT_FOUND` before the permission check, so a caller without the key can tell existing from non-existing ids **within the organization they pass**; low risk, not changed.

## 1. Acceptance, step by step (expected / actual / evidence)

Amounts, dates and accounts were fixed in the spec headers **before** execution (`tests/e2e/accounting-journey.spec.ts`, `accounting-bank-reconciliation.spec.ts`, `accounting-duplicates.spec.ts`, `accounting-demo-defects.spec.ts`, `trial-balance-opening-db.spec.ts`).

### Step 1 — clean local stack, migrations through the usual path
| | |
|---|---|
| Expected | A separate Supabase project (not the drifted dev DB at :54321) with every migration applied (including Phase 1.2 and 2), ledger == files, no schema drift, no external connections |
| Actual | Project `aqarbooks_clean` (API 55321 / DB 55322), created by `supabase start` + `migration up` from a copy of `supabase/migrations`. `npm run demo:stack-verify` → **ledger 67 / files 67 → MATCH; `db diff` (public): no schema changes** (re-verified at the end of the completion round, after the stack had been rebuilt a second time from the final files). Migration copy byte-identical to the repo file. |
| Isolation | App launcher blanks **every** variable named in `.env*` and sets only the local stack; Playwright config refuses non-local Supabase/loopback; browser egress guard aborts and fails the test on any non-local request; stack has no SMTP/analytics/realtime/edge runtime. AI provider keys are blank. |
| Honest note | While preparing this report I found that my first clean stack had the final audit-trail block of the Phase 2 migration applied by hand (the ledger held an older body of the same version). I therefore **destroyed and recreated the stack from the final files**, re-verified (above) and re-ran all evidence on it. |
| Evidence | `scripts/demo-local/*`, `package.json` scripts `demo:stack-*`, runbook §"What protects against external connections" |

### Step 2 — fictional organization and the connected UI journey
Fixture (`tests/e2e/helpers/accounting-fixture.ts`): organization, owner/accountant/auditor users, **real permissions** (ACCOUNTANT template **plus** `finance.payments.void`, role `ACCOUNTANT_WITH_VOID`, created for the test because the shipped ACCOUNTANT cannot reverse a receipt), RESORT_STANDARD chart of accounts and fiscal years 2025/2026 created through the product's RPCs under an owner session; property, unit A-101, owner member Mona Hassan. The service key creates only users/roles/master data; **every accounting operation is performed in the UI by the accountant**.

| step | operation | expected entry | actual |
|---|---|---|---|
| S1 | opening balance 10,000 dated 2025-12-31 (member page) | Dr 1130 / Cr 3900 10,000 | ✔ |
| S2 | new due 2,000 (2026-02-01, due 02-15) | Dr 1130 / Cr 4100 2,000 | ✔ |
| S3 | receipt #1 1,500 (2026-02-10, cash) | Dr 1110 / Cr 1130 1,500 | ✔ |
| S4 | receipt #2 500 (2026-02-12, cash) | Dr 1110 / Cr 1130 500 | ✔ |
| S5 | reverse receipt #2 in full | mirror Dr 1130 / Cr 1110 500; original → REVERSED | ✔ |

Expected end state: net collected **1,500**, outstanding **10,500** (opening 10,000 + new due 500). Actual: matches in every screen (step 3). Evidence: journey S1–S5, screens `01`–`07`.

### Step 3 — consistency across screens and ledger
| check | expected | actual |
|---|---|---|
| V1 dues list | remaining 10,500 | ✔ |
| V2 receipts | #1 posted 1,500; #2 shown as reversed 500; collections KPI 1,500 | ✔ |
| V3 owner statement | collected 1,500, outstanding 10,500 | ✔ |
| V4 general ledger | reversed original **and** its mirror visible; 1130 closes at 10,500, 1110 at 1,500 | ✔ (**failed before the fix**) |
| V5/V5b/V5c trial balance | opening + movement = closing; opening, period and closing columns each balance Dr = Cr; totals Dr = Cr = 12,000 | ✔ |
| V6 income statement, balance sheet, cash flow, aging | agree with the ledger | ✔ |
| V7 integrity | every entry balanced; reversal mirrors original; sub-ledger = ledger; hash-chained audit log intact | ✔ |
| V8 audit trail | the auditor sees the journey's events with actor names; the accountant sees the financial chain only | ✔ |
| Reversed operation's trail | original REVERSED + mirror POSTED + one `PAYMENT_REVERSED` audit row | ✔ (also D4) |

**Defect found and fixed (accounting-critical).** `void_payment` flips the original receipt entry to `REVERSED` and posts a mirror. `get_account_ledger`, `get_cash_flow_statement`, `get_cash_position`, `get_bank_reconciliation_summary`, `get_bank_match_candidates`, `auto_match_bank_statement` and `project_wip_summary` filtered `status = 'POSTED'`, so they dropped the original and kept only the mirror — after a reversal the ledger showed 1110/1130 off by the reversed amount. All seven now count `POSTED` **and** `REVERSED`. **Negative control:** restoring the old filters made V4, V5, V5b, V6 fail; restoring the fix made them pass (screens `before-fix-*` / `after-fix-*`).

### Step 4 — trial balance with prior balances; fiscal-year rules
New RPC `get_trial_balance_with_opening(org, start, end)` (guarded by `finance.reports.read`, service_role bypass, `INVALID_PERIOD` 22023) and a rewritten screen (opening / period / closing, Dr/Cr).
Rules implemented, from the project's fiscal-year model:
* **Balance-sheet accounts** (assets, liabilities, equity) carry the **cumulative** balance of all posted/reversed entries before the period start.
* **Income-statement accounts** open **year-to-date** from the start of the fiscal year containing the period start (zero on the first day of the year).
* **Results of earlier fiscal years that were never closed** appear as one explicit synthetic equity line `RE-PRIOR`, so the opening column balances without inventing an entry. If the period starts in a year the organization has not defined, the line is flagged (`fiscal_year_known = false`) and the screen says so.
* **No automatic year-end close was performed or created.** There is no closing procedure in the product.
* **What approval is unavailable:** a year-end close (transfer of the year's result to retained earnings 3100) needs a decision by the organization's accountant/board and a posting design that does not exist in the product; it was deliberately not implemented. Until then `RE-PRIOR` is the honest presentation. Likewise no fiscal period/year was CLOSED or LOCKED in the demo.
Proof: V5/V5b/V5c (UI) and `trial-balance-opening-db.spec.ts` E1–E4 (fixed numbers: cash opening 1,200 → closing 1,450; revenue opens 0; `RE-PRIOR` credit 800; draft entry of 9,999 absent; six refusal cases; invalid period rejected). Screens `10`, `11`.

### Step 5 — independent bank collection and reconciliation (UI)
> **Superseded by §0b (A2, A3):** the first version collected by *Cheque* and finalized with the fee only as a reconciling item. The current scenario records a bank transfer, books the fee as a real entry, and ends with book = bank = 1,985.
Fixed before execution: due 2,000 → receipt 2,000 by cheque into bank GL 1120 → statement 2026-03 with closing 1,985.00.
| step | expected | actual |
|---|---|---|
| B1/B2 | Dr 1130 2,000 / Cr 4100; then Dr 1120 / Cr 1130 2,000 | ✔ |
| B3 | statement created (closing 1,985) with only the +2,000 deposit line | ✔ |
| B4 | auto-match links the deposit to the receipt's journal line; difference **−15** (unexplained) → **finalize blocked** | ✔ |
| B5 | second auto-match changes nothing; one journal line cannot back two statement lines (DB `23505`) | ✔ |
| B6 | import the missing −15 fee line → difference **0** → finalize → **RECONCILED**; the fee stays a visible reconciling item (not force-matched) | ✔ |
| B7 | books agree: 1120 = 2,000, 1130 = 0, balanced | ✔ |
Formula (from `get_bank_reconciliation_summary`): difference = (closing + unmatched book − unmatched bank) − book. Screens `20`–`23`.

### Step 3b — duplicate prevention (`accounting-duplicates.spec.ts`)
| check | expected | actual |
|---|---|---|
| D1 second opening balance, same client+unit | refused, 1 due / 1 entry remain | ✔ (message appears in Arabic on the English screen — see §9 U2) |
| D2 identical due issued twice | only one due and one entry | ✔ |
| D3 double-click on "Record Receipt" | exactly one payment (#1) and one entry | ✔ |
| D4 reverse an already-reversed receipt | no button; DB `ALREADY_REVERSED`; one reversal entry, one audit row | ✔ |
| D5 `record_payment` replayed with the same idempotency key | same result, no second payment | ✔ |

### Step 6 — demo defects (`accounting-demo-defects.spec.ts`, plus screens `F*`)
| defect | fix | proof |
|---|---|---|
| Members page header said N but the table was empty / counts from different relations | count and rows come from `members_with_financials`; query error shows an error state, not "0" | F1 |
| Unit counts differed between dashboard and property page | one definition: active (non-archived) units; "with a current owner" = `units_with_financials.occupancy_status = 'OCCUPIED'`; a user without the property permission sees "not available for your permissions" instead of a number | F2 (owner: 3 / 2 on both pages; accountant: honest note) |
| Dr/Cr classification and cash-flow page failure | cash-flow page read a column the RPC does not return (`net_amount` vs `amount`) and failed; now mapped. Trial balance shows explicit Dr/Cr columns per account in opening, period and closing | V5, V6 (screen `after-fix-cash-flow`) |
| Audit trail empty for the people meant to read it | policy `platform_audit_logs_select_org_auditor` (own org, `finance.audit.read`) + `get_audit_actor_names`; page merges both sources, shows actor names, shows an error state on failure | V8, F6 |
| Fabricated occupancy split (82 % / 10 % / 8 %), maintenance count, "System operating smoothly… 100 % accuracy" | removed; real counts only; the insight card states only what it checks | F3 |
| Wrong role label ("Organization Owner" for everyone) | real role name | layout/account |
| Default AI insights / copilot shown without any AI configured | hidden unless a provider key exists (`lib/ai/availability.ts`) | F3 |

### Step 7 — `app/api/ai/journal-propose`
Order is now: session → body validation → **tenant permission proof (`proveTenantPermission`)** → organization active → demo/kill-switch/**no provider configured → 503 `AI_DISABLED`** → chart-of-accounts read → proposer. Nothing external can be reached before identity, organization and permission are proven.
* Unit tests (`tests/ai-journal-propose-route.test.ts`, **15**): 401 without session; 400 incl. `EMPTY_DESCRIPTION`; 403 when the proof fails (non-member/suspended/invited/no permission); 403 for another organization; 403 for an inactive organization; 503 for the demo org, the kill switch **and no provider configured** — each asserting that neither the proposer nor `fetch` was called and no account was read.
* Real server (F5): anonymous → 401; another organization's id → 403; owner with the permission → **503 `AI_DISABLED`** (no key exists in this environment; browser egress guard saw nothing); blank description → 400.
* **Found while testing:** with no key the route still answered 200 with a placeholder proposal (no external call happened because the gateway returns before `fetch`, but the contract was wrong). Fixed. AI was not enabled in the demo.

### Step 8 — cash-flow-forecast permission key
The forecast feature is **not complete** (no forecasting model exists in the product). The page now gates on the approved key `finance.reports.read`, shows a clear "forecast withheld" status, and shows only exact figures that can be computed from posted data (open dues, cheques in hand, supplier invoices) with their source. No fabricated results. Proof: F4, screen `F4-cash-forecast-status`.

## 2. Screens (no secrets, fictional data) — `docs/audits/phase2-evidence/screens/`
`01` opening-balance dialog · `02` issue-due · `03` receipt (cash) · `03-receipt-bank-transfer-dialog` / `03-receipt-bank-transfer` the transfer created in the dialog and found in the receipts list · `04`/`05`/`07` receipts before/after reversal · `06` dues · `08` owner statement · `09` ledger 1130 · `10`/`11` trial balance · `12` income statement · `13` balance sheet · `14` cash flow · `15` audit trail (auditor) · `20`–`23` bank statement → unexplained difference −15 → balanced (book = bank = 1,985) → finalized · `24`/`25` the bank-fee journal entry drafted and posted · `30` issue-due with **no approved receivable account** (field empty, notice) · `31` issue-due with the approved account preselected · `40` balance sheet with the prior-years line · `41` trial balance with `RE-PRIOR` · `50` receipts screen for a shipped-ACCOUNTANT user (no Reverse) · `60` issue-due partial-success warning · `61` finalize blocked by an unbooked bank line · `70` issue-due refused: no fiscal period · `71` opening balance refused: closed period · `F1` members · `F2` dashboard/property units · `F4` forecast status · `F6` audit trail · `before-fix-*`/`after-fix-*` pairs (ledger, trial balance, statements, aging, audit trail). Some images from the first round show the superseded cheque-based bank scenario or the old "Current Period Earnings" label; the final screens are the ones named above.

## 3. Running the demo locally
Docker Desktop + Supabase CLI + Node + `npx playwright install chromium`. **Keep a few GB free on the repo drive** (a dev server's cache alone filled this one).
```bash
npm run demo:stack-up && npm run demo:stack-verify        # clean stack, ledger == files, no drift
node scripts/demo-local/build.mjs --next-only              # production build, local-only environment
node scripts/demo-local/start-prod.mjs                     # http://localhost:3100 (leave running)   [or: npm run demo:app for the dev server]
npm run demo:e2e -- tests/e2e/accounting-journey.spec.ts tests/e2e/accounting-bank-reconciliation.spec.ts
npm run demo:e2e -- tests/e2e/accounting-receivable-default.spec.ts tests/e2e/accounting-void-permission.spec.ts tests/e2e/re-prior-year-boundary.spec.ts
node scripts/demo-local/run-vitest-local.mjs tests/owner-portal-functions-authz.integration.test.ts   # vitest on the clean stack (dummy payment settings)
node scripts/demo-local/scan-bundle.mjs                    # no configured value in the build output
```
Then sign in at `http://localhost:3100/en/login` with the accountant/auditor/owner emails written to `test-results/demo-org.json` (local-only password = `PASSWORD` in `tests/e2e/helpers/accounting-fixture.ts`). Full detail and safeguards: `docs/runbooks/accounting-demo-local.md`.

## 4. Diff
**SQL — nine migrations of Phase 1 → 2e (idempotent; Phase 2+ generated from live function definitions; all registered in `tests/migration-directory-guard.test.ts`, 36 new migrations):**
* `20261009120000_phase1_financial_report_authz.sql`, `20261009130000_phase1_1_membership_roles_audit.sql`, `20261009140000_phase1_2_finance_read_permissions.sql` — see their reports.
* `20261010120000_phase2_ledger_reversals_and_trial_balance_opening.sql` — ledger/cash-flow/cash-position/bank-reconciliation/bank-match/auto-match/WIP status filter `IN ('POSTED','REVERSED')`; `get_trial_balance` with the Phase 1 guard; `get_trial_balance_with_opening`; policy `platform_audit_logs_select_org_auditor`; `get_audit_actor_names`.
* `20261011100000_phase2b_receivable_account_setting.sql` — `organization_finance_settings.receivable_account_id` + validation trigger; `issue_dues` refuses a missing / foreign / non-asset / group / inactive receivable account.
* `20261011100100_phase2b_default_receivable_account_rpcs.sql` — `get_default_receivable_account` (read: `finance.dues.issue` or `finance.accounts.manage`), `set_default_receivable_account` (`finance.accounts.manage`, audited).
* `20261012100000_phase2c_bank_reconciliation_unhandled_lines.sql` — `finalize_bank_reconciliation` refuses any statement line not matched to a booked entry (strict; no explanation exception).
* `20261013100000_phase2d_dues_require_open_period.sql` — `assert_open_fiscal_period_for_date`; `issue_dues` and `record_member_opening_balance` refuse atomically when no OPEN period covers the date and verify the posting.
* `20261014100000_phase2e_bank_reconciliation_strict_upgrade.sql` — forward migration: converges a database that applied the superseded 2c (audit-retires explained lines, drops the explanation mechanism, strict finalize); no-op on a fresh build.
**App:** `finance/reports/{trial-balance,balance-sheet,cash-flow,cash-flow-forecast,audit-trail}`, `finance/dues/{page,dues-client,dues-dialogs}.tsx`, `finance/payments/payments-dialog.tsx` (Bank transfer option), `finance/banks/reconciliation/[statementId]/{page,reconciliation-actions}.tsx` (strict note only), `lib/actions/{receivables,bank-reconciliation}.ts`, `dashboard/*`, `members/page.tsx`, `property/page.tsx`, `(app)/layout.tsx`, `account/page.tsx`, `finance/journals/new/*`, `components/ai/journal-copilot-card.tsx`, `app/api/ai/journal-propose/route.ts`, `lib/ai/availability.ts` (new), `lib/supabase/types.ts`.
**Tooling:** `scripts/demo-local/{lib,stack,app,start-prod,build,scan-bundle,run-vitest-local,e2e,make-review-bundle,verify-review-bundle}.mjs`, `package.json` scripts, `playwright.config.ts` (local-only guard), `vitest.config.ts` (`hookTimeout: 60000`), `tests/helpers/{local-target,gate-release}.ts`, `tests/e2e/helpers/{local-only,accounting-fixture}.ts`.
**Tests (new):** `tests/e2e/accounting-{journey,bank-reconciliation,bank-unhandled-lines,open-period-required,issue-partial-success,duplicates,demo-defects,receivable-default,void-permission}.spec.ts`, `tests/e2e/{trial-balance-opening-db,re-prior-year-boundary}.spec.ts`, `tests/receipt-methods-contract.test.ts`, `tests/bank-reconciliation-upgrade.integration.test.ts` (+ fixture `scripts/demo-local/fixtures/phase2c-superseded-explain-exception.sql`), `tests/owner-portal-functions-authz.integration.test.ts`, `tests/ai-journal-propose-route.test.ts`, `tests/local-target-guard.test.ts`; updated `tests/security-function-grants.integration.test.ts`, `tests/migration-directory-guard.test.ts`, `tests/final-hardening-migration.test.ts`, `tests/tenant-dashboard-access.test.tsx`; fixture fix in `tests/payments/{payment-provider-settings-reverify,payment-provider-verification-race,resolve-credentials}.test.ts` (active membership).
Not mine / not included in the review bundle: the uncommitted Fawry, mobile and tooling work already in the tree (`lib/payments/providers/fawry.ts`, `lib/actions/online-payment-checkout.ts`, `lib/payments/fawry-initiation-policy.ts`, `tests/payments/fawry-*`, `mobile/**`, `.claude`, `.agents`, `.mcp.json`).

## 5. Verification (exact commands and numbers)
All runs on the **recreated** clean stack (rebuilt from scratch in round 4: ledger 69 / files 69 → MATCH; `db diff` no schema changes), the browser suites served from the **final production build** (`node scripts/demo-local/build.mjs --next-only`, then `start-prod.mjs`). Logs: `docs/audits/phase2-evidence/{final-e2e-run,integration-run,unit-run,seven-files-run}.log`.

| What | Command | Total | Passed | Failed | Skipped |
|---|---|---|---|---|---|
| Browser + DB evidence — journey 15, bank 9, bank strict finalize 4, **open period required 6**, issue partial success 3, duplicates 5, demo defects 6, trial-balance DB 4, receivable default 5, void permission 4, RE-PRIOR 4 | `npm run demo:e2e -- <the 11 spec files>` | 65 | **65** | 0 | 0 |
| Earlier phases + affected integration, **plus the upgrade-path test** — 20 files, serially (`--no-file-parallelism`) | `node scripts/demo-local/run-vitest-local.mjs --no-file-parallelism <20 files>` | 309 | 308 | 1 (pgTAP #15, §6) | 0 |
| Unit suite, 83 files — **last run in round 3; no application code changed in round 4** (SQL, a fixture and one integration test only) | `node scripts/demo-local/run-vitest-local.mjs <83 files>` | 784 | 778 | 6 (all in `sandbox-pilot.manual`, §6) | 0 |
| The seven files that failed to load before, each separately | `run-vitest-local.mjs --each <7 files>` | 7 files | 6 pass | `sandbox-pilot.manual` (6 of 9 tests) | 0 |
| Production build | `node scripts/demo-local/build.mjs --next-only` | – | exit 0: compiled, TypeScript passed, 225/225 static pages | – | – |
| Typecheck / lint | `npx tsc --noEmit` / `npx eslint` on touched paths | – | exit 0 / 0 errors | – | – |

**Not green, stated plainly:** `tests/sandbox-pilot.manual.test.ts` needs approved production tax-rule data; pgTAP #15 is stale. Everything else in the listed suites is green. Not run: the Flutter tests, `npm run test:sql-local`, the full `test:all` chain, the OpenNext (Cloudflare) build after round 3 (the plain `next build` was re-run), any run against the development stack or the hosted project.

## 6. Failures classified (none left unexplained)
| Failure | Evidence | Classification | Remediation |
|---|---|---|---|
| `tests/sandbox-pilot.manual.test.ts` (6 of 9) — `RULE_MISSING` | `tax_rule_versions` has 0 rows on the clean stack; the file's header says it uses the approved production rules already in the database | **ENVIRONMENT_OR_HARNESS** (data prerequisite) | none; cannot run locally without importing hosted data. `pilot-rehearsal.manual` (fake rules) passes 9/9 |
| `pgtap` #15 — `PGRST202` for `create_online_payment_checkout_transaction(p_due_ids, p_provider)` | the function has 5 arguments since `20260924072325…`; the test calls the old 2-argument form | **TEST_EXPECTATION_BUG** (unrelated) | logged U3 |
| `membership-status-access` ×3 (round 2 only) — `chart_of_accounts: expected { message: '' } to be null`, ~8 s each, in the 19-file **parallel** run | the `authenticated` role has `statement_timeout = 8s`; the clean stack holds 200 organizations / 2,733 accounts from repeated runs; the same file alone: **17/17 pass**; an unfiltered RLS count of `chart_of_accounts` took 1.3 s alone | **FLAKY / ENVIRONMENT** (parallel load + accumulated test data) | not changed; run serially in round 3: all 301 integration tests but pgTAP #15 pass. Observation G8 |
| Issue-partial spec I2 — the audit had 2 rows instead of 1 | trace: the same server action POSTed twice 0.9 s apart from the toast's Retry control | **PRODUCTION_BUG** (double dispatch of the retry) | handler guarded (one attempt at a time, none after success); 59/59 after rebuild |
| New open-period spec, first runs (round 3) — three failures | (1) the "already recorded" guard fires before the period check for a member that already has an opening balance; (2) opening balances cannot be future-dated, so a PLANNED 2027 date is refused for another reason; (3) the opening-balance dialog shows the message without the code prefix | **TEST_EXPECTATION_BUG** ×3 (the functions behaved correctly) | second member without an opening balance; PLANNED 2024; assertion on period/date/status | 
| `final-hardening-migration` "MVP contract" — failed when Bank Transfer was enabled (round 1) | the test pinned that the dialog must not contain it | superseded by the decision in round 2c | rewritten as behaviour (`receipt-methods-contract.test.ts`); passes |
| `security-function-grants` — 10 owner-portal functions not in the baseline | reviewed and tested with real sessions (§0c): no defect | baseline stale, not a defect | baseline updated as a documented group; 4/4 |
| 8 payment-provider tests — `FORBIDDEN … إدارة مزودي الدفع` | fixtures assigned a role without an active membership; since Phase 1.1 such a user has no access | **TEST_EXPECTATION_BUG** (fixture) | fixtures create the membership; pass |
| `resolve-credentials` scenario 5 — `PAYMENTS_ENV_INVALID` | provider variables intentionally unset | **ENVIRONMENT_OR_HARNESS** | dummy provider values in `run-vitest-local.mjs`; 6/6 |
| 5 unit files "Refusing to run: target …supabase.co is not a known local Supabase API" | `.env.local` points at the hosted project; the write-safety guard refuses | **ENVIRONMENT_OR_HARNESS** — the guard working | run on the clean stack |
| `w0-sec-postgres-invariants`, `fawry-v1-sql-proposal` — hook timed out at 10 s | pass on rerun; PGlite cold start under load | **FLAKY** | `hookTimeout` 60 s |
| Journey V6 — label "Current Period Surplus / Earnings" | the balance sheet now splits prior years and the current fiscal year | **TEST_EXPECTATION_BUG** (intended change) | assertion updated |
| Browser runs that timed out at login / failed at a screenshot | `os error 112` / `ENOSPC` (D: full) | **ENVIRONMENT_OR_HARNESS** | runs discarded; production build; Playwright artifacts on the system temp folder |
| `final-hardening.integration` on the clean stack | hard-coded port 54321 | **ENVIRONMENT_OR_HARNESS** | logged U5; not run |

## 7. Demo blockers
None stops the accounting demo as scripted. Present it exactly as scripted:
1. **The approved receivable account must be set once by the owner.** In an organization where nobody has done it, the issue-due dialog is empty by design and asks for an explicit choice; the accountant cannot save it as the default.
2. **Every bank line must be matched to a booked entry before a reconciliation can be finalized** — there is no way to defer or justify an unbooked fee. The accountant creates the fee entry and submits it, the owner (or a finance manager) posts it, then the line is matched. The shipped chart has **no bank-charges account**; the demo adds `5410`.
3. **The payment dialog allocates to one due only.** The "reference / cheque #" input is not stored.
4. **A due or an opening balance needs an OPEN fiscal period covering its date** — otherwise it is refused with a message naming the cause (nothing is created). **Reversal is dated "today"** and needs an OPEN period containing today; the journey assumes it runs in 2026. Opening balances cannot be future-dated.
5. **Reversing a receipt needs `finance.payments.void`** (owner and finance-manager templates). The demo accountant has it added explicitly; say so, or demo the reversal as the owner.
6. The journal-entry form defaults the **fiscal period to the first one listed**, not the one containing the entry date — choose it.
7. **AI is off** by design; dashboard counts are ownership-based. No year-end close exists: `RE-PRIOR` appears wherever a report spans an unclosed year — do not call the year closed.

## 8. Deployment blockers (separate from the demo)
1. **Nine migrations exist only on this machine:** `20261009120000`, `…130000`, `…140000`, `20261010120000`, `20261011100000`, `20261011100100`, `20261012100000`, `20261013100000`, `20261014100000`. Apply them in order. A database that applied an earlier, superseded text of `20261012100000` is converged by `20261014100000`; do **not** hand-edit already-applied migrations again. Validated only on a disposable local stack. Applying them to any shared environment, with backup and order, is your decision; none was applied.
2. **Behaviour changes to communicate:** reversed originals now counted in ledger reports; the balance sheet separates prior-year results; the trial balance has opening columns; `issue_dues` refuses unspecified accounts (callers must pass a valid receivable account); **`finalize_bank_reconciliation` now refuses any unmatched bank line** — statements that were finalizable before need the missing entries booked and matched; **`issue_dues` and `record_member_opening_balance` now refuse a date with no OPEN fiscal period** (callers that relied on silent creation must open the period first). Existing organizations have no approved receivable account until an owner sets one.
3. **Rollout compatibility of `replace_role_permissions_atomic`** (Phase 1.2): follow `docs/runbooks/role-permissions-signature-rollout.md`.
4. **The old `.open-next` output was deleted** (a local build had replaced it with a bundle built against the local database). **Rebuild with the real environment before any deploy**; the build copies the git-ignored `.env.production` into its output folders (hosted public keys only).
5. **The grants baseline now describes the migrated schema**; the old drifted development database will be reported as missing functions until migrated.
6. **Hosted verification not done** (forbidden). `tax_rule_versions` data is a production prerequisite of the sandbox pilot.
7. The user's own uncommitted Fawry/mobile/tooling changes need their own review before any release; they are excluded from the review bundle.
8. **Disk:** D: has under 1 GB free; the next large build or dev-server run on this machine can fail until space is freed (`.worktrees` and `mobile` are the large items; not touched).

## 9. Findings logged (not expanded into this phase)
| # | Finding | Impact | Blocks demo? | Blocks deployment? |
|---|---|---|---|---|
| U1 | *(resolved)* grants baseline vs 10 owner-portal functions — reviewed, tested, no defect; baseline updated (§0c) | – | No | No |
| U2 | `OPENING_BALANCE_ALREADY_RECORDED` is shown in Arabic on the English page | cosmetic | No | No |
| U3 | `pgtap` #15 calls `create_online_payment_checkout_transaction` with the old 2-argument signature | stale test (same on dev) | No | Only for CI |
| U4 | *(resolved in §0h-2)* an identical due skipped by the duplicate guard was reported as issued | – | No | No |
| U5 | `final-hardening.integration` hard-codes port 54321 | cannot run on another stack | No | No |
| U7 | Next.js 16 warns `middleware` is deprecated in favour of `proxy` | future breakage | No | No |
| G1 | The shipped RESORT_STANDARD chart has no bank-charges account | bank fees need a manually added account | Mention it | No |
| G2 | The journal form's fiscal-period default is the first listed period; other dialogs also default unit / due type / period to the first item | wrong period if not checked | Mention it | No |
| G3 | *(resolved in §0g-1, strictly)* finalize accepted a zero difference with an unbooked bank line | – | No | No |
| G4 | `void_payment` answers `PAYMENT_NOT_FOUND` before the permission check | existence of payment ids within an organization visible to a caller without the key | No | Low |
| G5 | `get_member_portal_access.shared_identity` reports one boolean about the owner's identity being active staff in *any* organization | one bit across tenants | No | Low |
| G6 | *(resolved in §0g-3)* Bank Transfer excluded from the receipt form | – | No | No |
| G9 | Dues created by leases, recurring schedules and installments, and by `post_due_to_ledger` callers other than `issue_dues` / opening balances, still tolerate a missing OPEN period (the due waits for "recognize"); only the two user-facing creation paths were tightened | a due can exist without an entry on those paths until recognized | No | Review |
| G11 | The upgrade test proves the migration against the exact old schema and functions with synthetic data, not against a copy of a real tenant database | residual risk for a database with unusual states | No | Rehearse on a copy first |
| G10 | Opening-balance guard order: "already recorded" is checked before the fiscal period | none; noted for message clarity | No | No |
| G7 | Disk exhaustion on D: broke a build, a dev server and a migration write during this work | tooling | Risk | Risk |
| G8 | Unfiltered counts under RLS on large tables degrade with total rows (policy function per row; `authenticated` has an 8 s statement timeout); 3 tests timed out only under parallel load with 2.7k accounts. The app's own queries are organization-filtered | possible slow admin/export queries at scale | No | Review |

## 10. Limits
* Everything ran on a local stack with fictional data. The browser suites were served from a production build made with the local environment only; the app uses `next/font/google` (public font files, no credentials), and I did not capture network traffic during the build.
* Hosted environments, real payment providers, real email/SMS and AI providers were not used; the payment tests used dummy values and a closed loopback port.
* Not run: the Flutter tests, `test:sql-local`, the full `test:all` chain, the OpenNext worker itself, any run against the development database. `tests/sandbox-pilot.manual.test.ts` cannot pass without production tax-rule data.
* Where this report says "passed", the command and count are in §5.
