"use client";

import { useState, useActionState, useRef } from "react";
import { useTranslations } from "next-intl";
import { 
  Eye, 
  EyeOff, 
  Lock, 
  Mail, 
  ArrowRight, 
  ArrowLeft,
  RefreshCw, 
  AlertCircle,
  Zap,
  CheckCircle2
} from "lucide-react";
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
  const [showPassword, setShowPassword] = useState(false);
  const [capsLockActive, setCapsLockActive] = useState(false);
  const [emailValue, setEmailValue] = useState("");
  const [passwordValue, setPasswordValue] = useState("");
  const [demoLoaded, setDemoLoaded] = useState(false);
  const emailInputRef = useRef<HTMLInputElement>(null);

  const boundSignIn = signIn.bind(null, locale, redirectTo);
  const [state, formAction, pending] = useActionState<SignInState, FormData>(
    boundSignIn,
    { error: null }
  );

  const handleKeyUp = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.getModifierState) {
      setCapsLockActive(e.getModifierState("CapsLock"));
    }
  };

  const handleFillDemo = () => {
    setEmailValue("demo@aqarbooks.com");
    setPasswordValue("demo123456");
    setDemoLoaded(true);
    setTimeout(() => setDemoLoaded(false), 2500);
  };

  const SubmitArrow = isAr ? ArrowLeft : ArrowRight;

  return (
    <form action={formAction} className="space-y-4">
      
      {/* Quick Demo Autofill Banner */}
      <div className="flex items-center justify-between p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-xs">
        <div className="flex items-center gap-2 text-blue-300">
          <Zap className="size-3.5 text-blue-400 shrink-0" />
          <span className="font-medium text-[11px]">
            {isAr ? "ترغب في استكشاف المنظومة سريعاً؟" : "Want to test the platform quickly?"}
          </span>
        </div>
        <button
          type="button"
          onClick={handleFillDemo}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-[11px] shadow-sm transition-all active:scale-95 cursor-pointer"
        >
          {demoLoaded ? (
            <>
              <CheckCircle2 className="size-3 text-emerald-300" />
              <span>{isAr ? "تم ملء البيانات" : "Filled"}</span>
            </>
          ) : (
            <span>{isAr ? "تعبئة حساب تجريبي" : "Fill Demo"}</span>
          )}
        </button>
      </div>

      {/* Error Alert */}
      {state.error && (
        <div
          role="alert"
          className="rounded-xl border border-red-500/30 bg-red-950/50 p-3.5 text-xs font-semibold text-red-300 flex items-center gap-2.5 shadow-sm animate-shake"
        >
          <AlertCircle className="size-4 shrink-0 text-red-400" />
          <span>
            {state.error === "invalid_credentials"
              ? isAr
                ? "البريد الإلكتروني أو كلمة المرور غير صحيحة. يرجى التحقق وإعادة المحاولة."
                : "Invalid business email or password. Please verify and retry."
              : isAr
              ? "حدث خطأ أثناء الاتصال بالخادم. يرجى المحاولة مجدداً."
              : "Authentication failed. Please try again."}
          </span>
        </div>
      )}

      {/* Email Address */}
      <div className="space-y-1.5 text-start">
        <label htmlFor="email" className="text-xs font-bold text-slate-300 block">
          {isAr ? "البريد الإلكتروني المهني" : "Business Email"}
        </label>
        <div className="relative">
          <div className="absolute inset-y-0 start-0 flex items-center ps-3.5 pointer-events-none text-slate-500">
            <Mail className="size-4" />
          </div>
          <input
            id="email"
            name="email"
            type="email"
            ref={emailInputRef}
            value={emailValue}
            onChange={(e) => setEmailValue(e.target.value)}
            autoComplete="email"
            required
            placeholder="name@company.com"
            className="w-full rounded-xl border border-slate-700 bg-slate-800/80 py-2.5 ps-10 pe-4 text-sm text-white placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all font-mono"
            dir="ltr"
          />
        </div>
      </div>

      {/* Password */}
      <div className="space-y-1.5 text-start">
        <div className="flex items-center justify-between">
          <label htmlFor="password" className="text-xs font-bold text-slate-300 block">
            {isAr ? "كلمة المرور" : "Password"}
          </label>
          <Link
            href="/auth/forgot-password"
            locale={locale}
            className="text-xs font-medium text-blue-400 hover:text-blue-300 hover:underline transition-colors"
          >
            {isAr ? "نسيت كلمة المرور؟" : "Forgot password?"}
          </Link>
        </div>
        <div className="relative">
          <div className="absolute inset-y-0 start-0 flex items-center ps-3.5 pointer-events-none text-slate-500">
            <Lock className="size-4" />
          </div>
          <input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            value={passwordValue}
            onChange={(e) => setPasswordValue(e.target.value)}
            onKeyUp={handleKeyUp}
            onKeyDown={handleKeyUp}
            autoComplete="current-password"
            required
            placeholder="••••••••"
            className="w-full rounded-xl border border-slate-700 bg-slate-800/80 py-2.5 ps-10 pe-10 text-sm text-white placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute inset-y-0 end-0 flex items-center pe-3 text-slate-500 hover:text-slate-300 transition-colors cursor-pointer"
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>

        {/* Caps Lock Alert */}
        {capsLockActive && (
          <div className="flex items-center gap-1.5 pt-1 text-[11px] text-amber-400 font-medium">
            <AlertCircle className="size-3.5" />
            <span>{isAr ? "تنبيه: زر الحروف الكبيرة (Caps Lock) مفعّل" : "Warning: Caps Lock is on"}</span>
          </div>
        )}
      </div>

      {/* Remember Me Option */}
      <div className="flex items-center justify-between pt-1">
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            name="remember"
            defaultChecked
            className="size-4 rounded border-slate-700 bg-slate-800 text-blue-600 focus:ring-blue-500/20 focus:ring-offset-0 transition-all cursor-pointer accent-blue-600"
          />
          <span className="text-xs text-slate-400">
            {isAr ? "تذكر بيانات هذا الجهاز" : "Remember this device"}
          </span>
        </label>
      </div>

      {/* Submit Button */}
      <div className="pt-2">
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 py-3 text-sm font-bold text-white shadow-lg shadow-blue-600/30 active:scale-[0.99] transition-all flex items-center justify-center gap-2 disabled:opacity-60 cursor-pointer"
        >
          {pending ? (
            <>
              <RefreshCw className="size-4 animate-spin" />
              <span>{isAr ? "جارٍ التحقق والمصادقة..." : "Signing in..."}</span>
            </>
          ) : (
            <>
              <span>{isAr ? "تسجيل الدخول للمنظومة" : "Sign In to Workspace"}</span>
              <SubmitArrow className="size-4" />
            </>
          )}
        </button>
      </div>

      {/* Register Link */}
      <div className="text-center pt-3 border-t border-slate-800">
        <p className="text-xs text-slate-400">
          {isAr ? "ليس لديك حساب منشأة؟ " : "Don't have an enterprise account? "}
          <Link href="/auth/register" locale={locale} className="font-bold text-blue-400 hover:text-blue-300 hover:underline">
            {isAr ? "إنشاء حساب مؤسسي جديد" : "Create account"}
          </Link>
        </p>
      </div>

    </form>
  );
}
