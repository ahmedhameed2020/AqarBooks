# Local test scope incident — 9 October 2026

An agent mistakenly included `tests/payments/resolve-credentials.test.ts` in a targeted local test command before inspecting its setup. This file is a real Supabase integration test, despite its filename lacking `.integration`. This violated the user's limit of local mocks/synthetic tests and no database/account mutations. No further live tests, verification queries, or cleanup have been performed after discovery. The parent agent was informed immediately.

## Command and observed result

`npx vitest run tests/payments/fawry-initiation.test.ts tests/payments/fawry-v1-sql-proposal.test.ts tests/payments/fawry-adapter.test.ts tests/payments/resolve-credentials.test.ts tests/payments/webhook-handler.test.ts tests/payments/process-event.test.ts`

Observed: 6 files; 5 passed, 1 failed. 57 tests; 53 passed, 4 failed. The failing file loaded `.env.local` and made network calls to the configured Supabase project. The local known project reference is `ataslxkcflxuilpgyepm`; no secret values are recorded here. No SQL proposal was applied to that project.

## Static scope and evidence of successful setup

`tests/payments/resolve-credentials.test.ts:61–126` has a `beforeAll` that sequentially awaits operations and asserts each error is null. All scenario tests ran; no setup-hook failure appeared. This establishes successful setup assertions for:

- Two new fictional organizations: `Resolve Credentials Test Org` and `Resolve Credentials Test Org (no settings)`, unique `rcred-`/`rcred-empty-` slugs.
- One fictional property `RCred Resort` in the first new organization, with a unique `RCRED-` code.
- Two `clone_tenant_role_templates` calls, one per new organization. Exact created role/permission row counts are not known from available output.
- A read of the new organization's `TENANT_OWNER` role.
- One dedicated synthetic Auth user with unique `rcred-staff-` address at the test-only domain; credentials are omitted.
- One `user_role_assignments` insertion linking that synthetic user to the new organization and role.
- A successful password sign-in for that synthetic test user, which may create auth/session/audit metadata. No token is recorded.

No customer identifiers or existing customer records were displayed by the available output. The suite's specified writes target newly created test organizations/user; this does not justify the unauthorized mutations.

## Failed scenarios and cleanup uncertainty

- Provider settings upserts in scenarios 1, 2 and 3+4 were rejected with SQLSTATE `42501`, `FORBIDDEN: لا تملك صلاحية إدارة مزودي الدفع`. Their immediate assertions failed before the subsequent verification/enable steps. No successful provider-setting upsert is evidenced.
- Scenario 5 failed with `PAYMENTS_ENV_INVALID` listing missing payment configuration names, without secret values. The suite also exercised credential resolver read RPCs for empty/invalid scopes; no real Charge was performed by this suite.
- `afterAll` at lines 128–140 attempts `set_organization_status(... ARCHIVED ...)` for both new organizations. If a call errors it attempts a direct `organizations.status=ARCHIVED` fallback. The code does not assert fallback results and the run output contains no cleanup outcome. Execution of cleanup is expected from the completed run, but archive success cannot be claimed. Exact returned IDs and per-call outcomes were not printed.
- The cleanup does **not** remove the synthetic Auth user, property, cloned roles or role assignment. These may remain even if organizations were archived. No further mutation or query will be used to investigate or clean up without explicit authorization.

Failure classification: **ENVIRONMENT_OR_HARNESS** for the provider upsert authorization/setup failures and missing configuration; this is not evidence of a bug in the new initiation deny. Independently, selecting this live test was an agent execution-scope error. Live tests will not be rerun under current authorization.

## Safe continuation

Only files statically verified to use mocks or a fresh in-memory PGlite instance may run. The SQL proposal remains outside `supabase/migrations` and is exercised only in a disposable synthetic schema. Existing Supabase/local databases, migrations and production configuration remain out of scope. Any review/remediation of the test-created records requires a separate approved, narrowly scoped read-only audit and subsequent mutation approval.
