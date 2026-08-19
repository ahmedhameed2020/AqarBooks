import { setRequestLocale } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getPrimaryOrganization } from "@/lib/auth/org-context";
import { hasPermission } from "@/lib/auth/authorize";
import { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/i18n/routing";
import { Truck, AlertCircle } from "lucide-react";
import { ApAgingClient, type ApAgingSupplierRow } from "./ap-aging-client";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const isAr = locale === "ar";
  return {
    title: isAr
      ? "تقرير أعمار ديون الموردين والالتزامات (AP Aging) — عقار بوكس"
      : "Accounts Payable (AP) Aging Report — AqarBooks",
    description: isAr
      ? "تحليل التزامات المنشأة تجاه الموردين والمقاولين وتصنيف فترات الاستحقاق لتخطيط السيولة وتفادي غرامات التأخير."
      : "Accounts payable aging analysis tracking vendor liabilities across standard maturity periods.",
  };
}

export default async function ApAgingPage({
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

  const canRead = (await hasPermission(organization.id, "finance.reports.read")) ||
                  (await hasPermission(organization.id, "finance.expenses.view"));

  if (!canRead) {
    return (
      <div className="p-8 text-center space-y-3">
        <div className="size-12 mx-auto rounded-2xl bg-amber-50 dark:bg-amber-950/50 flex items-center justify-center text-amber-600">
          <AlertCircle className="size-6" />
        </div>
        <h1 className="text-lg font-bold text-slate-900 dark:text-white">
          {isAr ? "أعمار ديون الموردين (AP Aging)" : "AP Aging Report"}
        </h1>
        <p className="text-xs text-slate-500 max-w-sm mx-auto">
          {isAr
            ? "لا تملك صلاحية استعراض تقارير ديون ومستحقات الموردين."
            : "You don't have permission to view this report."}
        </p>
      </div>
    );
  }

  const supabase = await createClient();

  // 1. Fetch suppliers
  const { data: suppliersData } = await supabase
    .from("suppliers")
    .select("id, name, contact_phone, contact_email, tax_number")
    .eq("organization_id", organization.id)
    .order("name", { ascending: true });

  // 2. Fetch unpaid supplier invoices
  const { data: invoicesData } = await supabase
    .from("supplier_invoices")
    .select(
      "id, supplier_id, invoice_number, amount, due_date, status, suppliers(id, name, contact_phone, contact_email)"
    )
    .eq("organization_id", organization.id)
    .in("status", ["POSTED", "PARTIALLY_PAID"]);

  // supplier_invoices stores no paid_amount; settlement lives in the
  // allocations, ignoring any that have been reversed.
  const { data: supplierAllocations } = await supabase
    .from("supplier_payment_allocations")
    .select("invoice_id, amount, reversed_at")
    .in("invoice_id", (invoicesData ?? []).map((i) => i.id));

  const paidByInvoice = new Map<string, number>();
  for (const a of supplierAllocations ?? []) {
    if (a.reversed_at) continue;
    paidByInvoice.set(a.invoice_id, (paidByInvoice.get(a.invoice_id) ?? 0) + Number(a.amount));
  }

  // Calculate Aging Buckets for each supplier
  const supplierAgingMap = new Map<
    string,
    {
      supplierId: string;
      supplierName: string;
      phone: string;
      email: string;
      invoicesCount: number;
      bucket0_30: number;
      bucket31_60: number;
      bucket61_90: number;
      bucket90Plus: number;
      totalOutstanding: number;
    }
  >();

  // Initialize with all suppliers
  suppliersData?.forEach((sup) => {
    supplierAgingMap.set(sup.id, {
      supplierId: sup.id,
      supplierName: sup.name,
      phone: sup.contact_phone || "",
      email: sup.contact_email || "",
      invoicesCount: 0,
      bucket0_30: 0,
      bucket31_60: 0,
      bucket61_90: 0,
      bucket90Plus: 0,
      totalOutstanding: 0,
    });
  });

  const now = Date.now();
  (invoicesData || []).forEach((inv) => {
    const supId = inv.supplier_id;
    if (!supId) return;
    const sup = inv.suppliers as unknown as
      | { name?: string; contact_phone?: string; contact_email?: string }
      | null;

    if (!supplierAgingMap.has(supId)) {
      supplierAgingMap.set(supId, {
        supplierId: supId,
        supplierName: sup?.name || "مورد غير معرف",
        phone: sup?.contact_phone || "",
        email: sup?.contact_email || "",
        invoicesCount: 0,
        bucket0_30: 0,
        bucket31_60: 0,
        bucket61_90: 0,
        bucket90Plus: 0,
        totalOutstanding: 0,
      });
    }

    const entry = supplierAgingMap.get(supId)!;
    const balance = Math.max(0, Number(inv.amount || 0) - (paidByInvoice.get(inv.id) ?? 0));
    if (balance <= 0) return;

    entry.invoicesCount += 1;
    entry.totalOutstanding += balance;

    const dueDate = inv.due_date ? new Date(inv.due_date).getTime() : now;
    const daysOverdue = Math.floor((now - dueDate) / (1000 * 60 * 60 * 24));

    if (daysOverdue <= 30) {
      entry.bucket0_30 += balance;
    } else if (daysOverdue <= 60) {
      entry.bucket31_60 += balance;
    } else if (daysOverdue <= 90) {
      entry.bucket61_90 += balance;
    } else {
      entry.bucket90Plus += balance;
    }
  });

  const rows: ApAgingSupplierRow[] = Array.from(supplierAgingMap.values());

  return (
    <ApAgingClient
      rows={rows}
      organizationName={organization.name}
      currency={organization.default_currency || "EGP"}
      locale={locale}
    />
  );
}
