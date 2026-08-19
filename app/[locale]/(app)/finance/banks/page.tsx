import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getPrimaryOrganization } from "@/lib/auth/org-context";
import { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/i18n/routing";
import { KpiCard } from "@/app/[locale]/(app)/dashboard/kpi-card";
import { getCurrencyLabel } from "@/lib/currency";
import {
  BanksClient,
  type BankRow,
  type BankAccountRow,
  type ChequeRow,
} from "./banks-client";
import { type Option } from "./banks-dialogs";
import {
  Building2,
  Landmark,
  FileCheck,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Scale,
  DollarSign,
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
    title: isAr ? "البنوك وحافظة الشيكات | AqarBooks" : "Banks & Cheques Treasury | AqarBooks",
    description: isAr
      ? "إدارة الحسابات البنكية للمنشأة، متابعة حافظة الشيكات وأوراق القبض، والتحصيل والتسويات البنكية."
      : "Organization bank accounts, cheques portfolio under collection, and reconciliation.",
  };
}

export default async function BanksPage({
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

  const supabase = await createClient();

  // 1. Get Primary Resort / Property
  const { data: resort } = await supabase
    .from("resorts")
    .select("id, name")
    .eq("organization_id", organization.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  // 2. Fetch Banks, Bank Accounts, Cheques, COA, Members, Dues, Units, Periods, Org Currency
  const [
    { data: banksRaw },
    { data: bankAccountsRaw },
    { data: accountsRaw },
    { data: membersRaw },
    { data: chequesRaw },
    { data: periodsRaw },
    { data: duesRaw },
    { data: unitsRaw },
    { data: orgData },
  ] = await Promise.all([
    supabase
      .from("banks")
      .select("id, name_ar, name_en")
      .eq("organization_id", organization.id)
      .order("name_ar"),
    supabase
      .from("bank_accounts")
      .select("id, account_name, account_number, bank_id, gl_account_id")
      .eq("organization_id", organization.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("chart_of_accounts")
      .select("id, code, name_ar, name_en, category")
      .eq("organization_id", organization.id)
      .eq("is_group", false)
      .eq("is_active", true)
      .in("category", ["ASSET"])
      .order("code"),
    supabase
      .from("members")
      .select("id, full_name")
      .eq("organization_id", organization.id)
      .order("full_name"),
    supabase
      .from("cheques")
      .select("id, cheque_number, amount, status, due_date, cheque_date, bank_account_id, member_id, direction, note")
      .eq("organization_id", organization.id)
      .order("cheque_date", { ascending: false }),
    supabase
      .from("fiscal_periods")
      .select("id")
      .eq("organization_id", organization.id)
      .eq("status", "OPEN")
      .limit(1),
    supabase
      .from("dues")
      .select("id, unit_id, amount, status")
      .eq("organization_id", organization.id)
      .in("status", ["ISSUED", "PARTIALLY_PAID", "OVERDUE"]),
    supabase
      .from("units")
      .select("id, code")
      .eq("organization_id", organization.id),
    supabase
      .from("organizations")
      .select("default_currency")
      .eq("id", organization.id)
      .maybeSingle(),
  ]);

  const currency = orgData?.default_currency || "EGP";
  const currencyLabel = getCurrencyLabel(currency, isAr);

  // COA mapping
  const accountMap = new Map((accountsRaw ?? []).map((a) => [a.id, a]));
  const assetAccountOptions: Option[] = (accountsRaw ?? []).map((a) => ({
    id: a.id,
    label: `${a.code} — ${isAr ? a.name_ar : a.name_en}`,
  }));

  // Bank name map
  const bankMap = new Map((banksRaw ?? []).map((b) => [b.id, b]));
  const banks: BankRow[] = (banksRaw ?? []).map((b) => ({
    id: b.id,
    name_ar: b.name_ar,
    name_en: b.name_en,
  }));

  // Bank accounts mapped
  const bankAccountMap = new Map((bankAccountsRaw ?? []).map((a) => [a.id, a]));
  const bankAccounts: BankAccountRow[] = (bankAccountsRaw ?? []).map((a) => {
    const bank = bankMap.get(a.bank_id);
    const gl = a.gl_account_id ? accountMap.get(a.gl_account_id) : undefined;
    return {
      id: a.id,
      bank_id: a.bank_id,
      bank_name_ar: bank?.name_ar,
      bank_name_en: bank?.name_en,
      account_name: a.account_name,
      account_number: a.account_number,
      gl_account_id: a.gl_account_id,
      gl_account_code: gl?.code,
      gl_account_name: gl ? (isAr ? gl.name_ar : gl.name_en) : undefined,
    };
  });

  // Members mapping
  const memberMap = new Map((membersRaw ?? []).map((m) => [m.id, m.full_name]));
  const memberOptions: Option[] = (membersRaw ?? []).map((m) => ({
    id: m.id,
    label: m.full_name,
  }));

  // Units mapping for dues
  const unitMap = new Map((unitsRaw ?? []).map((u) => [u.id, u.code]));
  const dueOptions: Option[] = (duesRaw ?? []).map((d) => ({
    id: d.id,
    label: `${unitMap.get(d.unit_id) || "وحدة"} — ${Number(d.amount).toLocaleString()} ${currencyLabel}`,
  }));

  // Cheques mapped
  const cheques: ChequeRow[] = (chequesRaw ?? []).map((c) => {
    const acc = bankAccountMap.get(c.bank_account_id);
    const bank = acc ? bankMap.get(acc.bank_id) : undefined;
    return {
      id: c.id,
      cheque_number: c.cheque_number,
      amount: Number(c.amount),
      status: c.status,
      due_date: c.due_date,
      cheque_date: c.cheque_date,
      bank_account_id: c.bank_account_id,
      bank_account_name: acc?.account_name,
      bank_name: bank ? (isAr ? bank.name_ar : bank.name_en) : undefined,
      member_id: c.member_id,
      member_name: c.member_id ? memberMap.get(c.member_id) : undefined,
      direction: c.direction,
      note: c.note,
    };
  });

  // KPI Calculations
  const underCollectionCheques = cheques.filter(
    (c) => c.status === "RECEIVED" || c.status === "DEPOSITED"
  );
  const totalUnderCollection = underCollectionCheques.reduce((sum, c) => sum + c.amount, 0);

  const clearedCheques = cheques.filter((c) => c.status === "CLEARED");
  const totalCleared = clearedCheques.reduce((sum, c) => sum + c.amount, 0);

  const returnedCheques = cheques.filter((c) => c.status === "RETURNED");
  const totalReturned = returnedCheques.reduce((sum, c) => sum + c.amount, 0);

  const fiscalPeriodId = periodsRaw?.[0]?.id;

  return (
    <div className="space-y-6 pb-12">
      {/* ──────────────────────────────────────────────────────────────────────────
          PAGE HEADER
          ────────────────────────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-950 dark:text-white">
            {isAr ? "البنوك وحافظة الشيكات (Treasury & Banking)" : "Banks & Cheques Portfolio"}
          </h1>
          <p className="text-xs text-slate-500 font-medium">
            {isAr
              ? "إدارة الحسابات البنكية الرسمية، متابعة دورة حياة الشيكات تحت التحصيل، والربط مع التسويات البنكية."
              : "Bank accounts, cheques collection lifecycle, clearing, and automated reconciliations."}
          </p>
        </div>
      </div>

      {/* ──────────────────────────────────────────────────────────────────────────
          EXECUTIVE KPI SUMMARY GRID
          ────────────────────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1. Bank Accounts */}
        <KpiCard
          label={isAr ? "الحسابات البنكية الرسمية" : "Bank Accounts"}
          value={bankAccounts.length.toString()}
          hint={
            isAr
              ? `معرفة ومربوطة بشجرة الحسابات العامة`
              : `Active GL-linked bank accounts`
          }
          icon={<Landmark className="size-5" />}
          tone="info"
        />

        {/* 2. Cheques Under Collection */}
        <KpiCard
          label={isAr ? "شيكات تحت التحصيل (أوراق قبض)" : "Cheques Under Collection"}
          value={
            <>
              {totalUnderCollection.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{" "}
              <span className="text-xs font-bold text-slate-400">{currencyLabel}</span>
            </>
          }
          hint={
            isAr
              ? `إجمالي ${underCollectionCheques.length} شيك برسم الإيداع والتحصيل`
              : `${underCollectionCheques.length} cheques pending clearance`
          }
          icon={<Clock className="size-5" />}
          tone="warning"
        />

        {/* 3. Cleared Cheques */}
        <KpiCard
          label={isAr ? "شيكات تم تحصيلها وإضافتها" : "Cleared Cheques"}
          value={
            <>
              {totalCleared.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{" "}
              <span className="text-xs font-bold text-slate-400">{currencyLabel}</span>
            </>
          }
          hint={
            isAr
              ? `تمت إضافتها لأرصدة البنوك عبر ${clearedCheques.length} شيك`
              : `Successfully deposited & cleared (${clearedCheques.length})`
          }
          icon={<CheckCircle2 className="size-5" />}
          tone="positive"
        />

        {/* 4. Returned Cheques */}
        <KpiCard
          label={isAr ? "شيكات مرتدة ومرفوضة" : "Returned / Bounced"}
          value={
            <>
              {totalReturned.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{" "}
              <span className="text-xs font-bold text-slate-400">{currencyLabel}</span>
            </>
          }
          hint={
            isAr
              ? returnedCheques.length > 0 ? `${returnedCheques.length} شيك بحاجة للمتابعة الفورية` : "لا توجد شيكات مرتدة"
              : `${returnedCheques.length} bounced cheque(s)`
          }
          icon={<AlertTriangle className="size-5" />}
          tone={returnedCheques.length > 0 ? "negative" : "positive"}
        />
      </div>

      {/* ──────────────────────────────────────────────────────────────────────────
          MAIN CLIENT INTERACTIVE HUB
          ────────────────────────────────────────────────────────────────────────── */}
      {resort ? (
        <BanksClient
          banks={banks}
          bankAccounts={bankAccounts}
          cheques={cheques}
          assetAccounts={assetAccountOptions}
          members={memberOptions}
          dues={dueOptions}
          organizationId={organization.id}
          organizationName={organization.name}
          resortId={resort.id}
          resortName={resort.name}
          fiscalPeriodId={fiscalPeriodId}
          currency={currency}
          locale={locale}
        />
      ) : (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
          <p className="text-sm font-bold">
            {isAr
              ? "يرجى تعريف مشروع / منتجع أولاً لربط الحسابات البنكية به."
              : "Please define at least one resort/property before managing bank accounts."}
          </p>
        </div>
      )}
    </div>
  );
}
