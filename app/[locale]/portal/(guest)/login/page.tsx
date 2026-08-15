import { setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { LoginForm } from "./login-form";

export default async function PortalLoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ reason?: string }>;
}) {
  const { locale } = await params;
  const { reason } = await searchParams;
  setRequestLocale(locale as Locale);
  return <LoginForm locale={locale as Locale} orgSuspended={reason === "org_suspended"} />;
}
