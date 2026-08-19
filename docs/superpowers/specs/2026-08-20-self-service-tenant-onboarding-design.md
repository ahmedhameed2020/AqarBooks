# Self-Service Tenant Onboarding — Design

## Purpose

Fix the critical gap found during the tenant-signup QA audit
(`docs/superpowers/specs/` audit session, 2026-08-19/20 — see the published
QA artifact for full evidence): a newly registered tenant who confirms their
email lands on `/ar/dashboard` with no organization and no way to create
one. `register-form.tsx` already redirects to `/${locale}/onboarding` for
one signup branch, but that route does not exist (404), and no self-service
path to organization creation exists anywhere in the app — the only caller
of organization creation is platform-admin-only.

## What already exists (verified live, not just read from source)

The backend is already built and confirmed working end-to-end against the
live database with a real authenticated user during this investigation:

- RPC `public.create_organization_onboarding(p_org_name, p_entity_type,
  p_entity_type_custom_label default null, p_resort_name, p_resort_code
  default null, p_timezone default 'Africa/Cairo', p_default_currency
  default 'EGP')`, `SECURITY DEFINER`, granted to `authenticated`.
- Atomically: validates input, advisory-locks per user (no double-submit),
  rejects if the caller already has a membership (`ALREADY_HAS_ORGANIZATION`),
  creates the `organizations` row, clones role templates
  (`clone_tenant_role_templates`), creates the first `resorts` row, creates
  the `organization_memberships` row, assigns the cloned `TENANT_OWNER` role,
  writes a `platform_audit_logs` entry, and returns
  `{ success, organization_id, resort_id, slug }`.
- Error codes observed: `UNAUTHORIZED` (42501, not signed in),
  `ALREADY_HAS_ORGANIZATION` (42501), `INVALID_ORG_NAME` /
  `INVALID_ENTITY_TYPE` / `CUSTOM_LABEL_REQUIRED` / `INVALID_RESORT_NAME`
  (22023, input validation), `ROLE_CLONE_FAILED` (50000, genuine server
  fault).
- `entity_type` accepts exactly: `DEVELOPER`, `FACILITY_MANAGEMENT`,
  `OWNERS_ASSOCIATION`, `INDIVIDUAL_OWNER`, `TOURIST_RESORT`,
  `TOURIST_VILLAGE`, `RESIDENTIAL_COMPOUND`, `OTHER` (the last requires
  `p_entity_type_custom_label`).

**Scope of this change is therefore frontend-only**: one new route, its
wiring into the two existing entry points (register redirect, confirmation
email `next`), and one defensive addition to the existing dead-end dashboard
state. No new database migration, no RPC changes.

## Routes and files

```
app/[locale]/onboarding/
  page.tsx                 # Server Component — auth + already-onboarded guard
  onboarding-wizard.tsx     # Client Component — shared 2-step state, calls the RPC
  entity-type-step.tsx      # Step 1: org name + entity type card grid
  first-project-step.tsx    # Step 2: first resort name/code + currency
```

`page.tsx` responsibilities:
- No session → redirect to `/[locale]/login`.
- Session exists but the user already has a row in
  `organization_memberships` with `status in ('active','invited')` → redirect
  straight to `/[locale]/dashboard` (idempotent guard matching the RPC's own
  `ALREADY_HAS_ORGANIZATION` check, so a returning/refreshing user never sees
  the wizard again after finishing it once).
- Otherwise render `<OnboardingWizard />`.

## Wiring changes to existing files

1. `supabase/templates/confirmation.html` — the `next=/ar/dashboard` query
   param on both CTA links changes to `next=/ar/onboarding`. This is the only
   template that changes; recovery/magic_link/email_change/invite/
   reauthentication keep pointing at the dashboard or their existing targets
   because those are all existing-user flows, not new-tenant signup.
2. `app/[locale]/auth/register/register-form.tsx` — no code change needed;
   line 59's `router.push(`/${locale}/onboarding`)` already targets the
   route this spec creates. (Verified during the audit that this is the only
   place in the app that already assumes this route's existence.)
3. The existing "not linked to an organization" dashboard empty state
   (`مرحبًا` / `حسابك غير مرتبط بأي منظمة بعد. تواصل مع مدير المنصة.`) gets
   one addition: a primary CTA button, "أنشئ مؤسستك الآن" → `/onboarding`.
   This is a safety net for any account already stuck in this state before
   this fix ships, and for edge cases (e.g. a platform-admin-invited user
   whose invite was later revoked). The "contact the platform admin" copy
   stays as a secondary line, not removed.

## Step 1 — عن مؤسستك (About your entity)

- Field: organization name (free text, mirrors `INVALID_ORG_NAME`: 2–150
  chars).
- Entity type: 8 clickable visual cards (icon + short label each), one
  selectable at a time, mapped 1:1 to the RPC's accepted enum values. Card
  labels (Arabic primary, matching the enum semantics):
  - `DEVELOPER` — مطوّر عقاري
  - `FACILITY_MANAGEMENT` — إدارة مرافق
  - `OWNERS_ASSOCIATION` — اتحاد ملاك
  - `INDIVIDUAL_OWNER` — مالك فرد
  - `TOURIST_RESORT` — منتجع سياحي
  - `TOURIST_VILLAGE` — قرية سياحية
  - `RESIDENTIAL_COMPOUND` — كمباوند سكني
  - `OTHER` — أخرى (reveals a required text field for
    `p_entity_type_custom_label` the moment it's selected)
- "التالي" advances to step 2 only after client-side validation passes
  (mirrors the RPC's own rules so the user never submits something the RPC
  will reject for a reason the UI could have caught first).

## Step 2 — أول مشروع/منتجع (Your first project)

- Field: project/resort name (free text, mirrors `INVALID_RESORT_NAME`).
- Field: project code — auto-derived from the name (same slugify approach
  as the org slug), editable, falls back to `RES-01` if the user clears it
  entirely (matching the RPC's own fallback so the two never disagree).
- Field: default currency — dropdown, EGP preselected, plus a short list of
  common currencies (USD, SAR, AED, and others already used elsewhere in the
  app's currency handling).
- "رجوع" returns to step 1 without losing step 1's values (state lives in
  the wizard's shared client state, not per-step local state).
- "إنشاء المؤسسة" calls the RPC. On success, redirect to `/[locale]/dashboard`
  (which will now render real data instead of the empty state, since the
  membership + role now exist).

## Error handling

Client-side validation mirrors the RPC's rules first (name lengths, custom
label required for "OTHER"), so most `22023` cases never reach the server.
Server-side errors the RPC can still legitimately return:

| RPC error | UI treatment |
|---|---|
| `ALREADY_HAS_ORGANIZATION` | Redirect to `/dashboard` immediately (defensive — `page.tsx`'s guard should normally prevent reaching this) |
| `INVALID_ORG_NAME` / `INVALID_RESORT_NAME` / `CUSTOM_LABEL_REQUIRED` | Inline error under the relevant field, focus returns to it |
| `ROLE_CLONE_FAILED` | Generic "حصل خطأ من عندنا، جرّب تاني" banner with a retry button — this is a genuine server fault, not user error |
| Any other/unexpected error | Same generic banner, plus `console.error` for diagnosis |

## Visual design

This is a first-impression, trust-setting screen for a financial SaaS
product — it gets the same visual investment as the register/verify-email
screens it sits between, not a bare utilitarian form. Concretely:

- Reuses the existing dark hero-panel + white-card split layout established
  by `register-form.tsx` and `verify-email`, so the three screens read as one
  continuous, designed sequence rather than a jump to a different product.
- A visible 2-step progress indicator (not just "step 1 of 2" text — a real
  progress affordance) so the promised "two minutes" from the landing copy
  feels concrete.
- The entity-type cards are genuinely designed selection cards (icon,
  label, selected-state treatment with the product's accent color and a
  clear focus/hover state), not a disguised radio list.
- Motion: a deliberate, restrained step transition (step 1 ↔ step 2) rather
  than an abrupt swap — this is one of the few screens in the product where
  a small crafted transition earns its place, since it's a one-time,
  high-stakes moment for the user.
- Full parity in both locales/directions (ar/RTL, en/LTR) and both existing
  light/dark handling conventions already used elsewhere in the app.
- Loading/submitting state on "إنشاء المؤسسة" (this call does real,
  non-trivial work server-side — cloning role templates, multiple inserts —
  so it must never look like a hung button).

## Testing / verification

- Manual walkthrough (Playwright, as used in the audit) repeating the full
  journey end-to-end: register → confirm email → land on `/onboarding` →
  complete both steps → land on `/dashboard` with real organization data
  rendered (not the empty state).
- Re-run the specific RPC error cases (duplicate org attempt via direct
  navigation after completing onboarding once; "OTHER" entity type with an
  empty custom label) to confirm the client-side messaging matches.
- Confirm the dashboard empty-state CTA appears and links correctly, for the
  pre-existing-stuck-account safety net.
