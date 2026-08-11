import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/i18n/routing";
import { stripLocalePrefix } from "@/lib/i18n/strip-locale-prefix";
import { LoginForm } from "./login-form";

export default async function LoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ redirect_to?: string }>;
}) {
  const { locale } = await params;
  const { redirect_to: redirectTo } = await searchParams;
  setRequestLocale(locale as Locale);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const target = redirectTo ? stripLocalePrefix(redirectTo) : "/dashboard";
    redirect({ href: target, locale: locale as Locale });
  }

  const t = await getTranslations("auth.login");

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-semibold">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <LoginForm locale={locale as Locale} redirectTo={redirectTo} />
      </div>
    </main>
  );
}
