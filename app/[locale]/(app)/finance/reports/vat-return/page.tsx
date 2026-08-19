import { setRequestLocale } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getPrimaryOrganization } from "@/lib/auth/org-context";
import { hasPermission } from "@/lib/auth/authorize";
import { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/i18n/routing";
import { Scale, AlertCircle } from "lucide-react";
import { VatReturnClient, type VatReturnData } from "./vat-return-client";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const isAr = locale === "ar";
  return {
    title: isAr
      ? "كشف إقرار ضريبة القيمة المضافة ومطابقة الضرائب — عقار بوكس"
      : "VAT Return & Tax Audit Statement — AqarBooks",
    description: isAr
      ? "كشف الإقرار الضريبي الرسمي: ضريبة المخرجات على الإيرادات، ضريبة المدخلات على المشتريات، وصافي الضريبة المستحقة للسداد."
      : "Official VAT return summary: output VAT on sales, input VAT on expenses, and net tax payable.",
  };
}

export default async function VatReturnPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const isAr = locale === "ar";

  const user = await getCurrentUser();
  const organization = user ? await getPrimaryOrganization(user.id) : null;
  if (!organization) return null;

  const canRead = await hasPermission(organization.id, "finance.reports.read") ||
                  await hasPermission(organization.id, "finance.dues.read");

  if (!canRead) {
    return (
      <div className="p-8 text-center space-y-3">
        <div className="size-12 mx-auto rounded-2xl bg-amber-50 dark:bg-amber-950/50 flex items-center justify-center text-amber-600">
          <AlertCircle className="size-6" />
        </div>
        <h1 className="text-lg font-bold text-slate-900 dark:text-white">
          {isAr ? "إقرار ضريبة القيمة المضافة" : "VAT Return Statement"}
        </h1>
        <p className="text-xs text-slate-500 max-w-sm mx-auto">
          {isAr
            ? "لا تملك صلاحية استعراض الإقرارات والتقارير الضريبية."
            : "You don't have permission to view this report."}
        </p>
      </div>
    );
  }

  const supabase = await createClient();

  // 1. Fetch tax decisions
  const { data: decisionsData } = await supabase
    .from("tax_decisions")
    .select(
      "id, source_type, source_id, taxable_base, vat_amount, gross_amount, decided_at, revenue_nature"
    )
    .eq("organization_id", organization.id)
    .order("decided_at", { ascending: false });

  // 2. Fetch recorded input tax
  const { data: inputTaxData } = await supabase
    .from("input_tax_decisions")
    .select("taxable_base, tax_amount, recoverable_amount, recoverability")
    .eq("organization_id", organization.id);

  // 3. Fetch tax profile
  const { data: profilesData } = await supabase
    .from("einvoice_profiles")
    .select("jurisdiction, taxpayer_id, environment")
    .eq("organization_id", organization.id)
    .maybeSingle();

  // 3. Compute VAT aggregates
  const items = decisionsData || [];
  // tax_decisions stores no rate or exempt flag; both follow from the amounts.
  const effectiveRate = (i: { taxable_base: number | null; vat_amount: number | null }) => {
    const base = Number(i.taxable_base || 0);
    return base > 0 ? Number(i.vat_amount || 0) / base : 0;
  };
  const standardRateSupplies = items.filter((i) => Number(i.vat_amount || 0) > 0);
  const exemptSupplies = items.filter((i) => Number(i.vat_amount || 0) === 0);

  const outputTaxableBase = standardRateSupplies.reduce((s, i) => s + Number(i.taxable_base || 0), 0);
  const outputVatTotal = standardRateSupplies.reduce((s, i) => s + Number(i.vat_amount || 0), 0);
  const exemptBaseTotal = exemptSupplies.reduce((s, i) => s + Number(i.taxable_base || 0), 0);

  // Input VAT comes from the recorded input tax decisions -- only the
  // recoverable portion is deductible against output tax.
  const inputTaxableBase = (inputTaxData || []).reduce((s, i) => s + Number(i.taxable_base || 0), 0);
  const inputVatTotal = (inputTaxData || []).reduce((s, i) => s + Number(i.recoverable_amount || 0), 0);

  const netVatPayable = Math.max(0, outputVatTotal - inputVatTotal);

  const vatData: VatReturnData = {
    taxpayerId: profilesData?.taxpayer_id || "—",
    jurisdiction: profilesData?.jurisdiction || "EG_ETA",
    periodLabel: `${new Date().getFullYear()} - Q${Math.floor(new Date().getMonth() / 3) + 1}`,
    outputTaxableBase,
    outputVatTotal,
    exemptBaseTotal,
    inputTaxableBase,
    inputVatTotal,
    netVatPayable,
    decisionsCount: items.length,
    decisions: items.map((i) => ({
      id: i.id,
      unitCode: `#${i.source_id.slice(0, 8)}`,
      nature: i.revenue_nature,
      date: i.decided_at,
      base: Number(i.taxable_base || 0),
      rate: effectiveRate(i),
      vat: Number(i.vat_amount || 0),
      gross: Number(i.gross_amount || 0),
      isExempt: Number(i.vat_amount || 0) === 0,
    })),
  };

  return (
    <VatReturnClient
      data={vatData}
      organizationName={organization.name}
      currency={organization.default_currency || "EGP"}
      locale={locale}
    />
  );
}
