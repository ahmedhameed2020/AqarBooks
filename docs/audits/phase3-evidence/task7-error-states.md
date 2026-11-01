# Task 7 — error states for pages that read the failing-prone views (isolated stack, 2026-10-13)

**What was done:** a failed read of `members_with_financials`, `units_with_financials` or `maintenance_categories` (and the other primary reads of the same pages) no longer renders as empty data. The page throws a `DataLoadError`; the route's error boundary shows *"This page's data could not be loaded"* with **Retry** (which refreshes the server data) and the correlation code. **What was NOT done:** the views themselves were not changed, so the statement timeouts that caused the flakes still happen; they are now visible instead of silent.

## Changes
* `lib/supabase/assert-read.ts` — `assertRead(error, source)` / `DataLoadError` (logs only the source and the stable code; never the database message).
* `components/data-load-error.tsx` + `app/[locale]/(app)/error.tsx` + `app/[locale]/portal/(member)/error.tsx` — the shared bilingual error view; Retry = `router.refresh()` + `reset()` (a bare `reset()` would replay the old failure).
* `assertRead` added to the primary reads of: members (list, drawer, `[memberId]`), property (list, drawer, `[unitId]`), admin/resorts, operations/maintenance (+ `[requestId]`), portal home, units, profile, payments, statement, maintenance (+ `new`, `[requestId]`). The portal statement and payments pages used to log the error and continue with empty sections.
* Not changed: the staff dashboard (it already has a per-section denied / error / ok state), exports.
* Tests: `tests/assert-read.test.ts` (4), `tests/page-read-guard.test.ts` (19: every `page.tsx` that reads these relations imports and calls `assertRead`; non-vacuous), `tests/e2e/page-error-states.spec.ts` (2).

## Proof
* **Red before / green after** (`task7-error-states/`): with SELECT on the two views revoked from `authenticated` (grants restored in `finally` and compared with a snapshot) the member page, without its two `assertRead` calls, **fails the test** (no error view, the old behaviour); with them, both tests pass. Screens: `task7-error-screens/en-member-page-load-error.png`, `ar-portal-units-load-error.png`.
* **A real incident caught by the new code:** the first green attempt, run right after Docker was restarted, failed its "healthy first" step because the database really answered `57014 statement timeout`; the server log shows `members/[id]: units_with_financials 57014` and the page showed the error view, not "Units owned 0". The rerun on a warm database passed.
* Retry recovery (grants restored, click Retry, normal page back): covered in both tests.

## Regression after the change (one run per suite, sequential, `task7-error-states/post-change-regression-summary.txt`)
accounting-duplicates 5/5 · accounting-journey 15/15 · portal-journey 6/6 · portal-statement 8/8 · customer-advances (B1–B8) 10/10 · customer-advances-ui-screens 6/6 · page-error-states **1 failed, 1 not run** in that run (its Retry step most likely met another real statement timeout: several `57014` were logged at that time). The spec was then made to press Retry again when the error view appears (what a user would do) and run: a batch of 3 gave 2 failures (details not kept) and 1 pass; **then 5 consecutive passes** (1 + 4, `error-state-spec-4-runs.txt`). Unit/guard set: 8 files, 161/161; `tsc` clean; eslint 0 errors. The 557-test suite was not rerun.

## What this change makes visible (read before relying on it)
* In the same regression session the server logged **39 real statement timeouts (57014)**: 32 on `portal/home: members_with_financials`, 2 on `members/[id]: units_with_financials`, the rest on portal units/statement/payments/maintenance-new. **The owner's landing page used to answer those with a dashboard of zeros; it now answers with the error view.** On this stack (835 organizations of test data) that is frequent. Whether it is frequent with production-sized, tenant-scoped data is not known.
* Hence the performance review of the views (single-member lookups scan all units/dues before filtering) is no longer optional hygiene: until it is done, a slow database shows users an error page instead of wrong numbers. That trade is deliberate (a wrong zero on a financial screen is worse), but it must be weighed before any deployment.

## Open
1. Review/rewrite `members_with_financials` / `units_with_financials` (and `maintenance_categories` read path) so single-id lookups filter inside the aggregates. Not done; needs an approved task (financial views).
2. Why queries of 0.3–1.5 s on a quiet connection sometimes exceed 8 s is still not established (`task7-flake-analysis.md`).
3. The error-state spec's stability: 5 consecutive passes after 3 earlier failures; not a proof.
4. Other pages that read other relations and ignore errors were not audited here (scope was the failing-prone relations and the pages that read them).
