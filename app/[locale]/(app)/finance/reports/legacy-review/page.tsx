import { setRequestLocale } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getPrimaryOrganization } from "@/lib/auth/org-context";
import { denyIfMissingPermission } from "@/lib/auth/page-guard";
import { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/i18n/routing";
import {
  LegacyReviewClient,
  type LegacyReviewFinding,
} from "./legacy-review-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return {
    title:
      locale === "ar"
        ? "مراجعة البيانات المالية القديمة — AqarBooks"
        : "Legacy Financial Review — AqarBooks",
    description:
      locale === "ar"
        ? "سجل الاستثناءات المالية المكتشفة أثناء ترحيل النظام القديم والمستندات المطلوبة لحسمها."
        : "Controlled register of legacy migration findings and required supporting evidence.",
  };
}

export default async function LegacyReviewPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);

  const user = await getCurrentUser();
  const organization = user ? await getPrimaryOrganization(user.id) : null;
  if (!organization) return null;

  const denied = await denyIfMissingPermission(
    organization.id,
    "finance.reports.read",
    locale,
  );
  if (denied) return denied;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "list_legacy_financial_review_findings",
    {
      p_organization_id: organization.id,
      p_status: null,
    },
  );
  if (error) throw error;

  return (
    <LegacyReviewClient
      findings={(data ?? []) as LegacyReviewFinding[]}
      organizationName={organization.name}
      currency={organization.default_currency || "EGP"}
      locale={locale}
    />
  );
}
