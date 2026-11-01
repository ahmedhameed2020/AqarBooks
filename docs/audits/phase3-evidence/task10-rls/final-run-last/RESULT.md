# Final run after the LAST change (2026-10-15, isolated stack)

State: migrations `20261017100900`, `…101000`, `…101100` applied (52 authorized migrations in the guard, ledger 85/85), production build of 2026-10-14 (no app code changed since). One run, sequential, nothing re-run inside the table (`summary.txt`, `driver.sh`). No timeout was changed anywhere.

## Vitest — one vitest process per file, strictly one after the other (`--each`; `vitest-each.log`): exit 0, 26 of 26 files PASS
| group | result |
|---|---|
| `membership-status-access` (the file that failed in every earlier series) | **17/17 PASS** (first time) |
| `owner-portal-access.local-sql` — the 40 formerly skipped tests, `LOCAL_PG_PORT=55322` (the isolated stack; the development DB is 54322 and was not used) | **40/40 PASS** |
| `rls-journal-entry-lines-equivalence` (both tables, plans, catalog, write denial) | 5/5 |
| `rls-set-based-policies-equivalence` | 6/6 |
| `rls-fiscal-years-equivalence` (proposal test, nothing applied) | 2/2 |
| `financial-views-equivalence` 4, `security-function-grants` 4, `migration-directory-guard` 103, `page-read-guard` 19, `assert-read` 4, `drift-verdict` 16, `deposit-accounts` 4 | all pass |
| `customer-advances-actions` (unit 84 + integration 8), `-integrity` 16, `-review2` 12, `-review3` 10, `customer-advances.integration` 39, `-schema` 16, `advance-account-configured` 3 | all pass |
| `owner-statement-settlement` 8, `portal-statement-history` 7, `member-opening-balance` 9, `owner-portal-functions-authz` 15, `payment-allocation-readers` 9, `tenant-dashboard-access` 8 | all pass (the `owner-statement-settlement` timeout seen once earlier did not recur; not closed as a flake) |

## Playwright — production build, one run per spec, first run (`summary.txt`)
`page-error-states` 2/2 (first Retry succeeded in both), `owner-portal-isolation` 1/1, `portal-refusals` 5/5, `accounting-duplicates` 5/5, `accounting-journey` 15/15, `portal-journey` 6/6, `portal-statement` 8/8, `customer-advances` 10/10, `customer-advances-ui-screens` 6/6. No failure.

## Schema check with catalog capture (`verify.txt`)
Ledger 85/85 MATCH; observation 1 clean and observation 2 clean, the live and shadow catalogs identical in both; verdict `CLEAN`, exit 0. The drift item itself stays OPEN (the earlier unstable-tool reports were never explained).

## First failures of THIS step (kept; none is hidden by the green run above)
| when | what failed first | classification |
|---|---|---|
| journal test, red control on the stack | 2 of 5 assertions (catalog: per-row helper still present; plans: no InitPlan) — **expected** red before the migration; the 3 equivalence and write-denial checks already passed on the old policies, so "writes denied" is recorded BEFORE the migration (`migration/jel-red-before-migration-on-stack.log`) | red control, as intended |
| journal test, first scripts | `missing FROM-clause entry for table "journal_entry_lines"` (re-pointing the catalog expression at the copy); then the admin-sub-select check captured the outer sub-link; then the pattern missed the schema-qualified name | TEST bugs of mine, fixed before any result above |
| journal test, negative control on a scratch copy with sabotaged policies | 4 of 5 assertions FAIL as required (the platform admin would lose 158 entries; no admin sub-select; no InitPlan; the admin cannot read) (`migration/jel-negative-control-run.log`) | control, as intended |
| the 40 local-sql tests, previous step | 39/40 on the first execution (test setup vs real `auth.sessions`), fixed in the test | already recorded in `../final-run-final/RESULT.md` |
| previous step, parallel Vitest invocation | 5 `customer-advances*` files failed in fixture setup from overload | already recorded in `../final-run-final/RESULT.md` |

## Migration 20261017101100 (journal_entries + journal_entry_lines, one migration)
2,780 bytes, SHA-256 `acddadb100368b30f31a8241fafbfe6c1c23b283ff3904530d64d75f90f9bafb`. Catalog diff before/after: exactly the two policies (4 lines, `migration/catalog-diff-journal.txt`). Each table has exactly one policy, a PUBLIC permissive SELECT policy; **no write policy exists and none was added or changed**; writes remain denied (test: a principal that can read entries updates and deletes 0 rows, for staff, platform admin and stranger, on the real tables). Equivalence of BOTH tables with the previous expressions: 0 differences for staff of every role present (10 holding keys, 4 without), owners, invited and suspended members, a stranger and a platform admin. Measured earlier (scratch copies, interleaved): lines policy alone ≈ no gain; both tables together 3.3 s / 2.5 s / 7.9 s → 13 / 13 / 30 ms.

## Not applied, proposed
`fiscal_years` (`../fiscal-years-proposal.md`, `../migration/fiscal-years-proposal.sql`, `tests/rls-fiscal-years-equivalence.integration.test.ts`): same pattern, 1,394 rows, ≈ 4.4 s under load (1,156 → 18 ms interleaved); equivalence incl. updates and WITH CHECK inserts passes, negative control fails as required. It did not time out in this run.

## Disclosed
* Four temporary debug files of mine remain, because the environment's safety check refused the command that would have removed them (the refusal text: it stops removals it cannot verify, here a command that passed a `sh -c` script containing `rm`; only a person may approve; I did not try to get around it):
  `docs/audits/phase3-evidence/task10-rls/migration/debug-out.txt`, `…/debug-err.txt`, `…/debug-script.sql`, `…/done-debug.txt`.
* Free space on D: fell during this step (2.26 → 1.89 GB): evidence logs, catalog captures (about 1 MB per capture file), the review bundle (19 MB), and the Docker disk file that holds the scratch databases (`scratch_ref`, `scratch_after`, `scratch_ab`, `scratch_rls` and the clone `aqar_local`, ≈ 125 MB each). Nothing was deleted.
* Open and unchanged: the schema-drift item (verify says CLEAN, the unexplained tool reports remain), G-ADV-1 / cash refund / credit transfer outside V1, Accsys (conditional on Bagoush), the owner-route policies of `dues`, every other table with per-row permission helpers (~80).
