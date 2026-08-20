# AqarBooks — Security Remediation, 2026-08-20

**Status: SECURITY BASELINE ESTABLISHED.** Not merely "security fixes applied" —
the resulting posture is frozen and enforced by an automated guard. See
[ADR 0004](adr/0004-security-baseline-freeze.md).

> **Naming.** "Phase 1" in this document means the *security remediation phase*
> executed on 2026-08-20. It is unrelated to
> [`phase1-implementation-report.md`](phase1-implementation-report.md), which
> documents the first phase of product construction (foundation, auth, RBAC).

Baseline commit: `7236d57` · Branch: `security/phase1-remediation` · Commit `0f75b7e`

---

## 1. What was closed

| Finding | Severity | Evidence of closure |
|---|---|---|
| Cross-tenant leak — `lease_rent_generation_runs` had RLS disabled | P0 | anon read `200` / 9 rows / 9 orgs → `401 42501`, 0 rows |
| Unauthenticated destructive write — anon held DELETE + TRUNCATE | P0 | all anon grants revoked; anon DELETE → `401` |
| RBAC bypass — unguarded 9-arg `record_payment` | P0 | overload dropped; 9-arg and 11-arg both `PGRST202` |
| Anonymous execution of 165 `SECURITY DEFINER` functions | P0 | 165 → 0; each returns `42501 permission denied` |
| Unauthenticated document-sequence advancement | P0 | `next_sequence_value`, `allocate_document_number` → `42501` |
| Platform admin transacting inside tenant ledgers | P1 | guard matrix: platform super admin denied |
| 17 functions with mutable `search_path` | P2 | advisor `function_search_path_mutable` 17 → 0 |

Security advisor: **360 → 184 lints, ERROR 1 → 0.**

## 2. Financial invariants

Held **exactly** at every checkpoint — baseline, and after each of migrations 1–5:

```
journal_entries      844
journal_entry_lines 1678
payments             368
posted trial balance 736,619.6100 Dr = 736,619.6100 Cr
```

No posting function body was modified. `post_payment_internal`,
`post_journal_entry_internal`, `create_journal_entry_internal` and
`reverse_journal_entry` are **not referenced by any DDL statement** in this
phase. The only change inside `record_payment` is the guard clause above an
otherwise untouched call to `post_payment_internal`.

**Application code changed: zero files.** Six migrations, one test, one
`package.json` script entry.

## 3. Migrations

| # | File | Effect |
|---|---|---|
| 1 | `20260820190233_phase1_pin_function_search_path` | Pins `search_path` on 17 functions (all SECURITY INVOKER — hardening debt, not escalation) |
| 2 | `20260820190307_phase1_lease_rent_generation_runs_rls` | Enables RLS, adds SELECT policy mirroring `due_generation_runs`, revokes all anon grants |
| 3 | `20260820190446_phase1_record_payment_collapse` | Drops 9-arg **then** 11-arg; hardens surviving 12-arg to `has_financial_permission` |
| 4 | `20260820190630_phase1_revoke_anon_function_execute` | Revokes EXECUTE from `PUBLIC` **and** `anon` on 202 application functions |
| 5 | `20260820191859_phase1_fix_internal_function_overgrant` | Repairs the regression migration 4 introduced |
| 6 | `20260820192502_phase1_security_grant_inventory` | Adds the read-only inventory function the regression test asserts against |

### Two places where order is load-bearing

**Migration 3 — 9-arg before 11-arg.** The unguarded 9-arg overload was *not*
reachable through PostgREST before this work: its parameter set is a strict
subset of the 11-arg's, so a 9-parameter call was ambiguous and refused with
`PGRST203`. The defect was **latent, masked by the overload being dropped
alongside it**. Dropping the 11-arg first would have made the unguarded
function uniquely resolvable and converted a latent defect into a live one.

**Migrations 4 and 5 — always together.** Migration 4 introduces a P0; migration
5 repairs it. Applying 4 alone to any environment opens the hole described
below.

## 4. The regression the remediation introduced

Migration 4 revoked EXECUTE from `PUBLIC` and `anon` but issued an
unconditional `GRANT EXECUTE ... TO authenticated` in the same loop. Its own
header claimed the authenticated surface was unchanged; the unconditional grant
did not preserve prior state.

Nine internal functions became `authenticated`-executable that were not before,
including `post_payment_internal` and `post_journal_entry_internal` — the
unguarded internals that `record_payment` and `post_journal_entry` exist to
wrap. Any signed-in user could have bypassed the RBAC guard hardened minutes
earlier in migration 3. `get_payment_provider_credentials` would have exposed
payment-provider secrets.

It was caught by hand-diffing two security-advisor runs (169 → 178), **not by
any planned assertion**. The verification protocol as originally written would
not have caught it. Migration 5 revoked the nine and restored the count to
exactly 169.

This is the reason ADR 0004 exists.

## 5. The guard that prevents recurrence

`tests/security-function-grants.integration.test.ts` — `npm run test:security`.
Read-only; safe on any environment including production.

- **Set equality, not count.** The total can hold at 169 while a safe function
  is swapped for a dangerous one. Additions and removals are reported
  separately.
- **Explicit denylist** for the nine internals that must never be
  client-callable.
- **Anti-vacuity check** — asserts every denylisted name still exists, so the
  guard cannot go green merely because a function was dropped.
- **Proven by deliberate failure.** `expire_stale_member_invitations` was
  granted to `authenticated` on purpose; both guards fired; the grant was
  revoked and green restored. Any future change to this test must repeat that
  procedure.

## 6. Verification performed

| Check | Result |
|---|---|
| `tsc --noEmit` | PASS — exit 0 |
| `next build` | PASS — exit 0, 84 routes |
| Security advisor | PASS — 360 → 184, ERROR 1 → 0 |
| RBAC matrix (4 identities) | PASS — legitimate allow; platform admin, archived org, non-member all denied |
| Tenant isolation | PASS — non-members see 0 of 9 rows |
| Anonymous access (10 endpoints) | PASS — all `42501 permission denied` |
| Financial invariants | PASS — identical at all checkpoints |
| `npm run test:security` | PASS — 4/4, and verified to fail on injected regression |
| `npm run test:all` | **NOT RUN** — see §7 |
| End-to-end invite flow | **NOT RUN** — requires a live invitation token |

## 7. Outstanding — operational, not security-open

**`test:all` has not been run.** It writes to the production database — it
creates organizations, payments and journal entries, then archives them.
Running it would move the trial balance this remediation was required to
preserve, and would add fresh test organizations to production. Run it against
a Supabase preview branch instead.

Do not conflate two different proofs:

- **Preview branch** answers *"does the system work after these migrations,
  with no behavioural regression?"* — it starts from an empty ledger, so it
  cannot reproduce `736,619.6100`.
- **Production before/after checkpoints** answer *"are existing data, tenant
  isolation and financial invariants still intact?"* — already proven above.

**Leaked-password protection is not enabled.** Auth configuration, not a
migration; requires the Supabase dashboard or the Management API. After
enabling, exercise invite, password setup, login, password reset and existing-
user password change. Note that `accept-invite-client.tsx` deliberately
replaces Supabase's password-policy wording with a generic bilingual message,
so a rejected password will not tell the invitee *why* — acceptable today,
a likely support-ticket source once the HaveIBeenPwned check is on.

## 8. Deliberately not addressed — Phase 2 backlog

| Item | Why deferred |
|---|---|
| Platform-admin cross-tenant **read** | Stems from `has_permission()`'s `is_platform_admin` branch and affects many tables. Fixing one table would create an inconsistent authorization model. Needs a full review of the platform-admin model: cross-tenant read? write? impersonation? tenant-scoped reports? operational metadata? |
| 289 orphaned role assignments | `user_role_assignments.organization_id` has no cascading FK; tenant deletion left permission grants dangling. A data-lifecycle problem, to be handled in a controlled way before real production tenants arrive at volume. |
| `btree_gist` in `public` | Backs `unit_leases_no_overlapping_active` and `tax_rule_no_overlap`. Relocating requires dropping and recreating both, suspending those correctness guarantees during the window. Needs a maintenance window with the application offline. |

## 9. Scope discipline

No P1 functionality was touched. No accounting logic was redesigned or
refactored. Unrelated in-progress work on the chart-of-accounts screens
(`accounts-client.tsx`, `edit-account-dialog.tsx`, `lib/accounting/`) was
deliberately left unstaged and out of the commit. Phase 2 has not been started.
