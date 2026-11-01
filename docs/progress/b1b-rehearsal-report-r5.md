# B1B rehearsal report, run R5 (fresh container)

Scope: SQL-level rehearsal of the fiscal year close fixes (R4 migrations 20261019100300, 20261019100400, 20261019100500 and
the guard branch in 20261019100100), in a brand-new isolated PostgreSQL container. No application, E2E or Playwright tests
were run. No git write commands were run. Nothing was committed, pushed, merged or deployed. Batch 2 was not started.
The only repository file created is this report; `docs/progress/status.json` was updated for `sprint-2-batch-1b`.

## Verdict

**FAIL (narrow), status stays `blocked`.**

- 134 of 135 recorded checks PASS in the final run (run 3). The one FAIL is a single sub-check of drafts (check 4):
  the authenticated UPDATE that moves a draft into a closed period is a silent no-op (0 rows, no error), not the
  `FISCAL_PERIOD_NOT_OPEN` refusal that was specified. No data changed. The trigger refusal itself is PASS (see check 4).
- The original S9 audit-function variant remains BLOCKED (not executed, as in the previous run).
- The converted integration suites are BLOCKED (need the Supabase API stack; see check 9).
- Race checks (check 8) PASS. Organization deletion (check 10) PASS.

## Container identity and isolation

Created with: `docker run -d --name g0rehearsal-b1b-20261024r5 --network none --label project=g0-rehearsal-b1b
--label purpose=disposable-b1b-rehearsal -e POSTGRES_PASSWORD=<generated in-shell, not printed, not written to any file>
public.ecr.aws/supabase/postgres:17.6.1.165`

`docker inspect` (selected fields only; the full JSON was not dumped because it contains the container environment):

```
Id=fdffab1bec9b582a2be660eba1fdee4d0d1271413607573a14a732c32b419563
Name=/g0rehearsal-b1b-20261024r5
State=running Health=healthy
NetworkMode=none
Networks=none
Ports(published)=map[]
PortBindings=map[]
Labels=map[project:g0-rehearsal-b1b purpose:disposable-b1b-rehearsal]
Image=public.ecr.aws/supabase/postgres:17.6.1.165
Created=2026-10-24T12:20:21.566103952Z
```

Identity proof, run through `docker exec <name> sh -c "psql -h /run/postgresql -U postgres -d postgres -X ..."` only:

- `select current_database(), version(), current_user` returned `postgres | PostgreSQL 17.6 | postgres`, and
  `inet_server_addr() is null` = true (no TCP address).
- Roles: anon, authenticated, authenticator, dashboard_user, pgbouncer, postgres, service_role, supabase_admin,
  supabase_auth_admin, supabase_etl_admin, supabase_privileged_role, supabase_read_only_user,
  supabase_replication_admin, supabase_storage_admin.
- Databases: postgres, template0, template1.
- No TCP connection, no host port, no other container touched.

Storage schema stub (`storage-stub.sql`) applied as supabase_admin (rc 0). Its tables are owned by postgres.

## Migrations applied (role postgres, stop on first error)

Source: current repository files copied to `C:\Users\Lenovo\AppData\Local\Temp\g0-mig-r5\` (93 files; the stale g0-mig
fiscal copies were not used). Log in container: `/work/mig/apply-r5.log`, last line `ALL 93 APPLIED`. Zero failures, so no
SQLSTATE to report for apply.

| # | Migration | Result |
|---|---|---|
| 1 | 20260821105505_baseline.sql | OK |
| 2 | 20260823044325_member_invitation_access_codes.sql | OK |
| 3 | 20260823071129_member_archiving.sql | OK |
| 4 | 20260823075533_unit_archive_reason.sql | OK |
| 5 | 20260823083604_revert_unit_archive_reason.sql | OK |
| 6 | 20260823093809_operational_alerts.sql | OK |
| 7 | 20260823100424_alert_digest_runs.sql | OK |
| 8 | 20260823200624_property_reports_permission.sql | OK |
| 9 | 20260823200722_property_reports_permission_widen.sql | OK |
| 10 | 20260825084639_organizations_is_demo.sql | OK |
| 11 | 20260825124312_generate_lease_rent_dues_authz.sql | OK |
| 12 | 20260825124342_internal_helper_acls.sql | OK |
| 13 | 20260825182109_rent_partial_period_guard.sql | OK |
| 14 | 20260825231151_demo_readonly_hardening_and_cashier_read.sql | OK |
| 15 | 20260826072010_public_action_rate_limits.sql | OK |
| 16 | 20260826102930_assisted_onboarding_requests.sql | OK |
| 17 | 20260826124013_onboarding_request_idempotency_and_self_read.sql | OK |
| 18 | 20260829104638_legacy_access_migration_control_plane.sql | OK |
| 19 | 20260829105948_legacy_migration_raw_staging_tables.sql | OK |
| 20 | 20260829110027_legacy_migration_validation_views_v2.sql | OK |
| 21 | 20260831194315_accsys_migration_staging_schema.sql | OK |
| 22 | 20260831194442_accsys_stage_loader_casts.sql | OK |
| 23 | 20260831194633_accsys_stage_compact_bulk_tables.sql | OK |
| 24 | 20260831194850_accsys_stage_coa_shape.sql | OK |
| 25 | 20260831195011_accsys_materialize_function.sql | OK |
| 26 | 20260831195049_accsys_materialize_function_fix.sql | OK |
| 27 | 20260831195824_accsys_materialize_no_demo_flag.sql | OK |
| 28 | 20260831200103_accsys_materialize_operations.sql | OK |
| 29 | 20260831200142_accsys_ops_unique_receipt_numbers.sql | OK |
| 30 | 20260831201313_accsys_stage_verified_loader.sql | OK |
| 31 | 20260831201513_accsys_stage_dictionary_and_reset.sql | OK |
| 32 | 20260831205217_accsys_loader_strip_cr.sql | OK |
| 33 | 20260903172101_member_opening_balance.sql | OK |
| 34 | 20260913165500_w0_sec_authorization_containment.sql | OK |
| 35 | 20260914131953_maintenance_request_core.sql | OK |
| 36 | 20260914200226_maintenance_request_attachments.sql | OK |
| 37 | 20260914203712_maintenance_work_orders.sql | OK |
| 38 | 20260915050914_maintenance_cost_accounting_bridge.sql | OK |
| 39 | 20260915073908_visitor_invitations_secure_qr_passes.sql | OK |
| 40 | 20260915081839_gate_operations_access_ledger.sql | OK |
| 41 | 20260915100016_vehicles_unit_timeline_notifications.sql | OK |
| 42 | 20260917040349_amenity_bookings.sql | OK |
| 43 | 20260917183206_lease_renewal_database_contract.sql | OK |
| 44 | 20260917195950_lease_expiry_alerts.sql | OK |
| 45 | 20260918010000_lease_renewal_successor_activation.sql | OK |
| 46 | 20260919010000_batch_navigation_permissions.sql | OK |
| 47 | 20260924072325_online_payment_production_foundation.sql | OK |
| 48 | 20260925124947_gate_device_trust.sql | OK |
| 49 | 20260925140133_gate_scan_device_binding.sql | OK |
| 50 | 20260925152255_gate_connectivity_incidents.sql | OK |
| 51 | 20260925160550_gate_supervision_evidence.sql | OK |
| 52 | 20260925182911_gate_notifications.sql | OK |
| 53 | 20260925184655_gate_hardware_outbox.sql | OK |
| 54 | 20261001052203_gate_long_stay_policy.sql | OK |
| 55 | 20261001070000_gate_completion_rollout.sql | OK |
| 56 | 20261001120000_gate_final_contracts.sql | OK |
| 57 | 20261001121000_gate_operational_cleanup.sql | OK |
| 58 | 20261001122000_gate_export_snapshot_contract.sql | OK |
| 59 | 20261001123000_final_hardening_sprint.sql | OK |
| 60 | 20261004120000_owner_portal_access.sql | OK |
| 61 | 20261009120000_phase1_financial_report_authz.sql | OK |
| 62 | 20261009130000_phase1_1_membership_roles_audit.sql | OK |
| 63 | 20261009140000_phase1_2_finance_read_permissions.sql | OK |
| 64 | 20261010120000_phase2_ledger_reversals_and_trial_balance_opening.sql | OK |
| 65 | 20261011100000_phase2b_receivable_account_setting.sql | OK |
| 66 | 20261011100100_phase2b_default_receivable_account_rpcs.sql | OK |
| 67 | 20261012100000_phase2c_bank_reconciliation_unhandled_lines.sql | OK |
| 68 | 20261013100000_phase2d_dues_require_open_period.sql | OK |
| 69 | 20261014100000_phase2e_bank_reconciliation_strict_upgrade.sql | OK |
| 70 | 20261015100000_phase2f_notifications_amenity_source_type.sql | OK |
| 71 | 20261015100100_phase2f_notifications_amenity_types.sql | OK |
| 72 | 20261015100200_phase2f_visitor_gate_scan_foreign_pass.sql | OK |
| 73 | 20261016100000_phase2g_owner_suspended_pass_denial.sql | OK |
| 74 | 20261017100000_phase3a_customer_advances_schema.sql | OK |
| 75 | 20261017100100_phase3b_customer_advances_functions.sql | OK |
| 76 | 20261017100200_phase3c_customer_advances_integrity.sql | OK |
| 77 | 20261017100300_phase3d_customer_advances_review2.sql | OK |
| 78 | 20261017100400_phase3e_customer_advances_trusted_backend.sql | OK |
| 79 | 20261017100500_phase3f_portal_statement_history.sql | OK |
| 80 | 20261017100600_phase3g_advance_account_configured.sql | OK |
| 81 | 20261017100700_phase3h_owner_statement_settlement.sql | OK |
| 82 | 20261017100800_phase3i_view_lateral_aggregates.sql | OK |
| 83 | 20261017100900_rls_set_based_permission_policies.sql | OK |
| 84 | 20261017101000_rls_admin_check_once.sql | OK |
| 85 | 20261017101100_rls_journal_entries_and_lines.sql | OK |
| 86 | 20261017101200_rls_fiscal_years.sql | OK |
| 87 | 20261018100000_deposit_account_cash_or_bank.sql | OK |
| 88 | 20261019100000_fiscal_year_closing_core.sql | OK |
| 89 | 20261019100100_fiscal_year_close_guards.sql | OK |
| 90 | 20261019100200_fiscal_year_close_permission_and_reports.sql | OK |
| 91 | 20261019100300_fiscal_calendar_truncate_revoke.sql | OK |
| 92 | 20261019100400_fiscal_calendar_draft_and_open_transition.sql | OK |
| 93 | 20261019100500_fiscal_year_opened_audit.sql | OK |

## Check results (final run 3)

Run output: `/work/tests/run-r5-run3.out` in the container (copied to `C:\Users\Lenovo\AppData\Local\Temp\g0-tests-r5\final-block-run3.txt`).
Totals for the final block: 135 results, 134 PASS, 1 FAIL (S-series 80 PASS; C-series 54 PASS, 1 FAIL).

Reconciliation with the prior 83-check suite (prior: 77 PASS, 5 FAIL, 1 BLOCKED):

| Group | Result |
|---|---|
| S1 to S16 except S14 (80 rows, including the S9 alternate overflow variant at 4 rows) | 80 PASS (includes the corrected S3 check and the four previous TRUNCATE FAILs, now PASS) |
| S9 audit-function variant (original definition) | BLOCKED, not executed (same as before; forcing `append_financial_audit_event` to fail requires replacing a function) |
| S14 concurrency (2 checks, separate sessions) | 2 PASS (see race section) |

So the 83-check suite now reads 82 PASS and 1 BLOCKED. New R5 checks (C3 to C7): 55 rows, 54 PASS, 1 FAIL.

| # | Scen | Check | Result | Expected | Actual (run 3) | SQLSTATE |
|---|---|---|---|---|---|---|
| 1 | S1 | organizations created (13 rehearsal orgs) | PASS | 13 | 13 |  |
| 2 | S1 | fiscal periods per year = 12 (org A, 2025) | PASS | 12 | 12 |  |
| 3 | S1 | retained earnings designated (org A, 3100 flagged) | PASS | true | true |  |
| 4 | S2 | posted entries exist with status POSTED | PASS | 7 POSTED | 7 |  |
| 5 | S3 | A profit: close returns ok | PASS | ok=true | {"ok": true, "line_count": 3, "net_income": "800.0000", "already_closed": false, "closing_entry_id": "166f9... | 00000 |
| 6 | S3 | A profit: net_income 800.0000 | PASS | 800.0000 | 800.0000 |  |
| 7 | S3 | A profit: line_count 3 | PASS | 3 | 3 |  |
| 8 | S3 | A profit: closing entry balanced (sum debit = sum credit, numeric(19,4)) | PASS | equal | 1000.0000 / 1000.0000 |  |
| 9 | S3 | A profit: closing entry_date = 2025-12-31 and source YEAR_END_CLOSING and POSTED | PASS | 2025-12-31 / YEAR_END_CLOSING / POSTED | 2025-12-31 / YEAR_END_CLOSING / POSTED |  |
| 10 | S3 | A profit: RE line credit 800.0000 | PASS | credit 800.0000 on 3100 | 800.0000 |  |
| 11 | S3 | A profit: ledger temporary accounts net to zero including closing lines | PASS | 0 | 0.0000 |  |
| 12 | S3 | A profit (R5 corrected S3): book temporary balance zero incl. closing lines AND get_trial_balance keeps 4100=1000 and 5100=200 | PASS | book 0 ; get_trial_balance 4100=1000.0000 ; 5100=200.0000 | book 0 ; 4100=1000.0000 ; 5100=200.0000 (literal original pre-R5 wording recorded as FAIL in run 3) |  |
| 13 | S3 | A profit: fiscal year status CLOSED and one closing row | PASS | CLOSED + 1 closing row (800.0000, 3 lines) | CLOSED |  |
| 14 | S3 | B loss: close returns ok | PASS | ok=true | {"ok": true, "line_count": 3, "net_income": "-300.0000", "already_closed": false, "closing_entry_id": "6717... | 00000 |
| 15 | S3 | B loss: net_income -300.0000 | PASS | -300.0000 | -300.0000 |  |
| 16 | S3 | B loss: RE line is a DEBIT 300.0000 and closing balanced | PASS | debit 300.0000 on 3100; balanced | c0c882d8-315c-4ffb-92fd-f550f6f59aa4 dr=200.0000 cr=0.0000 | e439f369-8b67-43de-b70e-658c92d20f4a dr=0.0000 cr=500.0000 |
| 17 | S3 | C breakeven: close returns ok | PASS | ok=true | {"ok": true, "line_count": 2, "net_income": "0.0000", "already_closed": false, "closing_entry_id": "bff8ba0... | 00000 |
| 18 | S3 | C breakeven: netIncome 0 | PASS | 0 | 0.0000 |  |
| 19 | S3 | C breakeven: no RE line in closing entry | PASS | no 3100 line | 2 |  |
| 20 | S3 | D zero temporary accounts: NOTHING_TO_CLOSE | PASS | ok=false error_code=NOTHING_TO_CLOSE | {"ok": false, "error_code": "NOTHING_TO_CLOSE"} | 00000 |
| 21 | S3 | D zero temporary accounts: no closing row, year stays PLANNED | PASS | no closing row; PLANNED (no close) | PLANNED |  |
| 22 | S4 | multi-centre: close returns ok | PASS | ok=true | {"ok": true, "line_count": 6, "net_income": "650.0000", "already_closed": false, "closing_entry_id": "77c1f... | 00000 |
| 23 | S4 | multi-centre: CC1 RE credit 400.0000 and CC2 RE credit 250.0000 (one line per centre) | PASS | two RE lines: CC1 400.0000, CC2 250.0000 | 29bdaa80-0dfd-4850-913c-1737658b2300=400.0000 ; 9c5e83ff-8219-4fc4-9f79-3beca5f6886f=250.0000 |  |
| 24 | S4 | multi-centre: closing entry balanced and net_income 650.0000 | PASS | balanced; 650.0000 | 800.0000/800.0000 net 650.0000 |  |
| 25 | S4 | required centre + NULL centre line: COST_CENTER_REQUIRED | PASS | ok=false error_code=COST_CENTER_REQUIRED | {"ok": false, "error_code": "COST_CENTER_REQUIRED"} | 00000 |
| 26 | S4 | required centre: no writes (no closing row, year still PLANNED, no closing entry) | PASS | no writes | checked |  |
| 27 | S4 | unknown (non-existent) centre id on a line is rejected by the database | PASS | SQLSTATE 23503 | SQLSTATE 23503 message insert or update on table "journal_entry_lines" violates foreign key constraint "jou... | 23503 |
| 28 | S4 | inactive centre carrying a closing balance: COST_CENTRE_INVALID | PASS | ok=false error_code=COST_CENTRE_INVALID | {"ok": false, "error_code": "COST_CENTRE_INVALID"} | 00000 |
| 29 | S5 | H draft entry exists in DRAFT | PASS | DRAFT | DRAFT |  |
| 30 | S5 | draft in year: UNREVIEWED_ENTRIES_EXIST | PASS | ok=false error_code=UNREVIEWED_ENTRIES_EXIST | {"ok": false, "error_code": "UNREVIEWED_ENTRIES_EXIST"} | 00000 |
| 31 | S5 | draft: no write (no closing row, year OPEN, draft still DRAFT) | PASS | no writes | checked |  |
| 32 | S6 | post into closed period: refused | PASS | SQLSTATE P0001 message fiscal period is not open | SQLSTATE P0001 message fiscal period is not open result NULL | P0001 |
| 33 | S6 | reverse entry in closed period: ENTRY_IN_CLOSED_PERIOD | PASS | SQLSTATE P0001 message ENTRY_IN_CLOSED_PERIOD | SQLSTATE P0001 message ENTRY_IN_CLOSED_PERIOD result NULL | P0001 |
| 34 | S6 | reverse YEAR_END_CLOSING entry: CLOSING_ENTRY_NOT_REVERSIBLE | PASS | SQLSTATE P0001 message CLOSING_ENTRY_NOT_REVERSIBLE | SQLSTATE P0001 message CLOSING_ENTRY_NOT_REVERSIBLE result NULL | P0001 |
| 35 | S6 | closed period: no reversal or late posting left behind | PASS | no posted late entry; E_A1 still POSTED | checked |  |
| 36 | S7 | RE account NULL: RE_ACCOUNT_REQUIRED | PASS | ok=false error_code=RE_ACCOUNT_REQUIRED | {"ok": false, "error_code": "RE_ACCOUNT_REQUIRED"} | 00000 |
| 37 | S7 | RE account non-EQUITY (cash flagged): RE_ACCOUNT_INVALID | PASS | ok=false error_code=RE_ACCOUNT_INVALID | {"ok": false, "error_code": "RE_ACCOUNT_INVALID"} | 00000 |
| 38 | S7 | RE account inactive (flagged EQUITY, is_active=false): RE_ACCOUNT_INVALID | PASS | ok=false error_code=RE_ACCOUNT_INVALID | {"ok": false, "error_code": "RE_ACCOUNT_INVALID"} | 00000 |
| 39 | S7 | RE account group (flagged EQUITY group): RE_ACCOUNT_INVALID | PASS | ok=false error_code=RE_ACCOUNT_INVALID | {"ok": false, "error_code": "RE_ACCOUNT_INVALID"} | 00000 |
| 40 | S7 | RE account from another organization: RE_ACCOUNT_INVALID | PASS | ok=false error_code=RE_ACCOUNT_INVALID | {"ok": false, "error_code": "RE_ACCOUNT_INVALID"} | 00000 |
| 41 | S7 | invalid RE attempts left no closing row (org I) | PASS | no closing row; PLANNED | checked |  |
| 42 | S7 | valid designated RE account: close ok (org I) | PASS | ok=true | {"ok": true, "line_count": 3, "net_income": "400.0000", "already_closed": false, "closing_entry_id": "fd8f1... | 00000 |
| 43 | S8 | same key, same year: already_closed true and same closing_entry_id | PASS | already_closed=true, id=166f949c-e05a-4def-b103-5056b7d56bae | {"result": "{\"ok\": true, \"line_count\": 3, \"net_income\": \"800.0000\", \"already_closed\": true, \"clo... |  |
| 44 | S8 | same key, same year: exactly 1 closing row and 1 closing entry | PASS | 1 row / 1 entry | 1 / 1 |  |
| 45 | S8 | same key, different year: OPERATION_KEY_REUSED | PASS | ok=false error_code=OPERATION_KEY_REUSED | {"ok": false, "error_code": "OPERATION_KEY_REUSED"} | 00000 |
| 46 | S8 | different key, same year: ALREADY_CLOSED | PASS | ok=false error_code=ALREADY_CLOSED | {"ok": false, "error_code": "ALREADY_CLOSED"} | 00000 |
| 47 | S10 | unauthenticated call: AUTHENTICATION_REQUIRED 42501 | PASS | SQLSTATE 42501 message AUTHENTICATION_REQUIRED | SQLSTATE 42501 message AUTHENTICATION_REQUIRED result NULL | 42501 |
| 48 | S10 | org AUDITOR member without finance.years.close: FORBIDDEN_CLOSE_PERMISSION 42501 | PASS | SQLSTATE 42501 message FORBIDDEN_CLOSE_PERMISSION | SQLSTATE 42501 message FORBIDDEN_CLOSE_PERMISSION result NULL | 42501 |
| 49 | S10 | platform admin NOT an organization member: refused 42501 | PASS | SQLSTATE 42501 message FORBIDDEN_CLOSE_PERMISSION | SQLSTATE 42501 message FORBIDDEN_CLOSE_PERMISSION result NULL | 42501 |
| 50 | S10 | outsider user (no membership): refused 42501 | PASS | SQLSTATE 42501 message FORBIDDEN_CLOSE_PERMISSION | SQLSTATE 42501 message FORBIDDEN_CLOSE_PERMISSION result NULL | 42501 |
| 51 | S10 | anon role: close_fiscal_year call denied | PASS | SQLSTATE 42501 | SQLSTATE 42501 message permission denied for function close_fiscal_year result NULL | 42501 |
| 52 | S10 | anon has no EXECUTE on close_fiscal_year (has_function_privilege) | PASS | false | false |  |
| 53 | S10 | no unauthorized call wrote a closing row for 2026 (org A) | PASS | none | checked |  |
| 54 | S11 | owner UPDATE fiscal_years status CLOSED year -> OPEN: refused (reopen) | PASS | SQLSTATE 42501 message FISCAL_YEAR_REOPEN_NOT_ALLOWED | SQLSTATE 42501 message FISCAL_YEAR_REOPEN_NOT_ALLOWED result NULL | 42501 |
| 55 | S11 | owner UPDATE fiscal_years status OPEN -> CLOSED without context: FISCAL_STATUS_DIRECT_WRITE_BLOCKED | PASS | SQLSTATE 42501 message FISCAL_STATUS_DIRECT_WRITE_BLOCKED | SQLSTATE 42501 message FISCAL_STATUS_DIRECT_WRITE_BLOCKED result NULL | 42501 |
| 56 | S11 | owner UPDATE fiscal_periods status of a CLOSED period without context: blocked | PASS | SQLSTATE 42501 message FISCAL_STATUS_DIRECT_WRITE_BLOCKED | SQLSTATE 42501 message FISCAL_STATUS_DIRECT_WRITE_BLOCKED result NULL | 42501 |
| 57 | S11 | owner UPDATE fiscal_periods status of an OPEN period to CLOSED without context: blocked | PASS | SQLSTATE 42501 message FISCAL_STATUS_DIRECT_WRITE_BLOCKED | SQLSTATE 42501 message FISCAL_STATUS_DIRECT_WRITE_BLOCKED result NULL | 42501 |
| 58 | S11 | set_fiscal_period_status reopen of closed period in closed year: refused | PASS | SQLSTATE P0001 message fiscal year is closed; its periods cannot be reopened | SQLSTATE P0001 message fiscal year is closed; its periods cannot be reopened result NULL | P0001 |
| 59 | S11 | org A 2025 still CLOSED with all periods CLOSED after direct write attempts | PASS | CLOSED / 12 CLOSED | checked |  |
| 60 | S12 | anon has no TRUNCATE on fiscal_years | PASS | false | false |  |
| 61 | S12 | authenticated has no TRUNCATE on fiscal_years | PASS | false | false |  |
| 62 | S12 | service_role has no TRUNCATE on fiscal_years | PASS | false | false |  |
| 63 | S12 | authenticated has no TRUNCATE on fiscal_periods | PASS | false | false |  |
| 64 | S12 | authenticated TRUNCATE fiscal_years CASCADE attempt (rolled back) | PASS | permission denied (42501) | ERROR permission denied for table fiscal_years | 42501 |
| 65 | S12 | TRUNCATE probe rolled back: fiscal_years rows unchanged | PASS | 2 | 2 |  |
| 66 | S13 | delete org with only OPEN calendar: succeeds | PASS | deleted 1 org | deleted 1 |  |
| 67 | S13 | OPEN calendar org delete left no fiscal rows behind | PASS | none | checked |  |
| 68 | S13 | T2 closed year created (setup for delete refusal) | PASS | ok=true | {"ok": true, "line_count": 2, "net_income": "100.0000", "already_closed": false, "closing_entry_id": "b083f... | 00000 |
| 69 | S13 | delete org with CLOSED year: refused and rolled back (any refusal) | PASS | refused (fiscal guard FISCAL_CLOSED_RECORD_DELETE_BLOCKED expected if reached) | COA_USED_DELETE_FORBIDDEN | 22023 |
| 70 | S13 | direct DELETE of CLOSED fiscal_years row: blocked by fiscal guard | PASS | SQLSTATE 42501 message FISCAL_STATUS_DIRECT_WRITE_BLOCKED | SQLSTATE 42501 message FISCAL_STATUS_DIRECT_WRITE_BLOCKED result NULL | 42501 |
| 71 | S13 | refused delete rolled back: org T2 and its closed year still exist | PASS | org + CLOSED year | checked |  |
| 72 | S15 | BEFORE closing: 2026 opening shows RE-PRIOR credit 800 and cash 800 | PASS | RE-PRIOR=800 ; 1110=800 | before: 1110=800.0000 ; 3100=0 ; RE-PRIOR=800.0000 |  |
| 73 | S15 | AFTER closing: 2026 opening cash = 800.0000 (equals 2025 closing cash balance) | PASS | 1110=800 | after: 1110=800.0000 ; 3100=800.0000 |  |
| 74 | S15 | AFTER closing: RE-PRIOR is zero (row absent) | PASS | no RE-PRIOR row | after: 1110=800.0000 ; 3100=800.0000 |  |
| 75 | S15 | AFTER closing: 3100 retained earnings opening = 800 credit | PASS | 3100=800 | after: 1110=800.0000 ; 3100=800.0000 |  |
| 76 | S16 | historical income statement 2025 after close: revenue 1000 and expense 200 (not zero) | PASS | 4100=1000.0000 ; 5100=200.0000 | 4100=1000.0000 ; 5100=200.0000 |  |
| 77 | S9 | forced mid-function failure (closing line numeric(19,4) overflow): close fails | PASS | SQLSTATE 22003 | SQLSTATE 22003 message numeric field overflow result NULL | 22003 |
| 78 | S9 | atomicity: no closing row, no closing entry, entry count unchanged | PASS | no closing row / entry; entries=2 | 2 |  |
| 79 | S9 | atomicity: year status unchanged (PLANNED), periods still CLOSED, no FISCAL_YEAR_CLOSED audit row | PASS | PLANNED / 12 CLOSED / audit unchanged | PLANNED |  |
| 80 | S9 | atomicity: posted entries and their lines unchanged (no partial closing lines) | PASS | no closing lines | checked |  |
| 81 | C3 | has_table_privilege TRUNCATE = false: anon on fiscal_years | PASS | false | false |  |
| 82 | C3 | has_table_privilege TRUNCATE = false: anon on fiscal_periods | PASS | false | false |  |
| 83 | C3 | has_table_privilege TRUNCATE = false: authenticated on fiscal_years | PASS | false | false |  |
| 84 | C3 | has_table_privilege TRUNCATE = false: authenticated on fiscal_periods | PASS | false | false |  |
| 85 | C3 | has_table_privilege TRUNCATE = false: service_role on fiscal_years | PASS | false | false |  |
| 86 | C3 | has_table_privilege TRUNCATE = false: service_role on fiscal_periods | PASS | false | false |  |
| 87 | C3 | TRUNCATE actually attempted as anon on fiscal_years: permission denied | PASS | SQLSTATE 42501 | ERROR : permission denied for table fiscal_years | 42501 |
| 88 | C3 | TRUNCATE actually attempted as anon on fiscal_periods: permission denied | PASS | SQLSTATE 42501 | ERROR : permission denied for table fiscal_periods | 42501 |
| 89 | C3 | TRUNCATE actually attempted as authenticated on fiscal_years: permission denied | PASS | SQLSTATE 42501 | ERROR : permission denied for table fiscal_years | 42501 |
| 90 | C3 | TRUNCATE actually attempted as authenticated on fiscal_periods: permission denied | PASS | SQLSTATE 42501 | ERROR : permission denied for table fiscal_periods | 42501 |
| 91 | C3 | TRUNCATE actually attempted as service_role on fiscal_years: permission denied | PASS | SQLSTATE 42501 | ERROR : permission denied for table fiscal_years | 42501 |
| 92 | C3 | TRUNCATE actually attempted as service_role on fiscal_periods: permission denied | PASS | SQLSTATE 42501 | ERROR : permission denied for table fiscal_periods | 42501 |
| 93 | C3 | row counts of fiscal_years + fiscal_periods unchanged after TRUNCATE attempts | PASS | 1144 | 1144 |  |
| 94 | C4 | create_journal_entry dated in closed period (org A, 2025-03-20): refused FISCAL_PERIOD_NOT_OPEN | PASS | SQLSTATE P0001 message FISCAL_PERIOD_NOT_OPEN: fiscal period is not open | SQLSTATE P0001 message FISCAL_PERIOD_NOT_OPEN: fiscal period is not open result NULL | P0001 |
| 95 | C4 | refused closed-period draft left no journal entry behind | PASS | no row | 0 |  |
| 96 | C4 | move DRAFT entry_date 2026-05-05 -> 2025-03-20 (closed period) via UPDATE: refused FISCAL_PERIOD_NOT_OPEN | FAIL | SQLSTATE P0001 message FISCAL_PERIOD_NOT_OPEN: fiscal period is not open | SQLSTATE 00000 message (none) result 0 | 00000 |
| 97 | C4 | refused draft move left the draft on its original date (2026-05-05, DRAFT) | PASS | 2026-05-05 DRAFT | 2026-05-05 DRAFT |  |
| 98 | C4 | trigger guard (service_role, BYPASSRLS): DRAFT move 2026-05-05 -> 2025-03-20 refused FISCAL_PERIOD_NOT_OPEN | PASS | SQLSTATE P0001 message FISCAL_PERIOD_NOT_OPEN: fiscal period is not open | SQLSTATE P0001 message FISCAL_PERIOD_NOT_OPEN: fiscal period is not open result NULL | P0001 |
| 99 | C4 | trigger refusal left the draft on its original date (2026-05-05, DRAFT) | PASS | 2026-05-05 DRAFT | 2026-05-05 DRAFT |  |
| 100 | C5 | T1 2027 created PLANNED with 12 PLANNED periods (fixture) | PASS | PLANNED / 12 PLANNED | PLANNED |  |
| 101 | C5 | AUDITOR member open PLANNED year: FORBIDDEN_OPEN_PERMISSION | PASS | SQLSTATE 42501 message FORBIDDEN_OPEN_PERMISSION | SQLSTATE 42501 message FORBIDDEN_OPEN_PERMISSION result NULL | 42501 |
| 102 | C5 | platform admin NOT an organization member: open refused FORBIDDEN_OPEN_PERMISSION | PASS | SQLSTATE 42501 message FORBIDDEN_OPEN_PERMISSION | SQLSTATE 42501 message FORBIDDEN_OPEN_PERMISSION result NULL | 42501 |
| 103 | C5 | outsider (no membership): open refused FORBIDDEN_OPEN_PERMISSION | PASS | SQLSTATE 42501 message FORBIDDEN_OPEN_PERMISSION | SQLSTATE 42501 message FORBIDDEN_OPEN_PERMISSION result NULL | 42501 |
| 104 | C5 | anon role: open_fiscal_year denied (no EXECUTE) | PASS | SQLSTATE 42501 | SQLSTATE 42501 message permission denied for function open_fiscal_year result NULL | 42501 |
| 105 | C5 | direct UPDATE fiscal_years PLANNED -> OPEN without context: FISCAL_STATUS_DIRECT_WRITE_BLOCKED | PASS | SQLSTATE 42501 message FISCAL_STATUS_DIRECT_WRITE_BLOCKED | SQLSTATE 42501 message FISCAL_STATUS_DIRECT_WRITE_BLOCKED result NULL | 42501 |
| 106 | C5 | refused open attempts left T1 2027 PLANNED with 12 PLANNED periods | PASS | PLANNED / 12 PLANNED | PLANNED |  |
| 107 | C5 | TENANT_OWNER (finance.periods.manage, active member): PLANNED -> OPEN returns ok | PASS | ok=true | {"ok": true, "fiscal_year_id": "63032481-6541-486f-af49-4e4f620e6209", "opened_period_count": 12} | 00000 |
| 108 | C5 | open result reports 12 periods opened | PASS | 12 | 12 |  |
| 109 | C5 | after open: T1 2027 status OPEN and all 12 periods OPEN | PASS | OPEN / 12 OPEN | OPEN |  |
| 110 | C5 | open again (OPEN year): FISCAL_YEAR_NOT_PLANNED | PASS | SQLSTATE P0001 message FISCAL_YEAR_NOT_PLANNED: fiscal year status is OPEN | SQLSTATE P0001 message FISCAL_YEAR_NOT_PLANNED: fiscal year status is OPEN result NULL | P0001 |
| 111 | C5 | CLOSED year (org A 2025) -> OPEN via open_fiscal_year: FISCAL_YEAR_NOT_PLANNED (CLOSED never reopens) | PASS | SQLSTATE P0001 message FISCAL_YEAR_NOT_PLANNED: fiscal year status is CLOSED | SQLSTATE P0001 message FISCAL_YEAR_NOT_PLANNED: fiscal year status is CLOSED result NULL | P0001 |
| 112 | C5 | CLOSED year (org A 2025) -> OPEN direct UPDATE: FISCAL_YEAR_REOPEN_NOT_ALLOWED | PASS | SQLSTATE 42501 message FISCAL_YEAR_REOPEN_NOT_ALLOWED | SQLSTATE 42501 message FISCAL_YEAR_REOPEN_NOT_ALLOWED result NULL | 42501 |
| 113 | C5 | org A 2025 still CLOSED after reopen attempts | PASS | CLOSED | CLOSED |  |
| 114 | C6 | FISCAL_YEAR_CLOSED audit row exists for each closed org (A, B, C, E, I) | PASS | 5 orgs | 5 |  |
| 115 | C6 | FISCAL_YEAR_OPENED audit row exists after successful open (T1 2027, exactly 1) | PASS | 1 | 1 |  |
| 116 | C6 | rollback proof OPEN: year status unchanged by failed open (PLANNED) | PASS | PLANNED | PLANNED |  |
| 117 | C6 | rollback proof OPEN: no period status changed by failed open (all PLANNED) | PASS | PLANNED,PLANNED,PLANNED,PLANNED,PLANNED,PLANNED,PLANNED,PLANNED,PLANNED,PLANN... | PLANNED,PLANNED,PLANNED,PLANNED,PLANNED,PLANNED,PLANNED,PLANNED,PLANNED,PLANNED,PLANNED,PLANNED |  |
| 118 | C6 | rollback proof OPEN: no FISCAL_YEAR_OPENED audit row written by failed open | PASS | 0 | 0 |  |
| 119 | C6 | rollback proof OPEN: after ROLLBACK the year is PLANNED and the whitelist again contains FISCAL_YEAR_OPENED | PASS | PLANNED + constraint with FISCAL_YEAR_OPENED | PLANNED |  |
| 120 | C6 | rollback proof OPEN: the test copy of the constraint had no FISCAL_YEAR_OPENED | PASS | no FISCAL_YEAR_OPENED in test copy | position=0 |  |
| 121 | C6 | rollback proof CLOSE: year status unchanged by failed close (OPEN) | PASS | OPEN | OPEN |  |
| 122 | C6 | rollback proof CLOSE: no period status changed by the failed close call (periods equal their state just before the call) | PASS | CLOSED,CLOSED,CLOSED,CLOSED,CLOSED,CLOSED,CLOSED,CLOSED,CLOSED,CLOSED,CLOSED,... | CLOSED,CLOSED,CLOSED,CLOSED,CLOSED,CLOSED,CLOSED,CLOSED,CLOSED,CLOSED,CLOSED,CLOSED |  |
| 123 | C6 | rollback proof CLOSE: no closing row and no closing entry written by failed close | PASS | 0 rows / 0 entries | 0 rows / 0 entries |  |
| 124 | C6 | rollback proof CLOSE: no FISCAL_YEAR_CLOSED audit row written by failed close | PASS | 0 | 0 |  |
| 125 | C6 | rollback proof CLOSE: after ROLLBACK the year is OPEN and the whitelist again contains FISCAL_YEAR_CLOSED | PASS | OPEN + constraint with FISCAL_YEAR_CLOSED | OPEN |  |
| 126 | C6 | rollback proof CLOSE: the test copy of the constraint had no FISCAL_YEAR_CLOSED | PASS | no FISCAL_YEAR_CLOSED in test copy | position=0 |  |
| 127 | C7 | T1 2027 close (committed) returns ok | PASS | ok=true | {"ok": true, "line_count": 2, "net_income": "100.0000", "already_closed": false, "closing_entry_id": "87219... | 00000 |
| 128 | C7 | T1 2027 closing net_income 100.0000 | PASS | 100.0000 | 100.0000 |  |
| 129 | C7 | T1 2027 closing entry balanced (sum debit = sum credit > 0) and POSTED | PASS | balanced, POSTED | 100.0000 / 100.0000 |  |
| 130 | C7 | T1 2027 RE line: credit 100.0000 on 3100 (designated RE account) | PASS | credit 100.0000 on 3100 | checked |  |
| 131 | C6 | T1 2027 FISCAL_YEAR_CLOSED audit row exists after successful close (exactly 1) | PASS | 1 | 1 |  |
| 132 | C7 | historical income statement 2027 after close keeps revenue 100 and expense 0 (closing lines excluded) | PASS | 4100=100.0000 ; 5100=0 | 4100=100.0000 ; 5100=0 |  |
| 133 | C7 | P2 after close: 2028 opening cash 100 and RE 3100 credit 100, no RE-PRIOR row | PASS | 1110=100.0000 ; 3100=100.0000 | 1110=100.0000 ; 3100=100.0000 |  |
| 134 | C7 | idempotency: different key same year -> ALREADY_CLOSED | PASS | ok=false error_code=ALREADY_CLOSED | {"ok": false, "error_code": "ALREADY_CLOSED"} | 00000 |
| 135 | C7 | idempotency: same key same year -> already_closed=true, same closing_entry_id, still 1 closing row and 1 closing entry | PASS | already_closed=true, 1 row, 1 entry | {"result": "{\"ok\": true, \"line_count\": 2, \"net_income\": \"100.0000\", \"already_closed\": true, \"clo... |  |

### Check summary by brief item

| Brief item | Result | Basis |
|---|---|---|
| 1. Apply all migrations | PASS | 93 of 93 OK, no failure |
| 2. Re-run prior 83 checks | PASS with 1 BLOCKED | 82 PASS, 1 BLOCKED (S9 audit-function variant); S3 correction applied as documented |
| 3. TRUNCATE privileges | PASS | `has_table_privilege` false for anon, authenticated, service_role on both tables (6 PASS); an actual TRUNCATE under each role with SET ROLE raised 42501 (6 PASS); row counts unchanged |
| 4. Drafts in closed periods | PASS for create and trigger; FAIL for one authenticated sub-check | create refused `P0001 FISCAL_PERIOD_NOT_OPEN` and no row left; trigger refused the move (service_role) with `P0001 FISCAL_PERIOD_NOT_OPEN`, draft unchanged; the authenticated UPDATE affected 0 rows with SQLSTATE 00000 (see Defect A) |
| 5. PLANNED to OPEN | PASS | owner opened 2027 (12 periods opened, `opened_period_count` 12); AUDITOR, non-member platform admin and outsider refused `42501 FORBIDDEN_OPEN_PERMISSION`; anon denied `42501`; direct UPDATE `42501 FISCAL_STATUS_DIRECT_WRITE_BLOCKED`; CLOSED to OPEN: `P0001 FISCAL_YEAR_NOT_PLANNED` via the function and `42501 FISCAL_YEAR_REOPEN_NOT_ALLOWED` via direct UPDATE |
| 6. Audit rows and rollback proofs | PASS | FISCAL_YEAR_OPENED and FISCAL_YEAR_CLOSED rows exist after success; both rollback proofs failed with `23514` as designed and left no change (details below) |
| 7. Closing journals, RE, history, P2, idempotency | PASS | S3, S4, S8, S10, S15, S16 and C7 (T1 2027: closing 100/100 balanced, RE credit 100 on 3100, revenue 100 kept in history, 2028 opening 1110=100 and 3100=100 with no RE-PRIOR row, same key returns already_closed and same entry, different key `ALREADY_CLOSED`) |
| 8. Concurrency | PASS | see race section |
| 9. Converted integration tests | BLOCKED | not run; see section below |
| 10. Organization deletion | PASS | S13: open-only throwaway org deleted (1 row, no fiscal rows left); org with closed year refused and rolled back; direct DELETE of CLOSED year `42501 FISCAL_STATUS_DIRECT_WRITE_BLOCKED` |

### Defects and findings (with SQLSTATE)

- **A. Authenticated draft move is a silent no-op (check 4, FAIL as specified).** Expected `P0001 FISCAL_PERIOD_NOT_OPEN`.
  Observed: UPDATE returned 0 rows, SQLSTATE 00000. Cause: `journal_entries` has only a SELECT policy
  (`journal_entries_select_permission`) and no UPDATE policy, so RLS matches no rows for `authenticated`. The move
  does not happen. Owner decision: whether the authenticated path should surface an error or stay a no-op. Not a data
  integrity defect in the trigger.
- **B. Trigger guard `guard_draft_entry_period_move` (verified through service_role, BYPASSRLS = true).** Moving a DRAFT
  from 2026-05-05 into closed March 2025 raised `P0001 FISCAL_PERIOD_NOT_OPEN: fiscal period is not open`; the draft
  stayed DRAFT on 2026-05-05.
- **C. Closed-period draft creation (check 4).** `create_journal_entry` for 2025-03-20 raised
  `P0001 FISCAL_PERIOD_NOT_OPEN: fiscal period is not open`; no journal entry with that key was left behind.
- **D. Open-transition permission gate.** `open_fiscal_year` for AUDITOR and for a non-member platform admin raised
  `42501 FORBIDDEN_OPEN_PERMISSION`. The non-member platform admin is also refused by the membership check in the same function.
- **E. TRUNCATE.** Revoke effective: all six role/table combinations raised `42501` on an actual TRUNCATE attempt.

### Audit rollback proofs (check 6)

Method: inside `BEGIN ... ROLLBACK`, `financial_audit_logs.check_audit_action` was dropped and re-added without the
new value (derived from `pg_get_constraintdef` by removing the element; re-added `NOT VALID`, see the note below), the
call was made under `SET LOCAL ROLE authenticated` in a savepoint, then the transaction was rolled back.

- **open_fiscal_year (year 2028 in T1, PLANNED).** Failure at the audit insert: `23514 check_violation`, constraint
  `check_audit_action`, "new row for relation financial_audit_logs violates check constraint". After rollback: year
  status PLANNED (unchanged), all 12 periods PLANNED (unchanged), no FISCAL_YEAR_OPENED row, and the constraint again
  contains FISCAL_YEAR_OPENED.
- **close_fiscal_year (year 2027 in T1, OPEN, one posted entry).** Periods were closed earlier in the same transaction by
  `close_periods`. The close call failed at the audit insert: `23514 check_violation`, same constraint. After rollback:
  year status OPEN (unchanged), periods unchanged relative to the state just before the call, no closing row, no closing
  entry, no FISCAL_YEAR_CLOSED row, and the constraint again contains FISCAL_YEAR_CLOSED.

Note on `NOT VALID`: the first attempt re-added the constraint validated. It failed with 23514 because existing
FISCAL_YEAR_OPENED rows (from the successful 2027 open in the same run) violate a constraint without that value. `NOT VALID`
still checks every new row, which is what the probe needs.

### Race results (check 8)

- **Org J (same year, two closers, separate sessions started at the same time).** Session 1 (key `race-key-1`) returned
  `ok: true`, `net_income 200.0000`, closing entry `bdb2a69b-1398-41db-94b6-bdcb6554148b`. Session 2 (key `race-key-2`)
  returned `ok: false, error_code: ALREADY_CLOSED`. Database afterwards: 1 fiscal_year_closings row, 1 YEAR_END_CLOSING
  entry, closing lines balanced 300.0000 / 300.0000, 1 FISCAL_YEAR_CLOSED audit row, year CLOSED. PASS.
- **Org K (closing with 5 s hold versus a posting).** Closer wrote at 12:33:33.608 and committed at 12:33:38.622 (the
  transaction held the lock 5 s). The posting's `create_journal_entry` started at 12:33:34.581 and blocked until the
  closer's commit, then raised `P0001 FISCAL_PERIOD_NOT_OPEN: fiscal period is not open` (returned 12:33:38.623). No draft
  was created (0 rows with the race key). Database afterwards: 1 closing row, 1 YEAR_END_CLOSING entry, balanced 50.0000 /
  50.0000, year CLOSED. PASS.
- Posting after CLOSED is refused (`P0001`, see S6 `post_journal_entry`). Note: because all periods are closed before
  closing starts, a posting cannot target an open period during the close. The observed case is lock ordering on the
  closed period, not an interleaving with open periods.

### Converted integration suites (check 9): BLOCKED

Not run. The suites (27 `*.integration.test.ts` files and the pgtap suite) use `tests/helpers/local-target.ts`, which accepts
only an opted-in loopback Supabase API port (`LOCAL_SUPABASE_API_PORTS`, never 54321), and require the service and anon keys
of that stack (`SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SUPABASE_URL`). This container
has only PostgreSQL (`--network none`, no PostgREST, GoTrue or Kong) and no keys. `.env` was not read. Prerequisite:
an isolated Supabase API stack (PostgREST, GoTrue, Kong) on an opted-in loopback port, with its keys supplied by that
stack, and then `npm run demo:stack-up` or `scripts/demo-local/run-vitest-local.mjs`.

## Corrections and fixture adaptations (all disclosed)

1. **S3 literal check (documented spec conflict).** The literal "temporary accounts net to zero in get_trial_balance"
   is replaced by the corrected expectation: book temporary balance zero including closing lines, and
   get_trial_balance keeps 4100=1000.0000 and 5100=200.0000. The original literal result (`4100=1000.0000 ; 5100=200.0000`)
   is kept in the detail column. Per `docs/progress/b1b-rehearsal-report.md` and `docs/progress/report-semantics.md`.
2. **S6 fixture.** The closed-period draft that S6 posts is inserted directly as postgres, because create now refuses
   (check 4). The posting refusal expectation is unchanged.
3. **S9 users.** The fixed user UUIDs from the older run were removed; users come from this run's setup.
4. **Race scripts.** Regenerated with this run's org J and K IDs (the older race scripts hardcoded old IDs).
5. **Run history (transparency).**
   - Run 1 (`run-r5-main.out`): the first version of the rollback probes failed at the validating constraint re-add
     (see NOT VALID note). Errors cascaded. Not used as evidence.
   - Run 2 (`run-r5-run2.out`): all probes ran. Three FAIL rows: (a) the authenticated draft move (Defect A, kept);
     (b) C6 close rollback "no period status changed", which was my expectation error (periods had been closed in the same
     transaction, so the right comparison is the state just before the call; the observed state matched it); (c) C7 history
     expectation, where I omitted 5100, which `get_trial_balance` lists with 0 for T1 2027 because that year has no expense
     postings. I corrected (b) and (c) after seeing run 2 and added the service_role trigger check to item 4. Expectation
     changes made after observing a run are disclosed here for review.
   - Run 3 (`run-r5-run3.out`): final evidence set, reported above.
6. Each run created new fixture organizations. Fixtures from runs 1 to 3 remain in the container (rehearsal data only).

## Remaining risks

1. Defect A (silent no-op for authenticated UPDATE on journal_entries); owner decision.
2. Open and close audit writes depend on `check_audit_action`. Any future whitelist change must keep FISCAL_YEAR_OPENED and
   FISCAL_YEAR_CLOSED (the rollback probes show the dependency).
3. Migration 20261019100500 drops and re-adds `check_audit_action` with a full-table validation under ACCESS EXCLUSIVE lock.
   Run it in a maintenance window on production-sized data.
4. Migration header `20261019100400` still says "NOT applied and NOT tested"; that header is stale after this run (doc-only).
5. TRUNCATE was checked only on fiscal_years and fiscal_periods. Other tables were not checked.
6. The original S9 audit-function variant is not executed. R5 check 6 covers audit-write failure through the constraint, which is a different mechanism.
7. Converted integration suites not run (check 9). Owner decisions from `status.json` remain open (income statement presentation of closing entries, finance.years.close grants, platform admin rule).
8. Race evidence covers the lock-ordering case on closed periods only.

## Containers left in place

- `g0rehearsal-b1b-20261024r5` (this run; running, healthy, network none, no ports)
- `g0rehearsal-b1b-20261024r3` and `g0rehearsal-b1b-20261024r2` (running; not touched)
- `g0rehearsal-b1b-20261024` (exited; not touched), `g0_iso_test` (exited; not touched), Vector containers (stopped; not touched)

Evidence files (outside the repository): `C:\Users\Lenovo\AppData\Local\Temp\g0-mig-r5\` (migrations, `order.txt`, `apply-r5.sh`,
`apply-r5.log`), `C:\Users\Lenovo\AppData\Local\Temp\g0-tests-r5\` (scripts, `main-r5.sql`, `final-block-run3.txt`).
Container output: `/work/tests/run-r5-run2.out`, `/work/tests/run-r5-run3.out`, `/work/tests/race/*.out`.
