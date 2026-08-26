"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertCircle } from "lucide-react";
import { startOnboardingAccountAction } from "@/lib/actions/onboarding-request";
import type { ActionResult } from "@/lib/actions/platform";
import { useOnboardingWizard, type PlanKey } from "./onboarding-wizard-context";

const ERROR_COPY: Record<string, { ar: string; en: string }> = {
  invalid_input: {
    ar: "توجد بيانات غير صحيحة. تحقق من الحقول وحاول مرة أخرى.",
    en: "Some details are invalid. Please check the fields and try again.",
  },
  rate_limited: {
    ar: "تم إجراء عدة محاولات متتالية. حاول مرة أخرى بعد قليل.",
    en: "Too many attempts. Please try again shortly.",
  },
  submission_failed: {
    ar: "تعذّر إنشاء الحساب. حاول مرة أخرى.",
    en: "We couldn't create your account. Please try again.",
  },
};

export function AccountStepForm({ locale, initialPlan }: { locale: Locale; initialPlan?: PlanKey }) {
  const isAr = locale === "ar";
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(startOnboardingAccountAction, {
    ok: true,
  });

  // Pre-seed the plan the visitor arrived with (e.g. from a pricing card's
  // /get-started?plan=STARTER link) so it's already selected once they
  // reach the Plan step -- purely a convenience, unrelated to the account
  // this step actually creates.
  const { planKey, setPlanKey } = useOnboardingWizard();
  const seededPlan = useRef(false);
  useEffect(() => {
    if (!seededPlan.current && !planKey && initialPlan) {
      setPlanKey(initialPlan);
    }
    seededPlan.current = true;
  }, [initialPlan, planKey, setPlanKey]);

  const [confirmPassword, setConfirmPassword] = useState("");
  const [password, setPassword] = useState("");
  const passwordsTyped = confirmPassword.length > 0;
  const passwordsMismatch = passwordsTyped && password !== confirmPassword;

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="locale" value={locale} />
      {/* Honeypot -- never rendered visibly, a real visitor never touches it. */}
      <input type="text" name="website" defaultValue="" className="hidden" tabIndex={-1} autoComplete="off" aria-hidden="true" />

      <div className="space-y-2">
        <Label htmlFor="fullName">{isAr ? "الاسم الكامل" : "Full name"}</Label>
        <Input id="fullName" name="fullName" required minLength={2} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="workEmail">{isAr ? "البريد الإلكتروني المهني" : "Work email"}</Label>
        <Input id="workEmail" name="workEmail" type="email" dir="ltr" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="phone">{isAr ? "رقم الهاتف (اختياري)" : "Phone (optional)"}</Label>
        <Input id="phone" name="phone" type="tel" dir="ltr" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="password">{isAr ? "كلمة المرور" : "Password"}</Label>
          <Input
            id="password"
            name="password"
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirmPassword">{isAr ? "تأكيد كلمة المرور" : "Confirm password"}</Label>
          <Input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            required
            minLength={8}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
        </div>
      </div>
      {passwordsMismatch && (
        <p className="text-xs font-medium text-destructive">
          {isAr ? "كلمتا المرور غير متطابقتين" : "Passwords do not match"}
        </p>
      )}

      {!state.ok && (
        <div role="alert" className="flex items-center gap-2 text-sm text-destructive">
          <AlertCircle className="size-4 shrink-0" />
          <span>{isAr ? ERROR_COPY[state.error]?.ar ?? state.error : ERROR_COPY[state.error]?.en ?? state.error}</span>
        </div>
      )}

      <p className="text-center text-xs text-slate-500">
        {isAr ? "لديك حساب بالفعل؟ " : "Already have an account? "}
        <Link href="/login?redirect_to=/get-started/company" locale={locale} className="font-bold text-[#07425d] hover:underline">
          {isAr ? "تسجيل الدخول" : "Sign in"}
        </Link>
      </p>

      <Button type="submit" className="w-full" disabled={pending || passwordsMismatch}>
        {pending ? (isAr ? "جارٍ إنشاء الحساب..." : "Creating account...") : isAr ? "متابعة" : "Continue"}
      </Button>
    </form>
  );
}
