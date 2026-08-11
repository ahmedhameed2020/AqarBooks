import { setRequestLocale } from "next-intl/server";
import { requirePlatformAdmin } from "@/lib/auth/authorize";
import type { Locale } from "@/i18n/routing";

export default async function PlatformLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  await requirePlatformAdmin(locale as Locale);

  return children;
}
