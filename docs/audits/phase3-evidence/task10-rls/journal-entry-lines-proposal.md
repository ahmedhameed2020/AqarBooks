# Proposal (NOT applied): `journal_entry_lines` and the `journal_entries` policy it depends on

**Status: APPROVED and applied as migration `20261017101100_rls_journal_entries_and_lines.sql` (both tables in one migration). The text below is the original diagnosis and proposal, kept as written; results: `final-run-last/RESULT.md`. Note: this proposal's test file `tests/rls-journal-entry-lines-equivalence.integration.test.ts` was rewritten after approval to read the INSTALLED policies and to cover both tables, plans, catalog and write denial.**

## Diagnosis (measured)
* Real plan, staff user, exact count (`EXPLAIN ANALYZE`, quiet moment): `journal_entry_lines` is a Seq Scan with `Filter: journal_entry_id = ANY (hashed SubPlan 2)`; the SubPlan is a Seq Scan of `journal_entries` — 3,269 rows, **87,516 buffers**, 1.6 s. The `EXISTS` in the lines policy is already planned as ONE hashed sub-plan (I had assumed it was a per-line probe; it is not).
* So the cost is the scan of `journal_entries`, where **every row pays three permission checks**: the `journal_entries` select policy (`has_permission(..'finance.reports.read') OR has_permission(..'finance.entries.create')`, two calls) plus the lines policy's `has_any_permission` (one call). At ~190 µs per call that is the 4.0–7.3 s seen under load in the probe (`probe-all-after-migration.md`) and the second timeout of `membership-status-access`.
* The test data grows with every run (6,099 → 6,548 lines), so this relation keeps drifting toward 8 s.

## What a rewrite buys (scratch copies, full tables, interleaved, median of 5 (min-max), ms — `jel-prototype.md`)
| principal | A: current | B: lines policy rewritten alone | C: B + `journal_entries` policy rewritten |
|---|---|---|---|
| staff | 3,260 (2,009–7,801) | 4,092 (1,423–8,632) | **13** (8–65) |
| owner | 2,459 (2,063–4,369) | 3,558 (2,897–4,467) | **13** (9–28) |
| stranger | 7,919 (2,958–9,084) | 8,192 (2,724–10,266) | **30** (10–110) |
**B alone does not help (within noise, even slightly slower): only C does (≈ 150–250×).** The fix therefore is the pair, and it touches `journal_entries`.

## Proposed change
`migration/journal-entry-lines-proposal.sql` (not under `supabase/migrations`): `journal_entries_select_permission` and `journal_entry_lines_select_permission` rewritten with `orgs_with_permission_keys` and the platform-admin check as an InitPlan, exactly like the five approved policies. Equivalence argument: `has_any_permission(org, K)` = `uid is not null AND (platform admin OR active member whose tenant role holds any key of K)` = `(admin scalar) OR org ∈ orgs_with_permission_keys(K)`; for `journal_entries`, `has_permission(k1) OR has_permission(k2)` = `org ∈ orgs_with_permission_keys({k1,k2})`; the sub-select on `journal_entries` inside the lines policy still runs under that table's RLS, as before.

## Independent equivalence test (passes on the proposal; fails on a sabotaged one)
`tests/rls-journal-entry-lines-equivalence.integration.test.ts`, inside a rolled-back transaction, on copies carrying only the policy under test (current per-row policies vs proposed): for staff of every role present (10 holding keys, 4 without), owners, invited and suspended members, a stranger and a platform admin created in the transaction, the visible `journal_entries` and `journal_entry_lines` ids are compared in both directions, for variant B and variant C: **0 differences** (`migration/jel-equivalence-run.log`, 2/2 pass). Negative control (`JEL_NEGATIVE_CONTROL=1`: no admin branch, narrowed key list): FAILS as required — the platform admin would lose 438 lines, CASHIER 99, FRA_READER 10 (`migration/jel-negative-control-run.log`). Limits: select path only (these tables have no write policy using these helpers in this proposal); a deterministic sample of organizations (the principals' own plus 40 by id and up to 10 non-active); the proposal is hard-coded in the test because it does not exist in the catalog yet — after approval the test gets catalog assertions like the five-policy test.

## Also seen in the final sequential run
`membership-status-access` failed once on `HEAD /fiscal_years` (1.6–4.2 s in the probes, 8 s limit hit under load) besides `journal_entry_lines`; `fiscal_years` is in no approved scope and has not been analysed.

## Not covered
Every other table (members, units, properties, fiscal_years and ~80 more), the owner routes of `dues`, and write policies. No performance claim beyond the copies above.
