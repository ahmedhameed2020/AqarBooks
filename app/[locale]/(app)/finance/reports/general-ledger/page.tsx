import { setRequestLocale } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getPrimaryOrganization } from "@/lib/auth/org-context";
import { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/i18n/routing";
import { BookOpen } from "lucide-react";
import { GeneralLedgerClient, type AccountOption, type LedgerLine } from "./general-ledger-client";
import { denyIfMissingPermission } from "@/lib/auth/page-guard";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const isAr = locale === "ar";
  return {
    title: isAr
      ? "دفتر الأستاذ العام — AqarBooks"
      : "General Ledger — AqarBooks",
    description: isAr
      ? "كشف حساب تفصيلي للحركات المحاسبية والقيود والرصيد التراكمي مع التصدير الرسمي للـ PDF والإكسل."
      : "Itemized transaction statement with journal references and running balance.",
  };
}

export default async function GeneralLedgerPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ accountId?: string; start?: string; end?: string }>;
}) {
  const { locale } = await params;
  const { accountId, start, end } = await searchParams;
  setRequestLocale(locale as Locale);
  const isAr = locale === "ar";

  const user = await getCurrentUser();
  const organization = user ? await getPrimaryOrganization(user.id) : null;
  if (!organization) return null;

  const denied = await denyIfMissingPermission(organization.id, "finance.reports.read", locale);
  if (denied) return denied;

  const startDate = start || "1900-01-01";
  const endDate = end || new Date().toISOString().slice(0, 10);

  const supabase = await createClient();
  const pageSize = 1000;
  const accounts: AccountOption[] = [];

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("chart_of_accounts")
      .select("id, code, name_ar, name_en")
      .eq("organization_id", organization.id)
      .eq("is_group", false)
      .order("code")
      .range(from, from + pageSize - 1);

    if (error) throw error;

    const page = (data ?? []) as AccountOption[];
    accounts.push(...page);
    if (page.length < pageSize) break;
  }
  const selectedAccount = accounts.find((a) => a.id === accountId) || null;

  const lines: LedgerLine[] = [];
  if (accountId) {
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await supabase
        .rpc("get_account_ledger", {
          p_organization_id: organization.id,
          p_account_id: accountId,
          p_start_date: startDate,
          p_end_date: endDate,
        })
        .range(from, from + pageSize - 1);

      if (error) throw error;

      const page = (data ?? []) as LedgerLine[];
      lines.push(...page);
      if (page.length < pageSize) break;
    }
  }

  return (
    <div className="space-y-6">
      {/* ──────────────────────────────────────────────────────────────────────────
          PAGE HEADER
          ────────────────────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="flex size-10 items-center justify-center rounded-xl bg-cyan-600/10 text-cyan-600 dark:bg-cyan-500/20 dark:text-cyan-400">
              <BookOpen className="size-5" />
            </div>
            <div>
              <h1 className="text-xl font-black tracking-tight text-slate-950 dark:text-white">
                {isAr ? "دفتر الأستاذ العام التفصيلي" : "General Ledger"}
              </h1>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                {isAr
                  ? "كشف حساب تفصيلي بالقيود المحاسبية والحركات والرصيد التراكمي مع التصدير الرسمي للـ PDF والإكسل."
                  : "Itemized transaction ledger with journal references, running balance, and instant exports."}
              </p>
            </div>
          </div>
        </div>
      </div>

      <GeneralLedgerClient
        accounts={accounts}
        selectedAccount={selectedAccount}
        lines={lines}
        startDate={startDate}
        endDate={endDate}
        organizationName={organization.name}
        taxNumber={organization.tax_id}
        currency={organization.default_currency || "EGP"}
        locale={locale}
      />
    </div>
  );
}
