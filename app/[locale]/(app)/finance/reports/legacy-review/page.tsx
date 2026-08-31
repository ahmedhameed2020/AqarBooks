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
  type LegacyResolutionSummary,
} from "./legacy-readiness-gate";
import {
  LegacyMasterDataFindings,
  type LegacyMasterDataFinding,
} from "./legacy-master-data-findings";

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
  // Keep staging-only RPCs locally typed until the schema is promoted and
  // authoritative Supabase types are regenerated.
  const readinessRpc = supabase.rpc.bind(supabase) as unknown as (
    fn: "get_legacy_financial_readiness",
    args: { p_organization_id: string },
  ) => Promise<{
    data: LegacyFinancialReadiness[] | null;
    error: { message: string; code?: string } | null;
  }>;

  const masterDataRpc = supabase.rpc.bind(supabase) as unknown as (
    fn: "list_legacy_financial_master_data_findings",
    args: { p_organization_id: string; p_status: string | null },
  ) => Promise<{
    data: LegacyMasterDataFinding[] | null;
    error: { message: string; code?: string } | null;
  }>;

  const [
    { data: readinessRows, error: readinessError },
    { data: masterRows, error: masterError },
  ] = await Promise.all([
    readinessRpc("get_legacy_financial_readiness", {
      p_organization_id: organization.id,
    }),
    masterDataRpc("list_legacy_financial_master_data_findings", {
      p_organization_id: organization.id,
      p_status: null,
    }),
  ]);
  if (readinessError) throw readinessError;
  if (masterError) throw masterError;

  const readiness = readinessRows?.[0];
  if (!readiness) {
    throw new Error("Legacy financial readiness gate returned no result");
  }

  const financialFindings = (data ?? []) as LegacyReviewFinding[];
  const masterFindings = masterRows ?? [];
  const openFinancial = financialFindings.filter(
    (finding) => finding.status === "OPEN",
  );
  const openMaster = masterFindings.filter(
    (finding) => finding.status === "OPEN",
  );

  const resolutionSummary: LegacyResolutionSummary = {
    documentary: openFinancial.length,
    receivables: openMaster.filter(
      (finding) =>
        finding.finding_type === "RECEIVABLE_ACCOUNT_OUTSIDE_PROPERTY_MASTER",
    ).length,
    banks: openMaster.filter(
      (finding) => finding.finding_type === "BANK_ACCOUNT_IDENTIFIER_MISSING",
    ).length,
    suppliers: openMaster.filter(
      (finding) =>
        finding.finding_type === "PAYABLE_COUNTERPARTY_OUTSIDE_SUPPLIER_MASTER",
    ).length,
    fixedAssets: openMaster.filter(
      (finding) => finding.finding_type === "FIXED_ASSET_REGISTER_NOT_MIGRATED",
    ).length,
  };

  return (
    <div className="space-y-5">
      <LegacyReadinessGate
        readiness={readiness}
        resolutionSummary={resolutionSummary}
        locale={locale}
        currency={organization.default_currency || "EGP"}
      />
      <LegacyMasterDataFindings
        findings={masterFindings}
        locale={locale}
        currency={organization.default_currency || "EGP"}
      />
      <LegacyReviewClient
        findings={financialFindings}
        organizationName={organization.name}
        currency={organization.default_currency || "EGP"}
        locale={locale}
      />
    </div>
  );
}
