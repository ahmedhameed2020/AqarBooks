"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertCircle } from "lucide-react";
import { useOnboardingWizard, type PlanKey } from "./onboarding-wizard-context";

const ERROR_COPY: Record<string, { ar: string; en: string }> = {
  full_name_required: { ar: "الاسم الكامل مطلوب (حرفان على الأقل)", en: "Full name is required (at least 2 characters)" },
  email_invalid: { ar: "البريد الإلكتروني غير صحيح", en: "Enter a valid email address" },
  password_too_short: { ar: "كلمة المرور يجب ألا تقل عن 8 أحرف", en: "Password must be at least 8 characters" },
  password_mismatch: { ar: "كلمتا المرور غير متطابقتين", en: "Passwords do not match" },
};

export function AccountStepForm({ locale, initialPlan }: { locale: Locale; initialPlan?: PlanKey }) {
  const isAr = locale === "ar";
  const router = useRouter();
  const { account, setAccount, planKey, setPlanKey } = useOnboardingWizard();

  const seededPlan = useRef(false);
  useEffect(() => {
    if (!seededPlan.current && !planKey && initialPlan) {
      setPlanKey(initialPlan);
    }
    seededPlan.current = true;
  }, [initialPlan, planKey, setPlanKey]);

  const [fullName, setFullName] = useState(account?.fullName ?? "");
  const [workEmail, setWorkEmail] = useState(account?.workEmail ?? "");
  const [phone, setPhone] = useState(account?.phone ?? "");
  const [password, setPassword] = useState(account?.password ?? "");
  const [confirmPassword, setConfirmPassword] = useState(account?.confirmPassword ?? "");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    if (fullName.trim().length < 2) return setError("full_name_required");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(workEmail.trim())) return setError("email_invalid");
    if (password.length < 8) return setError("password_too_short");
    if (password !== confirmPassword) return setError("password_mismatch");

    setError(null);
    setAccount({
      fullName: fullName.trim(),
      workEmail: workEmail.trim(),
      phone: phone.trim(),
      password,
      confirmPassword,
    });
    router.push("/get-started/company");
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="fullName">{isAr ? "الاسم الكامل" : "Full name"}</Label>
        <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="workEmail">{isAr ? "البريد الإلكتروني المهني" : "Work email"}</Label>
        <Input
          id="workEmail"
          type="email"
          dir="ltr"
          value={workEmail}
          onChange={(e) => setWorkEmail(e.target.value)}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="phone">{isAr ? "رقم الهاتف (اختياري)" : "Phone (optional)"}</Label>
        <Input id="phone" type="tel" dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="password">{isAr ? "كلمة المرور" : "Password"}</Label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirmPassword">{isAr ? "تأكيد كلمة المرور" : "Confirm password"}</Label>
          <Input
            id="confirmPassword"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            minLength={8}
          />
        </div>
      </div>

      {error && (
        <div role="alert" className="flex items-center gap-2 text-sm text-destructive">
          <AlertCircle className="size-4 shrink-0" />
          <span>{isAr ? ERROR_COPY[error]?.ar : ERROR_COPY[error]?.en}</span>
        </div>
      )}

      <Button type="submit" className="w-full">
        {isAr ? "متابعة" : "Continue"}
      </Button>
    </form>
  );
}
