"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signIn, type SignInState } from "@/lib/actions/auth";
import type { Locale } from "@/i18n/routing";
import { LogoMark } from "@/components/marketing/logo-mark";
import { Lock, Mail, AlertCircle, Loader2, ShieldCheck } from "lucide-react";

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
            ? "سجّل دخولك لمتابعة محفظتك العقارية وكشوف الحسابات المعتمدة."
            : "Sign in to manage your real estate assets and certified statements."}
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
          <Label htmlFor="portal-login-password" className="text-xs font-bold">
            {isAr ? "كلمة المرور" : "Password"}
          </Label>
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
              {isAr ? "بيانات تسجيل الدخول غير صحيحة، يرجى التحقق وإعادة المحاولة." : "Invalid credentials"}
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
              {isAr ? "جاري التحقق والدخول..." : "Signing in..."}
            </>
          ) : (
            isAr ? "دخول لبوابة الملاك" : "Sign in to Portal"
          )}
        </Button>

        <div className="flex items-center justify-center gap-1.5 pt-2 text-[11px] text-slate-400 font-medium">
          <ShieldCheck className="size-3.5 text-emerald-500" />
          <span>{isAr ? "نظام آمن ومشفر بالكامل عبر عقار بوكس" : "Secured & Encrypted by AqarBooks"}</span>
        </div>
      </form>
    </div>
  );
}
