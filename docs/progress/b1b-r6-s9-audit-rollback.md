# B1b r6 S9: audit-failure rollback test

Scope: isolated r6 database only. Owner approval granted for this scope.

## 1. Container identity

- Container: `g0r6-db` (access via `docker exec g0r6-db sh -c "psql -h /run/postgresql -U postgres -d postgres -X ..."`, unix socket only)
- `current_database()` = `postgres`
- `version()` = PostgreSQL 17.6 on x86_64-pc-linux-gnu
- `inet_server_addr() is null` = `t` (no TCP)
- No g0rehearsal-*, g0_iso_test, aqarbooks*/supabase_*, or other project containers touched.

## 2. Function definition md5 (md5 of `pg_get_functiondef`)

| Function | Before (step 1) | After ROLLBACK (step 4) | Result |
|---|---|---|---|
| `append_financial_audit_event(uuid,text,text,uuid,uuid,text,inet,text,jsonb)` | b86869928ce8dd3f36e12c40d70eb994 | b86869928ce8dd3f36e12c40d70eb994 | PASS (unchanged) |
| `open_fiscal_year(uuid,uuid,text)` | 11d4414083067bbbee87fc478251d868 | 11d4414083067bbbee87fc478251d868 | PASS (unchanged) |
| `close_fiscal_year(uuid,uuid,uuid,text,text)` | 30c182ca8a84e5648e78ce4bcc56bcec | 30c182ca8a84e5648e78ce4bcc56bcec | PASS (unchanged) |
| `create_fiscal_year(uuid,text,date,date)` | a5de277037be670d7c5703f4388f6707 | a5de277037be670d7c5703f4388f6707 | PASS (unchanged, checked at final cleanup) |

Inside the injection transaction the md5 of `append_financial_audit_event` became `65226b8df89820fd33294bb22a11c33e` (injected body active), confirming the injection took effect before rollback.

## 3. Fixtures

- Method: test user inserted into `auth.users` as `postgres` (email `s9-rollback-test@example.invalid`, no password hash). A profile row was created by the existing `handle_new_user` trigger.
- Auth context: `set_config('request.jwt.claims', '{"sub":"<test user>","role":"authenticated"}', true)` inside each transaction, so `auth.uid()` returns the test user for the SECURITY DEFINER functions. No `SET ROLE`.
- Organization `d6000000-0000-4000-8000-000000000001` (status ACTIVE), active membership, org-scoped role with `finance.periods.manage` and `finance.years.close`, and a role assignment.
- Chart of accounts: cash (ASSET), revenue (REVENUE), retained earnings (EQUITY, `is_retained_earnings`).
- Fiscal years created with `create_fiscal_year` (12 monthly periods each):
  - `S9 Year A` (2030): PLANNED, all periods PLANNED. Target of the open test.
  - `S9 Year B` (2031): all periods set to CLOSED via `set_fiscal_period_status`, plus one POSTED journal entry (JOURNAL_VOUCHER, 2031-06-15, Dr cash 100 / Cr revenue 100). Target of the close test. Closing is possible in this state.
- Setup was committed (throwaway fixtures). A preflight in a rolled-back transaction confirmed `close_fiscal_year` succeeds on Year B (`ok: true`, `net_income 100.0000`, 2 lines, one closing row), so any later failure is attributable to the injection.

## 4. Injection test (single transaction, ended with ROLLBACK)

`append_financial_audit_event` replaced by `CREATE OR REPLACE` with the same signature, defaults, `SECURITY DEFINER`, and `search_path`, body `RAISE EXCEPTION 'S9_INJECTED_AUDIT_FAILURE' USING ERRCODE = 'XX000'`. Each target call ran inside a SAVEPOINT.

| Check | Expected | Observed | Result |
|---|---|---|---|
| T1 `open_fiscal_year` on Year A | Failure | `ERROR XX000: S9_INJECTED_AUDIT_FAILURE`, raised from the audit PERFORM in `open_fiscal_year` | PASS |
| T1 Year A status after failure | PLANNED | PLANNED | PASS |
| T1 Year A periods | 12 PLANNED, none OPEN | 12 PLANNED | PASS |
| T1 FISCAL_YEAR_OPENED audit rows | 0 | 0 | PASS |
| T1 `fiscal_period.status_changed` platform events for org | 12 (only the committed Year B setup events; none from the failed open) | 12 | PASS |
| T2 `close_fiscal_year` on Year B | Failure | `ERROR XX000: S9_INJECTED_AUDIT_FAILURE`, raised from the audit PERFORM in `close_fiscal_year` | PASS |
| T2 Year B status after failure | PLANNED | PLANNED | PASS |
| T2 `fiscal_year_closings` rows | 0 | 0 | PASS |
| T2 YEAR_END_CLOSING entries | 0 | 0 | PASS |
| T2 journal entries / lines | 1 / 2 (only the seed) | 1 / 2 | PASS |
| T2 `chart_of_accounts.is_used = true` rows | 0 | 0 | PASS |
| T2 financial audit rows | 0 | 0 | PASS |
| T2 Year B periods | 12 CLOSED (unchanged) | 12 CLOSED | PASS |

Note on the T1 and T2 error paths: the original functions have no exception handler around the audit call, so the injected error aborts the whole statement and its earlier writes (period status updates, year status update, closing entry and lines, closing row) are undone.

## 5. Success path after ROLLBACK (step 4)

`open_fiscal_year` on Year A, inside a transaction that was then rolled back:

- Result: `{"ok": true, "opened_period_count": 12}`
- Year A status OPEN, 12 periods OPEN, one `FISCAL_YEAR_OPENED` audit row (previous PLANNED, new OPEN, 12 periods, hash present).
- After ROLLBACK: Year A PLANNED, 12 PLANNED periods, 0 financial audit rows, 17 platform audit rows (unchanged).

## 6. Close failure (step 5)

Done within the section 4 transaction (T2). Not BLOCKED.

## 7. Cleanup (step 6)

- Transaction 1 (committed): reset Year B periods to PLANNED via `set_fiscal_period_status`, deleted journal lines and entries, platform audit rows, chart of accounts, role assignments, role permissions, role, membership, then the organization (fiscal years and periods removed by cascade).
- Transaction 2 (committed): deleted the profile and the `auth.users` row.
- Verification (all 0): organization, fiscal years, periods, entries, chart of accounts, memberships, platform and financial audit rows, closings, auth user, profile, S9 role. Total organizations = 0 and total auth users = 0 in r6 after cleanup (both were 0 before setup).

## 8. Summary

| Item | Result |
|---|---|
| Identity proof | PASS |
| md5 unchanged after ROLLBACK (4 functions) | PASS |
| Open failure blocks, no partial rows | PASS (SQLSTATE XX000) |
| Close failure blocks, no partial rows | PASS (SQLSTATE XX000) |
| Open success path (rolled back) | PASS |
| Cleanup | PASS |
| BLOCKED items | None |

## Caveats

- The injected error uses SQLSTATE XX000 (internal error) to model an unexpected failure in the audit function; it is not a production code path.
- Platform audit rows for the org totalled 17 after the committed setup and again after the open-success ROLLBACK. The `fiscal_period.status_changed` count inside the failure transaction (12) matches the setup events only.
- `auth.users` insertion was performed as the postgres superuser. No password or secret was stored or displayed.
