"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signIn, type SignInState } from "@/lib/actions/auth";
import type { Locale } from "@/i18n/routing";

export function LoginForm({ locale }: { locale: Locale }) {
  const isAr = locale === "ar";
  const boundSignIn = signIn.bind(null, locale, "/portal");
  const [state, formAction, isPending] = useActionState<SignInState, FormData>(boundSignIn, { error: null });

  return (
    <form action={formAction} className="space-y-4 rounded-3xl border border-border bg-background p-8 shadow-sm">
      <h1 className="text-lg font-bold text-foreground">{isAr ? "بوابة الملاك" : "Owner Portal"}</h1>
      <div className="space-y-1.5">
        <Label>{isAr ? "البريد الإلكتروني" : "Email"}</Label>
        <Input type="email" name="email" required autoComplete="email" />
      </div>
      <div className="space-y-1.5">
        <Label>{isAr ? "كلمة المرور" : "Password"}</Label>
        <Input type="password" name="password" required autoComplete="current-password" />
      </div>
      {state.error && (
        <p className="text-xs font-bold text-destructive">
          {isAr ? "بيانات الدخول غير صحيحة" : "Invalid credentials"}
        </p>
      )}
      <Button type="submit" disabled={isPending} className="w-full">
        {isAr ? "تسجيل الدخول" : "Sign in"}
      </Button>
    </form>
  );
}
