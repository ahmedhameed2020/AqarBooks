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
        <div className="relative">
          <div className="absolute inset-y-0 start-0 flex items-center ps-3.5 pointer-events-none text-slate-400">
            <Mail className="size-4" />
          </div>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            placeholder="name@company.com"
            className="w-full rounded-lg border border-slate-300 bg-white py-2.5 ps-10 pe-4 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/10 transition-all font-mono"
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
            className="text-xs font-semibold text-blue-600 hover:underline"
          >
            {isAr ? "نسيت كلمة المرور؟" : "Forgot password?"}
          </Link>
        </div>
        <div className="relative">
          <div className="absolute inset-y-0 start-0 flex items-center ps-3.5 pointer-events-none text-slate-400">
            <Lock className="size-4" />
          </div>
          <input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            required
            placeholder="••••••••"
            className="w-full rounded-lg border border-slate-300 bg-white py-2.5 ps-10 pe-10 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/10 transition-all"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute inset-y-0 end-0 flex items-center pe-3 text-slate-400 hover:text-slate-600 transition-colors"
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
          className="w-full rounded-lg bg-blue-600 py-3 text-sm font-bold text-white shadow-sm hover:bg-blue-700 active:scale-[0.99] transition-all flex items-center justify-center gap-2 disabled:opacity-70 cursor-pointer"
        >
          {pending ? (
            <>
              <RefreshCw className="size-4 animate-spin" />
              <span>{isAr ? "جارٍ التحقق من الحساب..." : "Signing in..."}</span>
            </>
          ) : (
            <>
              <Check className="size-4" />
              <span>{isAr ? "تسجيل الدخول للمنظومة" : "Sign In to Workspace"}</span>
            </>
          )}
        </button>
      </div>

      {/* Register Link */}
      <div className="text-center pt-3 border-t border-slate-100">
        <p className="text-xs text-slate-500">
          {isAr ? "ليس لديك حساب منشأة؟ " : "Don't have an enterprise account? "}
          <Link href="/auth/register" locale={locale} className="font-bold text-blue-600 hover:underline">
            {isAr ? "إنشاء حساب جديد" : "Create account"}
          </Link>
        </p>
      </div>

    </form>
  );
}
