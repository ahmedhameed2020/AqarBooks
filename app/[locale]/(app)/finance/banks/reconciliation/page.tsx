import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getPrimaryOrganization } from "@/lib/auth/org-context";
import { hasPermission } from "@/lib/auth/authorize";
import { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/i18n/routing";
import { KpiCard } from "@/app/[locale]/(app)/dashboard/kpi-card";
import { getCurrencyLabel } from "@/lib/currency";
import {
  ReconciliationClient,
  type StatementRow,
} from "./reconciliation-client";
import { type BankAccountOption } from "./reconciliation-dialogs";
import {
  Scale,
  Building2,
  Landmark,
  Clock,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
} from "lucide-react";

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
    title: isAr ? "المطابقة والتسوية البنكية | AqarBooks" : "Bank Reconciliation | AqarBooks",
    description: isAr
      ? "مطابقة كشوف الحسابات البنكية مع دفاتر الأستاذ العام وتحديد الفروقات آلياً."
      : "Automated bank reconciliation, statement line matching, and variance analysis.",
  };
}

export default async function ReconciliationIndexPage({
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
    hasPermission(organization.id, "finance.bank_reconciliation.manage"),
    hasPermission(organization.id, "finance.bank_reconciliation.read"),
  ]);

  if (!canManage && !canRead) {
    return (
      <div className="space-y-2">
        <h1 className="text-xl font-semibold">{isAr ? "المطابقة البنكية" : "Bank Reconciliation"}</h1>
        <p className="text-sm text-muted-foreground">
          {isAr
            ? "لا تملك صلاحية الاطلاع على المطابقات البنكية. تواصل مع مدير النظام."
            : "You don't have permission to view bank reconciliations. Contact an administrator."}
        </p>
      </div>
    );
  }

  const supabase = await createClient();

  const [
    { data: statementsRaw },
    { data: accountsRaw },
    { data: banksRaw },
    { data: orgData },
  ] = await Promise.all([
    supabase
      .from("bank_statements")
      .select("id, period_start, period_end, opening_balance, closing_balance, status, bank_account_id, note")
      .eq("organization_id", organization.id)
      .order("period_end", { ascending: false }),
    supabase
      .from("bank_accounts")
      .select("id, account_name, account_number, bank_id, is_active")
      .eq("organization_id", organization.id)
      .eq("is_active", true)
      .order("account_name"),
    supabase
      .from("banks")
      .select("id, name_ar, name_en")
      .eq("organization_id", organization.id),
    supabase
      .from("organizations")
      .select("default_currency")
      .eq("id", organization.id)
      .maybeSingle(),
  ]);

  const currency = orgData?.default_currency || "EGP";
  const currencyLabel = getCurrencyLabel(currency, isAr);

  // Maps
  const bankMap = new Map((banksRaw ?? []).map((b) => [b.id, isAr ? b.name_ar : b.name_en]));
  const accountMap = new Map((accountsRaw ?? []).map((a) => [a.id, a]));

  const bankAccountOptions: BankAccountOption[] = (accountsRaw ?? []).map((a) => {
    const bankName = bankMap.get(a.bank_id);
    return {
      id: a.id,
      label: `${a.account_name} — ${a.account_number} ${bankName ? `(${bankName})` : ""}`,
    };
  });

  // Map statements
  const statements: StatementRow[] = (statementsRaw ?? []).map((s) => {
    const acc = accountMap.get(s.bank_account_id);
    const bankName = acc ? bankMap.get(acc.bank_id) : undefined;
    return {
      id: s.id,
      bank_account_id: s.bank_account_id,
      bank_account_name: acc?.account_name,
      bank_account_number: acc?.account_number,
      bank_name: bankName,
      period_start: s.period_start,
      period_end: s.period_end,
      opening_balance: Number(s.opening_balance),
      closing_balance: Number(s.closing_balance),
      status: s.status,
      note: s.note,
    };
  });

  // KPI Calculations
  const reconciledList = statements.filter((s) => s.status === "RECONCILED");
  const draftList = statements.filter((s) => s.status === "DRAFT");
  const totalReconciledVolume = reconciledList.reduce((sum, s) => sum + s.closing_balance, 0);

  return (
    <div className="space-y-6 pb-12">
      {/* ──────────────────────────────────────────────────────────────────────────
          PAGE HEADER
          ────────────────────────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-950 dark:text-white">
            {isAr ? "المطابقة والتسوية البنكية (Bank Reconciliation)" : "Bank Reconciliation"}
          </h1>
          <p className="text-xs text-slate-500 font-medium">
            {isAr
              ? "مقارنة كشوف الحسابات الصادرة من البنوك مع قيود الأستاذ العام بالدفاتر ومطابقة الحركات سطراً بسطر."
              : "Confront bank statements against ledger records and resolve matching variances line by line."}
          </p>
        </div>
      </div>

      {/* ──────────────────────────────────────────────────────────────────────────
          EXECUTIVE KPI SUMMARY GRID
          ────────────────────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1. Reconciled Statements */}
        <KpiCard
          label={isAr ? "كشوف حسابات مطابقة ومعتمدة" : "Reconciled Statements"}
          value={reconciledList.length.toString()}
          hint={
            isAr
              ? `تمت مطابقتها واعتماد تسويتها بالكامل`
              : `Fully matched & balanced statements`
          }
          icon={<CheckCircle2 className="size-5" />}
          tone="positive"
        />

        {/* 2. In Progress Reconciliations */}
        <KpiCard
          label={isAr ? "كشوف قيد المطابقة والتسوية" : "In Progress Statements"}
          value={draftList.length.toString()}
          hint={
            isAr
              ? `بحاجة لاستكمال مطابقة الحركات الفردية`
              : `Active open statements awaiting match`
          }
          icon={<Clock className="size-5" />}
          tone={draftList.length > 0 ? "warning" : "positive"}
        />

        {/* 3. Bank Accounts Monitored */}
        <KpiCard
          label={isAr ? "الحسابات البنكية المعتمدة" : "Monitored Bank Accounts"}
          value={(accountsRaw ?? []).length.toString()}
          hint={
            isAr
              ? "حسابات بنكية خاضعة للمطابقات الدورية"
              : "Active bank accounts for reconciliation"
          }
          icon={<Landmark className="size-5" />}
          tone="info"
        />

        {/* 4. Total Reconciled Closing Volume */}
        <KpiCard
          label={isAr ? "إجمالي الأرصدة المطابقة" : "Reconciled Closing Balance"}
          value={
            <>
              {totalReconciledVolume.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{" "}
              <span className="text-xs font-bold text-slate-400">{currencyLabel}</span>
            </>
          }
          hint={
            isAr
              ? `عبر ${reconciledList.length} كشف حساب بنكي معتمد`
              : `Total closing balance across reconciled statements`
          }
          icon={<Scale className="size-5" />}
        />
      </div>

      {/* ──────────────────────────────────────────────────────────────────────────
          MAIN CLIENT INTERACTIVE HUB
          ────────────────────────────────────────────────────────────────────────── */}
      <ReconciliationClient
        statements={statements}
        bankAccounts={bankAccountOptions}
        organizationId={organization.id}
        canManage={canManage}
        currency={currency}
        locale={locale}
      />
    </div>
  );
}
