import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { getCurrentUser } from "@/lib/auth/session";
import { getPrimaryOrganization } from "@/lib/auth/org-context";
import { hasPermission } from "@/lib/auth/authorize";
import { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/i18n/routing";
import { RecordRateForm } from "./rate-forms";

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
    title: isAr ? "أسعار الصرف | AqarBooks" : "Exchange Rates | AqarBooks",
    description: isAr
      ? "سجل أسعار الصرف المستعملة في تحويل المبالغ الأجنبية إلى عملة المؤسسة."
      : "The rate registry used to convert foreign amounts into the organisation's currency.",
  };
}

type RateRow = {
  id: string;
  foreign_currency: string;
  base_currency: string;
  rate_date: string;
  base_per_unit: number | string;
  source: string | null;
  is_latest: boolean;
};

export default async function ExchangeRatesPage({
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

  const [canManage, canRead] = await Promise.all([
    hasPermission(organization.id, "finance.fx.manage"),
    hasPermission(organization.id, "finance.fx.read"),
  ]);

  if (!canManage && !canRead) {
    return (
      <div className="space-y-2">
        <h1 className="text-xl font-semibold">{isAr ? "أسعار الصرف" : "Exchange Rates"}</h1>
        <p className="text-sm text-muted-foreground">
          {isAr
            ? "لا تملك صلاحية الاطلاع على أسعار الصرف."
            : "You don't have permission to view exchange rates."}
        </p>
      </div>
    );
  }

  const supabase = await createClient();
  const { data } = await supabase.rpc("list_exchange_rates", {
    p_organization_id: organization.id,
  });
  const rates = (data ?? []) as unknown as RateRow[];
  const base = organization.default_currency ?? "EGP";

  const latest = rates.filter((r) => r.is_latest);
  const history = rates.filter((r) => !r.is_latest);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">{isAr ? "أسعار الصرف" : "Exchange Rates"}</h1>
        <p className="text-sm text-muted-foreground">
          {isAr
            ? `كل الأسعار مقابل عملة المؤسسة (${base}). التحويل يأخذ أحدث سعر في تاريخ المعاملة أو قبله.`
            : `All rates are against the organisation's currency (${base}). A conversion takes the newest rate dated on or before the transaction.`}
        </p>
      </div>

      <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
        {isAr
          ? "مبلغ بعملة لا سعر لها يُرفض ولا يُحوَّل بافتراض 1:1 — القيد بالرقم الخاطئ يبقى متوازنًا فلا يكشفه ميزان المراجعة."
          : "An amount in a currency with no rate is REFUSED, never converted at an assumed 1:1 — an entry with the wrong figure still balances, so no trial balance would ever surface it."}
      </div>

      {canManage && (
        <section aria-label={isAr ? "تسجيل سعر" : "Record a rate"} className="space-y-3 rounded-lg border p-4">
          <h2 className="text-sm font-medium">{isAr ? "تسجيل سعر صرف" : "Record an exchange rate"}</h2>
          <RecordRateForm organizationId={organization.id} baseCurrency={base} locale={locale} />
        </section>
      )}

      <section aria-label={isAr ? "الأسعار السارية" : "Rates in force"} className="space-y-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-medium">{isAr ? "الأسعار السارية" : "Rates in force"}</h2>
          <Badge variant="outline">{latest.length}</Badge>
        </div>

        {latest.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {isAr
              ? "لا سعر مسجَّل. أي معاملة بعملة أجنبية ستُرفض حتى يُسجَّل سعرها."
              : "No rate recorded. Any foreign-currency transaction will be refused until one is."}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs">
                <tr>
                  <th className="p-2.5 text-start">{isAr ? "الزوج" : "Pair"}</th>
                  <th className="p-2.5 text-end">{isAr ? "السعر" : "Rate"}</th>
                  <th className="p-2.5 text-start">{isAr ? "التاريخ" : "Date"}</th>
                  <th className="p-2.5 text-start">{isAr ? "المصدر" : "Source"}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {latest.map((r) => (
                  <tr key={r.id} data-rate={`${r.foreign_currency}/${r.base_currency}`}>
                    <td className="p-2.5 font-mono" dir="ltr">
                      {r.foreign_currency} → {r.base_currency}
                    </td>
                    <td className="p-2.5 text-end font-mono" dir="ltr">
                      1 {r.foreign_currency} = {Number(r.base_per_unit)} {r.base_currency}
                    </td>
                    <td className="p-2.5 font-mono" dir="ltr">{r.rate_date}</td>
                    <td className="p-2.5 text-muted-foreground">{r.source ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {history.length > 0 && (
        <section aria-label={isAr ? "السجل التاريخي" : "History"} className="space-y-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-medium">{isAr ? "أسعار سابقة" : "Superseded rates"}</h2>
            <Badge variant="secondary">{history.length}</Badge>
          </div>
          {/* Kept and shown, not discarded: a transaction dated in the past is
              valued at the rate of its own day, so an old rate is still live
              history rather than clutter. */}
          <div className="space-y-1.5">
            {history.map((r) => (
              <div
                key={r.id}
                data-rate-history={`${r.foreign_currency}-${r.rate_date}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-2.5 text-xs"
                dir="ltr"
              >
                <span className="font-mono">
                  1 {r.foreign_currency} = {Number(r.base_per_unit)} {r.base_currency}
                </span>
                <span className="font-mono text-muted-foreground">{r.rate_date}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
