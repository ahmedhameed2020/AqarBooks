import { setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";

export default async function PortalDashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const isAr = locale === "ar";

  return (
    <div>
      <h1 className="text-xl font-bold text-foreground">
        {isAr ? "مرحبًا بك في بوابة الملاك" : "Welcome to the Owner Portal"}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {isAr ? "قريبًا: كشف حسابك ومستحقاتك ومدفوعاتك ووحداتك." : "Coming soon: your statement, dues, payments, and units."}
      </p>
    </div>
  );
}
