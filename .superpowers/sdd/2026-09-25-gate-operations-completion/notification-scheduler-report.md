# Notification retry scheduler completion

## Scope and acceptance evidence

- Added `POST /api/cron/gate-notifications`, reusing the established SHA-256/timing-safe `CRON_SECRET` authentication pattern. Missing configuration returns 503 and invalid authorization returns 401 before admin-client construction.
- Authorized requests invoke only the existing service-only `process_gate_notifications` RPC, with fixed `p_limit: 100`. Caller query/body inputs cannot widen the batch.
- Inspected `20260925182911_gate_notifications.sql`: RPC returns an integer attempted-row count, bounded 0..100; individual failed delivery attempts remain managed by the existing SQL retry state machine. Output is only `{ processed: number }`; unexpected returns, RPC errors and thrown admin/transport failures yield a generic 500 with no private error data.
- Added `Gate notifications` GitHub workflow with conventional best-effort five-minute retry cadence, single bounded request per invocation, serial concurrency, empty permissions, two-minute job timeout, 10-second connect timeout and 30-second request timeout. Response body goes to `/dev/null`; any HTTP non-200 or transport error fails the job.
- Updated notification scheduling runbook and corresponding go-live prerequisite. Production secret setup, enabled scheduling, successful probe and service-side aggregate alert wiring remain deployment prerequisites. Per-organization long-stay policy remains an explicit separate blocker.
- Read local Next 16 route documentation before editing. No external deployment, workflow invocation, secret creation or database mutation performed.

## Verification

- `npx vitest run tests/gate-notifications-cron.test.ts tests/gate-notifications-workflow.test.ts`: 2 files passed, 26 tests passed, 0 failed, 0 skipped. Workflow tests execute the actual checked-in shell with a stubbed curl, validating exact endpoint/auth/timeout/output arguments and real exit behavior for 200, 401, 503, 500, transport failure and missing secret.
- `npx eslint app/api/cron/gate-notifications/route.ts tests/gate-notifications-cron.test.ts tests/gate-notifications-workflow.test.ts`: passed, exit 0.
- `git diff --check`: passed, exit 0; only ordinary LF-to-CRLF Git warnings.
- `npx tsc --noEmit`: passed, exit 0.

## Adversarial assessment and remaining limits

Authentication precedes service-role construction; body/query cannot change bounds; null/string/object/fractional/out-of-range RPC results fail closed; raw private failures are never returned or printed. Unexpected setup/transport failures produce a failing workflow. SQL count is attempted work, not proof of delivery, and the runbook makes that distinction explicit.

Single-batch capacity is at most 100 attempted due rows per nominal five-minute run. GitHub can delay schedules; this is no delivery SLA. Private due/FAILED metrics and production alert wiring are still required and are not implemented by this scheduler. No per-organization long-stay setting was added.

Independent closure review delegated to the main agent. Unrelated temporary/test-worker edits preserved and excluded from scheduler commit. Graft reported approximately 9,344 tokens saved during context lookup.
