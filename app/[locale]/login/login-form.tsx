"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signIn, type SignInState } from "@/lib/actions/auth";
import type { Locale } from "@/i18n/routing";

export function LoginForm({
  locale,
  redirectTo,
}: {
  locale: Locale;
  redirectTo?: string;
}) {
  const t = useTranslations("auth.login");
  const boundSignIn = signIn.bind(null, locale, redirectTo);
  const [state, formAction, pending] = useActionState<SignInState, FormData>(
    boundSignIn,
    { error: null },
  );

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">{t("email")}</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">{t("password")}</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>
      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error === "invalid_credentials"
            ? t("invalidCredentials")
            : t("genericError")}
        </p>
      )}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? t("submitting") : t("submit")}
      </Button>
    </form>
  );
}
