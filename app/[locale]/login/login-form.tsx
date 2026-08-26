"use client";

import { useState, useActionState } from "react";
import { useTranslations } from "next-intl";
import { Eye, EyeOff, Lock, Mail, Check, RefreshCw, AlertCircle } from "lucide-react";
import { signIn, type SignInState } from "@/lib/actions/auth";
import type { Locale } from "@/i18n/routing";
import { Link } from "@/i18n/navigation";

export function LoginForm({
  locale,
  redirectTo,
}: {
  locale: Locale;
  redirectTo?: string;
}) {
  const isAr = locale === "ar";
  const t = useTranslations("auth.login");
  const [showPassword, setShowPassword] = useState(false);

  const boundSignIn = signIn.bind(null, locale, redirectTo);
  const [state, formAction, pending] = useActionState<SignInState, FormData>(
    boundSignIn,
    { error: null }
  );

  return (
    <form action={formAction} className="space-y-4">
      
      {/* Error Alert */}
      {state.error && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50/90 p-3.5 text-xs font-semibold text-red-700 flex items-center gap-2.5 shadow-2xs"
        >
          <AlertCircle className="size-4 shrink-0 text-red-600" />
          <span>
            {state.error === "invalid_credentials"
              ? isAr
                ? "البريد الإلكتروني أو كلمة المرور غير صحيحة"
                : "Invalid email or password"
              : isAr
              ? "حدث خطأ أثناء تسجيل الدخول. يرجى المحاولة مجدداً."
              : "Authentication failed. Please try again."}
          </span>
        </div>
      )}

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
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            placeholder="name@company.com"
            className="w-full min-h-11 rounded-lg border border-slate-300 bg-white py-2.5 ps-10 pe-4 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/10 transition-all font-mono"
            dir="ltr"
          />
        </div>
      </div>

      {/* Password */}
      <div className="space-y-1.5 text-start">
        <div className="flex items-center justify-between">
          <label className="text-xs font-bold text-slate-700 block">
            {isAr ? "كلمة المرور" : "Password"}
          </label>
          <Link
            href="/auth/forgot-password"
            locale={locale}
            className="text-xs font-semibold text-[#07425d] hover:underline"
          >
            {isAr ? "نسيت كلمة المرور؟" : "Forgot password?"}
          </Link>
        </div>
        <div className="group relative">
          <div className="absolute inset-y-0 start-0 flex items-center ps-3.5 pointer-events-none text-slate-400 transition-colors group-focus-within:text-[#07425d]">
            <Lock className="size-4" />
          </div>
          <input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            required
            placeholder="••••••••"
            className="w-full min-h-11 rounded-lg border border-slate-300 bg-white py-2.5 ps-10 pe-10 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#07425d] focus:outline-none focus:ring-2 focus:ring-[#07425d]/10 transition-all"
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
      </div>

      {/* Submit Button */}
      <div className="pt-2">
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-xl bg-[#07425d] py-3 text-sm font-bold text-white shadow-md shadow-[#07425d]/20 hover:bg-[#053247] active:scale-[0.99] transition-all flex items-center justify-center gap-2 disabled:opacity-70 cursor-pointer"
        >
          {pending ? (
            <>
              <RefreshCw className="size-4 animate-spin" />
              <span>{isAr ? "جارٍ التحقق من الحساب..." : "Signing in..."}</span>
            </>
          ) : (
            <>
              <Check className="size-4" />
              <span>{isAr ? "تسجيل الدخول" : "Sign In"}</span>
            </>
          )}
        </button>
      </div>

      {/* Acquisition block. /get-started is the single canonical
          acquisition/onboarding entry; internal approval steps are an
          operational detail and must never surface in this copy. */}
      <div className="text-center pt-3 border-t border-slate-100 space-y-1.5">
        <p className="text-xs text-slate-500">
          {isAr ? "ليس لديك حساب في AqarBooks؟ " : "Don't have an AqarBooks account? "}
          <Link href="/get-started" locale={locale} className="font-bold text-[#07425d] hover:underline">
            {isAr ? "ابدأ الآن" : "Get started"}
          </Link>
        </p>
        <p className="text-xs text-slate-500">
          {isAr
            ? "أكمل بيانات شركتك واختر الباقة المناسبة للبدء."
            : "Complete your company details and pick the right plan to get started."}
        </p>
        <p className="text-[11px] text-slate-400">
          {isAr ? "تريد استكشاف AqarBooks أولًا؟ " : "Want to explore AqarBooks first? "}
          <Link href="/demo" locale={locale} className="font-semibold text-slate-500 hover:text-[#07425d] hover:underline">
            {isAr ? "جرّب العرض الحي" : "Try the live demo"}
          </Link>
        </p>
      </div>

    </form>
  );
}
