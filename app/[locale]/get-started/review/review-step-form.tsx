"use client";

import { useEffect } from "react";
import { useActionState } from "react";
import { useRouter } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { Button } from "@/components/ui/button";
import { AlertCircle } from "lucide-react";
import { submitOnboardingRequestAction } from "@/lib/actions/onboarding-request";
import type { ActionResult } from "@/lib/actions/platform";
import { useOnboardingWizard } from "../onboarding-wizard-context";

const ENTITY_TYPE_LABELS: Record<string, { ar: string; en: string }> = {
  DEVELOPER: { ar: "مطوّر عقاري", en: "Developer" },
  FACILITY_MANAGEMENT: { ar: "إدارة مرافق", en: "Facility Management" },
  OWNERS_ASSOCIATION: { ar: "اتحاد ملاك", en: "Owners Association" },
  INDIVIDUAL_OWNER: { ar: "مالك فردي", en: "Individual Owner" },
  TOURIST_RESORT: { ar: "منتجع سياحي", en: "Tourist Resort" },
  TOURIST_VILLAGE: { ar: "قرية سياحية", en: "Tourist Village" },
  RESIDENTIAL_COMPOUND: { ar: "كمبوند سكني", en: "Residential Compound" },
  OTHER: { ar: "أخرى", en: "Other" },
};

const PLAN_LABELS: Record<string, { ar: string; en: string }> = {
  STARTER: { ar: "الأساسيات", en: "Essential" },
  PROFESSIONAL: { ar: "المتقدمة", en: "Professional" },
  ENTERPRISE: { ar: "المؤسسات", en: "Enterprise" },
};

const ERROR_COPY: Record<string, { ar: string; en: string }> = {
  invalid_input: { ar: "توجد بيانات غير صحيحة. يرجى مراجعة الخطوات السابقة.", en: "Some details are invalid. Please review the previous steps." },
  rate_limited: { ar: "تم إجراء عدة محاولات متتالية. حاول مرة أخرى بعد قليل.", en: "Too many attempts. Please try again shortly." },
  email_already_registered: {
    ar: "هذا البريد الإلكتروني مسجّل بالفعل. سجّل الدخول أو استخدم بريدًا آخر.",
    en: "This email is already registered. Sign in instead, or use a different email.",
  },
  submission_failed: { ar: "تعذّر إرسال الطلب. حاول مرة أخرى.", en: "We couldn't submit your request. Please try again." },
};

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5 text-sm">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium text-slate-900 text-end">{value}</span>
    </div>
  );
}

export function ReviewStepForm({ locale }: { locale: Locale }) {
  const isAr = locale === "ar";
  const router = useRouter();
  const { account, company, planKey } = useOnboardingWizard();

  useEffect(() => {
    if (!account) {
      router.replace("/get-started");
    } else if (!company) {
      router.replace("/get-started/company");
    } else if (!planKey) {
      router.replace("/get-started/plan");
    }
  }, [account, company, planKey, router]);

  const [state, formAction, pending] = useActionState<ActionResult, FormData>(submitOnboardingRequestAction, {
    ok: true,
  });

  if (!account || !company || !planKey) {
    return null;
  }

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="fullName" value={account.fullName} />
      <input type="hidden" name="workEmail" value={account.workEmail} />
      <input type="hidden" name="phone" value={account.phone} />
      <input type="hidden" name="password" value={account.password} />
      <input type="hidden" name="confirmPassword" value={account.confirmPassword} />
      <input type="hidden" name="organizationName" value={company.organizationName} />
      <input type="hidden" name="entityType" value={company.entityType} />
      <input type="hidden" name="entityTypeCustomLabel" value={company.entityTypeCustomLabel} />
      <input type="hidden" name="country" value={company.country} />
      <input type="hidden" name="city" value={company.city} />
      <input type="hidden" name="expectedPropertiesCount" value={company.expectedPropertiesCount} />
      <input type="hidden" name="expectedUnitsCount" value={company.expectedUnitsCount} />
      <input type="hidden" name="notes" value={company.notes} />
      <input type="hidden" name="requestedPlanKey" value={planKey} />
      {/* Honeypot -- never rendered visibly, a real visitor never touches it. */}
      <input type="text" name="website" defaultValue="" className="hidden" tabIndex={-1} autoComplete="off" aria-hidden="true" />

      <section className="rounded-xl border border-slate-200 p-4">
        <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
          {isAr ? "الحساب" : "Account"}
        </h3>
        <SummaryRow label={isAr ? "الاسم" : "Name"} value={account.fullName} />
        <SummaryRow label={isAr ? "البريد الإلكتروني" : "Email"} value={account.workEmail} />
        {account.phone && <SummaryRow label={isAr ? "الهاتف" : "Phone"} value={account.phone} />}
      </section>

      <section className="rounded-xl border border-slate-200 p-4">
        <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
          {isAr ? "المنشأة" : "Company"}
        </h3>
        <SummaryRow label={isAr ? "الاسم" : "Name"} value={company.organizationName} />
        <SummaryRow
          label={isAr ? "النوع" : "Type"}
          value={
            company.entityType === "OTHER"
              ? company.entityTypeCustomLabel
              : isAr
                ? ENTITY_TYPE_LABELS[company.entityType]?.ar ?? company.entityType
                : ENTITY_TYPE_LABELS[company.entityType]?.en ?? company.entityType
          }
        />
        {(company.country || company.city) && (
          <SummaryRow label={isAr ? "الموقع" : "Location"} value={[company.city, company.country].filter(Boolean).join(", ")} />
        )}
        {(company.expectedPropertiesCount || company.expectedUnitsCount) && (
          <SummaryRow
            label={isAr ? "الحجم المتوقع" : "Expected scale"}
            value={`${company.expectedPropertiesCount || "—"} ${isAr ? "مشروع" : "properties"} · ${company.expectedUnitsCount || "—"} ${isAr ? "وحدة" : "units"}`}
          />
        )}
      </section>

      <section className="rounded-xl border border-slate-200 p-4">
        <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
          {isAr ? "الباقة المختارة" : "Selected plan"}
        </h3>
        <SummaryRow label={isAr ? "الباقة" : "Plan"} value={isAr ? PLAN_LABELS[planKey].ar : PLAN_LABELS[planKey].en} />
      </section>

      {!state.ok && (
        <div role="alert" className="flex items-center gap-2 text-sm text-destructive">
          <AlertCircle className="size-4 shrink-0" />
          <span>{isAr ? ERROR_COPY[state.error]?.ar ?? state.error : ERROR_COPY[state.error]?.en ?? state.error}</span>
        </div>
      )}

      <div className="flex gap-3">
        <Button type="button" variant="outline" onClick={() => router.push("/get-started/plan")} className="flex-1" disabled={pending}>
          {isAr ? "رجوع" : "Back"}
        </Button>
        <Button type="submit" className="flex-1" disabled={pending}>
          {pending ? (isAr ? "جارٍ الإرسال..." : "Submitting...") : isAr ? "إرسال الطلب" : "Submit request"}
        </Button>
      </div>
    </form>
  );
}
