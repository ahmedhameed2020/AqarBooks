"use client";

import { useState, useTransition } from "react";
import { Mail, Check, RefreshCw, AlertCircle, CheckCircle2, ArrowLeft, ArrowRight } from "lucide-react";
import { requestPasswordResetAction } from "@/lib/actions/auth";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";

export function ForgotPasswordForm({ locale }: { locale: Locale }) {
  const isAr = locale === "ar";
  const [email, setEmail] = useState("");
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    startTransition(async () => {
      // Build redirect URL for password reset flow
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      const resetRedirectUrl = origin ? `${origin}/auth/callback?next=/${locale}/auth/reset-password` : undefined;

      const res = await requestPasswordResetAction(email, resetRedirectUrl);

      if (res.ok) {
        setIsSubmitted(true);
      } else {
        setErrorMsg(
          res.error ||
            (isAr
              ? "تعذر إرسال رابط الاستعادة. يرجى التأكد من البريد والمحاولة ثانية."
              : "Failed to send reset link. Please check your email and try again.")
        );
      }
    });
  };

  if (isSubmitted) {
    return (
      <div className="space-y-6 text-center">
        <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 border border-emerald-200 shadow-xs">
          <CheckCircle2 className="size-7" />
        </div>

        <div className="space-y-2">
          <h3 className="text-lg font-bold text-slate-900">
            {isAr ? "تم إرسال رابط الاستعادة بنجاح" : "Reset Link Sent Successfully"}
          </h3>
          <p className="text-xs sm:text-sm text-slate-600 leading-relaxed max-w-sm mx-auto">
            {isAr ? (
              <>
                إذا كان البريد <span className="font-semibold text-slate-900 font-mono" dir="ltr">{email}</span> مسجلاً لدينا، فستصلك رسالة تحتوي على رابط لتعيين كلمة مرور جديدة.
              </>
            ) : (
              <>
                If an account exists for <span className="font-semibold text-slate-900 font-mono">{email}</span>, you will receive an email with instructions to reset your password.
              </>
            )}
          </p>
        </div>

        <div className="pt-2 space-y-3">
          <button
            type="button"
            onClick={() => {
              setIsSubmitted(false);
              setEmail("");
            }}
            className="text-xs font-semibold text-blue-600 hover:underline block w-full"
          >
            {isAr ? "إعادة إرسال الرابط لبريد آخر" : "Send reset link to a different email"}
          </button>

          <Link
            href="/login"
            locale={locale}
            className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 py-2.5 text-xs font-bold transition-all"
          >
            {isAr ? <ArrowRight className="size-3.5" /> : <ArrowLeft className="size-3.5" />}
            <span>{isAr ? "العودة إلى تسجيل الدخول" : "Back to Sign In"}</span>
          </Link>
        </div>
      </div>
    );
  }

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

      {/* Info helper */}
      <p className="text-xs text-slate-600 leading-relaxed text-start">
        {isAr
          ? "أدخل بريدك الإلكتروني المسجل في المنصة وسنرسل لك رابطاً آمناً لإعادة تعيين كلمة المرور."
          : "Enter your registered email address and we'll send you a secure link to reset your password."}
      </p>

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
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@company.com"
            className="w-full rounded-lg border border-slate-300 bg-white py-2.5 ps-10 pe-4 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/10 transition-all font-mono"
            dir="ltr"
          />
        </div>
      </div>

      {/* Submit Button */}
      <div className="pt-2">
        <button
          type="submit"
          disabled={isPending}
          className="w-full rounded-lg bg-blue-600 py-3 text-sm font-bold text-white shadow-sm hover:bg-blue-700 active:scale-[0.99] transition-all flex items-center justify-center gap-2 disabled:opacity-70 cursor-pointer"
        >
          {isPending ? (
            <>
              <RefreshCw className="size-4 animate-spin" />
              <span>{isAr ? "جارٍ إرسال الرابط..." : "Sending reset link..."}</span>
            </>
          ) : (
            <>
              <Check className="size-4" />
              <span>{isAr ? "إرسال رابط إعادة التعيين" : "Send Reset Link"}</span>
            </>
          )}
        </button>
      </div>

      {/* Back to login */}
      <div className="text-center pt-3 border-t border-slate-100">
        <p className="text-xs text-slate-500">
          {isAr ? "تذكرت كلمة المرور؟ " : "Remembered your password? "}
          <Link href="/login" locale={locale} className="font-bold text-blue-600 hover:underline">
            {isAr ? "تسجيل الدخول" : "Sign in"}
          </Link>
        </p>
      </div>
    </form>
  );
}
