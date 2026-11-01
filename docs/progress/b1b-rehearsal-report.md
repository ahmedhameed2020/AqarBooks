# B1B fiscal year close rehearsal report

Scope: SQL-level rehearsal of fiscal year close, retained earnings, closed-period guards, authorization,
direct-write guards, privileges, organization deletion, concurrency, and reporting, inside an isolated
local Postgres container. No application, E2E, or Playwright tests were run. Nothing in this repository
was modified except this file. No git write commands were run.

## Verdict

**FAIL.** 77 checks passed, 5 failed, 1 blocked (83 checks total).

- Real defect: `TRUNCATE` is granted on `fiscal_years` and `fiscal_periods` to `anon`, `authenticated`
  and `service_role` (scenario S12, 4 checks failed).
- Spec conflict: the brief's literal wording for get_trial_balance in S3 contradicts its S16 wording. The
  literal S3 check failed (1 check). The code is consistent with S16.
- Blocked: the S9 variant that forces `append_financial_audit_event` to fail (1 check). See S9.

## Container identity

- Name: `g0rehearsal-b1b-20261024r3`
- Image: `public.ecr.aws/supabase/postgres:17.6.1.165`
- Network: `none`; published ports: none
- Status at start: running, healthy
- Access used: `docker exec g0rehearsal-b1b-20261024r3 sh -c "psql -h /run/postgresql -U postgres -d postgres -X ..."` only
- Other containers touched: none. The stopped `g0rehearsal-b1b-20261024`, `g0rehearsal-b1b-20261024r2` and the Vector container were not touched.

## Migration apply summary

- `/work/mig/apply.log`: 90 lines beginning `OK`, 0 other failure lines, final line `ALL 90 APPLIED`.
- Range: baseline `20260821105505` through `20261019100200` (including `20261019100000`, `20261019100100`, `20261019100200`).
- Storage schema stub applied as rehearsal-only (per the brief).

## SQL compilation

- All 90 migrations applied with stop-on-first-error and no errors.
- All functions exercised by the scenarios (close_fiscal_year, designate_retained_earnings_account,
  create_fiscal_year, set_fiscal_period_status, create_journal_entry, post_journal_entry,
  reverse_journal_entry, get_trial_balance, get_trial_balance_with_opening, guard triggers) executed
  without compilation errors.

## Method

- Impersonation: `auth.uid()` reads `request.jwt.claim.sub` in this stack. The harness sets that claim and
  `SET ROLE authenticated` (or `anon`) per call, so authorized-path tests are real, not BLOCKED.
- Organization setup used the product RPCs as the TENANT_OWNER session (`clone_tenant_role_templates`,
  `designate_retained_earnings_account`, `create_fiscal_year`, `set_fiscal_period_status`,
  `create_journal_entry`, `post_journal_entry`). Chart of accounts and cost centres were inserted directly as
  postgres (master data).
- Harness: psql temp functions (`pg_temp.run_as`, `pg_temp.expect_err`, etc.) capture SQLSTATE and RAISE message
  without aborting. Scripts are kept outside the repo at `C:\Users\Lenovo\AppData\Local\Temp\g0-tests\`
  (`00_harness.sql`, `10_setup.sql`, `15_mkorg.sql`, `16_helpers.sql`, `20_scenarios.sql`,
  `25_concurrency_setup.sql`, `26_atomicity.sql`, `race_*.sql`). Container copies: `/work/tests/`.
  Output: `/work/tests/run3.out` (main), `/work/tests/run_s9.out` (S9), `/work/tests/race_*.out` (S14).

## Scenario results

| # | Scenario | Result | Checks | Evidence (SQLSTATE / values) |
|---|---|---|---|---|
| 1 | Setup (org, membership, TENANT_OWNER, FY 2025 + 12 periods, COA, cost centres, RE designation) | PASS | 3/3 | 13 orgs, 12 periods, RE flagged |
| 2 | Posting: profit (A), loss (B), breakeven (C), zero temporary accounts (D) | PASS | 1/1 | 7 entries POSTED |
| 3 | close_fiscal_year profit / loss / breakeven / nothing to close | FAIL | 16 PASS, 1 FAIL | A: ok, net_income 800.0000, line_count 3, closing 1000.0000/1000.0000, entry_date 2025-12-31, RE credit 800.0000. B: net_income -300.0000, RE debit 300.0000. C: net_income 0.0000, no RE line. D: `NOTHING_TO_CLOSE`, year stays PLANNED. FAIL: literal "get_trial_balance temporary accounts net to zero" (see defect 4) |
| 4 | Multiple cost centres; NULL centre on required account; unknown/inactive centre | PASS | 7/7 | E: two RE lines CC1 400.0000, CC2 250.0000, net 650.0000, 6 lines, balanced 800.0000/800.0000. F: `COST_CENTER_REQUIRED`, no writes. Unknown centre id: SQLSTATE 23503 (FK on journal_entry_lines.cost_center_id). G: deactivated centre with balance: `COST_CENTRE_INVALID` |
| 5 | Draft entry in year | PASS | 3/3 | `UNREVIEWED_ENTRIES_EXIST`, no writes |
| 6 | Closed period: posting refused; reversal in closed period; reversal of closing entry | PASS | 4/4 | P0001 `fiscal period is not open`; P0001 `ENTRY_IN_CLOSED_PERIOD`; P0001 `CLOSING_ENTRY_NOT_REVERSIBLE` |
| 7 | RE account validation (NULL, non-EQUITY, inactive, group, other org) | PASS | 7/7 | `RE_ACCOUNT_REQUIRED`; `RE_ACCOUNT_INVALID` x4; no writes; valid RE then close ok (400.0000) |
| 8 | Idempotency | PASS | 4/4 | same key + same year: already_closed true, same closing_entry_id, 1 closing row, 1 closing entry. same key other year: `OPERATION_KEY_REUSED`. other key same year: `ALREADY_CLOSED` |
| 9 | Atomicity | BLOCKED (audit variant) / PASS (alternate) | 4 PASS, 1 BLOCKED | See S9 note below |
| 10 | Authorization | PASS | 7/7 | unauthenticated 42501 `AUTHENTICATION_REQUIRED`; AUDITOR member 42501 `FORBIDDEN_CLOSE_PERMISSION`; platform admin not a member 42501 `FORBIDDEN_CLOSE_PERMISSION`; outsider 42501; anon 42501 "permission denied for function"; anon has no EXECUTE; no unauthorized closing rows |
| 11 | Direct status writes | PASS | 6/6 | reopen 42501 `FISCAL_YEAR_REOPEN_NOT_ALLOWED`; direct fiscal_years CLOSED 42501 `FISCAL_STATUS_DIRECT_WRITE_BLOCKED`; direct fiscal_periods writes 42501 `FISCAL_STATUS_DIRECT_WRITE_BLOCKED`; set_fiscal_period_status reopen in closed year P0001 "fiscal year is closed; its periods cannot be reopened" |
| 12 | TRUNCATE privileges | FAIL | 2 PASS, 4 FAIL | see defect 1 |
| 13 | Organization deletion | PASS | 6/6 | open-calendar-only org deleted (1 row), no fiscal rows left. Closed-year org: refused and rolled back (22023 `COA_USED_DELETE_FORBIDDEN`, see defect 5). Direct DELETE of a CLOSED fiscal_years row: 42501 `FISCAL_STATUS_DIRECT_WRITE_BLOCKED` |
| 14 | Concurrency | PASS | 2/2 | see below |
| 15 | P2 opening balance | PASS | 4/4 | BEFORE close: `1110=800.0000 ; 3100=0 ; RE-PRIOR=800.0000` (RE-PRIOR credit 800). AFTER close: `1110=800.0000 ; 3100=800.0000`, no RE-PRIOR row (zero) |
| 16 | Historical income statement after close | PASS | 1/1 | get_trial_balance 2025: `4100=1000.0000 ; 5100=200.0000` |

### S3 correction (dated 2026-10-24)

- Conflict: the literal S3 expectation "get_trial_balance temporary accounts net to zero" contradicts S16.
  get_trial_balance excludes YEAR_END_CLOSING lines for REVENUE and EXPENSE
  (`supabase/migrations/20261019100200_fiscal_year_close_permission_and_reports.sql` lines 97-107), so the
  historical income statement keeps 2025 revenue and expense. Both cannot hold at once.
- Corrected expectation: "book balance of temporary accounts after closing is zero; historical income
  statement excludes the closing entry and keeps 2025 revenue/expense".
- This note is additive. The recorded PASS/FAIL values of the earlier run are unchanged. Definition 4 above
  stands as recorded. Details: `docs/progress/report-semantics.md`.

### S9 atomicity

- The specified variant (forcing `append_financial_audit_event` to fail) is **BLOCKED**. Doing it requires
  replacing a real function, even if only inside a rolled-back transaction, and the brief prohibits that.
- Alternate, non-altering mid-function failure (PASS): closing totals of 1.8e15 overflow `numeric(19,4)` at the
  first closing line insert (SQLSTATE 22003 "numeric field overflow"). The closing entry header is inserted
  before that point in `close_fiscal_year`, so this exercises rollback of a partial write.
  After the failure: no fiscal_year_closings row, no YEAR_END_CLOSING entry, entry count unchanged (2), year
  still PLANNED, all 12 periods still CLOSED, no FISCAL_YEAR_CLOSED audit row, no closing lines.
- Not verified: the audit-write failure path specifically, and a failure after the year-status UPDATE.

### S14 concurrency (separate psql sessions)

- Two closers on org J (keys race-key-1 and race-key-2, same year): race-key-2 returned ok (net_income
  200.0000, line_count 3); race-key-1 returned `ALREADY_CLOSED`. Result: exactly 1 closing row, 1 YEAR_END_CLOSING
  entry, year CLOSED. PASS.
- Closing vs posting on org K: close transaction held open 5 s after writing; closing committed at 11:48:16.406.
  The posting session's `create_journal_entry` blocked for about 4 s behind the closing transaction (cause not
  isolated; plausibly the `next_sequence_value` row lock). `post_journal_entry` then raised P0001
  `fiscal period is not open`. Posting after CLOSED is refused. Posting before closing cannot succeed because
  close requires every period CLOSED first.

## Defects

1. **TRUNCATE privilege on fiscal tables (IMPORTANT).**
   `has_table_privilege` returns true for TRUNCATE on `public.fiscal_years` for `anon`, `authenticated`,
   `service_role`, and on `public.fiscal_periods` for `anon`, `authenticated`, `service_role`.
   Row-level guards (`trg_fiscal_years_status_guard`, `trg_fiscal_periods_status_guard`, FOR EACH ROW) do not
   fire on TRUNCATE, so protection depends on foreign keys. In the probe, `TRUNCATE public.fiscal_years CASCADE`
   as `authenticated` failed with 42501 "permission denied for table fiscal_year_closings", so the cascade was
   blocked by privileges, not by the guard. The probe was rolled back; row count unchanged.
   Suggested fix, not applied: `REVOKE TRUNCATE ON public.fiscal_years, public.fiscal_periods FROM anon, authenticated, service_role;`
   Likely caused by Supabase default privileges, so other tables may have the same grant (not checked).

2. **Drafts can be created in closed periods (IMPORTANT, decision needed).**
   `create_journal_entry` (-> `create_journal_entry_internal`) accepts an entry dated in a closed period. S6 created
   a DRAFT dated 2025-03-20 in the closed March period, and the S14 posting race left a DRAFT dated 2025-07-10 in
   the closed 2025 of org K. Posting is refused (P0001 `fiscal period is not open`), so no ledger impact, but drafts
   accumulate in closed years. Decide whether creation should be refused.

3. **fiscal_years.status has no OPEN path (MINOR, decision needed).**
   Default is `PLANNED`. The only transition is to `CLOSED`, so an open year with open periods stays `PLANNED`
   (observed after every setup). Reports or UI that read year status will show PLANNED.

4. **Spec conflict: get_trial_balance and closing entries (SPEC).**
   get_trial_balance (20261019100200) excludes YEAR_END_CLOSING lines from REVENUE/EXPENSE by design, so
   revenue/expense stay non-zero for the closed year (S16 PASS). The S3 literal wording ("temporary accounts net to
   zero in get_trial_balance") is therefore FAIL. Ledger-level net is zero (S3 PASS). Owner should confirm which
   wording is correct.

5. **Organization delete with a closed year is refused by another guard first (MINOR).**
   `DELETE FROM organizations` for an org with a closed year fails with 22023 `COA_USED_DELETE_FORBIDDEN`
   (posted accounts are marked used), so `FISCAL_CLOSED_RECORD_DELETE_BLOCKED` is not reached at organization
   level. The row is kept (rolled back). Direct DELETE of the CLOSED year row is blocked by the fiscal guard
   (42501 `FISCAL_STATUS_DIRECT_WRITE_BLOCKED`).

## Corrections made during the run (transparency)

- First pass had 11 FAILs. Four were harness expectations assuming year status OPEN where the schema says PLANNED
  (S3-D, S4-F, S5-H, S7-I). One was a numeric text format mismatch (S16). One expected a specific error code for
  org delete where the refusal was by another guard (S13). Expectations were corrected and the full suite was
  rerun. The remaining FAILs are the 4 TRUNCATE checks and the S3 literal check.
- The scenario re-run created new rehearsal organizations each time, so the container holds about 40 rehearsal
  organizations from three setup passes plus org L. These are rehearsal fixtures only.

## Not verified / limitations

- No integration, E2E, or Playwright tests were run. None of the repo test suites were executed against this container.
- S9 audit-write failure variant: BLOCKED (see above).
- TRUNCATE by anon and service_role was checked by privilege only, not by execution.
- Only fiscal tables were checked for TRUNCATE; other tables were not.
- Rehearsal state left behind in the container (not removed, per rules): test users in `auth.users`; a global
  `PLATFORM_SUPER_ADMIN` role (organization_id NULL) and its assignment to the test admin user; DRAFT residues
  described in defect 2; about 40 rehearsal organizations (slugs prefixed `g0reh-`). `org_T2` remains with a closed year.
  One empty file `/tmp/q1.sql` may exist from an earlier hung command; it is outside the repo.
- Concurrency ordering in S14 was observed, not forced; the create-side blocking cause was not isolated.
