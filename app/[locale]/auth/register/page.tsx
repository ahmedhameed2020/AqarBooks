import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/i18n/routing";
import { stripLocalePrefix } from "@/lib/i18n/strip-locale-prefix";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const isAr = locale === "ar";

  return {
    title: isAr ? "طلب حساب مؤسسي | AqarBooks" : "Request an Enterprise Account | AqarBooks",
    description: isAr
      ? "حسابات AqarBooks المؤسسية يتم تأسيسها عبر فريقنا بعد اعتماد الطلب."
      : "AqarBooks enterprise accounts are provisioned by our team once a request is approved.",
    robots: { index: false, follow: true },
  };
}

/**
 * Public self-service registration is retired.
 *
 * Registration used to create an auth account that immediately fed the
 * onboarding wizard, which provisioned an ACTIVE organization with no approval
 * and no payment. That RPC is no longer executable by `authenticated` and the
 * journey it fed is gone -- but Release B adds a real replacement (assisted,
 * approval-gated onboarding at /get-started), so this route now redirects
 * there for anonymous visitors instead of just explaining why it can't help.
 * The route is kept (rather than deleted) so existing links and confirmation
 * emails still land somewhere useful instead of a 404.
 *
 * Existing customer sign-in is deliberately untouched.
 */
export default async function RegisterPage({
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

  redirect({ href: "/get-started", locale: locale as Locale });
}
