# 07 — SaaS Onboarding, Plans, Activation, Subscriptions

Audit of commit `a91d809` (master). Read-only.

## 1. The customer acquisition path as it actually exists on master

| Step | Route / code | Behaviour on master |
|---|---|---|
| Landing | `app/[locale]/page.tsx` | Hero and final CTA → `/demo`. Pricing teaser (`components/marketing/section-pricing-teaser.tsx`) → `/contact?plan=essential`, `/contact?plan=professional&program=founding`, `/contact?plan=enterprise`, `/pricing`. Nav → `/login`, `/demo`, `/pricing`. |
| Pricing | `app/[locale]/pricing/page.tsx`, `components/marketing/pricing/*` | Every plan CTA → `/contact?plan=…`; final CTA → `/contact`, `/contact?type=walkthrough`. Prices hard-coded in `pricing-data.ts` (Essential 1,490 / Professional 3,490 EGP). |
| `/get-started` | — | **Does not exist on master** (0 hits in `app`, `lib`, `components`, `messages`). Exists only on the PR #28 / #29 branches. |
| `/auth/register` | `app/[locale]/auth/register/page.tsx` | Static explainer linking `/demo`, `/contact`, `/login`; authenticated user → `redirect_to` or `/dashboard`. No form. |
| `/onboarding` | `app/[locale]/onboarding/page.tsx` | Requires login; member → `/dashboard`; otherwise a static "workspace being prepared" page → `/contact`, `/demo`. No wizard, no RPC. |
| `create_organization_onboarding` | baseline L2562; `20260825231151` §6 | EXECUTE revoked from `public, anon, authenticated`. Zero callers. Dead by design. |
| `/demo`, `/demo/request` | `lib/actions/demo.ts`, `lib/actions/leads.ts` | Demo signs the visitor into a real pre-provisioned account; demo request inserts a `demo_leads` row (honeypot, 1/e-mail/hour). |
| `/contact` | `submitContactRequestAction` | Inserts `contact_requests(full_name,email,phone,message)`. **The `?plan=`, `?program=`, `?type=` parameters every pricing CTA sends are never read** (no `searchParams` handling in `contact/page.tsx` or `contact-form.tsx`, no plan column). |
| Platform review | `app/[locale]/(app)/platform/leads/page.tsx` | Read-only table of the latest 100 `demo_leads`. No status transitions. No view of `contact_requests` at all. |
| Provisioning | `lib/actions/platform.ts::createOrganization` → RPC `create_organization` (baseline L2524) | Platform admin creates the org (status defaults `TRIAL`), clones roles, optionally assigns a subscription. Creates no membership/owner; admin must then run `inviteMemberAction` (`lib/actions/tenant.ts`: `auth.admin.inviteUserByEmail` + `add_organization_member`). |
| First login | `app/[locale]/(app)/dashboard/page.tsx` | No org and not platform admin → "no organization" panel whose button links to `/onboarding` (the static dead-end). |

**Conclusion:** the only working provisioning path is manual: platform admin creates the organization, then invites the owner. There is no self-service or assisted signup on master.

## 2. `onboarding_requests` schema present, application code absent
`20260826102930_assisted_onboarding_requests.sql` and `20260826124013_onboarding_request_idempotency_and_self_read.sql` are on master (restored by PR #31). `grep -rln "onboarding_requests|approve_onboarding_request|reject_onboarding_request|onboarding-request" app lib components messages i18n` → 0 files. Production therefore has `onboarding_requests`, `onboarding_request_events`, `approve_onboarding_request(uuid,text)`, `reject_onboarding_request(uuid,text)` (EXECUTE to `authenticated`, `is_platform_admin`-gated inside), a partial unique index and two SELECT policies — with no UI, no action, no submission path.

## 3. Competing signup/onboarding mechanisms (8 counted)
1. Marketing → `/contact` (`contact_requests`; plan intent lost)
2. Marketing → `/demo/request` (`demo_leads`)
3. `/auth/register` — retired explainer
4. `/onboarding` — retired explainer, still the dashboard CTA target
5. `create_organization_onboarding` RPC — service_role only, no caller
6. `onboarding_requests` + `approve_onboarding_request` — DB only, no caller
7. Platform admin `create_organization` + manual invite — **the only working path**
8. PR #28's `/get-started` wizard — unmerged

## 4. Failure, idempotency, orphans, authorization
- Halfway failure: `create_organization` is one transaction (atomic). The owner step (`inviteMemberAction`) is two non-atomic calls; if `add_organization_member` fails, an auth user is orphaned and a re-invite fails with "already registered". `approve_onboarding_request` (live SQL): outer UPDATE to `PROVISIONING` + events, inner `BEGIN…EXCEPTION` savepoint; on failure org/roles/membership roll back, row set `FAILED` with `failure_reason`, function returns NULL. A `FAILED` request can never be retried — approve/reject both raise `55000` unless `PENDING_APPROVAL`; no reset RPC.
- Idempotency/uniqueness: `organizations_slug_key` UNIQUE; `create_organization` has no collision handling and returns the raw Postgres message (`lib/actions/platform.ts` L52). `approve_onboarding_request` does a slug-suffix loop and takes advisory lock `onboarding_request_<id>`; a retry after success returns the same `organization_id`. `idx_subscriptions_one_active_per_org` partial unique. `onboarding_requests_one_actionable_per_requester` partial unique. `requester_user_id NOT NULL REFERENCES auth.users` — a request requires an auth account first. No uniqueness on `work_email` or `organizations.name`.
- Rejected/failed applications: reject provisions nothing but the auth user persists forever; FAILED leaves the auth user and a permanently stuck row. `demo_leads`/`contact_requests.status` never changes.
- Platform admin authorization: `is_platform_admin(uid)` = `PLATFORM_SUPER_ADMIN` role with `organization_id IS NULL` (baseline L5009); route gate `platform/layout.tsx` → `requirePlatformAdmin()`; DB gate inside every platform RPC; RLS SELECT admin-or-own-row. Sound in itself — but see SEC-01 (any tenant member can obtain the platform role).

## 5. Plans: commercial UI only, nothing enforced
- DB has `plans` (STARTER/PROFESSIONAL/ENTERPRISE, seeded baseline L21411), `plan_entitlements` (max_resorts/max_users/max_units/module flags/audit_retention_days), `subscriptions`, `tenant_feature_flags`, and `get_entitlement(org,key)` (L4230).
- Callers of `get_entitlement`: **0** (SQL and TS). `tenant_feature_flags`: 0 outside generated types/backup. No `max_units`/`max_users`/`max_resorts` check anywhere in `create_unit*`, `create_resort`, `add_organization_member`, or UI.
- Only `organization_is_active()` (status TRIAL/ACTIVE, ~78 references) is enforced. A STARTER tenant can create unlimited units and users; a lapsed subscription changes nothing unless an admin flips organization status manually.
- Naming drift: marketing **Essential / Professional / Enterprise** (100/500 units, 3/10 users) vs DB **STARTER / PROFESSIONAL / ENTERPRISE** (Starter max_units 100, max_users 5). `?plan=essential` has no DB counterpart. `messages/*.json` has no plan strings.
- Extent of "plans" in product: `/platform/organizations/[id]` shows and assigns a subscription. That is all. No billing, no payment provider for subscriptions, no trial expiry job.

## 6. Demo tenant model
`enterDemoAction` → durable IP rate limit (5/60 s, fails closed) → `signInWithPassword` with server-env `DEMO_USER_EMAIL/PASSWORD` → three post-sign-in assertions (primary org == `DEMO_ORGANIZATION_ID`; not platform admin; `organizations.is_demo=true`) else sign-out. Per-visitor cookie jar against one shared user. Write protection: AUDITOR-cloned role, RLS/RPC `has_permission` + demo policies, `is_demo` immutability, rent sweep skips demo. Residual risks: shared principal (any own-row-writable table not in the demo policy set leaks state between strangers; the "nine tables" audit cited in `lib/demo/guard.ts` is not in the repo); `denyIfDemo` helpers never called by actions (SEC-04); password rotation = outage; exfiltrated cookies valid for refresh-token lifetime; unset `DEMO_ORGANIZATION_ID` silently disables app-layer guards.

## 7. Findings
| ID | Sev | Finding / Expected / Actual / Impact / Recommendation |
|---|---|---|
| ONB-01 | **P1** | **No end-to-end signup path.** Expected pricing → active tenant. Actual: all CTAs end at `/contact` or `/demo/request`; provisioning is admin `create_organization` + manual invite. Impact: zero self-serve conversion; every customer requires operator time. Direction: merge a rebased PR #28 (schema already live) or formally retire `onboarding_requests` — not both half-present. |
| ONB-02 | **P1** | **DB has `onboarding_requests` / `approve_onboarding_request` with no application code.** Live `authenticated`-executable functions nothing exercises, pinned by the migration guard. Direction: land the #28 UI or a migration revoking/dropping them, with an ADR. |
| ONB-03 | P2 | Dashboard "no organization" CTA → retired `/onboarding` (`dashboard/page.tsx` L43). An invited user whose membership failed is told the workspace is being prepared. Direction: link `/contact` now; pending-request status after #28. |
| ONB-04 | P2 | Plan intent dropped at `/contact`: pricing CTAs pass `?plan=…&program=…&type=…`; contact page/form/table ignore them. Direction: hidden field + column, or fold into `message` as `demo_leads` does. |
| ONB-05 | P2 | Owner invitation non-atomic, orphans auth users (`inviteMemberAction`). Direction: look up existing auth user by e-mail first, or move membership into a SECURITY DEFINER RPC taking e-mail. |
| ONB-06 | P2 | Plans are marketing-only: `get_entitlement`, `plan_entitlements`, `tenant_feature_flags` have zero callers. Direction: enforce `max_units`/`max_users`/`max_resorts` DB-side in `create_unit*`, `add_organization_member`, `create_resort`; show usage on `/admin`; define trial expiry. |
| ONB-07 | P3 | Plan naming drift Essential(100u/3 users) vs STARTER(100u/5 users). Single source of truth. |
| ONB-08 | P2 | `create_organization` leaks raw Postgres errors, no slug-collision handling. Direction: suffix loop like approve; map 23505 to friendly text. |
| ONB-09 | P2 | `approve_onboarding_request` has no recovery from `FAILED`. Direction: admin-only `retry_onboarding_request` or let approve accept FAILED. |
| ONB-10 | P3 | Lead inboxes have no workflow: `/platform/leads` = `demo_leads` only, no pagination/status; `contact_requests` has no admin view. |
| ONB-11 | P3 | Demo shared-principal own-row-table coverage list not committed; add a test that fails when a new own-row write policy appears. |
| ONB-12 | P3 | `create_organization_onboarding` still defined with no caller; drop with the ONB-02 decision. |
