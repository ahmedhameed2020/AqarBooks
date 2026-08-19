import { setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { PlatformSettingsClient } from "./settings-client";

export default async function PlatformSettingsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);

  return <PlatformSettingsClient locale={locale} />;
}
