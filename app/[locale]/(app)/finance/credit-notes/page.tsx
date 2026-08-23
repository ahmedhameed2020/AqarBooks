import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getPrimaryOrganization } from "@/lib/auth/org-context";
import { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/i18n/routing";
import { KpiCard } from "@/app/[locale]/(app)/dashboard/kpi-card";
import { getCurrencyLabel } from "@/lib/currency";
import {
  CreditNotesClient,
  type CreditNoteItem,
} from "./credit-notes-client";
import { type DueCreditableOption } from "./credit-notes-dialog";
import { denyIfMissingPermission } from "@/lib/auth/page-guard";
import {
  FileMinus2,
  CheckCircle2,
  DollarSign,
  Scale,
  Percent,
  Receipt,
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
    title: isAr ? "إشعارات الخصم الضريبية | AqarBooks" : "Tax Credit Notes | AqarBooks",
    description: isAr
      ? "إصدار وإدارة إشعارات الخصم الضريبية، تسوية المطالبات، وعكس القيود والضريبة."
      : "Issue and manage tax credit notes, demand adjustments, and VAT reversals.",
  };
}

export default async function CreditNotesPage({
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

  const denied = await denyIfMissingPermission(organization.id, "finance.dues.read", locale);
  if (denied) return denied;

  const supabase = await createClient();

  const [
    { data: resort },
    { data: creditNotesRaw },
    { data: duesRaw },
    { data: unitsRaw },
    { data: orgData },
  ] = await Promise.all([
    supabase
      .from("resorts")
      .select("id, name")
      .eq("organization_id", organization.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("credit_notes")
      .select("id, document_number, document_type, credit_date, gross_amount, taxable_base, vat_amount, reason, source_id, decision_snapshot")
      .eq("organization_id", organization.id)
      .order("credit_date", { ascending: false })
      .limit(300),
    supabase
      .from("dues")
      .select("id, unit_id, amount, description, status, due_date")
      .eq("organization_id", organization.id),
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

  const unitMap = new Map((unitsRaw ?? []).map((u) => [u.id, u.code]));
  const dueMap = new Map((duesRaw ?? []).map((d) => [d.id, d]));

  // Calculate creditable remaining per due
  const creditNotesByDue = new Map<string, number>();
  (creditNotesRaw ?? []).forEach((cn) => {
    creditNotesByDue.set(
      cn.source_id,
      (creditNotesByDue.get(cn.source_id) ?? 0) + Number(cn.gross_amount)
    );
  });

  const dueCreditableOptions: DueCreditableOption[] = (duesRaw ?? [])
    .map((d) => {
      const unitCode = unitMap.get(d.unit_id) || "—";
      const totalAmount = Number(d.amount);
      const credited = creditNotesByDue.get(d.id) ?? 0;
      const remaining = Math.max(0, totalAmount - credited);

      return {
        id: d.id,
        unitCode,
        amount: totalAmount,
        remainingCreditable: remaining,
        label: `${unitCode} — ${d.description || (isAr ? "مطالبة مالية" : "Due")} (${totalAmount.toLocaleString()} ${currencyLabel})`,
      };
    })
    .filter((d) => d.remainingCreditable > 0);

  // Map Credit Notes
  const creditNotes: CreditNoteItem[] = (creditNotesRaw ?? []).map((cn) => {
    const due = dueMap.get(cn.source_id);
    const unitCode = due ? unitMap.get(due.unit_id) || "—" : "—";
    return {
      id: cn.id,
      document_number: cn.document_number,
      document_type: cn.document_type,
      credit_date: cn.credit_date,
      gross_amount: Number(cn.gross_amount),
      taxable_base: Number(cn.taxable_base),
      vat_amount: Number(cn.vat_amount),
      reason: cn.reason,
      unit_code: unitCode,
      due_title: due?.description || (isAr ? "مطالبة مستحقة" : "Issued Due"),
      decision_snapshot: cn.decision_snapshot,
    };
  });

  // KPI Calculations
  const totalGross = creditNotes.reduce((sum, cn) => sum + cn.gross_amount, 0);
  const totalTaxable = creditNotes.reduce((sum, cn) => sum + cn.taxable_base, 0);
  const totalVat = creditNotes.reduce((sum, cn) => sum + cn.vat_amount, 0);

  return (
    <div className="space-y-6 pb-12">
      {/* ──────────────────────────────────────────────────────────────────────────
          PAGE HEADER
          ────────────────────────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-950 dark:text-white">
            {isAr ? "إشعارات الخصم الضريبية (Tax Credit Notes)" : "Tax Credit Notes"}
          </h1>
          <p className="text-xs text-slate-500 font-medium">
            {isAr
              ? "تصحيح الفواتير والمطالبات الصادرة، تسوية الخصومات، وعكس المعالجة الضريبية وقيد الاستحقاق."
              : "Issue legal credit adjustments against demands and reverse revenue/VAT accruals."}
          </p>
        </div>
      </div>

      {/* ──────────────────────────────────────────────────────────────────────────
          EXECUTIVE KPI SUMMARY GRID
          ────────────────────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1. Total Gross Credit Notes */}
        <KpiCard
          label={isAr ? "إجمالي الخصومات الصادرة" : "Total Gross Credits"}
          value={
            <>
              {totalGross.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{" "}
              <span className="text-xs font-bold text-slate-400">{currencyLabel}</span>
            </>
          }
          hint={
            isAr
              ? `إجمالي ${creditNotes.length} إشعار خصم صادر`
              : `${creditNotes.length} total credit notes`
          }
          icon={<FileMinus2 className="size-5" />}
          tone="negative"
        />

        {/* 2. Taxable Base Net Deduction */}
        <KpiCard
          label={isAr ? "صافي الخصم على الإيرادات" : "Net Revenue Deduction"}
          value={
            <>
              {totalTaxable.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{" "}
              <span className="text-xs font-bold text-slate-400">{currencyLabel}</span>
            </>
          }
          hint={
            isAr
              ? "المبالغ المخصومة من الإيراد الصافي"
              : "Taxable base reduction"
          }
          icon={<Scale className="size-5" />}
        />

        {/* 3. VAT Reclaimed */}
        <KpiCard
          label={isAr ? "ضريبة القيمة المضافة المستردة" : "VAT Reclaimed"}
          value={
            <>
              {totalVat.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{" "}
              <span className="text-xs font-bold text-slate-400">{currencyLabel}</span>
            </>
          }
          hint={
            isAr
              ? "ضريبة معكوسة لصالح المنشأة"
              : "Output VAT reversed in return"
          }
          icon={<Percent className="size-5" />}
          tone="positive"
        />

        {/* 4. Total Count */}
        <KpiCard
          label={isAr ? "عدد الإشعارات الضريبية" : "Credit Note Count"}
          value={creditNotes.length.toString()}
          hint={
            isAr
              ? "إشعارات خصم مقفلة ومرحلة بالدفاتر"
              : "Locked & posted credit notes"
          }
          icon={<Receipt className="size-5" />}
          tone="info"
        />
      </div>

      {/* ──────────────────────────────────────────────────────────────────────────
          MAIN CLIENT INTERACTIVE HUB
          ────────────────────────────────────────────────────────────────────────── */}
      <CreditNotesClient
        creditNotes={creditNotes}
        dues={dueCreditableOptions}
        organizationName={organization.name}
        resortName={resort?.name}
        currency={currency}
        locale={locale}
      />
    </div>
  );
}
