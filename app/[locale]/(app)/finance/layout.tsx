import { setRequestLocale } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getPrimaryOrganization } from "@/lib/auth/org-context";
import type { Locale } from "@/i18n/routing";

export default async function FinanceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const isAr = locale === "ar";

  const user = await getCurrentUser();
  const organization = user ? await getPrimaryOrganization(user.id) : null;

  if (!organization) {
    return (
      <p className="max-w-md text-sm text-muted-foreground">
        {isAr ? "حسابك غير مرتبط بأي منظمة بعد." : "Your account isn't linked to an organization yet."}
      </p>
    );
  }

  return children;
}
