"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Lock, Mail, User, Check, RefreshCw, AlertCircle, X } from "lucide-react";
import { signUpAction } from "@/lib/actions/auth";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { PasswordStrengthMeter } from "@/components/auth/password-strength-meter";

export function RegisterForm({ locale }: { locale: string }) {
  const isAr = locale === "ar";
  const router = useRouter();

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [acceptTerms, setAcceptTerms] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (password !== confirmPassword) {
      setErrorMsg(isAr ? "كلمتا المرور غير متطابقتين" : "Passwords do not match");
      return;
    }

    if (!acceptTerms) {
      setErrorMsg(
        isAr
          ? "يجب الموافقة على شروط الخدمة وسياسة الخصوصية للمتابعة"
          : "Terms acceptance required"
      );
      return;
    }

    startTransition(async () => {
      const formData = new FormData();
      formData.set("fullName", fullName);
      formData.set("email", email);
      formData.set("password", password);
      formData.set("confirmPassword", confirmPassword);
      if (acceptTerms) formData.set("acceptTerms", "true");

      const res = await signUpAction(formData);

      if (res.ok) {
        if (res.requiresVerification) {
          router.push(
            `/${locale}/auth/verify-email?email=${encodeURIComponent(email)}`
          );
        } else {
          router.push(`/${locale}/onboarding`);
        }
      } else {
        setErrorMsg(
          res.error ||
            (isAr ? "حدث خطأ أثناء إنشاء الحساب" : "Registration failed")
        );
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Error Alert */}
      {errorMsg && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50/90 p-3.5 text-xs font-semibold text-red-700 flex items-center gap-2.5 shadow-2xs"
        >
          <AlertCircle className="size-4 shrink-0 text-red-600" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Full Name */}
      <div className="space-y-1.5 text-start">
        <label className="text-xs font-bold text-slate-700 block">
          {isAr ? "الاسم الكامل" : "Full Name"}
        </label>
        <div className="group relative">
          <div className="absolute inset-y-0 start-0 flex items-center ps-3.5 pointer-events-none text-slate-400 transition-colors group-focus-within:text-blue-600">
            <User className="size-4" />
          </div>
          <input
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder={isAr ? "أحمد حامد" : "Ahmed Hameed"}
            className="w-full min-h-11 rounded-lg border border-slate-300 bg-white py-2.5 ps-10 pe-4 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/10 transition-all"
            required
          />
        </div>
      </div>

      {/* Email Address */}
      <div className="space-y-1.5 text-start">
        <label className="text-xs font-bold text-slate-700 block">
          {isAr ? "البريد الإلكتروني المهني" : "Business Email"}
        </label>
        <div className="group relative">
          <div className="absolute inset-y-0 start-0 flex items-center ps-3.5 pointer-events-none text-slate-400 transition-colors group-focus-within:text-blue-600">
            <Mail className="size-4" />
          </div>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@company.com"
            className="w-full min-h-11 rounded-lg border border-slate-300 bg-white py-2.5 ps-10 pe-4 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/10 transition-all font-mono"
            required
            dir="ltr"
          />
        </div>
      </div>

      {/* Password & Confirm Password (2 Columns on sm screens) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-start">
        {/* Password */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-slate-700 block">
            {isAr ? "كلمة المرور" : "Password"}
          </label>
          <div className="group relative">
            <div className="absolute inset-y-0 start-0 flex items-center ps-3.5 pointer-events-none text-slate-400 transition-colors group-focus-within:text-blue-600">
              <Lock className="size-4" />
            </div>
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full min-h-11 rounded-lg border border-slate-300 bg-white py-2.5 ps-10 pe-10 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/10 transition-all"
              required
              minLength={8}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute inset-y-0 end-0 flex min-w-11 items-center justify-end pe-3 text-slate-400 hover:text-slate-600 transition-colors"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
          <PasswordStrengthMeter password={password} isAr={isAr} />
        </div>

        {/* Confirm Password */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-slate-700 block">
            {isAr ? "تأكيد كلمة المرور" : "Confirm Password"}
          </label>
          <div className="group relative">
            <div className="absolute inset-y-0 start-0 flex items-center ps-3.5 pointer-events-none text-slate-400 transition-colors group-focus-within:text-blue-600">
              <Lock className="size-4" />
            </div>
            <input
              type={showConfirmPassword ? "text" : "password"}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
              className={`w-full min-h-11 rounded-lg border bg-white py-2.5 ps-10 pe-10 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 transition-all ${
                confirmPassword && password !== confirmPassword
                  ? "border-red-300 focus:border-red-500 focus:ring-red-500/10"
                  : "border-slate-300 focus:border-blue-600 focus:ring-blue-600/10"
              }`}
              required
              minLength={8}
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              className="absolute inset-y-0 end-0 flex min-w-11 items-center justify-end pe-3 text-slate-400 hover:text-slate-600 transition-colors"
              aria-label={showConfirmPassword ? "Hide password" : "Show password"}
            >
              {showConfirmPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
          {confirmPassword && (
            <p
              className={`flex items-center gap-1 pt-1 text-[10px] font-bold ${
                password === confirmPassword ? "text-emerald-600" : "text-red-600"
              }`}
            >
              {password === confirmPassword ? (
                <Check className="size-3" />
              ) : (
                <X className="size-3" />
              )}
              {password === confirmPassword
                ? isAr
                  ? "كلمتا المرور متطابقتان"
                  : "Passwords match"
                : isAr
                  ? "كلمتا المرور غير متطابقتين"
                  : "Passwords don't match"}
            </p>
          )}
        </div>
      </div>

      {/* Terms & Privacy Checkbox */}
      <div className="pt-2 flex items-start gap-2.5 text-start">
        <button
          type="button"
          role="checkbox"
          aria-checked={acceptTerms}
          id="acceptTerms"
          onClick={() => setAcceptTerms((v) => !v)}
          className={`hit-target mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border transition-colors cursor-pointer ${
            acceptTerms
              ? "border-[#07425d] bg-[#07425d] text-white"
              : "border-slate-300 bg-white hover:border-[#07425d]/60"
          }`}
        >
          {acceptTerms && <Check className="size-3" strokeWidth={3} />}
        </button>
        <label
          htmlFor="acceptTerms"
          onClick={() => setAcceptTerms((v) => !v)}
          className="text-xs text-slate-600 select-none cursor-pointer leading-relaxed"
        >
          {isAr ? "أوافق على " : "I agree to "}
          <Link
            href="/terms"
            locale={locale as Locale}
            onClick={(e) => e.stopPropagation()}
            className="font-bold text-[#07425d] hover:underline"
          >
            {isAr ? "شروط الخدمة" : "Terms of Service"}
          </Link>
          {isAr ? " و" : " and "}
          <Link
            href="/privacy"
            locale={locale as Locale}
            onClick={(e) => e.stopPropagation()}
            className="font-bold text-[#07425d] hover:underline"
          >
            {isAr ? "سياسة الخصوصية وحماية البيانات" : "Privacy Policy"}
          </Link>
        </label>
      </div>

      {/* Submit Button */}
      <div className="pt-3">
        <button
          type="submit"
          disabled={isPending}
          className="w-full rounded-xl bg-[#07425d] py-3 text-sm font-bold text-white shadow-md shadow-[#07425d]/20 hover:bg-[#053247] active:scale-[0.99] transition-all flex items-center justify-center gap-2 disabled:opacity-70 cursor-pointer"
        >
          {isPending ? (
            <>
              <RefreshCw className="size-4 animate-spin" />
              <span>{isAr ? "جارٍ إنشاء الحساب المؤسسي..." : "Setting Up Account..."}</span>
            </>
          ) : (
            <>
              <Check className="size-4" />
              <span>{isAr ? "إنشاء الحساب المالي" : "Create Enterprise Account"}</span>
            </>
          )}
        </button>
      </div>

      {/* Sign In Redirect */}
      <div className="text-center pt-3 border-t border-slate-100">
        <p className="text-xs text-slate-500">
          {isAr ? "لديك حساب بالفعل؟ " : "Already have an account? "}
          <Link
            href="/login"
            locale={locale as Locale}
            className="font-bold text-[#07425d] hover:underline"
          >
            {isAr ? "تسجيل الدخول" : "Sign in"}
          </Link>
        </p>
      </div>
    </form>
  );
}
