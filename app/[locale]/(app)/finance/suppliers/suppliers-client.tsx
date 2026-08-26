"use client";

import { useState, useMemo } from "react";
import { Link } from "@/i18n/navigation";
import {
  Truck,
  FileText,
  CreditCard,
  ShoppingCart,
  Plus,
  Search,
  Calendar,
  Building2,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Layers,
  DollarSign,
  ChevronRight,
  Printer,
  Download,
} from "lucide-react";
import ExcelJS from "exceljs";
import { generateFinancialStatementPdf } from "@/lib/reports/financial-statements-pdf";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { getCurrencyLabel } from "@/lib/currency";
import {
  CreateSupplierDialog,
  PostInvoiceDialog,
  RecordSupplierPaymentDialog,
  type Option,
  type InvoiceOption,
} from "./suppliers-dialogs";

export type SupplierItem = {
  id: string;
  name: string;
  category?: string | null;
  tax_number?: string | null;
  commercial_registry?: string | null;
  contact_person?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  payable_account_code?: string;
  payment_terms_days?: number;
  credit_limit?: number;
  bank_name?: string | null;
  bank_iban?: string | null;
  invoice_count: number;
  total_billed: number;
  total_paid: number;
  remaining_balance: number;
};

export type SupplierInvoiceItem = {
  id: string;
  invoice_number: string;
  supplier_id: string;
  supplier_name: string;
  amount: number;
  paid_amount: number;
  remaining_amount: number;
  due_date: string;
  status: "DRAFT" | "POSTED" | "PAID" | "CANCELLED" | string;
};

export type PurchaseOrderItem = {
  id: string;
  order_number?: string | number | null;
  supplier_id: string;
  supplier_name: string;
  description: string;
  amount: number;
  status: "DRAFT" | "SUBMITTED" | "APPROVED" | "RECEIVED" | "CANCELLED" | string;
};

export function SuppliersClient({
  suppliers,
  invoices,
  orders,
  liabilityAccounts,
  expenseAccounts,
  assetAccounts,
  periods,
  organizationId,
  resortId,
  canPostInvoice = false,
  canPaySupplier = false,
  canManageSuppliers = false,
  currency = "EGP",
  locale,
}: {
  suppliers: SupplierItem[];
  invoices: SupplierInvoiceItem[];
  orders: PurchaseOrderItem[];
  liabilityAccounts: Option[];
  expenseAccounts: Option[];
  assetAccounts: Option[];
  periods: Option[];
  organizationId: string;
  resortId: string;
  canPostInvoice?: boolean;
  canPaySupplier?: boolean;
  canManageSuppliers?: boolean;
  currency?: string;
  locale: string;
}) {
  const isAr = locale === "ar";
  const currencyLabel = getCurrencyLabel(currency, isAr);

  const [activeTab, setActiveTab] = useState<"INVOICES" | "SUPPLIERS" | "ORDERS">("INVOICES");
  const [searchQuery, setSearchQuery] = useState("");

  const [createSupplierOpen, setCreateSupplierOpen] = useState(false);
  const [postInvoiceOpen, setPostInvoiceOpen] = useState(false);
  const [recordPaymentOpen, setRecordPaymentOpen] = useState(false);
  const [selectedPayInvoiceId, setSelectedPayInvoiceId] = useState<string | undefined>(undefined);

  const supplierOptions = useMemo(
    () => suppliers.map((s) => ({ id: s.id, label: s.name })),
    [suppliers]
  );

  const invoiceOptions: InvoiceOption[] = useMemo(
    () =>
      invoices
        .filter((i) => i.status !== "PAID" && i.status !== "CANCELLED")
        .map((i) => ({
          id: i.id,
          label: `${i.invoice_number} — ${i.supplier_name}`,
          remaining: i.remaining_amount,
          supplierId: i.supplier_id,
        })),
    [invoices]
  );

  const filteredInvoices = useMemo(() => {
    if (!searchQuery.trim()) return invoices;
    const q = searchQuery.toLowerCase().trim();
    return invoices.filter(
      (i) =>
        i.invoice_number.toLowerCase().includes(q) ||
        i.supplier_name.toLowerCase().includes(q) ||
        i.due_date.includes(q)
    );
  }, [invoices, searchQuery]);

  const filteredSuppliers = useMemo(() => {
    if (!searchQuery.trim()) return suppliers;
    const q = searchQuery.toLowerCase().trim();
    return suppliers.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.contact_email || "").toLowerCase().includes(q) ||
        (s.contact_phone || "").includes(q)
    );
  }, [suppliers, searchQuery]);

  const filteredOrders = useMemo(() => {
    if (!searchQuery.trim()) return orders;
    const q = searchQuery.toLowerCase().trim();
    return orders.filter(
      (o) =>
        String(o.order_number ?? "").toLowerCase().includes(q) ||
        o.supplier_name.toLowerCase().includes(q) ||
        o.description.toLowerCase().includes(q)
    );
  }, [orders, searchQuery]);

  const handlePayInvoice = (invId: string) => {
    setSelectedPayInvoiceId(invId);
    setRecordPaymentOpen(true);
  };

  const handleExportPdf = () => {
    if (activeTab === "INVOICES") {
      const totalAmount = filteredInvoices.reduce((s, i) => s + i.amount, 0);
      const totalPaid = filteredInvoices.reduce((s, i) => s + i.paid_amount, 0);
      const totalRemaining = filteredInvoices.reduce((s, i) => s + i.remaining_amount, 0);

      generateFinancialStatementPdf(
        {
          title: isAr ? "سجل فواتير الموردين والذمم الدائنة" : "Supplier Invoices & Payables Log",
          subtitle: isAr ? "كشف فواتير الموردين والمسدد والمتبقي وتواريخ الاستحقاق" : "Supplier invoices, payments, remaining balances and due dates",
          organizationName: "AqarBooks",
          currencyLabel: currency,
          dateRangeLabel: new Date().toISOString().slice(0, 10),
          columns: [
            { header: isAr ? "رقم الفاتورة" : "Invoice #", key: "num", align: "start", width: "16%" },
            { header: isAr ? "المورد" : "Supplier", key: "supplier", align: "start", width: "26%" },
            { header: isAr ? "تاريخ الاستحقاق" : "Due Date", key: "dueDate", align: "center", width: "16%" },
            { header: isAr ? "المبلغ" : "Total", key: "amount", align: "end", isNumber: true, width: "14%" },
            { header: isAr ? "المسدد" : "Paid", key: "paid", align: "end", isNumber: true, width: "14%" },
            { header: isAr ? "المتبقي" : "Remaining", key: "remaining", align: "end", isNumber: true, width: "14%" },
          ],
          rows: filteredInvoices.map((inv) => ({
            num: inv.invoice_number,
            supplier: inv.supplier_name,
            dueDate: inv.due_date,
            amount: inv.amount,
            paid: inv.paid_amount,
            remaining: inv.remaining_amount,
          })),
          totalRow: {
            num: isAr ? "الإجمالي" : "Total",
            supplier: "",
            dueDate: "",
            amount: totalAmount,
            paid: totalPaid,
            remaining: totalRemaining,
          },
          summaryCards: [
            { label: isAr ? "عدد الفواتير" : "Total Invoices", value: filteredInvoices.length },
            {
              label: isAr ? "إجمالي قيمة الفواتير" : "Total Invoiced",
              value: `${totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`,
            },
            {
              label: isAr ? "إجمالي المتبقي سداده" : "Total Payables Remaining",
              value: `${totalRemaining.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`,
              highlight: true,
            },
          ],
          includeCoverPage: false,
        },
        locale
      );
    } else if (activeTab === "SUPPLIERS") {
      const totalBilled = filteredSuppliers.reduce((s, sup) => s + sup.total_billed, 0);
      const totalPaid = filteredSuppliers.reduce((s, sup) => s + sup.total_paid, 0);
      const totalRemaining = filteredSuppliers.reduce((s, sup) => s + sup.remaining_balance, 0);

      generateFinancialStatementPdf(
        {
          title: isAr ? "دليل الموردين المعتمدين وأرصدة الحسابات" : "Approved Suppliers & Balances Directory",
          subtitle: isAr ? "بيان الموردين وبيانات التواصل والفوترة والأرصدة المستحقة" : "Suppliers directory, contact info, billing totals and balances",
          organizationName: "AqarBooks",
          currencyLabel: currency,
          dateRangeLabel: new Date().toISOString().slice(0, 10),
          columns: [
            { header: isAr ? "اسم المورد" : "Supplier Name", key: "name", align: "start", width: "25%" },
            { header: isAr ? "التصنيف" : "Category", key: "category", align: "start", width: "15%" },
            { header: isAr ? "الهاتف" : "Phone", key: "phone", align: "center", width: "15%" },
            { header: isAr ? "إجمالي الفواتير" : "Billed", key: "billed", align: "end", isNumber: true, width: "15%" },
            { header: isAr ? "المسدد" : "Paid", key: "paid", align: "end", isNumber: true, width: "15%" },
            { header: isAr ? "الرصيد المستحق" : "Balance Due", key: "balance", align: "end", isNumber: true, width: "15%" },
          ],
          rows: filteredSuppliers.map((sup) => ({
            name: sup.name,
            category: sup.category || "—",
            phone: sup.contact_phone || "—",
            billed: sup.total_billed,
            paid: sup.total_paid,
            balance: sup.remaining_balance,
          })),
          totalRow: {
            name: isAr ? "الإجمالي" : "Total",
            category: "",
            phone: "",
            billed: totalBilled,
            paid: totalPaid,
            balance: totalRemaining,
          },
          summaryCards: [
            { label: isAr ? "إجمالي الموردين" : "Total Suppliers", value: filteredSuppliers.length },
            {
              label: isAr ? "إجمالي المطالبات المفوترة" : "Total Billed",
              value: `${totalBilled.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`,
            },
            {
              label: isAr ? "إجمالي المستحقات القائمة" : "Total Payables Outstanding",
              value: `${totalRemaining.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`,
              highlight: true,
            },
          ],
          includeCoverPage: false,
        },
        locale
      );
    } else {
      const totalOrdersAmount = filteredOrders.reduce((s, o) => s + o.amount, 0);

      generateFinancialStatementPdf(
        {
          title: isAr ? "سجل أوامر الشراء والتوريد" : "Purchase Orders Registry",
          subtitle: isAr ? "بيان أوامر الشراء والتوريد المعتمدة والجارية" : "Purchase orders log, suppliers and estimated values",
          organizationName: "AqarBooks",
          currencyLabel: currency,
          dateRangeLabel: new Date().toISOString().slice(0, 10),
          columns: [
            { header: isAr ? "رقم الأمر" : "Order #", key: "num", align: "center", width: "15%" },
            { header: isAr ? "المورد" : "Supplier", key: "supplier", align: "start", width: "25%" },
            { header: isAr ? "البيان / الوصف" : "Description", key: "desc", align: "start", width: "35%" },
            { header: isAr ? "القيمة التقديرية" : "Estimated Value", key: "amount", align: "end", isNumber: true, width: "15%" },
            { header: isAr ? "الحالة" : "Status", key: "status", align: "center", width: "10%" },
          ],
          rows: filteredOrders.map((o) => ({
            num: `#${o.order_number || "—"}`,
            supplier: o.supplier_name,
            desc: o.description,
            amount: o.amount,
            status: o.status,
          })),
          totalRow: {
            num: isAr ? "الإجمالي" : "Total",
            supplier: "",
            desc: "",
            amount: totalOrdersAmount,
            status: "",
          },
          summaryCards: [
            { label: isAr ? "عدد الأوامر" : "Total Orders", value: filteredOrders.length },
            {
              label: isAr ? "إجمالي القيمة التقديرية" : "Total Orders Value",
              value: `${totalOrdersAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`,
              highlight: true,
            },
          ],
          includeCoverPage: false,
        },
        locale
      );
    }
  };

  const handleExportExcel = async () => {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "AqarBooks";
    workbook.created = new Date();

    if (activeTab === "INVOICES") {
      const worksheet = workbook.addWorksheet(isAr ? "فواتير الموردين" : "Supplier Invoices", {
        views: [{ rightToLeft: isAr }],
      });
      worksheet.columns = [
        { header: isAr ? "رقم الفاتورة" : "Invoice #", width: 18 },
        { header: isAr ? "المورد" : "Supplier", width: 30 },
        { header: isAr ? "تاريخ الاستحقاق" : "Due Date", width: 16 },
        { header: isAr ? "مبلغ الفاتورة" : "Total Amount", width: 18 },
        { header: isAr ? "المسدد" : "Paid", width: 18 },
        { header: isAr ? "المتبقي" : "Remaining", width: 18 },
        { header: isAr ? "الحالة" : "Status", width: 16 },
      ];
      worksheet.getRow(1).eachCell((c) => {
        c.font = { bold: true, color: { argb: "FFFFFFFF" } };
        c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF581C87" } };
      });
      for (const inv of filteredInvoices) {
        const row = worksheet.addRow([
          inv.invoice_number,
          inv.supplier_name,
          inv.due_date,
          inv.amount,
          inv.paid_amount,
          inv.remaining_amount,
          inv.status,
        ]);
        row.getCell(4).numFmt = "#,##0.00";
        row.getCell(5).numFmt = "#,##0.00";
        row.getCell(6).numFmt = "#,##0.00";
      }
    } else if (activeTab === "SUPPLIERS") {
      const worksheet = workbook.addWorksheet(isAr ? "دليل الموردين" : "Suppliers", {
        views: [{ rightToLeft: isAr }],
      });
      worksheet.columns = [
        { header: isAr ? "اسم المورد" : "Supplier Name", width: 30 },
        { header: isAr ? "التصنيف" : "Category", width: 18 },
        { header: isAr ? "الرقم الضريبي" : "Tax #", width: 18 },
        { header: isAr ? "الهاتف" : "Phone", width: 18 },
        { header: isAr ? "البريد الإلكتروني" : "Email", width: 25 },
        { header: isAr ? "إجمالي الفواتير" : "Billed", width: 18 },
        { header: isAr ? "المسدد" : "Paid", width: 18 },
        { header: isAr ? "الرصيد المستحق" : "Balance", width: 18 },
      ];
      worksheet.getRow(1).eachCell((c) => {
        c.font = { bold: true, color: { argb: "FFFFFFFF" } };
        c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A8A" } };
      });
      for (const s of filteredSuppliers) {
        const row = worksheet.addRow([
          s.name,
          s.category || "—",
          s.tax_number || "—",
          s.contact_phone || "—",
          s.contact_email || "—",
          s.total_billed,
          s.total_paid,
          s.remaining_balance,
        ]);
        row.getCell(6).numFmt = "#,##0.00";
        row.getCell(7).numFmt = "#,##0.00";
        row.getCell(8).numFmt = "#,##0.00";
      }
    } else {
      const worksheet = workbook.addWorksheet(isAr ? "أوامر الشراء" : "Purchase Orders", {
        views: [{ rightToLeft: isAr }],
      });
      worksheet.columns = [
        { header: isAr ? "رقم الأمر" : "Order #", width: 16 },
        { header: isAr ? "المورد" : "Supplier", width: 30 },
        { header: isAr ? "البيان / الوصف" : "Description", width: 35 },
        { header: isAr ? "القيمة التقديرية" : "Amount", width: 18 },
        { header: isAr ? "الحالة" : "Status", width: 16 },
      ];
      worksheet.getRow(1).eachCell((c) => {
        c.font = { bold: true, color: { argb: "FFFFFFFF" } };
        c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F766E" } };
      });
      for (const o of filteredOrders) {
        const row = worksheet.addRow([
          `#${o.order_number || "—"}`,
          o.supplier_name,
          o.description,
          o.amount,
          o.status,
        ]);
        row.getCell(4).numFmt = "#,##0.00";
      }
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Suppliers_${activeTab}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* ──────────────────────────────────────────────────────────────────────────
          MAIN ACTION TOOLBAR & MODULE TABS
          ────────────────────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white dark:bg-slate-900 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        {/* Module Section Tabs */}
        <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl w-full sm:w-auto">
          <button
            onClick={() => setActiveTab("INVOICES")}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
              activeTab === "INVOICES"
                ? "bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
            }`}
          >
            <FileText className="size-3.5" />
            <span>{isAr ? "فواتير واستحقاقات الموردين" : "Supplier Invoices"}</span>
            <Badge variant="secondary" className="text-[10px] h-4 px-1 ms-1">
              {invoices.length}
            </Badge>
          </button>

          <button
            onClick={() => setActiveTab("SUPPLIERS")}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
              activeTab === "SUPPLIERS"
                ? "bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
            }`}
          >
            <Truck className="size-3.5" />
            <span>{isAr ? "دليل الموردين" : "Suppliers"}</span>
            <Badge variant="secondary" className="text-[10px] h-4 px-1 ms-1">
              {suppliers.length}
            </Badge>
          </button>

          <button
            onClick={() => setActiveTab("ORDERS")}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
              activeTab === "ORDERS"
                ? "bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
            }`}
          >
            <ShoppingCart className="size-3.5" />
            <span>{isAr ? "أوامر الشراء" : "Purchase Orders"}</span>
            <Badge variant="secondary" className="text-[10px] h-4 px-1 ms-1">
              {orders.length}
            </Badge>
          </button>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2 self-stretch sm:self-auto">
          {/* Search */}
          <div className="relative w-full sm:w-48">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={isAr ? "بحث..." : "Search..."}
              className="ps-9 text-xs h-9"
            />
          </div>

          <Button
            type="button"
            variant="outline"
            onClick={handleExportPdf}
            className="text-xs font-bold gap-1.5 h-9 border-slate-200 dark:border-slate-700"
          >
            <Printer className="size-3.5 text-purple-600" />
            <span>{isAr ? "طباعة / PDF" : "Print PDF"}</span>
          </Button>

          <Button
            type="button"
            variant="outline"
            onClick={handleExportExcel}
            className="text-xs font-bold gap-1.5 h-9 border-slate-200 dark:border-slate-700"
          >
            <Download className="size-3.5 text-emerald-600" />
            <span>{isAr ? "تصدير Excel" : "Export Excel"}</span>
          </Button>

          {canManageSuppliers && (
            <Button
              onClick={() => setCreateSupplierOpen(true)}
              variant="outline"
              className="text-xs font-bold gap-1.5 h-9"
            >
              <Truck className="size-3.5 text-slate-500" />
              <span>{isAr ? "مورد جديد" : "New Supplier"}</span>
            </Button>
          )}

          {canPaySupplier && (
            <Button
              onClick={() => setRecordPaymentOpen(true)}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs gap-1.5 h-9 shadow-sm"
            >
              <CreditCard className="size-3.5" />
              <span>{isAr ? "سداد دفعة" : "Pay Supplier"}</span>
            </Button>
          )}

          {canPostInvoice && (
            <Button
              onClick={() => setPostInvoiceOpen(true)}
              className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs gap-1.5 h-9 shadow-xs press-feedback motion-control"
            >
              <Plus className="size-3.5" />
              <span>{isAr ? "ترحيل فاتورة" : "Post Invoice"}</span>
            </Button>
          )}
        </div>
      </div>

      {/* ──────────────────────────────────────────────────────────────────────────
          TAB 1: SUPPLIER INVOICES TABLE
          ────────────────────────────────────────────────────────────────────────── */}
      {activeTab === "INVOICES" && (
        <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-start">
              <thead className="bg-slate-900 text-white dark:bg-slate-800/90 font-bold border-b border-slate-800">
                <tr>
                  <th className="p-3.5 text-start">{isAr ? "رقم الفاتورة" : "Invoice #"}</th>
                  <th className="p-3.5 text-start">{isAr ? "المورد" : "Supplier"}</th>
                  <th className="p-3.5 text-start">{isAr ? "تاريخ الاستحقاق" : "Due Date"}</th>
                  <th className="p-3.5 text-end">{isAr ? "مبلغ الفاتورة" : "Total Amount"}</th>
                  <th className="p-3.5 text-end">{isAr ? "المسدد" : "Paid"}</th>
                  <th className="p-3.5 text-end">{isAr ? "المتبقي للدفع" : "Remaining"}</th>
                  <th className="p-3.5 text-center">{isAr ? "الحالة" : "Status"}</th>
                  <th className="p-3.5 text-end">{isAr ? "الإجراءات" : "Actions"}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredInvoices.length ? (
                  filteredInvoices.map((inv) => {
                    const isPaid = inv.status === "PAID";
                    return (
                      <tr
                        key={inv.id}
                        className="hover:bg-slate-50/70 dark:hover:bg-slate-800/50 transition-colors group"
                      >
                        <td className="p-3.5 font-mono font-bold text-slate-900 dark:text-white">
                          <div className="flex items-center gap-1.5">
                            <FileText className="size-3.5 text-purple-600" />
                            <span>{inv.invoice_number}</span>
                          </div>
                        </td>

                        <td className="p-3.5 font-semibold text-slate-800 dark:text-slate-200">
                          {inv.supplier_name}
                        </td>

                        <td className="p-3.5 font-mono text-[11px] text-slate-600 dark:text-slate-400">
                          {inv.due_date}
                        </td>

                        <td className="p-3.5 text-end font-mono font-bold text-slate-900 dark:text-white text-xs">
                          {inv.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}{" "}
                          <span className="text-[10px] text-slate-400 font-normal">{currencyLabel}</span>
                        </td>

                        <td className="p-3.5 text-end font-mono font-semibold text-emerald-600 dark:text-emerald-400 text-xs">
                          {inv.paid_amount > 0 ? (
                            <>
                              {inv.paid_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}{" "}
                              <span className="text-[10px] text-slate-400 font-normal">{currencyLabel}</span>
                            </>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>

                        <td className="p-3.5 text-end font-mono font-black text-sm text-slate-900 dark:text-white">
                          {inv.remaining_amount > 0 ? (
                            <span className="text-rose-600">
                              {inv.remaining_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}{" "}
                              <span className="text-[10px] text-slate-400 font-normal">{currencyLabel}</span>
                            </span>
                          ) : (
                            <span className="text-emerald-600">0.00</span>
                          )}
                        </td>

                        <td className="p-3.5 text-center">
                          <Badge
                            className={`text-[10px] font-bold ${
                              isPaid
                                ? "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300"
                                : "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950 dark:text-amber-300"
                            }`}
                          >
                            {isPaid ? (isAr ? "✓ مسددة بالكامل" : "Paid") : (isAr ? "قيد السداد" : "Open")}
                          </Badge>
                        </td>

                        <td className="p-3.5 text-end">
                          {canPaySupplier && !isPaid && (
                            <Button
                              onClick={() => handlePayInvoice(inv.id)}
                              size="sm"
                              className="h-7 px-2.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white gap-1 shadow-sm"
                            >
                              <CreditCard className="size-3" />
                              <span>{isAr ? "سداد الفاتورة" : "Pay"}</span>
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={8} className="p-10 text-center text-slate-400 text-xs">
                      {isAr ? "لا توجد فواتير موردين مسجلة بعد" : "No supplier invoices found"}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────────────────────
          TAB 2: SUPPLIERS DIRECTORY TABLE
          ────────────────────────────────────────────────────────────────────────── */}
      {activeTab === "SUPPLIERS" && (
        <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-start">
              <thead className="bg-slate-900 text-white dark:bg-slate-800/90 font-bold border-b border-slate-800">
                <tr>
                  <th className="p-3.5 text-start">{isAr ? "المورد والنشاط" : "Supplier & Activity"}</th>
                  <th className="p-3.5 text-start">{isAr ? "البيانات الضريبية والتجارية" : "Tax & CR"}</th>
                  <th className="p-3.5 text-start">{isAr ? "مسؤول التواصل" : "Contact"}</th>
                  <th className="p-3.5 text-center">{isAr ? "الفواتير" : "Invoices"}</th>
                  <th className="p-3.5 text-end">{isAr ? "إجمالي التعاملات" : "Total Billed"}</th>
                  <th className="p-3.5 text-end">{isAr ? "المسدد له" : "Total Paid"}</th>
                  <th className="p-3.5 text-end">{isAr ? "الرصيد المستحق" : "Outstanding"}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredSuppliers.length ? (
                  filteredSuppliers.map((s) => (
                    <tr
                      key={s.id}
                      className="hover:bg-slate-50/70 dark:hover:bg-slate-800/50 transition-colors group"
                    >
                      <td className="p-3.5 font-bold text-slate-900 dark:text-white">
                        <div className="flex items-center gap-2">
                          <Truck className="size-4 text-blue-600 shrink-0" />
                          <div>
                            <div>{s.name}</div>
                            {s.category && (
                              <Badge variant="outline" className="text-[10px] font-normal border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-300 mt-0.5">
                                {s.category}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </td>

                      <td className="p-3.5">
                        {s.tax_number ? (
                          <div className="font-mono text-xs font-bold text-slate-800 dark:text-slate-200">
                            <span className="text-[10px] text-slate-400 font-normal me-1">{isAr ? "ضريبي:" : "Tax:"}</span>
                            {s.tax_number}
                          </div>
                        ) : (
                          <span className="text-slate-400 text-[11px]">—</span>
                        )}
                        {s.commercial_registry && (
                          <div className="font-mono text-[11px] text-slate-500">
                            <span className="text-[10px] text-slate-400 font-normal me-1">{isAr ? "س.ت:" : "CR:"}</span>
                            {s.commercial_registry}
                          </div>
                        )}
                      </td>

                      <td className="p-3.5 text-slate-600 dark:text-slate-400">
                        {s.contact_person && <div className="font-semibold text-slate-800 dark:text-slate-200">{s.contact_person}</div>}
                        <div>{s.contact_phone || "—"}</div>
                        {s.contact_email && <div className="text-[11px] font-mono text-slate-400">{s.contact_email}</div>}
                      </td>

                      <td className="p-3.5 text-center font-mono font-bold text-slate-700 dark:text-slate-300">
                        {s.invoice_count}
                      </td>

                      <td className="p-3.5 text-end font-mono font-bold text-slate-900 dark:text-white text-xs">
                        {s.total_billed.toLocaleString(undefined, { minimumFractionDigits: 2 })}{" "}
                        <span className="text-[10px] text-slate-400 font-normal">{currencyLabel}</span>
                      </td>

                      <td className="p-3.5 text-end font-mono font-semibold text-emerald-600 dark:text-emerald-400 text-xs">
                        {s.total_paid.toLocaleString(undefined, { minimumFractionDigits: 2 })}{" "}
                        <span className="text-[10px] text-slate-400 font-normal">{currencyLabel}</span>
                      </td>

                      <td className="p-3.5 text-end font-mono font-black text-sm text-slate-900 dark:text-white">
                        {s.remaining_balance > 0 ? (
                          <span className="text-rose-600">
                            {s.remaining_balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}{" "}
                            <span className="text-[10px] text-slate-400 font-normal">{currencyLabel}</span>
                          </span>
                        ) : (
                          <span className="text-emerald-600">0.00</span>
                        )}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="p-10 text-center text-slate-400 text-xs">
                      {isAr ? "لا يوجد موردون مسجلون بعد" : "No suppliers registered"}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────────────────────
          TAB 3: PURCHASE ORDERS TABLE
          ────────────────────────────────────────────────────────────────────────── */}
      {activeTab === "ORDERS" && (
        <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-start">
              <thead className="bg-slate-900 text-white dark:bg-slate-800/90 font-bold border-b border-slate-800">
                <tr>
                  <th className="p-3.5 text-start">{isAr ? "رقم أمر الشراء" : "PO #"}</th>
                  <th className="p-3.5 text-start">{isAr ? "المورد" : "Supplier"}</th>
                  <th className="p-3.5 text-start">{isAr ? "البيان / الوصف" : "Description"}</th>
                  <th className="p-3.5 text-end">{isAr ? "القيمة التقديرية" : "Amount"}</th>
                  <th className="p-3.5 text-center">{isAr ? "الحالة" : "Status"}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredOrders.length ? (
                  filteredOrders.map((o) => (
                    <tr
                      key={o.id}
                      className="hover:bg-slate-50/70 dark:hover:bg-slate-800/50 transition-colors group"
                    >
                      <td className="p-3.5 font-mono font-bold text-slate-900 dark:text-white">
                        <div className="flex items-center gap-1.5">
                          <ShoppingCart className="size-3.5 text-blue-600" />
                          <span>{o.order_number || "—"}</span>
                        </div>
                      </td>

                      <td className="p-3.5 font-semibold text-slate-800 dark:text-slate-200">
                        {o.supplier_name}
                      </td>

                      <td className="p-3.5 text-slate-600 dark:text-slate-400">
                        {o.description}
                      </td>

                      <td className="p-3.5 text-end font-mono font-bold text-slate-900 dark:text-white text-xs">
                        {o.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}{" "}
                        <span className="text-[10px] text-slate-400 font-normal">{currencyLabel}</span>
                      </td>

                      <td className="p-3.5 text-center">
                        <Badge
                          variant={o.status === "RECEIVED" ? "default" : "secondary"}
                          className="text-[10px] font-bold"
                        >
                          {o.status}
                        </Badge>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="p-10 text-center text-slate-400 text-xs">
                      {isAr ? "لا توجد أوامر شراء مسجلة بعد" : "No purchase orders found"}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────────────────────
          DIALOG MODALS
          ────────────────────────────────────────────────────────────────────────── */}
      <CreateSupplierDialog
        open={createSupplierOpen}
        onOpenChange={setCreateSupplierOpen}
        organizationId={organizationId}
        payableAccounts={liabilityAccounts}
        locale={locale}
      />

      <PostInvoiceDialog
        open={postInvoiceOpen}
        onOpenChange={setPostInvoiceOpen}
        organizationId={organizationId}
        resortId={resortId}
        suppliers={supplierOptions}
        expenseAccounts={expenseAccounts}
        liabilityAccounts={liabilityAccounts}
        periods={periods}
        currency={currency}
        locale={locale}
      />

      <RecordSupplierPaymentDialog
        open={recordPaymentOpen}
        onOpenChange={setRecordPaymentOpen}
        organizationId={organizationId}
        resortId={resortId}
        suppliers={supplierOptions}
        invoices={invoiceOptions}
        paymentAccounts={assetAccounts}
        periods={periods}
        currency={currency}
        locale={locale}
        preselectedInvoiceId={selectedPayInvoiceId}
      />
    </div>
  );
}
