# Production test incident — read-only audit preparation

## Status and access gate

Google Play and publication work is paused at the user's request. The incident report was read before access discovery. No production database connection, query, Auth call, test, migration, cleanup or rollback was performed in this audit turn.

Local inspection found environment variable names for a Supabase service-role key and public anon key; their values were not printed. No dedicated read-only database credential or verified read-only connector was found. The exposed connector's execute_sql capability allows arbitrary SQL and does not establish a SELECT-only database role. Neither service_role nor Dashboard SQL editor is suitable for the user's required access boundary. The user selected preparation of SELECT queries for their database administrator.

Prepared file: `incident-audit/SELECT_ONLY_INCIDENT_AUDIT_2026-10-09.sql`. It has not been executed. It contains SELECT statements only, with no application RPCs or write functions. A DBA must review it against the deployed schema and run it only through an already-approved, genuinely read-only connection. Creating that role/grants would itself be a production change and is not authorized here.

## Confirmed evidence versus current state

The completed test run and successful setup assertions establish historical creation, not present database state:

| Item | Historical evidence | Current state |
|---|---|---|
| Two organizations | Exact names `Resolve Credentials Test Org` and `Resolve Credentials Test Org (no settings)`; slugs `rcred-<suffix>` and `rcred-empty-<suffix>` | UUIDs, database creation timestamps and archive status not retrieved |
| One property | `RCred Resort`, code `RCRED-<suffix>`, first organization | UUID/current state not retrieved |
| Cloned roles | Two successful clone_tenant_role_templates calls | Count and current grants unknown |
| One Auth user | `rcred-staff-<suffix>@resortos-test.local`, email confirmed in createUser | UUID/timestamps/current ban or deletion status unknown |
| Role assignment | Synthetic user assigned first organization's TENANT_OWNER | Current membership/effective permission state unknown |
| Password sign-in | Successful assertion | Sessions, refresh tokens, expiry and continued access unknown |
| Provider settings | Three upserts failed with FORBIDDEN | No successful insert evidenced; current absence not established |
| Organization archiving | afterAll attempted RPC then fallback update | Neither outcome asserted; archive success unknown |

The generated suffix is `${Date.now()}-${randomInteger}`. The exact suffix/UUIDs were not retained in the available test output. The suffix timestamp can help match a run but must not substitute for database timestamps. Discovery uses BOTH known synthetic names and the generated slug pattern. Multiple suffixes require manual reconciliation before inspecting relations; broad prefix matching must never drive cleanup.

## Scope of tables and operations

Explicit setup writes: `public.organizations`, `public.properties`, `auth.users` through Auth Admin, and `public.user_role_assignments`. Local baseline `supabase/migrations/20260821105505_baseline.sql:1684–1707` shows clone_tenant_role_templates inserting `public.roles` and `public.role_permissions`, using read-only templates/permissions as sources. The deployed function and triggers may differ; their side effects are not exhaustively established.

Follow-up read scope: those rows, incident-only role grants, organization_memberships (possible related state), auth.identities/sessions/refresh_tokens/mfa_factors metadata or counts, incident-only payment_provider_settings, online_payment_transactions counts and platform audit action summaries. FK catalog metadata identifies additional dependent tables for later targeted review. This is not an exhaustive inventory of untracked relationships or external Auth/logging effects.

## DBA execution and evidence handling

1. Verify project `ataslxkcflxuilpgyepm` and a genuinely read-only connection before executing anything. The role must have no elevated ownership, role-switch path, write privileges or callable mutating SECURITY DEFINER/application functions. Prefer narrowly scoped read views/column permissions managed separately by the DBA; read-only transaction settings alone are not proof of restricted credentials.
2. Run discovery only. Reconcile the two exact organization names, common generated suffix and execution date. Record UUIDs and DB timestamps. If multiple runs match, STOP and resolve ambiguity; do not audit all similarly named tenants.
3. Replace the explicit suffix placeholder in each Stage B query. Verify the Auth user/property marker matches the same suffix and organization UUIDs. No placeholder matches real rows by default.
4. Run one reviewed SELECT at a time. Missing tables, denied permissions, timeouts or unavailable timestamps mean **not verified**, not zero. The local schema is a preparation aid, not evidence of deployed schema.
5. Record only synthetic IDs, timestamps, status, permission keys and counts. Never export password hashes, keys, tokens, IPs, user agents, raw user metadata, provider credentials or audit payloads. Cross-tenant relationships are flags/counts, not customer identities.
6. Session rows and unrevoked-token counts indicate possible continuing access; they do not prove a token remains usable or an account can access customers. Do not sign in to test this. Account deletion/organization archiving cannot be presumed to revoke every issued token.
7. Preserve approved audit evidence, query versions, execution timestamps and access-role identity privately. Do not mutate or run cleanup from this query package.

## Potential continuing impact

- The synthetic Auth user may still authenticate; issued sessions or refresh tokens may remain.
- TENANT_OWNER assignment and cloned permission grants may remain, even if the synthetic organizations are archived. Actual effective access depends on memberships, organization status and authorization rules; no current access has been established.
- Auth creation/sign-in and database triggers may have created audit, identity, membership or other dependent rows. Catalog FKs cover declared relationships only.
- Failed provider upserts do not prove that there are no incidental audit rows. No real payment was evidenced by the known run, but current transaction absence has not been queried.
- No customer data exposure or customer-row modification is evidenced by the available output. Absence of evidence is not a completed audit of those possibilities.

## Reviewable cleanup plan — NOT executed or authorized

1. Finish read-only inventory and freeze an exact UUID/suffix manifest; identify any foreign-tenant dependency and stop if present.
2. Seek separate approval for account containment/session revocation and role-assignment removal. Review token lifetime/session validation before assuming containment complete; never disclose tokens.
3. Seek separate approval for synthetic-tenant cleanup. Review every FK, cascade, trigger and financial dependency. If any genuine transaction or customer association is discovered, stop and revise the plan. Prefer reversible disable/archive where appropriate to immediate deletion.
4. Preserve financial records, audit trails and evidence. Never delete ledger/receipt rows, role templates or shared permission definitions. Any approved row cleanup must use exact confirmed IDs with precondition counts and transaction rollback checks; no prefix or name-only deletion.
5. Capture private pre-change snapshots of approved non-secret synthetic metadata, then make only approved changes. Auth operations and database operations may not share a transaction, so plan staged verification and recovery explicitly.
6. Re-audit with the read-only connection afterward and report the observed result. No cleanup SQL is provided now because the current IDs/dependencies are unknown.

## Preventing recurrence — local proposal only

The current vitest.config.ts excludes build/worktree folders but does not separate live tests; the incident file itself loads `.env.local` and declares real Supabase coverage. Filename-only exclusion is insufficient.

- Default unit tests should run only an explicit verified mock/in-memory allowlist, without `.env.local` or production keys. Move all live tests, including this misleadingly named file, into an explicit integration project.
- Require a separately opted-in integration command plus a positively allowlisted disposable project reference. Deny production reference `ataslxkcflxuilpgyepm`; do not rely only on NODE_ENV or a filename suffix.
- Strip production credentials from test processes and CI. Use isolated test-project credentials, not production service-role keys.
- Block external network from unit-test processes; allow only explicitly approved local/emulated endpoints. Add a static check for dotenv loading and real Supabase clients in unit files.
- A setup guard must run before module imports/client construction and fail closed on missing/ambiguous project identity. Test the guard with synthetic URLs/secrets; never prove the guard by calling production.
- Adopt manifest-based fixture ownership and auditable cleanup in disposable test projects. Cleanup hooks alone are not a safety boundary and can fail silently.

These safeguards are proposals only; no production or local test configuration changes were applied in this audit turn.

## Sources and verification limits

- Original incident report and tests/payments/resolve-credentials.test.ts:61–137; local baseline clone function; vitest.config.ts.
- Supabase Postgres roles documentation: https://supabase.com/docs/guides/database/postgres/roles — service_role has elevated RLS-bypassing access; Dashboard queries run as postgres.
- Supabase Auth sessions documentation: https://supabase.com/docs/guides/auth/sessions — consult current session/token behavior when reviewing containment.

Local query package reviewed for SELECT-only statements, exact synthetic markers, no application RPCs, no secret/token output and fail-closed placeholders. Runtime SQL validity, deployed schema, current record counts, timestamps and effective privileges remain unverified until the DBA supplies sanitized results.
