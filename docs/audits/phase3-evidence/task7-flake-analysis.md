# Task 7 — Playwright flakes: `accounting-duplicates` D1, `portal-journey` J2/J4 (isolated stack, 2026-10-12/13)

**Result: cause located in the application's data path, not in the tests. A deeper cause for *why* the queries sometimes exceed 8 s is NOT established. No application code was changed; the flake is not "fixed", it is explained and made self-explaining in two specs.**

## What fails
D1 opens the member page, clicks "Opening balance" and fills `#ob-amount`. In the failing runs the dialog **does open**, but instead of the form it shows *"Link the client to a unit first (ownership or an active lease)"*, and the member page behind it reads **"Units owned 0"** for a member who owns a unit (`failing-D1-last-frame-units-owned-0.jpg`, last frame of the kept trace). The test then waits for a field that is never rendered until its 120 s timeout. The earlier description ("`#ob-amount` not present", "first test after a cold server") described the symptom, not the cause.

## Evidence for the cause
1. **Statement timeouts.** PostgREST returned **500** (`57014 canceling statement due to statement timeout`, role limit `statement_timeout=8s`) for `GET /units_with_financials` (46), `GET /members_with_financials` (21) and `GET /maintenance_categories` (3) in a 150-minute window; 70 timeouts in the database log between 21:22 and 22:38.
2. **Per-run correlation** (14 consecutive D1 runs, `loop3-correlation.md`): **7 of the 8 failing runs contain 1–3 statement timeouts in their time window; none of the 6 passing runs contains one.** (The 8th failing run, run 1, shows 0 in the window; the window is approximate.)
3. **The page turns the error into "no data".** The member page treats a failed `members_with_financials` / `units_with_financials` read as an empty result, so the UI shows a coherent but wrong state (0 units, a notice, no form) instead of an error.
4. J2 failed twice in a row in one loop (`/portal/units` text lacked `R-101` after a ~15 s first render; the portal reads `units_with_financials`) and J4 (maintenance form: `maintenance_categories` timeouts seen) failed in 2 of the combined runs. **Both are consistent with the same cause but were not individually confirmed** (no timeout was matched to a specific J2/J4 failure).

## Failure rates observed (D1 alone, quiet machine)
| loop | state of the code | D1 failures |
|---|---|---|
| 1 | untouched | 1 / 8 (plus J1–J4: J2 failed in 2 of 4 runs) |
| 2 | with a click-retry helper (wrong hypothesis, since reverted) | 3 / 10; S1 0 / 4; whole `portal-journey` 1 / 5 (J4) |
| 3 | with extra `hasPermission` logging (reverted) | **8 / 14** |
| 4 | same, with a `pg_stat_activity` sampler | 0 / 6 |
Total **12 failures in 38 D1 runs (~32 %)**, clustered in time, not uniform. The sampler of loop 4 saw `units_with_financials WHERE id = ANY($1)` statements **active for 3–7 s** in runs that still passed (`sampled-slow-queries-loop4.txt`): the same statement is routinely a few seconds and occasionally crosses the 8 s limit.

## What is NOT established
* **Why a statement that takes 0.4–1.5 s on a quiet connection (measured: `members_with_financials` for one member, 70 k buffer hits, a Seq Scan on `units`; `units_with_financials` for one id, < 10 ms) is sometimes 3–7 s and occasionally > 8 s.** Candidates, none proven: (a) the view shape scales with total data, not with the tenant (the stack holds ~800 organizations of test fixtures); (b) several view queries issued in parallel by one page; (c) CPU/IO contention on the shared Docker VM (38 containers running on 9.6 GiB, three Supabase `vector` containers in a restart loop); (d) table statistics are not stale (≤ 10 % modified since the last autoanalyze), so stale statistics are unlikely.
* Whether production-like data volumes make this a user-facing defect (a page that silently shows "0 units"). It is a real defect of error handling regardless of the load cause.

## Hypotheses tried and retracted (in order)
1. *"Cold server."* Three restarts of the server followed by the D1 steps: no failure. (Also: D1 failed as the 10th test of a combined run, not only as the first.)
2. *"A click on an un-hydrated button is lost."* A probe clicked immediately after `goto` and often saw no `#ob-amount`; I took that for a lost click. **Wrong:** the same page state (no units → notice instead of form) explains it. A click-retry helper and a poll in J2 built on this were removed; the retry helper did not reduce failures (3/10, then 8/14).
3. *"`hasPermission` fails closed silently and hides the button."* Logging added to `lib/auth/authorize.ts` recorded **0** denials over 14 runs (8 failures); the change was reverted (the file has no diff against HEAD).

## What was changed
* `tests/e2e/accounting-duplicates.spec.ts` (D1) and `tests/e2e/accounting-journey.spec.ts` (S1): after opening the dialog, if the "link the client to a unit first" notice is shown, the test fails **immediately with a message that names the environment cause** (page read no units; statement timeout on the units/members views) and points here. This does not hide the flake or retry it; it makes each occurrence self-explaining.
* No change to application code, migrations or views. `portal-journey` J2/J4 unchanged.

## Follow-up (2026-10-13)
**Item 1 below was implemented**: see `task7-error-states.md` (the pages now show an error view with Retry; it also made the timeouts visible: 39 real ones in one regression session). Items 2-4 remain open.

## Recommended (item 1 done, items 2-4 NOT done; they touch financial views)
1. ~~Pages that read `*_with_financials` must show an **error state** when the query fails, never an empty list.~~ Done.
2. Review `members_with_financials` / `units_with_financials`: the plan for a single-member lookup scans all units and aggregates dues before filtering; filter by the requested id/organization **inside** the view's aggregates.
3. Test environment: fewer parallel containers (the three restart-looping `vector` containers), and a statement-timeout headroom for the isolated stack if the product change is deferred.
4. Re-measure D1 / J2 / J4 (≥ 30 runs each) after (1)–(2); only then call the flake closed.

## Files
`task7-flake/`: `loop1…loop4` summaries, `loop3-correlation.md`, `pg-statement-timeouts-21-22h.txt`, `sampled-slow-queries-loop4.txt`, `failing-D1-last-frame-units-owned-0.jpg`.
