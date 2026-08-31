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
import {
  LegacyReadinessGate,
  type LegacyFinancialReadiness,
} from "./legacy-readiness-gate";

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

  // The generated client types intentionally trail staging-only migrations.
  // Keep the one new RPC locally typed until the schema is promoted and types
  // are regenerated; do not weaken the Supabase client globally.
  const readinessRpc = supabase.rpc.bind(supabase) as unknown as (
    fn: "get_legacy_financial_readiness",
    args: { p_organization_id: string },
  ) => Promise<{
    data: LegacyFinancialReadiness[] | null;
    error: { message: string; code?: string } | null;
  }>;

  const { data: readinessRows, error: readinessError } = await readinessRpc(
    "get_legacy_financial_readiness",
    { p_organization_id: organization.id },
  );
  if (readinessError) throw readinessError;

  const readiness = readinessRows?.[0];
  if (!readiness) {
    throw new Error("Legacy financial readiness gate returned no result");
  }

  return (
    <div className="space-y-5">
      <LegacyReadinessGate
        readiness={readiness}
        locale={locale}
        currency={organization.default_currency || "EGP"}
      />
      <LegacyReviewClient
        findings={(data ?? []) as LegacyReviewFinding[]}
        organizationName={organization.name}
        currency={organization.default_currency || "EGP"}
        locale={locale}
      />
    </div>
  );
}
