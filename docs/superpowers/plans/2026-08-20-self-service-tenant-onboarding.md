# Self-Service Tenant Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a newly registered tenant create their organization themselves right after confirming their email, instead of landing on a dead-end dashboard with no organization and no way to create one.

**Architecture:** Frontend-only. The backend RPC (`create_organization_onboarding`) already exists on the live database and was verified end-to-end during the audit that produced this plan (see `docs/superpowers/specs/2026-08-20-self-service-tenant-onboarding-design.md`). This plan adds one new route (`/[locale]/onboarding`), a server action that calls the existing RPC, and wires the two places in the app that already assume this route exists (the register form's redirect, and the confirmation email's `next` param) plus a defensive CTA on the dashboard's existing dead-end state.

**Tech Stack:** Next.js 16 App Router (Server Components + Server Actions), `useActionState`, Supabase (`@supabase/ssr`), Tailwind, `lucide-react`, Vitest (integration test against the live RPC), Playwright (e2e UI test).

---

## File Structure

```
lib/
  currency.ts                          # MODIFY — add CURRENCY_CODES export
  actions/
    onboarding.ts                      # CREATE — server action calling create_organization_onboarding
app/[locale]/
  onboarding/
    page.tsx                           # CREATE — server guard (auth + already-onboarded check)
    onboarding-wizard.tsx              # CREATE — client: shared state, step switching, form
    entity-type-step.tsx               # CREATE — presentational: org name + 8 entity cards
    first-project-step.tsx             # CREATE — presentational: resort name/code + currency
  auth/register/
    page.tsx                           # MODIFY — swap broken imageSrc for a real asset
  (app)/dashboard/
    page.tsx                           # MODIFY — add "create your organization" CTA to the empty state
components/auth/
  auth-shell.tsx                       # MODIFY — swap broken default imageSrc for a real asset
supabase/
  templates/confirmation.html          # MODIFY — next=/ar/dashboard -> next=/ar/onboarding
messages/
  ar.json                              # MODIFY — add dashboard.createOrganizationCta
  en.json                              # MODIFY — add dashboard.createOrganizationCta
tests/
  onboarding.integration.test.ts       # CREATE — RPC contract regression test (Vitest, live DB)
tests/e2e/
  onboarding-wizard.spec.ts            # CREATE — full UI flow (Playwright)
```

---

### Task 1: Currency options helper

**Files:**
- Modify: `lib/currency.ts`

- [ ] **Step 1: Add the exported code list**

The wizard's currency `<select>` needs the same 10 codes `getCurrencyLabel` already knows about, in one place so the dropdown and the label function can never drift apart. Add this export above the existing `getCurrencyLabel` function:

```ts
export const CURRENCY_CODES = [
  "EGP",
  "SAR",
  "AED",
  "KWD",
  "QAR",
  "BHD",
  "OMR",
  "USD",
  "EUR",
  "GBP",
] as const;

export type CurrencyCode = (typeof CURRENCY_CODES)[number];

export function getCurrencyLabel(currencyCode: string | undefined | null, isAr: boolean): string {
```

(The rest of `getCurrencyLabel`'s body is unchanged — only the new export and the `export function` line above it are added.)

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no new errors mentioning `lib/currency.ts`.

- [ ] **Step 3: Commit**

```bash
git add lib/currency.ts
git commit -m "feat(onboarding): export CURRENCY_CODES from lib/currency"
```

---

### Task 2: RPC contract regression test

**Files:**
- Create: `tests/onboarding.integration.test.ts`

This RPC already exists and was manually verified working during the audit — this task turns that manual verification into a repeatable automated test, so a future migration can't silently break it. Run against the same live project the other `tests/*.integration.test.ts` files use (`.env.local`).

- [ ] **Step 1: Write the test file**

```ts
import { describe, it, expect, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

const createdUserIds: string[] = [];
const createdOrgIds: string[] = [];

async function newSignedInUser(): Promise<{ userId: string; client: SupabaseClient }> {
  const email = `onboarding-rpc-${Date.now()}-${Math.random().toString(36).slice(2)}@resortos-test.local`;
  const password = "TestPassword123!";
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createErr) throw createErr;
  createdUserIds.push(created.user.id);

  const client = createClient(url, anonKey, { auth: { persistSession: false } });
  const { error: signInErr } = await client.auth.signInWithPassword({ email, password });
  if (signInErr) throw signInErr;

  return { userId: created.user.id, client };
}

afterAll(async () => {
  for (const orgId of createdOrgIds) {
    await admin.from("organizations").delete().eq("id", orgId);
  }
  for (const userId of createdUserIds) {
    await admin.auth.admin.deleteUser(userId);
  }
});

describe("create_organization_onboarding RPC", () => {
  it("1. creates an organization, first resort, membership, and TENANT_OWNER role for a fresh user", async () => {
    const { userId, client } = await newSignedInUser();

    const { data, error } = await client.rpc("create_organization_onboarding", {
      p_org_name: "Vitest Onboarding Org",
      p_entity_type: "FACILITY_MANAGEMENT",
      p_resort_name: "Vitest First Project",
      p_resort_code: "VT-01",
      p_default_currency: "EGP",
    });

    expect(error).toBeNull();
    expect(data?.success).toBe(true);
    expect(data?.organization_id).toBeTruthy();
    expect(data?.resort_id).toBeTruthy();
    if (data?.organization_id) createdOrgIds.push(data.organization_id);

    const { data: membership } = await admin
      .from("organization_memberships")
      .select("status")
      .eq("user_id", userId)
      .eq("organization_id", data!.organization_id)
      .maybeSingle();
    expect(membership?.status).toBe("active");

    const { data: roleAssignment } = await admin
      .from("user_role_assignments")
      .select("roles(key)")
      .eq("user_id", userId)
      .eq("organization_id", data!.organization_id)
      .maybeSingle();
    expect((roleAssignment as unknown as { roles: { key: string } } | null)?.roles?.key).toBe(
      "TENANT_OWNER"
    );
  });

  it("2. rejects a second onboarding attempt for a user who already has an organization", async () => {
    const { client } = await newSignedInUser();

    const first = await client.rpc("create_organization_onboarding", {
      p_org_name: "Vitest Duplicate Org",
      p_entity_type: "OTHER",
      p_entity_type_custom_label: "Vitest custom label",
      p_resort_name: "Vitest Project One",
    });
    expect(first.error).toBeNull();
    if (first.data?.organization_id) createdOrgIds.push(first.data.organization_id);

    const second = await client.rpc("create_organization_onboarding", {
      p_org_name: "Vitest Second Attempt Org",
      p_entity_type: "OTHER",
      p_entity_type_custom_label: "Vitest custom label",
      p_resort_name: "Vitest Project Two",
    });

    expect(second.error).toBeDefined();
    expect(second.error?.message).toMatch(/^ALREADY_HAS_ORGANIZATION:/);
  });

  it("3. rejects an org name shorter than 2 characters", async () => {
    const { client } = await newSignedInUser();

    const { error } = await client.rpc("create_organization_onboarding", {
      p_org_name: "A",
      p_entity_type: "OTHER",
      p_entity_type_custom_label: "Vitest custom label",
      p_resort_name: "Vitest Project",
    });

    expect(error).toBeDefined();
    expect(error?.message).toMatch(/^INVALID_ORG_NAME:/);
  });

  it("4. requires a custom label when entity_type is OTHER", async () => {
    const { client } = await newSignedInUser();

    const { error } = await client.rpc("create_organization_onboarding", {
      p_org_name: "Vitest Missing Label Org",
      p_entity_type: "OTHER",
      p_resort_name: "Vitest Project",
    });

    expect(error).toBeDefined();
    expect(error?.message).toMatch(/^CUSTOM_LABEL_REQUIRED:/);
  });

  it("5. rejects an unauthenticated call", async () => {
    const anonClient = createClient(url, anonKey, { auth: { persistSession: false } });
    const { error } = await anonClient.rpc("create_organization_onboarding", {
      p_org_name: "Vitest Anon Org",
      p_entity_type: "OTHER",
      p_entity_type_custom_label: "x",
      p_resort_name: "Vitest Project",
    });

    expect(error).toBeDefined();
    expect(error?.message).toMatch(/^UNAUTHORIZED:/);
  });
});
```

- [ ] **Step 2: Run it**

Run: `npx vitest run tests/onboarding.integration.test.ts --reporter=verbose`
Expected: all 5 tests PASS (this documents already-verified live behavior — it is not expected to fail first, since the RPC under test was not written as part of this plan).

- [ ] **Step 3: Commit**

```bash
git add tests/onboarding.integration.test.ts
git commit -m "test(onboarding): add regression coverage for create_organization_onboarding RPC"
```

---

### Task 3: Server action wrapping the RPC

**Files:**
- Create: `lib/actions/onboarding.ts`

- [ ] **Step 1: Write the action**

Mirrors `signIn`'s pattern in `lib/actions/auth.ts` (extra bound args before `prevState`/`formData`, so it plugs into `useActionState` via `.bind(null, locale)`), and parses the RPC's `"CODE: message"` error format to route the error back to the exact field that caused it — the same `"CODE: text"` shape already observed live (`UNAUTHORIZED: يرجى تسجيل الدخول أولاً`, etc.) in Task 2's test.

```ts
"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { CURRENCY_CODES } from "@/lib/currency";

const ENTITY_TYPES = [
  "DEVELOPER",
  "FACILITY_MANAGEMENT",
  "OWNERS_ASSOCIATION",
  "INDIVIDUAL_OWNER",
  "TOURIST_RESORT",
  "TOURIST_VILLAGE",
  "RESIDENTIAL_COMPOUND",
  "OTHER",
] as const;

// Both enums are server-side allowlists, not just UI conveniences: the RPC
// itself only enforces entity_type (a CHECK constraint on organizations),
// not currency (default_currency has no CHECK constraint), so this is the
// only place a bogus/unsupported currency code gets rejected before it
// reaches the database.
const onboardingSchema = z.object({
  orgName: z.string().min(2).max(150),
  entityType: z.enum(ENTITY_TYPES),
  customLabel: z.string().optional(),
  resortName: z.string().min(2),
  resortCode: z.string().optional(),
  currency: z.enum(CURRENCY_CODES),
});

export type OnboardingState = {
  ok: boolean;
  error?: string;
  field?: "orgName" | "entityType" | "customLabel" | "resortName";
};

export async function completeOnboarding(
  locale: Locale,
  _prevState: OnboardingState,
  formData: FormData
): Promise<OnboardingState> {
  const parsed = onboardingSchema.safeParse({
    orgName: formData.get("orgName"),
    entityType: formData.get("entityType"),
    customLabel: formData.get("customLabel") || undefined,
    resortName: formData.get("resortName"),
    resortCode: formData.get("resortCode") || undefined,
    currency: formData.get("currency") || "EGP",
  });

  if (!parsed.success) {
    return { ok: false, error: "بيانات غير صالحة، راجع الحقول وحاول مرة أخرى" };
  }

  if (parsed.data.entityType === "OTHER" && !parsed.data.customLabel) {
    return {
      ok: false,
      error: "يرجى إدخال وصف نوع الكيان المخصص",
      field: "customLabel",
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_organization_onboarding", {
    p_org_name: parsed.data.orgName,
    p_entity_type: parsed.data.entityType,
    p_entity_type_custom_label: parsed.data.customLabel,
    p_resort_name: parsed.data.resortName,
    p_resort_code: parsed.data.resortCode,
    p_default_currency: parsed.data.currency,
  });

  if (error) {
    const code = error.message.split(":")[0].trim();

    if (code === "ALREADY_HAS_ORGANIZATION") {
      redirect({ href: "/dashboard", locale });
    }

    if (code === "INVALID_ORG_NAME") {
      return { ok: false, error: "اسم المؤسسة يجب أن يكون بين حرفين و150 حرفاً", field: "orgName" };
    }
    if (code === "INVALID_RESORT_NAME") {
      return { ok: false, error: "اسم المشروع الأول مطلوب (حرفان على الأقل)", field: "resortName" };
    }
    if (code === "CUSTOM_LABEL_REQUIRED") {
      return { ok: false, error: "يرجى إدخال وصف نوع الكيان المخصص", field: "customLabel" };
    }

    console.error("[completeOnboarding] RPC failed", { code, message: error.message });
    return { ok: false, error: "حصل خطأ من عندنا، جرّب تاني بعد لحظات" };
  }

  if (!data?.success) {
    console.error("[completeOnboarding] RPC returned success:false unexpectedly", data);
    return { ok: false, error: "حصل خطأ من عندنا، جرّب تاني بعد لحظات" };
  }

  redirect({ href: "/dashboard", locale });
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors mentioning `lib/actions/onboarding.ts`.

- [ ] **Step 3: Commit**

```bash
git add lib/actions/onboarding.ts
git commit -m "feat(onboarding): add completeOnboarding server action"
```

---

### Task 4: Entity-type step (presentational)

**Files:**
- Create: `app/[locale]/onboarding/entity-type-step.tsx`

- [ ] **Step 1: Write the component**

This is a pure controlled-input component — it has no `name` attributes and never touches `FormData` directly. Task 6's wizard owns the single source of truth (its own `useState`) and submits everything through its own consolidated hidden inputs, which is what makes it safe for Task 6 to unmount this component entirely when the user is on step 2 (needed for a real step-change animation, not just a CSS show/hide).

```tsx
"use client";

import {
  Building,
  Wrench,
  Users,
  User,
  Palmtree,
  Home,
  Building2,
  MoreHorizontal,
} from "lucide-react";

export const ENTITY_TYPE_OPTIONS = [
  { value: "DEVELOPER", icon: Building, ar: "مطوّر عقاري", en: "Developer" },
  { value: "FACILITY_MANAGEMENT", icon: Wrench, ar: "إدارة مرافق", en: "Facility Management" },
  { value: "OWNERS_ASSOCIATION", icon: Users, ar: "اتحاد ملاك", en: "Owners Association" },
  { value: "INDIVIDUAL_OWNER", icon: User, ar: "مالك فرد", en: "Individual Owner" },
  { value: "TOURIST_RESORT", icon: Palmtree, ar: "منتجع سياحي", en: "Tourist Resort" },
  { value: "TOURIST_VILLAGE", icon: Home, ar: "قرية سياحية", en: "Tourist Village" },
  { value: "RESIDENTIAL_COMPOUND", icon: Building2, ar: "كمباوند سكني", en: "Residential Compound" },
  { value: "OTHER", icon: MoreHorizontal, ar: "أخرى", en: "Other" },
] as const;

export type EntityTypeValue = (typeof ENTITY_TYPE_OPTIONS)[number]["value"];

interface EntityTypeStepProps {
  isAr: boolean;
  orgName: string;
  onOrgNameChange: (value: string) => void;
  entityType: EntityTypeValue | null;
  onEntityTypeChange: (value: EntityTypeValue) => void;
  customLabel: string;
  onCustomLabelChange: (value: string) => void;
  orgNameError?: string;
  customLabelError?: string;
}

export function EntityTypeStep({
  isAr,
  orgName,
  onOrgNameChange,
  entityType,
  onEntityTypeChange,
  customLabel,
  onCustomLabelChange,
  orgNameError,
  customLabelError,
}: EntityTypeStepProps) {
  return (
    <div className="space-y-5 text-start">
      <div className="space-y-1.5">
        <label className="text-xs font-bold text-slate-700 block">
          {isAr ? "اسم المؤسسة" : "Organization Name"}
        </label>
        <input
          type="text"
          value={orgName}
          onChange={(e) => onOrgNameChange(e.target.value)}
          placeholder={isAr ? "شركة النخبة العقارية" : "Elite Real Estate Holdings"}
          className="w-full rounded-lg border border-slate-300 bg-white py-2.5 px-3.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/10 transition-all"
          required
          minLength={2}
          maxLength={150}
        />
        {orgNameError && (
          <p role="alert" className="text-xs font-semibold text-red-600">
            {orgNameError}
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-bold text-slate-700 block">
          {isAr ? "نوع الكيان" : "Entity Type"}
        </label>
        <div className="grid grid-cols-2 gap-2.5" role="radiogroup">
          {ENTITY_TYPE_OPTIONS.map(({ value, icon: Icon, ar, en }) => {
            const selected = entityType === value;
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => onEntityTypeChange(value)}
                className={`flex flex-col items-start gap-2 rounded-lg border p-3 text-start transition-all ${
                  selected
                    ? "border-blue-600 bg-blue-50 ring-2 ring-blue-600/20"
                    : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                }`}
              >
                <Icon className={`size-4 ${selected ? "text-blue-600" : "text-slate-400"}`} />
                <span
                  className={`text-xs font-bold ${selected ? "text-blue-900" : "text-slate-700"}`}
                >
                  {isAr ? ar : en}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {entityType === "OTHER" && (
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-slate-700 block">
            {isAr ? "صف نوع الكيان" : "Describe the entity type"}
          </label>
          <input
            type="text"
            value={customLabel}
            onChange={(e) => onCustomLabelChange(e.target.value)}
            placeholder={isAr ? "مثال: صندوق استثمار عقاري" : "e.g. Real estate investment fund"}
            className="w-full rounded-lg border border-slate-300 bg-white py-2.5 px-3.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/10 transition-all"
            required
            minLength={2}
          />
          {customLabelError && (
            <p role="alert" className="text-xs font-semibold text-red-600">
              {customLabelError}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors mentioning `entity-type-step.tsx`.

- [ ] **Step 3: Commit**

```bash
git add app/\[locale\]/onboarding/entity-type-step.tsx
git commit -m "feat(onboarding): add entity-type selection step component"
```

---

### Task 5: First-project step (presentational)

**Files:**
- Create: `app/[locale]/onboarding/first-project-step.tsx`

- [ ] **Step 1: Write the component**

Same rule as `EntityTypeStep` (Task 4): pure controlled inputs, no `name` attributes — the wizard's hidden inputs (Task 6) are what actually get submitted.

```tsx
"use client";

import { CURRENCY_CODES, getCurrencyLabel } from "@/lib/currency";

interface FirstProjectStepProps {
  isAr: boolean;
  resortName: string;
  onResortNameChange: (value: string) => void;
  resortCode: string;
  onResortCodeChange: (value: string) => void;
  currency: string;
  onCurrencyChange: (value: string) => void;
  resortNameError?: string;
}

export function FirstProjectStep({
  isAr,
  resortName,
  onResortNameChange,
  resortCode,
  onResortCodeChange,
  currency,
  onCurrencyChange,
  resortNameError,
}: FirstProjectStepProps) {
  return (
    <div className="space-y-5 text-start">
      <div className="space-y-1.5">
        <label className="text-xs font-bold text-slate-700 block">
          {isAr ? "اسم المشروع أو المنتجع الأول" : "First project or resort name"}
        </label>
        <input
          type="text"
          value={resortName}
          onChange={(e) => onResortNameChange(e.target.value)}
          placeholder={isAr ? "منتجع النخيل الذهبي" : "Golden Palm Resort"}
          className="w-full rounded-lg border border-slate-300 bg-white py-2.5 px-3.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/10 transition-all"
          required
          minLength={2}
        />
        {resortNameError && (
          <p role="alert" className="text-xs font-semibold text-red-600">
            {resortNameError}
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-bold text-slate-700 block">
          {isAr ? "كود المشروع" : "Project code"}
        </label>
        <input
          type="text"
          value={resortCode}
          onChange={(e) => onResortCodeChange(e.target.value.toUpperCase())}
          placeholder="RES-01"
          className="w-full rounded-lg border border-slate-300 bg-white py-2.5 px-3.5 text-sm text-slate-900 font-mono placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/10 transition-all"
          dir="ltr"
        />
        <p className="text-[11px] text-slate-400">
          {isAr
            ? "يتولّد تلقائيًا من اسم المشروع، وتقدر تعدّله"
            : "Auto-generated from the project name — feel free to edit it"}
        </p>
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-bold text-slate-700 block">
          {isAr ? "العملة الافتراضية" : "Default currency"}
        </label>
        <select
          value={currency}
          onChange={(e) => onCurrencyChange(e.target.value)}
          className="w-full rounded-lg border border-slate-300 bg-white py-2.5 px-3.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/10 transition-all"
        >
          {CURRENCY_CODES.map((code) => (
            <option key={code} value={code}>
              {code} — {getCurrencyLabel(code, isAr)}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors mentioning `first-project-step.tsx`.

- [ ] **Step 3: Commit**

```bash
git add app/\[locale\]/onboarding/first-project-step.tsx
git commit -m "feat(onboarding): add first-project step component"
```

---

### Task 6: The wizard shell (client, shared state + step transition)

**Files:**
- Create: `app/[locale]/onboarding/onboarding-wizard.tsx`

This is the only file in the feature responsible for cross-step state, client-side validation before advancing, and the actual form submission. The step components (Task 4, Task 5) are pure controlled presentational components with no `name` attributes — this wizard is the single source of truth for every field's value (its own `useState`) and the only place that touches `FormData`, via one consolidated block of `<input type="hidden">`s that stay mounted regardless of which step is visually showing. That decoupling is what makes it safe to conditionally *unmount* the inactive step component (instead of just CSS-hiding it) — which is what makes a real entrance animation possible: `key={step}` forces React to remount the step's wrapper on every change, and `tw-animate-css`'s `animate-in` utilities (already imported globally in `app/globals.css`) replay on that remount. A `display:none` show/hide toggle cannot animate this way — there's no intermediate frame to transition through — which is why the two are structured differently here.

- [ ] **Step 1: Write the component**

```tsx
"use client";

import { useActionState, useState } from "react";
import { RefreshCw, ArrowLeft, ArrowRight, Check } from "lucide-react";
import { completeOnboarding, type OnboardingState } from "@/lib/actions/onboarding";
import type { Locale } from "@/i18n/routing";
import { EntityTypeStep, type EntityTypeValue } from "./entity-type-step";
import { FirstProjectStep } from "./first-project-step";

const slugify = (value: string) =>
  value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 20);

export function OnboardingWizard({ locale }: { locale: string }) {
  const isAr = locale === "ar";
  const [state, formAction, pending] = useActionState<OnboardingState, FormData>(
    completeOnboarding.bind(null, locale as Locale),
    { ok: true }
  );

  const [step, setStep] = useState<1 | 2>(1);
  const [orgName, setOrgName] = useState("");
  const [entityType, setEntityType] = useState<EntityTypeValue | null>(null);
  const [customLabel, setCustomLabel] = useState("");
  const [resortName, setResortName] = useState("");
  const [resortCode, setResortCode] = useState("");
  const [resortCodeEdited, setResortCodeEdited] = useState(false);
  const [currency, setCurrency] = useState("EGP");
  const [step1Error, setStep1Error] = useState<string | null>(null);

  function handleResortNameChange(value: string) {
    setResortName(value);
    if (!resortCodeEdited) {
      setResortCode(slugify(value) || "RES-01");
    }
  }

  function handleResortCodeChange(value: string) {
    setResortCodeEdited(true);
    setResortCode(value);
  }

  function handleNext() {
    if (orgName.trim().length < 2) {
      setStep1Error(isAr ? "اسم المؤسسة يجب أن يكون حرفين على الأقل" : "Organization name must be at least 2 characters");
      return;
    }
    if (!entityType) {
      setStep1Error(isAr ? "اختر نوع الكيان" : "Select an entity type");
      return;
    }
    if (entityType === "OTHER" && customLabel.trim().length < 2) {
      setStep1Error(isAr ? "يرجى وصف نوع الكيان" : "Please describe the entity type");
      return;
    }
    setStep1Error(null);
    setStep(2);
  }

  const showFieldError = (field: OnboardingState["field"]) =>
    !state.ok && state.field === field ? state.error : undefined;

  return (
    <form action={formAction} className="space-y-5">
      {!state.ok && !state.field && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50/90 p-3.5 text-xs font-semibold text-red-700"
        >
          {state.error}
        </div>
      )}

      <div className="flex items-center gap-2" aria-label={isAr ? "خطوات التسجيل" : "Onboarding steps"}>
        {[1, 2].map((n) => (
          <div key={n} className="flex flex-1 items-center gap-2">
            <div
              className={`flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold transition-colors ${
                step >= n ? "bg-blue-600 text-white" : "bg-slate-200 text-slate-500"
              }`}
            >
              {step > n ? <Check className="size-3.5" /> : n}
            </div>
            {n === 1 && (
              <div
                className={`h-0.5 flex-1 rounded-full transition-colors ${
                  step > 1 ? "bg-blue-600" : "bg-slate-200"
                }`}
              />
            )}
          </div>
        ))}
      </div>

      {/* Consolidated hidden inputs -- the only fields the server action actually
          receives. Always mounted regardless of which step is visible, so the
          step components above can be freely unmounted for the entrance
          animation without losing data on submit. */}
      <input type="hidden" name="orgName" value={orgName} />
      <input type="hidden" name="entityType" value={entityType ?? ""} />
      <input type="hidden" name="customLabel" value={customLabel} />
      <input type="hidden" name="resortName" value={resortName} />
      <input type="hidden" name="resortCode" value={resortCode} />
      <input type="hidden" name="currency" value={currency} />

      <div key={step} className="animate-in fade-in-0 zoom-in-95 duration-300 motion-reduce:animate-none">
        {step === 1 ? (
          <>
            <EntityTypeStep
              isAr={isAr}
              orgName={orgName}
              onOrgNameChange={setOrgName}
              entityType={entityType}
              onEntityTypeChange={setEntityType}
              customLabel={customLabel}
              onCustomLabelChange={setCustomLabel}
              orgNameError={step1Error ?? showFieldError("orgName")}
              customLabelError={showFieldError("customLabel")}
            />

            {step1Error && (
              <p role="alert" className="mt-3 text-xs font-semibold text-red-600">
                {step1Error}
              </p>
            )}

            <button
              type="button"
              onClick={handleNext}
              className="mt-5 w-full rounded-lg bg-blue-600 py-3 text-sm font-bold text-white shadow-sm hover:bg-blue-700 active:scale-[0.99] transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>{isAr ? "التالي" : "Next"}</span>
              {isAr ? <ArrowLeft className="size-4" /> : <ArrowRight className="size-4" />}
            </button>
          </>
        ) : (
          <>
            <FirstProjectStep
              isAr={isAr}
              resortName={resortName}
              onResortNameChange={handleResortNameChange}
              resortCode={resortCode}
              onResortCodeChange={handleResortCodeChange}
              currency={currency}
              onCurrencyChange={setCurrency}
              resortNameError={showFieldError("resortName")}
            />

            <div className="mt-5 flex gap-2.5">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50 transition-all cursor-pointer"
              >
                {isAr ? "رجوع" : "Back"}
              </button>
              <button
                type="submit"
                disabled={pending}
                className="flex-1 rounded-lg bg-blue-600 py-3 text-sm font-bold text-white shadow-sm hover:bg-blue-700 active:scale-[0.99] transition-all flex items-center justify-center gap-2 disabled:opacity-70 cursor-pointer"
              >
                {pending ? (
                  <>
                    <RefreshCw className="size-4 animate-spin" />
                    <span>{isAr ? "جارٍ إنشاء المؤسسة..." : "Creating your organization..."}</span>
                  </>
                ) : (
                  <>
                    <Check className="size-4" />
                    <span>{isAr ? "إنشاء المؤسسة" : "Create Organization"}</span>
                  </>
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </form>
  );
}
```

Note on `zoom-in-95` over a directional slide: `tw-animate-css`'s `slide-in-from-*` utilities are physical (left/right), not logical, so under `dir="rtl"` a `slide-in-from-right` reads as "backwards" instead of "forward" — getting that right for both directions needs per-locale class swapping. A subtle scale+fade reads as intentional forward motion in *either* direction without that complexity, which is the better trade for a two-step form (a heavier per-locale directional treatment would be reasonable to revisit later, but isn't worth the complexity for this first pass).

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors mentioning `onboarding-wizard.tsx`.

- [ ] **Step 3: Commit**

```bash
git add app/\[locale\]/onboarding/onboarding-wizard.tsx
git commit -m "feat(onboarding): add two-step onboarding wizard shell"
```

---

### Task 7: The route itself (server guard)

**Files:**
- Create: `app/[locale]/onboarding/page.tsx`

- [ ] **Step 1: Write the page**

Mirrors `app/[locale]/auth/register/page.tsx`'s structure exactly (same `AuthShell`, same locale/redirect handling), with the two guards this route specifically needs: no session → login; already has a membership → dashboard (matching the RPC's own `ALREADY_HAS_ORGANIZATION` check, so a user who already finished onboarding never sees this form again).

```tsx
import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/i18n/routing";
import { AuthShell } from "@/components/auth/auth-shell";
import { OnboardingWizard } from "./onboarding-wizard";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const isAr = locale === "ar";

  const title = isAr ? "تجهيز مؤسستك | AqarBooks" : "Set Up Your Organization | AqarBooks";
  const description = isAr
    ? "أنشئ مؤسستك وأول مشروع عقاري لك على AqarBooks."
    : "Create your organization and first real estate project on AqarBooks.";

  return { title, description };
}

export default async function OnboardingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const isAr = locale === "ar";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect({ href: "/login", locale: locale as Locale });
  }

  const { data: membership } = await supabase
    .from("organization_memberships")
    .select("id")
    .eq("user_id", user!.id)
    .in("status", ["active", "invited"])
    .limit(1)
    .maybeSingle();

  if (membership) {
    redirect({ href: "/dashboard", locale: locale as Locale });
  }

  return (
    <AuthShell
      brandName="AqarBooks"
      eyebrow={isAr ? "الخطوة الأخيرة" : "Last Step"}
      title={isAr ? "جهّز مؤسستك" : "Set Up Your Organization"}
      subtitle={
        isAr
          ? "خطوتين بسيطتين وتبقى منظومتك المالية جاهزة."
          : "Two simple steps and your financial workspace is ready."
      }
      panelTitle={
        isAr
          ? "كل مؤسسة عقارية تستحق بداية واضحة"
          : "Every real estate entity deserves a clear start."
      }
      panelSubtitle={
        isAr
          ? "من هنا هتقدر تدير كل مشاريعك ووحداتك وحساباتك من مكان واحد."
          : "From here you'll manage every project, unit, and ledger in one place."
      }
      stats={
        isAr
          ? [
              { value: "خطوتين", label: "لإنشاء المؤسسة" },
              { value: "فوري", label: "تفعيل الحساب" },
              { value: "١٠٠٪", label: "عزل مالي RLS" },
            ]
          : [
              { value: "2 Steps", label: "To create your org" },
              { value: "Instant", label: "Account activation" },
              { value: "100%", label: "RLS isolation" },
            ]
      }
      imageSrc="/images/aqarbooks-entities.jpg"
      locale={locale}
    >
      <OnboardingWizard locale={locale} />
    </AuthShell>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors mentioning `app/[locale]/onboarding/page.tsx`.

- [ ] **Step 3: Commit**

```bash
git add app/\[locale\]/onboarding/page.tsx
git commit -m "feat(onboarding): add /onboarding route with auth + already-onboarded guards"
```

---

### Task 8: Wire the confirmation email to land on /onboarding

**Files:**
- Modify: `supabase/templates/confirmation.html`

The signup confirmation email currently sends a freshly confirmed user to `/ar/dashboard` (a leftover from before this route existed) instead of the onboarding wizard it's meant to feed.

- [ ] **Step 1: Update both CTA links**

In `supabase/templates/confirmation.html`, both occurrences (English CTA and Arabic CTA) of:

```
next=/ar/dashboard
```

become:

```
next=/ar/onboarding
```

- [ ] **Step 2: Verify the substitution**

Run: `grep -c "next=/ar/onboarding" supabase/templates/confirmation.html`
Expected: `2`

Run: `grep -c "next=/ar/dashboard" supabase/templates/confirmation.html`
Expected: `0`

- [ ] **Step 3: Push the template to the live project**

```bash
RESEND_API_KEY="<your Resend API key>" supabase config push --yes
```

Review the printed diff before it applies — it should touch only `[email.template.confirmation]`'s `content` field, nothing under `site_url`, `mfa`, or the other email templates. If anything else shows up in the diff, stop and investigate before continuing (this file previously caused an unrelated-settings regression — see the `fix(auth): pin full auth config...` commit in this repo's history for what that looked like).

- [ ] **Step 4: Commit**

```bash
git add supabase/templates/confirmation.html
git commit -m "fix(auth): route confirmation email to /onboarding instead of the dashboard"
```

---

### Task 9: Dashboard safety-net CTA

**Files:**
- Modify: `app/[locale]/(app)/dashboard/page.tsx`
- Modify: `messages/ar.json`
- Modify: `messages/en.json`

For any account that reaches the dead-end "not linked to an organization" state — pre-existing stuck accounts from before this fix, or edge cases like a revoked invite — give it a real way out instead of only "contact the platform admin".

- [ ] **Step 1: Add the message key**

In `messages/ar.json`, inside the `"dashboard"` object, add a new key after `"noOrganization"`:

```json
    "noOrganization": "حسابك غير مرتبط بأي منظمة بعد. تواصل مع مدير المنصة.",
    "createOrganizationCta": "أنشئ مؤسستك الآن",
```

In `messages/en.json`, the same object, same position:

```json
    "noOrganization": "Your account isn't linked to an organization yet. Contact the platform admin.",
    "createOrganizationCta": "Create your organization now",
```

- [ ] **Step 2: Add the button to the empty state**

In `app/[locale]/(app)/dashboard/page.tsx`, add the `Link` import and the button:

```tsx
import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect, Link } from "@/i18n/navigation";
import { getCurrentUser, isPlatformAdmin } from "@/lib/auth/session";
import { getPrimaryOrganization } from "@/lib/auth/org-context";
import type { Locale } from "@/i18n/routing";
import { buttonVariants } from "@/components/ui/button";
import { TenantDashboard } from "./tenant-dashboard";
import { PlatformDashboard } from "./platform-dashboard";
```

Then replace the final return block:

```tsx
  const t = await getTranslations("dashboard");
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 py-24 text-center">
      <h1 className="text-xl font-semibold">{t("welcome")}</h1>
      <p className="max-w-md text-sm text-muted-foreground">{t("noOrganization")}</p>
      <Link href="/onboarding" locale={locale as Locale} className={buttonVariants({ variant: "default" })}>
        {t("createOrganizationCta")}
      </Link>
    </div>
  );
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors mentioning `dashboard/page.tsx`.

- [ ] **Step 4: Commit**

```bash
git add "app/[locale]/(app)/dashboard/page.tsx" messages/ar.json messages/en.json
git commit -m "feat(dashboard): add create-organization CTA to the no-org empty state"
```

---

### Task 10: Fix the two broken background images (found during the audit)

**Files:**
- Modify: `app/[locale]/auth/register/page.tsx`
- Modify: `components/auth/auth-shell.tsx`

Both files reference image files that don't exist in `public/images/` (`executive-boardroom.jpg`, `commercial-towers.jpg` — leftovers from before the AqarBooks rebrand), causing a real 400 on every load of the register, verify-email, and (as of Task 7) onboarding pages. `public/images/` actually contains `aqarbooks-hero.jpg`, `aqarbooks-entities.jpg`, `aqarbooks-cashier.jpg`, `aqarbooks-ledger.jpg`.

- [ ] **Step 1: Fix the register page's image**

In `app/[locale]/auth/register/page.tsx`, change:

```tsx
      imageSrc="/images/executive-boardroom.jpg"
```

to:

```tsx
      imageSrc="/images/aqarbooks-hero.jpg"
```

- [ ] **Step 2: Fix AuthShell's default image**

In `components/auth/auth-shell.tsx`, change:

```tsx
  imageSrc = "/images/commercial-towers.jpg",
```

to:

```tsx
  imageSrc = "/images/aqarbooks-hero.jpg",
```

(This default is what `verify-email` and any other `AuthShell` consumer that doesn't pass its own `imageSrc` falls back to — `register/page.tsx` and `onboarding/page.tsx` both pass their own explicit `imageSrc` already, so they're unaffected by this default.)

- [ ] **Step 3: Verify no more references to the missing files**

Run: `grep -rn "executive-boardroom\|commercial-towers" app components`
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add app/\[locale\]/auth/register/page.tsx components/auth/auth-shell.tsx
git commit -m "fix(auth): replace broken hero image references with existing assets"
```

---

### Task 11: End-to-end UI test

**Files:**
- Create: `tests/e2e/onboarding-wizard.spec.ts`

Tests the wizard itself in isolation from the email-confirmation flow (already covered by the RPC test in Task 2 and the manual audit) — creates an already-confirmed user directly via the Admin API, signs in as them through the real login page, and drives the two-step form.

- [ ] **Step 1: Write the spec**

```ts
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

let email: string;
let password: string;
let userId: string;
let organizationId: string | undefined;

test.beforeEach(async () => {
  email = `e2e-onboarding-${Date.now()}@resortos-test.local`;
  password = "TestPassword123!";
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw error;
  userId = data.user.id;
});

test.afterEach(async () => {
  if (organizationId) {
    await admin.from("organizations").delete().eq("id", organizationId);
    organizationId = undefined;
  }
  await admin.auth.admin.deleteUser(userId);
});

test("a freshly confirmed user completes onboarding and lands on a working dashboard", async ({ page }) => {
  await page.goto("/ar/login");
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole("button", { name: /تسجيل الدخول/ }).click();

  await page.waitForURL(/\/ar\/onboarding/, { timeout: 15000 });

  await page.getByPlaceholder("شركة النخبة العقارية").fill("شركة اختبار E2E العقارية");
  await page.getByRole("radio", { name: /إدارة مرافق/ }).click();
  await page.getByRole("button", { name: "التالي" }).click();

  await page.getByPlaceholder("منتجع النخيل الذهبي").fill("مشروع اختبار E2E الأول");
  await page.getByRole("button", { name: "إنشاء المؤسسة" }).click();

  await page.waitForURL(/\/ar\/dashboard/, { timeout: 15000 });
  await expect(page.getByText("حسابك غير مرتبط بأي منظمة بعد")).not.toBeVisible();

  const { data: membership } = await admin
    .from("organization_memberships")
    .select("organization_id, status")
    .eq("user_id", userId)
    .maybeSingle();
  expect(membership?.status).toBe("active");
  organizationId = membership?.organization_id;
});

test("visiting /onboarding a second time after finishing it redirects to the dashboard", async ({ page }) => {
  // create_organization_onboarding reads auth.uid() -- it must be called as
  // the real signed-in user, not the service-role admin client (which has no
  // auth.uid() and would just fail with UNAUTHORIZED). One call, no throwaway
  // first attempt.
  const client = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  const { error: signInErr } = await client.auth.signInWithPassword({ email, password });
  if (signInErr) throw signInErr;

  const { data: rpcData, error } = await client.rpc("create_organization_onboarding", {
    p_org_name: "شركة اختبار إعادة الزيارة",
    p_entity_type: "OTHER",
    p_entity_type_custom_label: "اختبار",
    p_resort_name: "مشروع اختبار",
  });
  if (error) throw error;
  organizationId = rpcData?.organization_id;

  await page.goto("/ar/login");
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole("button", { name: /تسجيل الدخول/ }).click();
  await page.waitForURL(/\/ar\/dashboard/, { timeout: 15000 });

  await page.goto("/ar/onboarding");
  await page.waitForURL(/\/ar\/dashboard/, { timeout: 15000 });
});
```

- [ ] **Step 2: Run it**

Run: `npx playwright test tests/e2e/onboarding-wizard.spec.ts --reporter=list`
Expected: both tests PASS. (Requires the dev server running at the port `playwright.config.ts`'s `baseURL` points to — start it first with `npm run dev` if it isn't already running.)

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/onboarding-wizard.spec.ts
git commit -m "test(e2e): cover the onboarding wizard happy path and re-visit redirect"
```

---

### Task 12: Full manual walkthrough (matches the original audit)

**Files:** none — verification only.

- [ ] **Step 1: Repeat the exact journey from the audit**

With `npm run dev` running:

1. Go to `/ar/auth/register`, fill the form with a real-reachable test email, submit.
2. Confirm the register page no longer shows a 400 for its background image (open browser DevTools Network tab, filter `_next/image`).
3. Follow the confirmation email (or, for a faster loop, use the same Admin API `generateLink` approach from the audit) and click through.
4. Confirm you land on `/ar/onboarding`, not `/ar/dashboard`.
5. Complete both steps with real-looking data. Confirm the submit button shows the loading state, then lands on `/ar/dashboard`.
6. Confirm the dashboard now renders `TenantDashboard` (real data), not the empty state.
7. Log out, log back in, confirm you land directly on the dashboard (not onboarding again).

- [ ] **Step 2: Confirm the dashboard safety-net CTA**

Using the Admin API, create a user with `email_confirm: true` and no organization membership, sign in as them, go to `/ar/dashboard`. Confirm the "أنشئ مؤسستك الآن" button is visible and clicking it lands on `/ar/onboarding`. Clean up the test user afterward the same way the other scripts in this plan do (`admin.auth.admin.deleteUser`).

---

### Task 13: Full-suite verification and tree review

**Files:** none — verification only. This is the plan's final gate: nothing in this feature is "done" until every step below passes and the working tree is clean of anything unintended.

- [ ] **Step 1: Run the project's own full test command**

Run: `npm run test:all`
Expected: every suite it chains passes, including `tests/onboarding.integration.test.ts` and `tests/e2e/onboarding-wizard.spec.ts` from this plan.

- [ ] **Step 2: Typecheck the whole project, not just the files touched here**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors anywhere in the project (a change in `dashboard/page.tsx` or `auth-shell.tsx` could in principle affect a type elsewhere that a single-file check wouldn't catch).

- [ ] **Step 3: Confirm the app actually builds for production**

Run: `npm run build:next`
Expected: build succeeds with no errors. (`npm run build` runs the Cloudflare adapter on top of this — use `build:next` here since the goal is catching Next.js/TypeScript build breakage specifically, not re-verifying the Cloudflare pipeline.)

- [ ] **Step 4: Review the working tree before calling this finished**

Run: `git status --short`
Expected: only the files this plan's tasks intentionally created or modified (Task 1–10's file list) appear, each already committed by its own task. No stray files (e.g. leftover `.qa-scratch`-style debug scripts, accidentally-modified unrelated files, or `.env`/secret files) should be present. If anything unexpected shows up, investigate it before considering the feature complete — don't commit it blindly and don't discard it without understanding what it is.

- [ ] **Step 5: Mark every task's checkboxes `[x]` in this plan file**

Only after Steps 1–4 above genuinely pass — this file is the execution record, not a wishlist. Go back through Tasks 1–12 and flip each `- [ ]` to `- [x]` for the steps actually completed and verified, then commit the plan file itself:

```bash
git add docs/superpowers/plans/2026-08-20-self-service-tenant-onboarding.md
git commit -m "docs: mark self-service tenant onboarding plan complete"
```
