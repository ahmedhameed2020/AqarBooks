import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { getCurrentUser } from "@/lib/auth/session";
import { getPrimaryOrganization } from "@/lib/auth/org-context";
import { hasPermission } from "@/lib/auth/authorize";
import { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/i18n/routing";
import { saveFxDifferenceAccounts, saveAssetDisposalAccounts } from "@/lib/actions/accounting-accounts";
import { AccountPairForm, type Option } from "./account-pair-forms";
import { ShieldCheck, ArrowRightLeft, Building2, CheckCircle2, AlertCircle } from "lucide-react";

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
    title: isAr ? "الحسابات المحاسبية المعيَّنة | AqarBooks" : "Designated Accounts | AqarBooks",
    description: isAr
      ? "تعيين الحسابات التي تستقبل فروق العملة ونتائج استبعاد الأصول."
      : "Designate which accounts receive currency differences and asset disposal results.",
  };
}

export default async function AccountingAccountsPage({
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

  const canManage = await hasPermission(organization.id, "finance.accounts.manage");
  if (!canManage) {
    return (
      <div className="space-y-3 rounded-2xl border border-red-200 bg-red-50 p-6 text-start">
        <h1 className="text-xl font-bold text-red-900">
          {isAr ? "الحسابات المحاسبية المعيَّنة" : "Designated Accounts"}
        </h1>
        <p className="text-sm text-red-700">
          {isAr
            ? "لا تملك صلاحية تعيين الحسابات المحاسبية."
            : "You don't have permission to designate accounting accounts."}
        </p>
      </div>
    );
  }

  const supabase = await createClient();
  const [{ data: accounts }, { data: org }] = await Promise.all([
    supabase
      .from("chart_of_accounts")
      .select("id, code, name_ar, name_en, category")
      .eq("organization_id", organization.id)
      .eq("is_group", false)
      .eq("is_active", true)
      .in("category", ["REVENUE", "EXPENSE"])
      .order("code"),
    supabase
      .from("organizations")
      .select(
        "fx_gain_account_id, fx_loss_account_id, asset_disposal_gain_account_id, asset_disposal_loss_account_id"
      )
      .eq("id", organization.id)
      .maybeSingle(),
  ]);

  const label = (a: { code: string; name_ar: string; name_en: string }) =>
    `${a.code} — ${isAr ? a.name_ar : a.name_en}`;
  const revenue: Option[] = (accounts ?? [])
    .filter((a) => a.category === "REVENUE")
    .map((a) => ({ id: a.id, label: label(a) }));
  const expense: Option[] = (accounts ?? [])
    .filter((a) => a.category === "EXPENSE")
    .map((a) => ({ id: a.id, label: label(a) }));

  const fxReady = Boolean(org?.fx_gain_account_id && org?.fx_loss_account_id);
  const disposalReady = Boolean(
    org?.asset_disposal_gain_account_id && org?.asset_disposal_loss_account_id
  );

  const sections = [
    {
      key: "fx",
      icon: ArrowRightLeft,
      titleAr: "حسابات فروق تقييم وتحويل العملة",
      titleEn: "Currency Differences (FX Gain/Loss)",
      bodyAr:
        "تنشأ حين تُسدَّد معاملة بعملة أجنبية بسعر يختلف عن سعر يوم تسجيلها. الترحيل في النظام يرفض حتى يُعيَّن الحسابان.",
      bodyEn:
        "Arise when a foreign-currency transaction settles at a rate different from the transaction date. System posting requires both designated.",
      ready: fxReady,
      action: saveFxDifferenceAccounts,
      gain: org?.fx_gain_account_id ?? null,
      loss: org?.fx_loss_account_id ?? null,
    },
    {
      key: "disposal",
      icon: Building2,
      titleAr: "حسابات أرباح وخسائر استبعاد وتخريد الأصول",
      titleEn: "Fixed Asset Disposal (Gain/Loss)",
      bodyAr:
        "الفرق بين المتحصلات وصافي القيمة الدفترية عند بيع أصل أو استبعاده كخردة. الاستبعاد في النظام يرفض حتى يُعيَّن الحسابان.",
      bodyEn:
        "The variance between disposal proceeds and net book value. Disposal transactions require both designated accounts.",
      ready: disposalReady,
      action: saveAssetDisposalAccounts,
      gain: org?.asset_disposal_gain_account_id ?? null,
      loss: org?.asset_disposal_loss_account_id ?? null,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200/80 pb-5 text-start">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-black tracking-tight text-slate-900">
              {isAr ? "الحسابات المحاسبية المعيَّنة للنظام" : "System Designated Accounts"}
            </h1>
            <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-bold text-blue-700 border border-blue-200/60">
              {isAr ? "إعدادات الأرباح والخسائر" : "Automated Postings"}
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 max-w-2xl leading-relaxed">
            {isAr
              ? "تحديد حسابات الإيرادات والمصروفات التي يرحل إليها النظام الفروق الآلية مثل فروق العملة ونتائج استبعاد الأصول الثابتة."
              : "Designate specific ledger accounts for automatic system adjustments like currency variances and fixed asset retirements."}
          </p>
        </div>
      </div>

      {/* Overview Notice */}
      <div className="rounded-2xl border border-blue-200/80 bg-blue-50/50 p-4 text-xs sm:text-sm text-blue-900 flex items-start gap-3">
        <ShieldCheck className="size-5 shrink-0 text-blue-600 mt-0.5" />
        <div className="space-y-1 leading-relaxed">
          <span className="font-bold block">
            {isAr ? "قاعدة محاسبية هامة:" : "Accounting Rule:"}
          </span>
          <p>
            {isAr
              ? "يجوز تعيين نفس الحساب لكلا الطرفين (الربح والخسارة) إذا كانت سياسة شركتكم تعرض صافي الفروق في بند واحد بقائمة الدخل. يتم توجيه الفروق الموجبة كدائن والفروق السالبة كمدين."
              : "You may designate the same account for both gains and losses if your accounting policy presents net differences in a single income statement line."}
          </p>
        </div>
      </div>

      {/* Sections Cards */}
      <div className="grid grid-cols-1 gap-6">
        {sections.map((s) => {
          const Icon = s.icon;
          return (
            <div
              key={s.key}
              data-designation={s.key}
              data-ready={s.ready ? "yes" : "no"}
              className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-xs space-y-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
                <div className="flex items-center gap-3">
                  <div className="flex size-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600 border border-blue-100">
                    <Icon className="size-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-black text-slate-900">
                      {isAr ? s.titleAr : s.titleEn}
                    </h2>
                    <p className="text-xs text-slate-400 font-medium">
                      {isAr ? s.bodyAr : s.bodyEn}
                    </p>
                  </div>
                </div>

                <Badge
                  variant="outline"
                  className={
                    s.ready
                      ? "border-emerald-300 bg-emerald-50 text-emerald-700 font-bold text-xs"
                      : "border-amber-300 bg-amber-50 text-amber-700 font-bold text-xs"
                  }
                >
                  {s.ready ? (
                    <span className="flex items-center gap-1">
                      <CheckCircle2 className="size-3.5" />
                      {isAr ? "معيَّن بالكامل وجاهز للترحيل" : "Designated & Ready"}
                    </span>
                  ) : (
                    <span className="flex items-center gap-1">
                      <AlertCircle className="size-3.5" />
                      {isAr ? "غير مكتمل — الترحيل الآلي متوقف" : "Pending Designation"}
                    </span>
                  )}
                </Badge>
              </div>

              {revenue.length === 0 || expense.length === 0 ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs font-bold text-amber-900">
                  {isAr
                    ? "يلزم وجود حساب إيراد وحساب مصروف في دليل الحسابات أولاً لتعيينهما."
                    : "Revenue and Expense accounts must exist in the Chart of Accounts first."}
                </div>
              ) : (
                <AccountPairForm
                  action={s.action}
                  organizationId={organization.id}
                  idPrefix={s.key}
                  gainAccounts={revenue}
                  lossAccounts={expense}
                  currentGainId={s.gain}
                  currentLossId={s.loss}
                  locale={locale}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
