"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link } from "@/i18n/navigation";
import { signIn, type SignInState } from "@/lib/actions/auth";
import type { Locale } from "@/i18n/routing";
import { LogoMark } from "@/components/marketing/logo-mark";
import {
  Lock,
  Mail,
  AlertCircle,
  Loader2,
  ShieldCheck,
  HelpCircle,
  KeyRound,
  Info,
} from "lucide-react";

export function LoginForm({ locale, orgSuspended }: { locale: Locale; orgSuspended?: boolean }) {
  const isAr = locale === "ar";
  const boundSignIn = signIn.bind(null, locale, "/portal");
  const [state, formAction, isPending] = useActionState<SignInState, FormData>(boundSignIn, { error: null });

  return (
    <div className="w-full max-w-md mx-auto space-y-6">
      <div className="text-center space-y-2">
        <div className="inline-flex justify-center mb-1">
          <LogoMark className="size-12 shadow-md" />
        </div>
        <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
          {isAr ? "بوابة الملاك والمستثمرين" : "Owner & Investor Portal"}
        </h1>
        <p className="text-xs text-slate-500 max-w-xs mx-auto">
          {isAr
            ? "سجّل دخولك ببيانات حسابك لمتابعة محفظتك العقارية وكشوف الحسابات وسداد المستحقات."
            : "Sign in to manage your real estate assets, certified statements, and payments."}
        </p>
      </div>

      <form
        action={formAction}
        className="space-y-4 rounded-3xl border border-border/80 bg-card p-6 sm:p-8 shadow-md"
      >
        {orgSuspended && (
          <div className="flex items-center gap-2 p-3 text-xs font-bold text-rose-600 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 rounded-2xl">
            <AlertCircle className="size-4 shrink-0" />
            <span>
              {isAr
                ? "تم تعليق حساب المنشأة حاليًا، يرجى التواصل مع الإدارة"
                : "Your organization account is currently suspended, please contact support"}
            </span>
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="portal-login-email" className="text-xs font-bold">
            {isAr ? "البريد الإلكتروني المسجل" : "Registered Email"}
          </Label>
          <div className="relative">
            <Input
              id="portal-login-email"
              type="email"
              name="email"
              required
              autoComplete="email"
              placeholder="name@example.com"
              className="h-11 rounded-xl ps-9 text-xs font-medium"
            />
            <Mail className="size-4 text-slate-400 absolute start-3 top-3.5" />
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="portal-login-password" className="text-xs font-bold">
              {isAr ? "كلمة المرور" : "Password"}
            </Label>
            <Link
              href="/auth/forgot-password"
              locale={locale}
              className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
            >
              {isAr ? "نسيت كلمة المرور؟" : "Forgot password?"}
            </Link>
          </div>
          <div className="relative">
            <Input
              id="portal-login-password"
              type="password"
              name="password"
              required
              autoComplete="current-password"
              placeholder="••••••••"
              className="h-11 rounded-xl ps-9 text-xs font-medium"
            />
            <Lock className="size-4 text-slate-400 absolute start-3 top-3.5" />
          </div>
        </div>

        {state.error && (
          <div className="flex items-center gap-2 p-3 text-xs font-bold text-rose-600 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 rounded-2xl">
            <AlertCircle className="size-4 shrink-0" />
            <span>
              {isAr
                ? "البريد الإلكتروني أو كلمة المرور غير صحيحة. يرجى التحقق وإعادة المحاولة."
                : "Invalid credentials. Please verify your email and password."}
            </span>
          </div>
        )}

        <Button
          type="submit"
          disabled={isPending}
          className="w-full h-11 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-black text-sm shadow-md transition-all"
        >
          {isPending ? (
            <>
              <Loader2 className="size-4 animate-spin me-2" />
              {isAr ? "جاري تسجيل الدخول..." : "Signing in..."}
            </>
          ) : (
            isAr ? "تسجيل الدخول لبوابة الملاك" : "Sign In to Portal"
          )}
        </Button>

        {/* Informative Guidance Card for Owners */}
        <div className="p-3.5 rounded-2xl border border-border/60 bg-slate-50/70 dark:bg-slate-900/70 space-y-1.5 text-start">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300">
            <Info className="size-3.5 text-indigo-500 shrink-0" />
            <span>{isAr ? "إرشادات دخول الملاك الجدد:" : "New Owner Access Instructions:"}</span>
          </div>
          <p className="text-[11px] text-slate-500 leading-relaxed">
            {isAr
              ? "يتم تفعيل الحساب وتعيين كلمة المرور أول مرة عبر رابط الدعوة المعتمد المرسل من إدارة المنتجع أو الكيان العقاري عبر رسائل واتساب أو البريد الإلكتروني."
              : "Account activation and password setup are completed via the official invitation link sent to your registered WhatsApp or email by the property management."}
          </p>
        </div>

        <div className="flex items-center justify-center gap-1.5 pt-1 text-[11px] text-slate-400 font-medium">
          <ShieldCheck className="size-3.5 text-emerald-500" />
          <span>{isAr ? "نظام آمن ومشفر بالكامل عبر عقار بوكس" : "Secured & Encrypted by AqarBooks"}</span>
        </div>
      </form>
    </div>
  );
}
