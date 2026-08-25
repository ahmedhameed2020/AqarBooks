"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { CURRENCY_CODES } from "@/lib/currency";
import { denyIfDemo } from "@/lib/demo/guard";

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
  // Refused inside the public demo before anything is touched.
  const demoRefusal = await denyIfDemo();
  if (demoRefusal) return demoRefusal;

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
  // "as never": create_organization_onboarding postdates the last
  // lib/supabase/types.ts generation, so it isn't in the generated RPC
  // union yet -- same cast already used for other newly-added RPCs
  // (see tests/credit-notes.integration.test.ts).
  const { data, error } = await supabase.rpc("create_organization_onboarding" as never, {
    p_org_name: parsed.data.orgName,
    p_entity_type: parsed.data.entityType,
    p_entity_type_custom_label: parsed.data.customLabel,
    p_resort_name: parsed.data.resortName,
    p_resort_code: parsed.data.resortCode,
    p_default_currency: parsed.data.currency,
  } as never);

  if (error) {
    const code = error.message.split(":")[0].trim();

    if (code === "ALREADY_HAS_ORGANIZATION") {
      return redirect({ href: "/dashboard", locale });
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

  // The RPC returns jsonb, and its shape ({success, organization_id,
  // resort_id, slug}) is proven by tests/onboarding.integration.test.ts,
  // not by the type system (the "as never" call above has no return typing).
  const result = data as { success?: boolean } | null;
  if (!result?.success) {
    console.error("[completeOnboarding] RPC returned success:false unexpectedly", data);
    return { ok: false, error: "حصل خطأ من عندنا، جرّب تاني بعد لحظات" };
  }

  return redirect({ href: "/dashboard", locale });
}
