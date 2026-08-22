import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getPrimaryOrganization } from "@/lib/auth/org-context";
import { redirect } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { AiGovernanceClient } from "./ai-governance-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const isAr = locale === "ar";

  return {
    title: isAr ? "حوكمة الذكاء الاصطناعي والـ Shadow Pilot | AqarBooks" : "AI Governance & Shadow Pilot | AqarBooks",
    description: isAr
      ? "لوحة مراقبة الأدلة الميدانية، وسجل الحوادث، ومفاتيح الإيقاف الفورية للذكاء الاصطناعي."
      : "Shadow pilot evidence monitoring, AI incident matrix, and operational kill-switches.",
  };
}

export default async function AiGovernancePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);

  const user = await getCurrentUser();
  if (!user) {
    redirect({ href: "/login", locale: locale as Locale });
  }

  const organization = user ? await getPrimaryOrganization(user.id) : null;
  if (!organization) return null;

  return (
    <div className="space-y-6">
      <AiGovernanceClient
        locale={locale}
        organizationName={organization.name}
      />
    </div>
  );
}
