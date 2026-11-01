# Proposal (NOT applied): `fiscal_years` policies evaluated once per statement

**Status: diagnosis, prototype on a scratch copy and an independent equivalence test only. Nothing is applied to the isolated stack. `fiscal_years` is outside the tables approved so far; this is the analysis you asked for, to close the remaining timeouts of `membership-status-access`.**

## Diagnosis (measured)
* `fiscal_years` has 1,394 rows (728 organizations). `EXPLAIN ANALYZE select count(*)` as a staff user: a Seq Scan, `Filter: has_any_permission(organization_id, {finance.periods.manage,finance.reports.read,finance.accounts.view}) OR (has_permission(.., 'finance.periods.manage') AND organization_is_active(..))`, 1,392 rows removed, **37,100 buffers, 4.4 s** (under neighbour load; ~1 s on a quiet machine).
* Per-call cost on this table (`micro-fy.sql`, 1,394 rows): `has_any_permission` 610 ms (≈ 440 µs per call), `has_permission` 339 ms (≈ 240 µs), `organization_is_active` 19 ms, `is_platform_admin` 21 ms. Two permissive policies apply to every read (the SELECT policy and the ALL "manage" policy), so each scanned row pays them all.
* The indexes the helpers use exist (`idx_organization_memberships_user`, the unique (organization_id, user_id), `idx_user_role_assignments_user`): the cost is call volume, not a missing index. Same mechanism as `chart_of_accounts` / `fiscal_periods` (migrations 20261017100900 / 101000).
* Effect: `HEAD /fiscal_years` returned HTTP 500 / 57014 once in the strictly sequential run of `membership-status-access` (and 1.6–4.2 s in the probes), i.e. it is next in line to cross the 8 s limit as test data grows.

## Proposed change
`migration/fiscal-years-proposal.sql` (not under `supabase/migrations`): both policies rewritten exactly like the approved ones — `orgs_with_permission_keys` for the organization check and the platform-admin check as an uncorrelated InitPlan; `organization_is_active` stays as the extra AND; the ALL policy keeps USING and WITH CHECK identical to each other, as today.

## Evidence
* Interleaved timing, current vs proposed, full copy with only the policy under test, median of 5 (min–max), ms (`fy-timing.md`): staff **1,156 (688–1,562) → 18 (9–28)**, owner 689 (541–1,125) → 10 (8–16), stranger 1,319 (809–1,693) → 13 (10–47).
* Independent equivalence test, **writes included** because the manage policy is an ALL policy with WITH CHECK (`tests/rls-fiscal-years-equivalence.integration.test.ts`, 2/2 pass; `migration/fy-equivalence-run.log`): for staff of every role present (10 holding the keys, 4 without), owners, invited and suspended members, a stranger and a platform admin created in a rolled-back transaction, the visible ids, the number of updatable rows and the outcome of an INSERT for the principal's own organization and for another organization are identical, current vs proposed: 0 differences.
* Negative control (`FY_NEGATIVE_CONTROL=1`: narrowed key list, no active-organization check): FAILS as required — staff:CASHIER and staff:FRA_READER would each lose 2 rows (`migration/fy-negative-control-run.log`).
* Limits: deterministic sample of organizations (the principals' own plus 40 by id and up to 10 non-active); the proposal is hard-coded in the test because it is not in the catalog; if approved, the test gets catalog and plan assertions like the applied suites; no claim beyond the copies.

## Not covered
Every other table (members, units, properties and ~80 more) and the `dues` owner routes — not expanded, as instructed.
