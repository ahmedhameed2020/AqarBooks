# 04 — Security, Authentication, RBAC, RLS, Multi-Tenancy

Audit of commit `a91d809` (master). Static, read-only. Baseline SQL cited as `baseline.sql:<line>`. The P0 finding (SEC-01) and the guard-drift finding (SEC-03) were re-verified by the lead auditor directly against the source.

## 0. Findings summary

| ID | Sev | Where | One line |
|---|---|---|---|
| SEC-01 | **P0** | `lib/actions/users.ts:134-185` (`changeUserRoleAction`), `:18-131` (`inviteUserAction`); `baseline.sql:5009` `is_platform_admin`; seed `:21790` | Any user holding any membership row in any tenant can assign the global `PLATFORM_SUPER_ADMIN` role to themselves through a service-role write; `is_platform_admin` ignores the assignment's organization; `has_permission` short-circuits on it → full cross-tenant and platform takeover. |
| SEC-02 | **P1** | `lib/actions/roles.ts:17-152`, `users.ts:188-262` | Membership-only check + service-role client: any member can rewrite `role_permissions` of any role id (other tenants', template roles), create roles, suspend/remove colleagues, create confirmed auth users for arbitrary e-mails. |
| SEC-03 | P2 | `tests/security-function-grants.integration.test.ts` vs `20260825124342`, `20260825231151` | ADR-0004 allowlist is stale: five functions revoked by `internal_helper_acls` (`allocate_document_number`, `clone_tenant_role_templates`, `next_sequence_value`, `post_due_to_ledger`, `record_tax_decision_for_due_internal`) plus `create_organization_onboarding` are still listed; `is_demo_organization`/`is_demo_principal` (granted to anon) are unlisted. The suite cannot pass against the migrated schema and no CI runs it. |
| SEC-04 | **P1** (conditional on demo enabled in prod) | `lib/demo/guard.ts` (unused), `users.ts`, `roles.ts`, `tenant.ts` | Demo read-only guarantee is DB-side only; service-role actions never call `denyIfDemo`; with SEC-01/02 the anonymous demo session can escalate. |
| SEC-05 | P2 | `lib/actions/tenant.ts:257-289` | `auth.admin.inviteUserByEmail` runs before the `tenant.users.manage` check → any authenticated user can send invites / pre-create accounts. |
| SEC-06 | P2 | `app/auth/callback/route.ts:10,26-49` | Open redirect: unvalidated `next` concatenated to origin (`next=.evil.com`, `@evil.com`) after magic-link / recovery / PKCE exchange; `x-forwarded-host` trusted. |
| SEC-07 | P2 | `baseline.sql:4684 has_permission`, `:4992 is_org_member`, `users.ts:188` | Suspending a user does not revoke `has_permission`-gated access; `invited` members can read. |
| SEC-08 | P3 | `baseline.sql:19574…20700, 21035-21047` | `GRANT ALL … TO anon` on ~102 tables + default privileges; inert under RLS today; one disabled-RLS or `USING(true)` policy away from anonymous exposure. |
| SEC-09 | P3 | `has_permission` vs `has_financial_permission` | Platform admins bypass every `has_permission` policy/RPC (post/reverse entries, credit notes) though the ledger-write guard deliberately excludes them; inconsistent trust model. |
| SEC-11 | P3 | `app/api/ai/ask-aqarbooks/route.ts:27` | Hard-coded `userPermissions` for all callers; AI tool RBAC collapses to RLS select policies. |
| SEC-12 | P3 | `app/api/ai/*` | No per-user rate limit on LLM endpoints (cost abuse). |
| SEC-13 | P2 / UNKNOWN | `supabase/migrations/` vs archive `…members_next_level.sql:112-134` | Storage buckets and policies are absent from the squashed baseline; production state unverifiable from the repo. |
| SEC-14 | P3 | `lib/payments/webhook-handler.ts:63`, `resolve-credentials.ts:98` | Environment hard-coded to SANDBOX; production provider credentials cannot resolve (documented). |
| SEC-15 | P3 | `.env.production` (tracked) | Only public values today; tracking an env file invites accidental secret commits. |
| SEC-16 | P3 | `lib/actions/leads.ts:52-58, 134-140` | Public lead/contact forms rate-limited per attacker-chosen e-mail only; honeypot present. |
| SEC-17 | P3 | `next.config.ts` | No CSP / HSTS / frame-ancestors / Referrer-Policy configured in-app (edge config UNKNOWN). |
| SEC-18 | P3 | `middleware.ts:10` | Edge redirect covers only `dashboard`, `admin`, `platform`; layouts cover the rest; server actions must self-authorize. |
| SEC-19 | P3 | `portal/(member)/payments/page.tsx:34` | Render-path mutation under service role from a GET. |

## 1. SEC-01 in detail (verified)
- Expected: changing a user's role requires `tenant.users.manage`, the target role must belong to the caller's organization, and platform roles must never be assignable from tenant admin.
- Actual: `changeUserRoleAction(organizationId, userId, newRoleId)` checks only `getPrimaryOrganization(currentUser.id).id === organizationId`. `getPrimaryOrganization` (`lib/auth/org-context.ts:4-13`) returns the oldest membership row with no status filter. The action then uses `createAdminClient()` (RLS bypassed), loads the role by id with a comment "belongs to this org or is system role" but never compares `role.organization_id`, deletes the caller-chosen user's assignments and inserts `(organization_id, user_id, role_id)`. The global role id `d7212d4b-8899-4a52-af9a-60be2e6ea79e` is seeded at `baseline.sql:21790` and readable by every authenticated user via `roles_select_system_or_member` (`:17496`). `is_platform_admin` (`:5009-5021`) matches on `r.key='PLATFORM_SUPER_ADMIN' and r.organization_id is null` with no filter on `ura.organization_id`. `has_permission` (`:4684`) begins `is_platform_admin(p_user_id) or …`. No `denyIfDemo`, `has_permission` or `requirePermission` call exists in `users.ts` or `roles.ts` (grep count 0).
- Impact: any invited/suspended/active member of any tenant, and the shared public-demo principal if the demo is live, becomes platform super admin: reads and mutates every tenant, approves onboarding, changes organization status, posts and reverses journal entries.
- Recommendation direction (do not implement yet): in `users.ts`/`roles.ts` require `has_permission(uid, org, 'tenant.users.manage' | 'tenant.roles.manage')` and active membership, verify `role.organization_id = organizationId`, reject `is_system`/platform roles, call `denyIfDemo`; harden `is_platform_admin` to require `ura.organization_id is null`; add a CHECK/trigger forbidding a platform role in an org-scoped assignment; query production `user_role_assignments` for platform-role rows with non-null org; add an authorization test.

## 2. Auth boundaries
- `middleware.ts:10` protects only `dashboard`/`admin`/`platform` at the edge; `app/[locale]/(app)/layout.tsx:58-61` redirects unauthenticated users for every `(app)` page; `finance/layout.tsx:21-30` and `admin/layout.tsx:19-29` additionally require a membership; `platform/layout.tsx:14` `requirePlatformAdmin()`; `portal/(member)/layout.tsx:9-16` `getPortalMemberContext()`. Page gating is complete. Route handlers and server actions do not inherit layouts (SEC-18).
- `app/auth/callback/route.ts` open redirect (SEC-06): `next` is concatenated onto `origin`; recommended validation `^/[a-z]{2}/` and `new URL(next, origin).origin === origin`.
- `redirect_to` on login/register/forgot-password passes through `stripLocalePrefix` and next-intl `redirect`, so it stays same-origin. OK.
- `lib/actions/auth.ts`: `signUpAction` refuses unconditionally (self-registration retired); `requestPasswordResetAction` forwards a caller-supplied redirect URL to Supabase (bounded by the Auth allow-list — UNKNOWN whether tight); `updatePasswordAction` returns raw error text (P3). Leaked-password protection documented as not enabled (`docs/security-remediation-2026-08-20.md` §7).
- `lib/auth/page-guard.tsx` `denyIfMissingPermission()` used by 24 of 65 `(app)` pages; data remains RLS-gated elsewhere.

## 3. Platform-admin vs tenant-admin
`lib/auth/authorize.ts:7-17` `requirePlatformAdmin`; `lib/actions/platform.ts` relies on DB-side `is_platform_admin(auth.uid())` inside `create_organization` (`:2524`), `set_organization_status` (`:9802`), `assign_subscription` (`:803`), `approve/reject_onboarding_request`. Correct. `has_financial_permission` (`:4606-4680`) deliberately excludes platform admins (requires active membership) while `has_permission` includes them (SEC-09). Demo entry (`lib/demo/session.ts:31-35`) refuses to start if the demo account is a platform admin — checked only at entry.

## 4. Service-role usage (all callers of `createAdminClient`)
| Caller | Authorization around admin use | Verdict |
|---|---|---|
| `lib/actions/users.ts:38,148,206,234` | membership-only; no permission key, no role→org check, no target-user check | **SEC-01/02** |
| `lib/actions/roles.ts:35,115` | membership-only; comment says "verify role belongs to org", code does not | **SEC-02** |
| `lib/actions/tenant.ts:271` | `inviteUserByEmail` before permission-checked RPC `add_organization_member` | SEC-05 |
| `lib/actions/member-portal.ts:53-67, 198-209` | permission enforced in RPC first | OK |
| `lib/actions/member-portal-documents.ts:50,85` | scoped by session-resolved member and org | OK |
| `lib/actions/member-lifecycle.ts:129`, `unit-lifecycle.ts:105` | `has_permission` on entity org first | OK |
| `lib/actions/member-profile.ts:150-155` | `auth.admin.updateUserById`; caller permission check not fully read | UNKNOWN |
| `lib/actions/leads.ts:50,132` | public inserts into tables with no client policies | OK |
| `lib/demo/rate-limit.ts:68`, `lib/alerts/digest.ts:178`, `lib/payments/webhook-handler.ts:37-45,140`, `resolve-credentials.ts:70-82` | service-role-only RPCs / HMAC-verified | OK |
| `app/api/cron/*` | `CRON_SECRET`, `timingSafeEqual`, 503 when unset | OK |
| `app/i/[slug]/route.ts` | unauthenticated by design; expiry + status re-check | OK (slug entropy UNKNOWN) |
| `admin/users/page.tsx:44` | `denyIfMissingPermission` then org-scoped reads | OK |
| `portal/(member)/payments/page.tsx:34` | render-path sweep mutation | SEC-19 |

API routes: cron routes fail closed; Fawry webhook verifies SHA-256 signature with `timingSafeEqual` before `record_online_payment`; AI routes check `getCurrentUser()` but hard-code permissions (SEC-11) and take `organizationId` from the body (reads through RLS client, so no leak found; should derive from session).

## 5. Server actions (sample of 22 files, ~110 actions)
Pattern: zod-parse, take `organizationId` from the caller, then call a SECURITY DEFINER RPC or table through the user's client; the database re-authorizes with `has_permission`/`has_financial_permission` and `organization_is_active`. Verified for receivables, treasury, accounting, accounting-accounts, property, service-charges, commissions, lease-deposits, member-opening-balance, purchasing, projects, fixed-assets, dunning, payment-provider-settings, online-payment-checkout, property-import, platform. Exceptions that trust caller org and bypass RLS: `users.ts` (4 actions) and `roles.ts` (2 actions).

## 6. Database layer
### 6.1 SECURITY DEFINER inventory
179 `SECURITY DEFINER` occurrences in the baseline; later migrations add or redefine ~26 more; the guard allowlist names 169 executable by `authenticated`. Sampled predicates:

| Function | Predicate | Safe? |
|---|---|---|
| `is_platform_admin` :5009 | role key + null role org; no `ura.organization_id` filter | **No (SEC-01)** |
| `has_permission` :4684 | platform-admin OR role→permission join; no membership status | takes `p_user_id` from caller (info leak P3) |
| `has_financial_permission` :4606 | `auth.uid()`, org active, resort∈org, membership active, role∈org, property scope | Yes |
| `is_org_member` :4992 | membership `status <> 'suspended'` OR platform admin | Yes |
| `record_payment` :8092 | `has_financial_permission(finance.payments.record)` | Yes |
| `post_journal_entry` :6508 / `reverse_journal_entry` :8918 | org derived from entry; `finance.entries.post/reverse` | Yes |
| `void_payment` :10908 | payment∈org, `finance.payments.void`, reason required | Yes (but broken, ACC-01) |
| `create_journal_entry` :2290, `issue_dues` :5208, `issue_credit_note` :5043, `record_expense` :7513 | financial permission; org derived or validated | Yes |
| `get_trial_balance` :4529, `get_account_ledger` :3769, `get_bank_match_candidates` :3804 | `finance.reports.read` / `finance.bank_reconciliation.manage` | Yes |
| `generate_lease_rent_dues` (20260825182109:73) | lease∈org; service-role or `finance.schedules.generate` | Yes |
| `run_lease_rent_generation`, `record_online_payment` :7923, `get_payment_provider_credentials` :4384, `check_and_record_rate_limit`, `append_financial_audit_event` :506 | no predicate; EXECUTE revoked from `authenticated` | Yes by ACL (if migrations applied) |
| `create_organization` :2524, `set_organization_status` :9802, `assign_subscription` :803, `approve/reject_onboarding_request` | `is_platform_admin(auth.uid())` | Yes |
| `create_organization_onboarding` :2562 | uid + not in org; revoked from authenticated | dead path |
| `record_member_opening_balance` (20260903:76) | not demo, `finance.dues.issue`, unit/member∈org | Yes |
| `create_member_invitation` :2388, `accept_member_invitation` :176, `current_member_id` :2971, `add_organization_member` :412, `create_resort` :2788 | permission + org checks | Yes |
| `allocate_document_number` :452, `next_sequence_value` :6055 | none; revoked by `20260825124342` | Yes only if applied (SEC-03) |
| `is_demo_organization` / `is_demo_principal` | pure lookups granted to anon | intentional |

### 6.2 RLS
101 `CREATE TABLE` / 101 `ENABLE ROW LEVEL SECURITY` in the baseline (set difference empty); later migrations enable RLS on every new table. Exactly one `USING (true)` policy (`revenue_natures_select`, reference data, authenticated). Tables with RLS and no client policy are service-role-only by design (`demo_leads`, `contact_requests`, `public_action_rate_limits`, `member_invitation_short_links`, `onboarding_*`). `*_manage` policies pair `has_permission` with `organization_is_active`. Views are `security_invoker=true`. Grants to `anon` remain on ~102 tables (SEC-08). Storage DDL is absent from the baseline (SEC-13).

### 6.3 The frozen baseline and the guard test (SEC-03)
`npm run test:security` asserts: no application function executable by `anon`; nine internals executable by neither role; those nine exist; the `authenticated`-executable SECURITY DEFINER set equals a 169-name list. It proves EXECUTE posture against whatever database `.env.local` points to at run time. It does not cover RLS, table grants, storage, triggers, function bodies, auth config, or application-layer authorization (where SEC-01/02 live), and no CI workflow invokes it. Drift verified by the lead auditor: all five functions revoked in `20260825124342_internal_helper_acls.sql` are still in the allowlist; the two anon-granted demo helpers are absent. Either the suite is red and ignored, or those migrations are not applied where it runs — UNKNOWN which.

## 7. Secrets
No service-role keys, JWTs, API keys or passwords in tracked source. `.env.production` (force-tracked) holds only `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`. `.gitignore` covers `.env*`, `.dev.vars`, `tests/e2e/.auth/`, `*.pem`. Runtime secrets (`SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, `RESEND_API_KEY`, Paymob/Fawry keys, `DEMO_*`) are read from env with loud placeholder fallbacks.

## 8. Public forms, rate limiting, demo hardening
Lead/contact forms: zod, honeypot, per-e-mail hourly count (SEC-16). Demo entry: 5/60 s per `cf-connecting-ip` via durable RPC, fails closed. Demo tenant: `is_demo` immutability trigger, single-demo unique index, rent sweep and opening-balance refuse demo, RLS on `profiles`/`alert_dismissals` refuse demo principals, entry asserts env↔column agreement and non-platform-admin. Gap: `lib/demo/guard.ts` helpers are never called from any action (grep 0), so the read-only property rests on the demo role's permissions plus DB checks, and is defeated by SEC-01/02 (SEC-04).

## 9. Hardcoded values / bypasses
Fixed platform role id (`baseline.sql:21790`); sentinel zero-UUIDs in two UI files; no `NODE_ENV` auth toggles or disabled validation found; `member-portal.ts:30` falls back to `http://localhost:3000` for invite links when `NEXT_PUBLIC_SITE_URL` is unset; `webhook-handler.ts:63` hard-coded `"SANDBOX"`; no security headers in `next.config.ts`.

## 10. UNKNOWN — verification required
1. Whether migrations `20260825*`, `20260826*`, `20260903*` are applied to production and whether `npm run test:security` is green there.
2. Whether the public demo is enabled in production (decides whether SEC-01 is reachable anonymously).
3. Storage bucket existence and policies in production.
4. Supabase Auth config: redirect allow-list, leaked-password protection, OTP rate limits, `x-forwarded-host` handling at the Worker.
5. The demo account's role permissions in production.
6. `member-profile.ts:updateMemberAction` authorization before `auth.admin.updateUserById`.
7. Entropy of `member_invitation_short_links.slug`.
8. Whether any production `user_role_assignments` row already carries the platform role with a non-null organization.
