import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getPrimaryOrganization } from "@/lib/auth/org-context";
import { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/i18n/routing";
import { KpiCard } from "@/app/[locale]/(app)/dashboard/kpi-card";
import { getCurrencyLabel } from "@/lib/currency";
import {
  SuppliersClient,
  type SupplierItem,
  type SupplierInvoiceItem,
  type PurchaseOrderItem,
} from "./suppliers-client";
import {
  Truck,
  FileText,
  CreditCard,
  ShoppingCart,
  CheckCircle2,
  Clock,
  DollarSign,
  AlertTriangle,
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
    title: isAr ? "الموردون وحسابات المشتريات | AqarBooks" : "Suppliers & Purchasing | AqarBooks",
    description: isAr
      ? "إدارة حسابات الموردين، ترحيل الفواتير، إصدار أوامر الشراء، وتسجيل دفعات السداد."
      : "Manage vendors, post supplier invoices, track purchase orders, and record payments.",
  };
}

export default async function SuppliersPage({
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
  const { data: resort } = await supabase
    .from("resorts")
    .select("id, name")
    .eq("organization_id", organization.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const [
    { data: suppliersRaw },
    { data: accounts },
    { data: requestsRaw },
    { data: ordersRaw },
    { data: invoicesRaw },
    { data: periodsRaw },
    { data: paymentAllocationsRaw },
    { data: orgData },
  ] = await Promise.all([
    supabase.from("suppliers").select("id, name, contact_email, contact_phone, payable_account_id").eq("organization_id", organization.id).order("name"),
    supabase
      .from("chart_of_accounts")
      .select("id, code, name_ar, name_en, category")
      .eq("organization_id", organization.id)
      .eq("is_group", false)
      .eq("is_active", true),
    supabase
      .from("purchase_requests")
      .select("id, description, estimated_amount, status")
      .eq("organization_id", organization.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("purchase_orders")
      .select("id, order_number, description, amount, status, supplier_id")
      .eq("organization_id", organization.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("supplier_invoices")
      .select("id, invoice_number, amount, status, supplier_id, due_date")
      .eq("organization_id", organization.id)
      .order("created_at", { ascending: false })
      .limit(300),
    supabase
      .from("fiscal_periods")
      .select("id, name")
      .eq("organization_id", organization.id)
      .eq("status", "OPEN"),
    supabase.from("supplier_payment_allocations").select("invoice_id, amount"),
    supabase
      .from("organizations")
      .select("default_currency")
      .eq("id", organization.id)
      .maybeSingle(),
  ]);

  const currency = orgData?.default_currency || "EGP";
  const currencyLabel = getCurrencyLabel(currency, isAr);

  const supplierMap = new Map((suppliersRaw ?? []).map((s) => [s.id, s.name]));
  const accountMap = new Map((accounts ?? []).map((a) => [a.id, a.code]));

  const liabilityAccounts = (accounts ?? [])
    .filter((a) => a.category === "LIABILITY")
    .map((a) => ({ id: a.id, label: `${a.code} — ${isAr ? a.name_ar : a.name_en}` }));
  const expenseAccounts = (accounts ?? [])
    .filter((a) => a.category === "EXPENSE")
    .map((a) => ({ id: a.id, label: `${a.code} — ${isAr ? a.name_ar : a.name_en}` }));
  const assetAccounts = (accounts ?? [])
    .filter((a) => a.category === "ASSET")
    .map((a) => ({ id: a.id, label: `${a.code} — ${isAr ? a.name_ar : a.name_en}` }));
  const periods = (periodsRaw ?? []).map((p) => ({ id: p.id, label: p.name }));

  // Calculate paid amounts by invoice
  const paidByInvoice = new Map<string, number>();
  for (const a of paymentAllocationsRaw ?? []) {
    paidByInvoice.set(a.invoice_id, (paidByInvoice.get(a.invoice_id) ?? 0) + Number(a.amount));
  }

  // Map Invoices
  const invoices: SupplierInvoiceItem[] = (invoicesRaw ?? []).map((inv) => {
    const totalAmount = Number(inv.amount);
    const paid = paidByInvoice.get(inv.id) ?? 0;
    const remaining = Math.max(0, totalAmount - paid);

    return {
      id: inv.id,
      invoice_number: inv.invoice_number,
      supplier_id: inv.supplier_id,
      supplier_name: supplierMap.get(inv.supplier_id) || (isAr ? "مورد عام" : "General Vendor"),
      amount: totalAmount,
      paid_amount: paid,
      remaining_amount: remaining,
      due_date: inv.due_date,
      status: inv.status,
    };
  });

  // Calculate supplier totals
  const billedBySupplier = new Map<string, number>();
  const paidBySupplier = new Map<string, number>();
  const invoiceCountBySupplier = new Map<string, number>();

  invoices.forEach((inv) => {
    billedBySupplier.set(inv.supplier_id, (billedBySupplier.get(inv.supplier_id) ?? 0) + inv.amount);
    paidBySupplier.set(inv.supplier_id, (paidBySupplier.get(inv.supplier_id) ?? 0) + inv.paid_amount);
    invoiceCountBySupplier.set(
      inv.supplier_id,
      (invoiceCountBySupplier.get(inv.supplier_id) ?? 0) + 1
    );
  });

  // Map Suppliers
  const suppliers: SupplierItem[] = (suppliersRaw ?? []).map((s) => {
    const totalBilled = billedBySupplier.get(s.id) ?? 0;
    const totalPaid = paidBySupplier.get(s.id) ?? 0;
    return {
      id: s.id,
      name: s.name,
      contact_email: s.contact_email,
      contact_phone: s.contact_phone,
      payable_account_code: s.payable_account_id ? accountMap.get(s.payable_account_id) : undefined,
      invoice_count: invoiceCountBySupplier.get(s.id) ?? 0,
      total_billed: totalBilled,
      total_paid: totalPaid,
      remaining_balance: Math.max(0, totalBilled - totalPaid),
    };
  });

  // Map Purchase Orders
  const orders: PurchaseOrderItem[] = (ordersRaw ?? []).map((o) => ({
    id: o.id,
    order_number: o.order_number,
    supplier_id: o.supplier_id,
    supplier_name: supplierMap.get(o.supplier_id) || "—",
    description: o.description,
    amount: Number(o.amount),
    status: o.status,
  }));

  // KPI Calculations
  const totalInvoiced = invoices.reduce((sum, i) => sum + i.amount, 0);
  const totalPaid = invoices.reduce((sum, i) => sum + i.paid_amount, 0);
  const totalRemaining = invoices.reduce((sum, i) => sum + i.remaining_amount, 0);

  return (
    <div className="space-y-6 pb-12">
      {/* ──────────────────────────────────────────────────────────────────────────
          PAGE HEADER
          ────────────────────────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-950 dark:text-white">
            {isAr ? "الموردون وحسابات المشتريات (Suppliers & Payables)" : "Suppliers & Purchasing"}
          </h1>
          <p className="text-xs text-slate-500 font-medium">
            {isAr
              ? "إدارة حسابات وفواتير الموردين، متابعة الاستحقاقات والخصم الضريبي، وتسجيل أوامر الشراء وسندات الصرف."
              : "Manage vendor ledger, track payables and taxes, issue purchase orders and record payments."}
          </p>
        </div>
      </div>

      {/* ──────────────────────────────────────────────────────────────────────────
          EXECUTIVE KPI SUMMARY GRID
          ────────────────────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1. Total Invoiced */}
        <KpiCard
          label={isAr ? "إجمالي فواتير الموردين" : "Total Billed Volume"}
          value={
            <>
              {totalInvoiced.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{" "}
              <span className="text-xs font-bold text-slate-400">{currencyLabel}</span>
            </>
          }
          hint={
            isAr
              ? `إجمالي ${invoices.length} فاتورة مسجلة بالدفاتر`
              : `${invoices.length} supplier invoices`
          }
          icon={<FileText className="size-5" />}
          tone="info"
        />

        {/* 2. Total Paid */}
        <KpiCard
          label={isAr ? "المسدد للموردين" : "Total Paid Out"}
          value={
            <>
              {totalPaid.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{" "}
              <span className="text-xs font-bold text-slate-400">{currencyLabel}</span>
            </>
          }
          hint={
            isAr
              ? `نسبة سداد ${totalInvoiced > 0 ? Math.round((totalPaid / totalInvoiced) * 100) : 0}% من إجمالي الالتزامات`
              : `${totalInvoiced > 0 ? Math.round((totalPaid / totalInvoiced) * 100) : 0}% settlement rate`
          }
          icon={<CheckCircle2 className="size-5" />}
          tone="positive"
        />

        {/* 3. Outstanding Balance */}
        <KpiCard
          label={isAr ? "الرصيد المستحق واجب السداد" : "Outstanding Payables"}
          value={
            <>
              {totalRemaining.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{" "}
              <span className="text-xs font-bold text-slate-400">{currencyLabel}</span>
            </>
          }
          hint={
            isAr
              ? "مستحقات وفواتير مفتوحة بانتظار الصرف"
              : "Open vendor liability balances"
          }
          icon={<Clock className="size-5" />}
          tone={totalRemaining > 0 ? "warning" : "positive"}
        />

        {/* 4. Active Suppliers */}
        <KpiCard
          label={isAr ? "الموردون المعتمدون" : "Active Suppliers"}
          value={suppliers.length.toString()}
          hint={
            isAr
              ? "موردون مسجلون بدليل الحسابات"
              : "Registered vendors in directory"
          }
          icon={<Truck className="size-5" />}
          tone="info"
        />
      </div>

      {/* ──────────────────────────────────────────────────────────────────────────
          MAIN CLIENT INTERACTIVE HUB
          ────────────────────────────────────────────────────────────────────────── */}
      {resort ? (
        <SuppliersClient
          suppliers={suppliers}
          invoices={invoices}
          orders={orders}
          liabilityAccounts={liabilityAccounts}
          expenseAccounts={expenseAccounts}
          assetAccounts={assetAccounts}
          periods={periods}
          organizationId={organization.id}
          resortId={resort.id}
          currency={currency}
          locale={locale}
        />
      ) : (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
          <p className="text-sm font-bold">
            {isAr
              ? "يرجى تعريف مشروع / منتجع أولاً لإدارة الموردين وحسابات المشتريات."
              : "Please define a property/resort before managing suppliers."}
          </p>
        </div>
      )}
    </div>
  );
}
