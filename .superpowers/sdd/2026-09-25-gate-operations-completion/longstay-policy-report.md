# Organization long-stay policy completion

## Plan and challenged assumptions

1. Add a tenant-owned bounded threshold policy and a narrow manager mutation; verify tenant isolation and grants.
2. Use that policy in occupancy and summary and expose an explicit opt-in setting UI.
3. Detect original allowed-entry visits through the existing bounded notification outbox; verify concurrent detection/drain and cycle idempotency.

Challenge: reconciliation changes occupancy timestamps but is not original entry evidence. The detector requires a same-tenant immutable ALLOW/VALID_ENTRY/ENTRY event whose timestamp matches current last_entry_at. It locks current occupancy with SKIP LOCKED while enqueueing. Stable entry event identity produces gate-alert:<entry-id>; the existing outbox primary key is the final concurrency guard. An original allowed entry cannot collide with denial-alert source identity.

## Completed acceptance criteria

- CLI-created `20261001052203_gate_long_stay_policy.sql` adds a per-organization 1–168 hour policy. Absent policy uses a 12-hour display fallback. Notifications default false and migration creates no opted-in organization.
- Policy table has RLS and explicit SELECT-only authenticated/service grants. Read policy requires organization gate operations and gate/evidence permission. No direct client writes.
- `set_gate_long_stay_policy` requires authenticated manager authorization through existing gate manage permission, validates all settings, and records actor/time. It has an empty search path; anon/service cannot execute it.
- Manager-only setting page is linked from Gate Management. Saving explicitly opts into alerts and revalidates management, settings and the real occupancy route.
- Occupancy and aggregate summary share one tenant policy helper. Summary shows configured hours.
- `detect_gate_long_stays` is service-only, empty-search-path and bounded 1–100. It ignores reconciliation-only origins, uses safe existing enqueue payload and returns only a count. Repeated and concurrent detectors/drains do not duplicate original visit alerts. A later visit receives a new stable source identity.
- Authorized cron route detects before draining with two fixed 100-row calls. Invalid detector response/error stops before drain and returns a generic error. Authentication still precedes any admin access.
- Types, exact migration size/digest pin, authenticated function allowlist, internal detector denylist and pilot runbook updated.

## Verification

- Local migration application through Docker psql with ON_ERROR_STOP: passed (table, policy, functions and grants accepted).
- Exact local privilege query: setter anon=false/authenticated=true/service=false; detector anon=false/authenticated=false/service=true; both search_path empty.
- `node node_modules/vitest/vitest.mjs run tests/gate-notifications.integration.test.ts tests/gate-long-stay-policy.test.ts tests/gate-notifications-cron.test.ts tests/gate-operations-summary.test.ts tests/gate-evidence-actions.test.ts tests/migration-directory-guard.test.ts --maxWorkers=1`: 6 files, 113 passed, 0 failed, 0 skipped; 112.51 seconds.
- Focused ESLint across policy/helper/actions/settings/page/summary/cron and focused tests: passed exit 0. Final follow-up lint run recorded by controller if needed.
- `git diff --check`: passed.
- Earlier parallel-load run: 103 passed and 3 failures, each exact `Test timed out in 30000ms`, including two unchanged notification cases. Serial rerun passed all. Classified ENVIRONMENT_OR_HARNESS (shared concurrent TypeScript/Next/browser load); assertions unchanged. New multi-query policy test has a 120-second budget.
- Typecheck started during contention and cancelled without a result; not claimed passed. Controller owns final serial typecheck and fresh database reset after all completion migrations.

## Review and remaining risks

Self-review inspected migration grants/search paths, SQL tenant joins, original-entry correlation, actual route ordering, setting authorization, safe payload use, and actual occupancy revalidation path. No blockers found in this scope. Parent controller performs independent closure review.

No production migration, policy opt-in, notification schedule activation, secrets or deployment performed. Production schedule timing/capacity and organization business approval remain operational prerequisites. Evidence retention remains a separate policy decision.

## Independent-review correction: recipient starvation

Independent review found an IMPORTANT production bug in the original detector: LIMIT selected the oldest visits before the existing enqueue helper rejected inviting members without a linked user. A full batch of such visits remained eligible indefinitely and could starve later deliverable visits across organizations.

Regression first ran against the original live detector: `node node_modules/vitest/vitest.mjs run tests/gate-notifications.integration.test.ts --maxWorkers=1 --testNamePattern='100 older unlinked'` failed exactly `expected '100' to be '1'` (1 failed, 9 skipped). Classified PRODUCTION_BUG, traced to enqueue's same-tenant member lookup and `m.user_id is not null` condition.

Correction adds same-tenant invitation and inviting-member joins, requiring a non-null linked member user before ordering/LIMIT. Existing occupancy lock, threshold, stable original-entry event source and outbox deduplication remain intact. Regression creates 100 older unlinked visits in bulk and one later linked visit; the bounded detector must process only that deliverable visit and produce one alert, with no outbox rows for unlinked visits. Fixture explicitly enables completion policy before device enrollment, and disables long-stay notifications in finally to isolate even failing runs.

Local CREATE OR REPLACE of only the detector was applied after the rollout worker released the database lane. Migration pin updated to 4526 bytes and SHA-256 `9b546f551dd0f899b3aa9368bf330877266d594cc4ff279119fcccbc51f5dcde`.

GREEN: `node node_modules/vitest/vitest.mjs run tests/gate-notifications.integration.test.ts tests/gate-notifications-cron.test.ts tests/gate-long-stay-policy.test.ts tests/gate-operations-summary.test.ts tests/gate-evidence-actions.test.ts tests/migration-directory-guard.test.ts --maxWorkers=1`: 6 files, 115 passed, 0 failed, 0 skipped, 121.98 seconds. This includes the corrected starvation regression and the new rollout migration guard pin. Independent review's IMPORTANT finding is fixed with reproduced failure and passing regression evidence.

Follow-up `node node_modules/eslint/bin/eslint.js tests/gate-notifications.integration.test.ts tests/migration-directory-guard.test.ts` and scoped `git diff --check`: both passed exit 0. The rollout worker's commit owns the shared guard file containing both final migration pins.
