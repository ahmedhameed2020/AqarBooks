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
} from "lucide-react";
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
  order_number?: string | null;
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
        (o.order_number || "").toLowerCase().includes(q) ||
        o.supplier_name.toLowerCase().includes(q) ||
        o.description.toLowerCase().includes(q)
    );
  }, [orders, searchQuery]);

  const handlePayInvoice = (invId: string) => {
    setSelectedPayInvoiceId(invId);
    setRecordPaymentOpen(true);
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
          <div className="relative w-full sm:w-56">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={isAr ? "بحث..." : "Search..."}
              className="ps-9 text-xs h-9"
            />
          </div>

          <Button
            onClick={() => setCreateSupplierOpen(true)}
            variant="outline"
            className="text-xs font-bold gap-1.5 h-9"
          >
            <Truck className="size-3.5 text-slate-500" />
            <span>{isAr ? "مورد جديد" : "New Supplier"}</span>
          </Button>

          <Button
            onClick={() => setRecordPaymentOpen(true)}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs gap-1.5 h-9 shadow-sm"
          >
            <CreditCard className="size-3.5" />
            <span>{isAr ? "سداد دفعة" : "Pay Supplier"}</span>
          </Button>

          <Button
            onClick={() => setPostInvoiceOpen(true)}
            className="bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs gap-1.5 h-9 shadow-sm"
          >
            <Plus className="size-3.5" />
            <span>{isAr ? "ترحيل فاتورة" : "Post Invoice"}</span>
          </Button>
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
                          {!isPaid && (
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
