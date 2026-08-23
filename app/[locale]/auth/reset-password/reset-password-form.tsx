"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, Lock, Check, RefreshCw, AlertCircle, CheckCircle2, X } from "lucide-react";
import { updatePasswordAction } from "@/lib/actions/auth";
import { createClient } from "@/lib/supabase/client";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { PasswordStrengthMeter } from "@/components/auth/password-strength-meter";

export function ResetPasswordForm({ locale }: { locale: Locale }) {
  const isAr = locale === "ar";
  const router = useRouter();
  const searchParams = useSearchParams();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  useEffect(() => {
    const code = searchParams.get("code");
    if (code) {
      const supabase = createClient();
      supabase.auth.exchangeCodeForSession(code).catch((err) => {
        console.error("Failed to exchange code for session:", err);
      });
    }
  }, [searchParams]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (password !== confirmPassword) {
      setErrorMsg(isAr ? "كلمتا المرور غير متطابقتين" : "Passwords do not match");
      return;
    }

    if (password.length < 8) {
      setErrorMsg(isAr ? "كلمة المرور يجب ألا تقل عن 8 خانات" : "Password must be at least 8 characters");
      return;
    }

    startTransition(async () => {
      const res = await updatePasswordAction(password, confirmPassword);

      if (res.ok) {
        setIsSuccess(true);
        setTimeout(() => {
          router.push(`/${locale}/dashboard`);
        }, 2000);
      } else {
        setErrorMsg(
          res.error ||
            (isAr
              ? "تعذر تحديث كلمة المرور. قد تكون صلاحية الرابط قد انتهت."
              : "Failed to update password. The link might have expired.")
        );
      }
    });
  };

  if (isSuccess) {
    return (
      <div className="space-y-6 text-center">
        <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 border border-emerald-200 shadow-xs">
          <CheckCircle2 className="size-7" />
        </div>

        <div className="space-y-2">
          <h3 className="text-lg font-bold text-slate-900">
            {isAr ? "تم تحديث كلمة المرور بنجاح!" : "Password Updated Successfully!"}
          </h3>
          <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
            {isAr
              ? "جاري تحويلك إلى لوحة التحكم الخاصة بك..."
              : "Redirecting you to your dashboard..."}
          </p>
        </div>

        <div className="pt-2">
          <Link
            href="/dashboard"
            locale={locale}
            className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white py-2.5 text-xs font-bold transition-all"
          >
            {isAr ? "الانتقال إلى لوحة التحكم فوراً" : "Go to Dashboard Now"}
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

      {/* New Password */}
      <div className="space-y-1.5 text-start">
        <label className="text-xs font-bold text-slate-700 block">
          {isAr ? "كلمة المرور الجديدة" : "New Password"}
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

      {/* Confirm New Password */}
      <div className="space-y-1.5 text-start">
        <label className="text-xs font-bold text-slate-700 block">
          {isAr ? "تأكيد كلمة المرور الجديدة" : "Confirm New Password"}
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
            className={`w-full rounded-lg border bg-white py-2.5 ps-10 pe-10 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 transition-all ${
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
            {password === confirmPassword ? <Check className="size-3" /> : <X className="size-3" />}
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

      {/* Submit Button */}
      <div className="pt-2">
        <button
          type="submit"
          disabled={isPending}
          className="w-full rounded-xl bg-[#1A3C2E] py-3 text-sm font-bold text-white shadow-md shadow-[#1A3C2E]/20 hover:bg-[#132d22] active:scale-[0.99] transition-all flex items-center justify-center gap-2 disabled:opacity-70 cursor-pointer"
        >
          {isPending ? (
            <>
              <RefreshCw className="size-4 animate-spin" />
              <span>{isAr ? "جارٍ حفظ كلمة المرور..." : "Updating password..."}</span>
            </>
          ) : (
            <>
              <Check className="size-4" />
              <span>{isAr ? "تعيين كلمة المرور والمتابعة" : "Reset Password & Continue"}</span>
            </>
          )}
        </button>
      </div>

      {/* Back to Login */}
      <div className="text-center pt-3 border-t border-slate-100">
        <Link href="/login" locale={locale} className="text-xs font-bold text-[#1A3C2E] hover:underline">
          {isAr ? "العودة إلى تسجيل الدخول" : "Back to Sign In"}
        </Link>
      </div>
    </form>
  );
}
