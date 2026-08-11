# RESORTOS — Phase 2 Implementation Report

**Scope:** Platform Super Admin workspace, Tenant Admin workspace, plans/entitlements, subscriptions, tenant role templates.
**Verdict: CONTROLLED PILOT READY** — live-verified end-to-end (org creation, status change, subscription assignment, audit trail) against the real Supabase project.

---

## 1. What was built

### Database (8 migrations, applied)
| File | Contents |
|---|---|
| `20260810000007_plans_subscriptions.sql` | `plans`, `plan_entitlements`, `subscriptions` (one active per org, enforced by partial unique index), `get_entitlement()` |
| `20260810000008_tenant_extras.sql` | `tenant_feature_flags`, `tenant_branding` |
| `20260810000009_leads.sql` | `demo_leads`, `contact_requests` (schema only — public capture form is Phase 8) |
| `20260810000010_role_templates.sql` | `role_templates`, `role_template_permissions`, `clone_tenant_role_templates()` |
| `20260810000011_phase2_rls.sql` | RLS on all 9 new tables, default-deny |
| `20260810000012_phase2_seed.sql` | 3 plans × 13 entitlement keys (no prices), 12 tenant role templates with permission grants |
| `20260810000013_org_lifecycle_functions.sql` | `create_organization`, `set_organization_status`, `assign_subscription`, `create_resort` — atomic, `SECURITY DEFINER`, self-authorizing, self-auditing |
| `20260810000014_membership_functions.sql` | `add_organization_member` — links an already-invited auth user to an org with a role, atomically |
| `seed-platform-admin.sql` | one-time manual grant, not a tracked migration |

**Design choice — SQL functions over multi-request client flows:** every composite write (create org + clone 12 roles + subscribe; invite user + membership + role assignment) is one `SECURITY DEFINER` Postgres function, not a sequence of independent `supabase-js` calls. This matches the Phase 1 posting-architecture principle (docs/phase1-audit-and-plan.md §7): the invariant lives in the database, not in whichever client happens to call it. Each function re-checks authorization itself via `is_platform_admin()`/`has_permission()` since `SECURITY DEFINER` bypasses RLS.

### Platform Super Admin (`/platform`, gated by `requirePlatformAdmin()`)
- `/platform/organizations` — list all orgs, create new org (name, slug, currency, initial plan)
- `/platform/organizations/[id]` — status transitions (TRIAL/ACTIVE/SUSPENDED/ARCHIVED) with optional reason, subscription/plan reassignment
- `/platform/leads` — demo lead list (empty until Phase 8 ships the public form)
- `/platform/audit` — last 200 `platform_audit_logs` entries

### Tenant Admin (`/admin`, gated by org membership)
- `/admin` — organization profile (name, default currency), edit form disabled unless the user actually holds `tenant.settings.manage` (checked server-side via `has_permission()`, not just UI-hidden)
- `/admin/resorts` — list + create resorts (via `create_resort()`, blocked if the org isn't `ACTIVE`)
- `/admin/users` — list members (email resolved via the admin API since `auth.users` isn't queryable through PostgREST) + role, invite-by-email form using `supabase.auth.admin.inviteUserByEmail()` then `add_organization_member()`
- `/admin/roles` — read-only list of the org's cloned roles with permission counts (grant editing UI is a follow-up, not in this phase)

### Navigation
Dashboard now links to `/platform` (if platform admin) and `/admin` (if org member); both workspaces have their own bilingual sidebar nav.

## 2. Verification executed

| Check | Result |
|---|---|
| `npx tsc --noEmit` | ✅ Pass, 0 errors |
| `npm run lint` | ✅ Pass |
| `npm run build` | ✅ Pass, 25 routes generated |
| Unauthenticated access to `/platform/*`, `/admin` | ✅ 307 → `/login` |
| **Live browser test** (your confirmation) | ✅ Created an organization, changed its status, reassigned its plan, confirmed both events in `/platform/audit`, confirmed `/admin` correctly shows "not linked to an organization" for the platform-admin-only test account |

## 3. Known limitations / explicit scope cuts

- **Role permission editing UI** — `/admin/roles` is read-only. Templates clone correctly per org, but there's no UI yet to add/remove a permission from a cloned role (spec allows tenant customization; not built this phase).
- **Org switcher** — `getPrimaryOrganization()` always picks the user's oldest membership. A user in multiple organizations has no way to switch context yet. Flagged now so it isn't forgotten; low priority until multi-org membership is actually exercised.
- **User invite email delivery** — uses Supabase's default auth email (not a dedicated provider, consistent with the Phase 1 decision to defer email infrastructure). Test it before relying on it for a real invite.
- **Feature flags / branding / usage counters** — tables and RLS exist (`tenant_feature_flags`, `tenant_branding`, entitlement lookup via `get_entitlement()`), but no UI was built for them this phase — not needed until a module actually gates on them.
- **RLS negative tests still not automated** — same gap noted in the Phase 1 report. Now that two real organizations can exist, this is the natural next thing to write before Phase 3 touches financial data.
- **`/platform/leads` has no data source yet** — correct, since the public demo form is Phase 8. Verified the empty state renders correctly rather than erroring.

## 4. Next step (Phase 3 — not started)

Accounting Core: chart of accounts, fiscal years/periods, the double-entry journal engine and posting function (already designed in docs/phase1-audit-and-plan.md §7), vouchers, and the first real database-integrity tests (unbalanced entry rejected, closed-period posting rejected, etc. — spec §38). **Waiting for your go-ahead before starting.**
