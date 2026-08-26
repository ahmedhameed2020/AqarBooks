import { redirect } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";

/**
 * Compatibility redirect only — never a landing page.
 *
 * The old self-service registration route is retired; /get-started is the
 * single canonical acquisition/onboarding entry. This route is kept so that
 * existing links and confirmation emails land there instead of a 404.
 */
export default async function RegisterPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect({ href: "/get-started", locale: locale as Locale });
}
