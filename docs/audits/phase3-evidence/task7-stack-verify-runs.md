# Task 7 — `stack verify` (migration registry and schema-drift check), runs of 2026-10-12

Isolated stack `aqarbooks_clean`; development database untouched.

| # | what | result |
|---|---|---|
| 0 | first run of the closure | `ledger 81/81 MATCH`; `supabase db diff` **errored** (`LegacyShadowDbError: function public.due_outstanding(uuid) does not exist` while replaying the Phase 1 migration, which comes after the baseline that defines it) |
| 1 | cause of #0 | the stack **project folder** the CLI replays (`%TEMP%\aqarbooks-clean-stack\supabase\migrations`) held **21 files** (those from 20261009 on), not the repo's 81 -- no baseline. Environment, not schema. How it became partial is **unknown**: `syncStackProject`, `stack migrate` and `stack verify` were each run afterwards and none of them reduces it. (A deliberate re-creation of the partial folder as a negative control was not done: the removal was refused by the session's safety check and was not worked around.) |
| 2 | after re-syncing the 81 files | `ledger 81/81 MATCH` and `db diff (public): no schema changes` |
| 3 | `verify` changed to re-sync first and refuse to run unless the folder's count equals the repo's | next run: **DRIFT** (output not kept in full) |
| 4 | the next run, then runs r1-r3, then runs r4-r7 (eight runs in a row; r1-r7 kept as `run-r1..r7.txt`, the first one only in this note) | 8 x `no schema changes` |
| 5 | run r8 | **DRIFT**, 272 KB: 1,152 ALTER TABLE, 193 DROP POLICY, 91 DROP TRIGGER, 11 DROP FUNCTION (`run-r8-DRIFT-summary.txt`) -- objects that the migration files define, so the signature of an **incomplete shadow replay**, not of real drift; this run took ~4 minutes against ~1 minute for the others |
| 6 | `verify` changed again: the diff is taken twice (a third time if they disagree); disagreement prints `UNSTABLE` and exits 2, a reproduced difference prints `DRIFT (reproduced)` and exits 1 | `run-new-guarded.txt`: **2 identical clean runs, exit 0** |

Tally of single diff observations (#2, #3, #4, #5): **9 clean, 2 DRIFT with an incomplete-shadow signature** (11 runs) (+ the 2 clean runs of #6). Cause of the two DRIFT runs: **unknown**; load/time-out is a hypothesis, not shown. The `UNSTABLE` detector has not yet met a real unstable case.

What this does and does not establish
* `ledger 81 / files 81 → MATCH` proves the migration **registry** equals the migration **files**. It does not prove the schema is sound.
* The clean runs are consistent with "files replayed from scratch == live schema" but, given 2 of 11 inexplicable DRIFT reports, they are not a settled proof. The item stays open until the instability is explained.

## Follow-up (2026-10-14)
Investigated in `task9-drift/result.md`; **the item stays OPEN**. A report like the DRIFT ones was reproduced once under load and likely comes from the diff tool, but the independent catalog check of that instance was not completed and the cause is unknown. `verify` now uses a conservative rule (`CLEAN` only when the first two observations are clean; difference or tool error then clean = `UNSTABLE`; the same difference twice = `DRIFT_REPRODUCED`; all raw outputs kept; `scripts/demo-local/drift-verdict.mjs`, `tests/drift-verdict.test.ts`).
