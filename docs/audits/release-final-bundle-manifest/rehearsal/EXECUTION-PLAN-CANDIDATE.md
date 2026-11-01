# Execution plan — rehearsal then general rollout (CANDIDATE, not approved)

Status: candidate for review. It does not change `REHEARSAL-PLAN.md` (v3, approved, `25a3bbcb…`) or the frozen bundle (`ec1b669a…`). Nothing here runs until the gate in front of it is passed. Rule for every step: **stop at the first failed check, report it with the exact output, do not work around it.**

Tools (hashes in `SHA256SUMS.txt`): `export-preflight.sql`, `export-generate.sql` (`bdeb387d…`), `load-verify.psql` (`32d905f7…`), `scan-export.ps1` (`f422595e…`).

## Gates
| Gate | Who decides | Opens when |
|---|---|---|
| G0 | owner | tooling v4 accepted as reviewed (this folder) |
| G1 | owner | JSON allowlist for production written and signed off (step 2) |
| G2 | owner | scanner CLEAN on the export + handoff copy placed in `C:\rehearsal\input` |
| G3 | owner, in writing | the single execution authorization phrase (REHEARSAL-PLAN §9) |
| G4 | owner | rehearsal report accepted; open decisions 1–7 answered |
| G5 | owner | production window, per decision 7 |

## Phase A — owner side, production, READ-ONLY (before G1)
Executed by the owner, not by this assistant. Read-only session: `PGOPTIONS="-c default_transaction_read_only=on"`.
1. **Preflight** `export-preflight.sql` → send the output (metadata only: versions, extensions, roles, sizes, ledger, settings). *Check:* PG major matches the rehearsal image (17); every extension used is available; ledger count and last version recorded. *Stop if:* version/extension mismatch → we adjust the image/recipe before anything else.
2. **JSON key inventory** `json-key-inventory.sql` (v2, tested on test data, see `example-local/g0-v2-test-log.txt`; read-only; writes key names ONLY if they are on the owner's approved list (`-v allow=...`), counts everything else, never writes values; stops before reading any JSON if the running role is subject to row security (needs `json-inventory-role.sql` and an owner decision on RLS); a column with > 150 distinct keys is reported as "dynamic" without listing them). From it, turn each safe key into `JSONKEEP|table|column|path|kind`. *Rule:* unknown or identifier-unshaped keys are not listed (dropped). *Gate G1:* owner signs the list line by line; `KEEP` kind needs an explicit reason in the sign-off.
3. **Pass 1** `export-generate.sql` (no reviewed file) → `rule-report.txt` (every column incl. KEEP), `reviewed-candidate.sql`. Owner reviews all 1,700+ lines: priority = every KEEP text/varchar/jsonb column and every column added since the 242-ref test copy.
4. **Pass 2** with `reviewed-columns.sql` (candidate + JSONKEEP lines). *Check:* `unreviewed-columns.txt` says "none"; `stale-reviewed.txt` read. *Stop if:* any unreviewed item → export is blocked by design.
5. **Export** `export-run.psql` (single repeatable-read read-only snapshot). *Check:* exit 0; `_counts.csv` present; file count and size noted.
6. **Scan** `scan-export.ps1 -Path <export>` → must print CLEAN (digest count is info only). *Stop if:* any finding → delete nothing, report file/line/rule, fix the rule, re-export.
7. **Handoff:** copy `data/`, `load.psql`, `load-verify.psql`, `rule-report.txt`, `reviewed-columns.sql`, scan output to `C:\rehearsal\input`; compute SHA-256 of each and send the list (G2). Disk-encryption is operational info, not consent.

## Phase B — rehearsal, local (after G3, one authorization)
Authorized scope only: create container `aqarbooks_rehearsal` (isolated network, **no** published ports to other projects, no pg_cron/pg_net/pgsodium preload, no vault secrets, no outbound access), restore, load, verify, run listed checks. Never touch 54321/54322 or other projects' containers.
1. **Space check first:** copy + container volume + WAL + logs on D:. *Stop if* free space < 2× estimated need (recorded in the plan; D: had 10.31 GB on 2026-10-17).
2. **Create container**, wait healthy; record image digest and `select version()`.
3. **Restore base:** schema-only app schema into the container's initialized `postgres` DB (not `template1`); record errors verbatim.
4. **Load** `load.psql` as `supabase_admin`. *Check:* exit 0; `show session_replication_role` = `origin` printed.
5. **Verify** `load-verify.psql`. *Pass only if:* V1 counts equal, V2 zero orphans, V3 sequences ok, V5 ledger identical, V6 origin; V0 file `v0-reference-changes.csv` reviewed (vault refs nulled, providers disabled — numbers recorded). V4 NOT VALID list recorded.
6. **Ledger vs repo:** compare restored ledger to `supabase/migrations/`; list migrations missing in the copy (expected to include `20261018100000_deposit_account_cash_or_bank.sql`, SHA `add8a244…`, frozen).
7. **Apply pending migrations forward-only**, one by one, with timing; after each: row counts of touched tables and `select count(*)` from the new triggers' audit tables. *Stop on first error*, classify (PRODUCTION_BUG / ENV / DATA-SHAPE) with evidence; no edits to frozen migrations.
8. **Targeted checks on real-shape data** (no full suite): the deposit-account validation functions against every org's accounts; `record_payment`/`record_advance_payment` smoke on one test org inside a rolled-back transaction; the all-org impact queries (`ALL-ORGS-IMPACT-QUERIES.sql`) with their stated conditions; RLS: one tenant cannot read another's rows (3 sampled orgs).
9. **Report:** exact commands, exit codes, counts, timings (labelled "rehearsal conditions, not production, not an upper bound"), failures, space used. Then wait for G4. Container and data stay until the owner says delete.

## Phase C — rollout design (G4 → G5, nothing executed in this plan)
Decisions still open: 1 trial org, 2 read-only production checks, 3 commit split, 4 migration apply method, 5 rollback scripts, 6 refund function, 7 window. For each, the plan will carry: exact command, pre-check, post-check, rollback or "forward-fix only", and who runs it. Production deploy remains manual `workflow_dispatch` from master after commits/PR approved by the owner; migrations are not applied by CI; `npm run test:all` never runs on production.

## Always-on stop rules
- Any sign of production data leaving the owner's machine unscanned, or a secret in a log → stop.
- Any command that would touch ports 54321/54322, other containers, or production → do not run.
- No commit/push/PR/deploy and no deletion of scratch data without an explicit instruction.
- A check not run is reported "not run", never "passed".

## Immediate next actions (no authorization needed)
1. Owner: accept or amend tooling v4 (G0).
2. Done: `json-key-inventory.sql` written and tested on test data; awaiting the owner's review before it is ever run on production.
3. Assistant: estimate the space need from the preflight output when it arrives.
