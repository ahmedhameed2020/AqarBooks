# AqarBooks — Tenant Backup & Recovery — Phase 1 Report

**Status: TB&R PHASE 1 — PAUSED / MARKET VALIDATION (2026-08-24).** Owner
decision: AqarBooks prioritizes market validation and customer acquisition
before further TB&R investment. Reopen trigger: ≥10 paying AqarBooks
customers, OR an earlier customer/enterprise deal with an explicit
contractual backup/recovery requirement. Everything below this line
reflects the state at the moment of pausing — preserved as-is, not removed.

**Scope:** Foundation only, per the owner's Phase 1 mandate — canonical
snapshot spec, identity-preserving recovery contract, extractor foundation
(table classification + ordering), an isolated-restore-target guard, and a
verification-gate decision engine. **No production writes. No live
extraction or restore was executed against any database.**

**Governing decision:** [ADR 0006](../adr/0006-tenant-backup-identity-preserving-recovery.md)
(TB&R-001) — identity-preserving recovery only; remap workflows are
Clone/Data Portability, out of scope. **This decision remains binding when
the workstream reopens** — it is not affected by the pause.

## Status at pause

| Item | State |
|---|---|
| Phase 0 Discovery | COMPLETE |
| TB&R-001 (ADR 0006) | APPROVED |
| Phase 1 Foundation (code, spec, ADR) | BUILT — 13 files, unchanged, not removed |
| Unit tests | 49 PASS |
| Schema bootstrap drill | NOT RUN |
| Recovery drill | NOT RUN |
| Production TB&R | NOT DEPLOYED |

## Disposable validation infrastructure — decommission candidates

Two projects were provisioned in the Pro org (`pqbcyijrapzwzdnepaht`) for the
Phase 1E drill, per the owner-authorized provisioning flow. Verified via
`list_projects`/`list_tables` at pause time: **both exist, both
`ACTIVE_HEALTHY`, both contain zero tables — no schema bootstrap, no
synthetic tenant, no data of any kind was ever loaded into either.**

| Project | Ref | Region | State |
|---|---|---|---|
| `aqarbooks-tbr-p1-source` | `upajcdhmnaxtawsliubm` | eu-west-1 | Empty, ACTIVE_HEALTHY |
| `aqarbooks-tbr-p1-restore` | `jmssnfszftmokbpytzhz` | eu-west-1 | Empty, ACTIVE_HEALTHY |

Both are billed at $10/month each ($20/mo combined) on the Pro org while
they remain active. **Not deleted automatically** — reported here as
safe-to-decommission candidates for owner action, since they hold no work
product to lose. Trakova and muhassil, the org's other two projects, were
never touched.

---

## 1. Baseline

- `HEAD`: `4620fb713ad946b072aaea7f13e9bf324cc07551`
- `origin/master`: same commit — working tree was clean and fully in sync
  before this work started.
- `git status` before any change: clean.

## 2. Files added

```
docs/adr/0006-tenant-backup-identity-preserving-recovery.md
docs/backup-recovery/tenant-backup-format-v1.md
docs/backup-recovery/phase1-implementation-report.md   (this file)
lib/backup/table-classification.ts
lib/backup/hashing.ts
lib/backup/restore-target-guard.ts
lib/backup/verification-gates.ts
lib/backup/storage-completeness.ts
tests/backup-table-classification.test.ts
tests/backup-hashing.test.ts
tests/backup-restore-target-guard.test.ts
tests/backup-verification-gates.test.ts
tests/backup-storage-completeness.test.ts
```

No existing file was modified. No accounting primitive, RLS policy,
migration, or unrelated application code was touched. Every new file exists
because the Phase 1 mandate names it directly (1A canonical spec, 1A
hashing, extraction manifest/classification, restore-target refusal,
verification-gate decision logic, storage completeness contract).

## 3. Snapshot format v1 specification

Written: [`docs/backup-recovery/tenant-backup-format-v1.md`](tenant-backup-format-v1.md).
Defines package layout, `manifest.json` shape, the GLOBAL_REFERENCE
resolution model, the auth-identity metadata model (active-identity map
only, no secrets, historical actors preserved verbatim), the storage
manifest, the hash/signature construction (no self-reference), the
snapshot-consistency requirement (single `REPEATABLE READ` transaction), and
the export-time verification-evidence capture. Explicitly marks encryption
and signing as `null`/absent placeholders — Phase 1 does not deploy KMS.

## 4. Tenant extraction mechanism

`lib/backup/table-classification.ts` encodes the full, Phase-0-verified
104-table partition as data (not a runtime discovery step):

| Classification | Count | Disposition |
|---|---|---|
| TENANT_ROOT | 1 | REFERENCE_ONLY |
| TENANT_OWNED_DIRECT | 82 | INCLUDE |
| TENANT_OWNED_INDIRECT | 9 | INCLUDE |
| GLOBAL_REFERENCE | 9 | EXCLUDE_RESOLVE_BY_ID |
| PLATFORM_INTERNAL | 2 | EXCLUDE_ENTIRELY |
| AUTH_IDENTITY | 1 | EXCLUDE_ENTIRELY |

`classifyTable()` throws `UnknownTableError` for any table it doesn't
recognize rather than guessing a classification — this is the literal
"UNKNOWN ownership is not allowed" requirement. `assertKnownTableSet()`
fails closed in **both** directions: a live table missing from the map, or
a mapped table no longer live (schema drift either way is refused, not
silently tolerated).

`EXTRACTION_LAYER_ORDER` gives the 91 INCLUDE-dispositioned tables a
concrete load order, derived from the Phase 0 §5 dependency graph in
layers (org config → property hierarchy → members → chart of accounts →
journal + everything that posts to it → audit). This was **not** hand-typed
blind — the test suite (`backup-table-classification.test.ts`) asserts the
order set exactly matches the INCLUDE set (bijective, no extra/missing
tables) and that every `TENANT_OWNED_INDIRECT` table is ordered after the
direct parent named in its own `tenantPath`. Running that suite caught and
fixed three real ordering bugs during development (`resort_memberships`
missing entirely; `payment_allocations` ordered before its `payments`
parent; `plan_installments` ordered before its `dues` parent) — the tests
did their job.

Table-level topological ordering *within* a layer (e.g. among the 20+
Layer-4 tables) is not fully FK-graph-derived in this v1 — it follows the
Phase 0 narrative grouping. This is a documented, deliberate scoping choice:
correctness of a restore does not depend on insertion order (FK enforcement
is suspended during the replica-mode load window regardless, per Phase 0
§30), it depends on the mandatory post-load FK sweep. A fully automated
topological sort is a reasonable Phase 1 follow-up, not a blocker.

## 5. Recovery contract implementation

`ADR 0006` is the contract; `lib/backup/restore-target-guard.ts` and
`lib/backup/verification-gates.ts` are its two enforcement points:

- **Identity preservation** is structural in the format (§1 of the spec:
  `organization_id` lives at the manifest's top level, never as a row to
  "restore into a new id"; `organizations` itself is `REFERENCE_ONLY`, not
  `INCLUDE`).
- **No remap path exists in this code at all** — there is no function
  anywhere in `lib/backup/` that takes a source and destination
  `organization_id` and produces a translation. That was a deliberate
  omission, not an oversight: building it would have created exactly the
  footgun ADR 0006 exists to prevent.

## 6. Restore harness implementation

`lib/backup/restore-target-guard.ts` — `assertRestoreTargetIsSafe()`:

- Hard-denies the literal production project ref (`ataslxkcflxuilpgyepm`),
  unconditionally, with no override.
- Refuses any target not positively classified
  `"disposable-non-production"` — an unclassified or ambiguous target is
  refused, never defaulted to "probably fine."
- Refuses unless the operator explicitly acknowledges validation mode.

This is the full extent of the "restore harness" built in Phase 1: the
refusal logic. The part that would actually open a privileged Postgres
connection, set `session_replication_role`, run `COPY`, and load rows is
**not implemented** — see §9 for why, and §12 for what unblocks it.

## 7. Verification harness implementation

`lib/backup/verification-gates.ts` — `evaluateRecovery()`: given a set of
gate results (each to be produced by code that actually queries a restored
database — not yet built), decides `VERIFIED_RECOVERY` vs.
`RESTORE_INVALID`. Fails closed on every axis: a gate that never ran counts
identically to a gate that ran and failed, and **any single failed or
missing mandatory gate makes the whole verdict `RESTORE_INVALID`** — tested
explicitly (`6 of 7 mandatory gates passing is still RESTORE_INVALID, not
'mostly passed'`).

`lib/backup/storage-completeness.ts` — implements the
`COMPLETE_VERIFIED`/`INCOMPLETE`/`FAILED` state machine from Phase 0 §25: a
single capture failure or checksum mismatch remaining at the retry/cutoff
boundary fails the **whole package**, never just that one object.

## 8. Disposable validation environment — BLOCKED, reported not assumed

Per the mandate's own instruction ("If no already-authorized disposable
non-production environment exists ... STOP before provisioning it. Report
the exact requirement instead of creating it silently"), I checked what
already exists (read-only `list_projects`) before writing any extraction or
restore-execution code that would need one:

| Project ref | Name | Status | Usable for Phase 1E? |
|---|---|---|---|
| `ataslxkcflxuilpgyepm` | ResortOS (production) | ACTIVE_HEALTHY | **No — this is production, hard-denied by `restore-target-guard.ts`** |
| `vktofgamwoglxjcnzuma` | aqarbooks-step7a-gate | ACTIVE_HEALTHY | **No** — this is Step 7/9 migration-reconciliation incident infrastructure |
| `sqtdgkdtvooqlzvswktb` | aqarbooks-baseline-scratch | INACTIVE | **No** — same incident's scratch trail |
| `vxtcieaawkwxlphyrpgc` | aqarbooks-baseline-scratch-2 | INACTIVE | **No** — same incident's scratch trail |
| `npwxwvrkxjsextygipcx` | aqarbooks-baseline-scratch-3 | INACTIVE | **No** — same incident's scratch trail |
| `national-foam`, `saydali` | unrelated projects | INACTIVE | Not AqarBooks infrastructure at all |

Every existing non-production Supabase project in this organization traces
back to the migration-reconciliation incident (Step 7/8/9, ADR 0005 in that
separate context). The Phase 1 mandate explicitly requires isolation from
that workstream — reusing any of these would entangle a disposable
backup-validation drill with an incident's evidence trail that memory
records as something to preserve, not overwrite or reinterpret
(`step7_production_cutover_complete.md`: "rollback evidence must never be
deleted"). Treating any of them as "already-authorized disposable
infrastructure" for this purpose would violate the mandate's own isolation
requirement, so — per the mandate — **none of them count**, and creating a
fresh, dedicated, disposable Supabase project is new billable infrastructure
requiring the owner's explicit go-ahead before provisioning.

**This was not provisioned.** I am reporting the requirement, not creating
it silently, exactly as instructed.

## 9. Mandatory gate results

Only the gates that don't require a live database were run:

| Gate | Result |
|---|---|
| `tests/backup-table-classification.test.ts` (15 tests) | ✅ PASS |
| `tests/backup-hashing.test.ts` (16 tests) | ✅ PASS |
| `tests/backup-restore-target-guard.test.ts` (6 tests) | ✅ PASS |
| `tests/backup-verification-gates.test.ts` (5 tests) | ✅ PASS |
| `tests/backup-storage-completeness.test.ts` (7 tests) | ✅ PASS |
| **Total** | **49/49 passing** |
| `npx eslint lib/backup tests/backup-*.test.ts` | 0 errors, 0 warnings |
| `npx tsc --noEmit` (whole project) | 0 errors attributable to new files |
| Phase 1E — one disposable non-production validation drill (source tenant, extraction, restore, full gate run) | **NOT RUN — blocked on §8** |

## 10. Tests / build results

49 new unit tests, all passing, all pure-logic (no database, no network, no
`.env` dependency) — they can run in any environment, including this one,
without a Supabase connection. No existing test was touched, weakened, or
silenced. `npm run test:all` (the full existing integration suite) was not
re-run as part of this change, since nothing in `lib/backup/` is imported by
any existing code path yet — there is zero surface area for this change to
have regressed anything.

## 11. Limitations deliberately left for later phases

- **No live extractor.** `lib/backup/table-classification.ts` defines *what*
  to extract and in *what order*; no code yet opens a `REPEATABLE READ`
  transaction against a real database and writes `tenant-data/*.json` files.
- **No live restore runner.** `restore-target-guard.ts` defines *whether a
  target may be used*; no code yet drives `session_replication_role`, runs
  `COPY`, or loads rows.
- **No live gate producers.** `verification-gates.ts` defines *how to
  decide* given results; no code yet queries a restored database to produce
  those results (FK sweep, trial balance, `verify_financial_audit_chain`
  call, etc.).
- **No encryption, no signing** — placeholders only, per the mandate.
- **No Storage capture code** — the state machine exists;
  the fetch-and-checksum loop against Supabase Storage does not.
- Table-level ordering within a layer is narrative-derived, not a full
  FK-topological sort (§4).

None of these are accidents — each is exactly what the mandate excluded
("DO NOT build the complete product") or what the environment gate in §8
blocks.

## 12. Owner decisions still open

Unchanged from the Phase 0 closure, plus one new item this pass surfaced:

- Retention policy, RPO/RTO targets, entitlement tier mapping (Phase 0 §16).
- Customer-controlled encryption ownership model (Phase 0 §26).
- **Whether to provision a new, dedicated, disposable Supabase project for
  Phase 1E** (this report's §8) — this is billable infrastructure and a
  fresh account-scoped resource; I did not create it.
- Confirming `service_role` `BYPASSRLS`/`session_replication_role` access on
  whatever environment is eventually used (Phase 0 §23/§27) — still
  unverified, and now also unverifiable for the *destination*, since no
  destination exists yet.

## 13. Mutation matrix

| Surface | Writes |
|---|---|
| Repository | 13 new files (listed in §2); zero existing files modified |
| Production DB | ZERO |
| Validation DB | ZERO — none was provisioned or connected to |
| Production schema | ZERO |
| Production Storage | ZERO |
| External infrastructure | ZERO — no new Supabase project, no billing action, nothing provisioned |

---

## Success condition check

Per the mandate's own criteria:

> PHASE 1 may close only if: one tenant snapshot can be created
> consistently; the original organization_id is preserved; it restores into
> an isolated non-production environment; the original financial audit
> chain verifies WITHOUT rehashing; accounting invariants pass; FK isolation
> passes; package integrity passes; production remains untouched.

No snapshot was created and no restore ran — both require the environment
decision in §8. Production remaining untouched is the one criterion fully
satisfied (§13). The foundation code (spec, classification, hashing,
guard, gate logic) is built, tested, and ready to be driven by a real
extractor/restore runner the moment a disposable environment is authorized
— but that is a **follow-on** step, not something this report can claim
happened.

```text
PHASE 1
FOUNDATION BUILT — NOT VERIFIED

Reason: Phase 1E's validation drill requires a disposable non-production
environment. None already exists that satisfies the mandate's own isolation
requirement from the migration-reconciliation incident (§8). Provisioning
one is a new-infrastructure decision reserved for the owner.
```
