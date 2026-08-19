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
      <div className="space-y-2">
        <h1 className="text-xl font-semibold">
          {isAr ? "الحسابات المحاسبية المعيَّنة" : "Designated Accounts"}
        </h1>
        <p className="text-sm text-muted-foreground">
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
        "fx_gain_account_id, fx_loss_account_id, asset_disposal_gain_account_id, asset_disposal_loss_account_id",
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
    org?.asset_disposal_gain_account_id && org?.asset_disposal_loss_account_id,
  );

  const sections = [
    {
      key: "fx",
      titleAr: "فروق العملة",
      titleEn: "Currency differences",
      bodyAr:
        "تنشأ حين تُسدَّد معاملة بعملة أجنبية بسعر يختلف عن سعر يوم تسجيلها. الترحيل يرفض حتى يُعيَّن الحسابان.",
      bodyEn:
        "Arise when a foreign-currency transaction settles at a rate different from the one it was recorded at. Posting is refused until both are designated.",
      ready: fxReady,
      action: saveFxDifferenceAccounts,
      gain: org?.fx_gain_account_id ?? null,
      loss: org?.fx_loss_account_id ?? null,
    },
    {
      key: "disposal",
      titleAr: "استبعاد الأصول الثابتة",
      titleEn: "Fixed asset disposal",
      bodyAr:
        "الفرق بين المتحصلات والقيمة الدفترية عند بيع أصل أو خردته. الاستبعاد يرفض حتى يُعيَّن الحسابان.",
      bodyEn:
        "The difference between proceeds and net book value when an asset is sold or scrapped. Disposal is refused until both are designated.",
      ready: disposalReady,
      action: saveAssetDisposalAccounts,
      gain: org?.asset_disposal_gain_account_id ?? null,
      loss: org?.asset_disposal_loss_account_id ?? null,
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">
          {isAr ? "الحسابات المحاسبية المعيَّنة" : "Designated Accounts"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {isAr
            ? "أين تذهب النتائج التي لا يختار الكود لها حسابًا."
            : "Where the results land that the software will not pick an account for."}
        </p>
      </div>

      <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
        {isAr
          ? "يجوز أن يشير حسابا الربح والخسارة إلى الحساب نفسه إن كنت تعرض فروقك في سطر واحد بالصافي — الفصل والدمج كلاهما صحيح، والاختيار اختيارك."
          : "The gain and loss accounts may point at the SAME account if you present your differences as one net line. Splitting and combining are both valid, and the choice is yours."}
      </div>

      {sections.map((s) => (
        <section
          key={s.key}
          data-designation={s.key}
          data-ready={s.ready ? "yes" : "no"}
          className="space-y-3 rounded-lg border p-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-medium">{isAr ? s.titleAr : s.titleEn}</h2>
            <Badge variant={s.ready ? "secondary" : "outline"}>
              {s.ready
                ? isAr ? "معيَّن" : "Designated"
                : isAr ? "غير معيَّن — الترحيل مرفوض" : "Not set — posting refused"}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">{isAr ? s.bodyAr : s.bodyEn}</p>

          {revenue.length === 0 || expense.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {isAr
                ? "يلزم وجود حساب إيراد وحساب مصروف في دليل الحسابات أولًا."
                : "A revenue account and an expense account must exist in the chart of accounts first."}
            </p>
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
        </section>
      ))}
    </div>
  );
}
