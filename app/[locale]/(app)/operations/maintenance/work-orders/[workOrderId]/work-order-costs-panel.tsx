"use client";

import { useMemo, useState, useTransition } from "react";
import { Banknote, FileText, Plus, ReceiptText, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  addWorkOrderCostAction,
  chargeWorkOrderCostToOwnerAction,
  postWorkOrderCostAsExpenseAction,
  postWorkOrderCostAsSupplierInvoiceAction,
  updateUnpostedWorkOrderCostAction,
  voidUnpostedWorkOrderCostAction,
} from "@/lib/actions/maintenance";

export type Option = { id: string; label: string };

export type WorkOrderCostItem = {
  id: string;
  cost_type: "LABOR" | "SUPPLIER" | "MATERIAL" | "OTHER";
  description: string;
  quantity: number;
  unit_cost: number;
  total_cost: number;
  currency: string;
  supplier_id: string | null;
  source_reference: string | null;
  financial_status: "UNPOSTED" | "POSTED_EXPENSE" | "POSTED_SUPPLIER_INVOICE" | "VOIDED";
  owner_charge_status: "NOT_CHARGED" | "OWNER_CHARGED";
  expense_id: string | null;
  supplier_invoice_id: string | null;
  owner_due_id: string | null;
  created_at: string;
};

const COST_TYPES = ["LABOR", "SUPPLIER", "MATERIAL", "OTHER"] as const;

export function WorkOrderCostsPanel({
  workOrderId,
  costs,
  suppliers,
  expenseCategories,
  expenseAccounts,
  paymentAccounts,
  fiscalPeriods,
  dueTypes,
  receivableAccounts,
  currency,
  canManage,
  canPost,
  canChargeOwner,
  locale,
}: {
  workOrderId: string;
  costs: WorkOrderCostItem[];
  suppliers: Option[];
  expenseCategories: Option[];
  expenseAccounts: Option[];
  paymentAccounts: Option[];
  fiscalPeriods: Option[];
  dueTypes: Option[];
  receivableAccounts: Option[];
  currency: string;
  canManage: boolean;
  canPost: boolean;
  canChargeOwner: boolean;
  locale: "ar" | "en";
}) {
  const isAr = locale === "ar";
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const totals = useMemo(() => {
    const active = costs.filter((cost) => cost.financial_status !== "VOIDED");
    return {
      internal: active.reduce((sum, cost) => sum + Number(cost.total_cost || 0), 0),
      ownerCharged: active.filter((cost) => cost.owner_charge_status === "OWNER_CHARGED").reduce((sum, cost) => sum + Number(cost.total_cost || 0), 0),
    };
  }, [costs]);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setMessage(null);
    startTransition(async () => {
      const result = await fn();
      setMessage(result.ok ? (isAr ? "تم حفظ العملية المالية." : "Financial action saved.") : `${isAr ? "فشل الإجراء" : "Action failed"}: ${result.error ?? "failed"}`);
    });
  };

  return (
    <section className="space-y-4 rounded-2xl border border-border/70 bg-card p-4 shadow-2xs">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-bold text-slate-950 dark:text-white">
            <Banknote className="size-4" />
            {isAr ? "التكاليف والربط المحاسبي" : "Costs and Accounting Bridge"}
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            {isAr
              ? "التكلفة تشغيلية فقط حتى يتم ترحيلها صراحةً إلى سجل محاسبي قائم."
              : "Costs remain operational until explicitly posted to an existing accounting record."}
          </p>
        </div>
        <div className="grid gap-1 text-xs font-semibold text-slate-600 dark:text-slate-300 sm:text-end">
          <span>{isAr ? "إجمالي التكلفة" : "Internal cost"}: {totals.internal.toLocaleString(isAr ? "ar-EG" : "en-US")} {currency}</span>
          <span>{isAr ? "محمل على المالك" : "Owner charged"}: {totals.ownerCharged.toLocaleString(isAr ? "ar-EG" : "en-US")} {currency}</span>
        </div>
      </div>

      {message ? <p className="rounded-xl border border-border/70 bg-muted px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200">{message}</p> : null}

      {canManage ? (
        <CostForm
          mode="add"
          workOrderId={workOrderId}
          suppliers={suppliers}
          currency={currency}
          locale={locale}
          pending={pending}
          onSubmit={(payload) => run(() => addWorkOrderCostAction(payload))}
        />
      ) : null}

      <div className="space-y-3">
        {costs.length ? costs.map((cost) => (
          <article key={cost.id} className="rounded-xl border border-border/70 bg-background p-3">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{cost.cost_type}</Badge>
                  <Badge variant="outline">{cost.financial_status}</Badge>
                  <Badge variant="outline">{cost.owner_charge_status}</Badge>
                </div>
                <p className="mt-2 text-sm font-bold text-slate-950 dark:text-white">{cost.description}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {Number(cost.quantity).toLocaleString(isAr ? "ar-EG" : "en-US")} x {Number(cost.unit_cost).toLocaleString(isAr ? "ar-EG" : "en-US")} {cost.currency}
                  {cost.source_reference ? ` · ${cost.source_reference}` : ""}
                </p>
              </div>
              <div className="text-sm font-black text-slate-950 dark:text-white lg:text-end">
                {Number(cost.total_cost).toLocaleString(isAr ? "ar-EG" : "en-US")} {cost.currency}
              </div>
            </div>

            {editingId === cost.id ? (
              <div className="mt-3">
                <CostForm
                  mode="edit"
                  cost={cost}
                  suppliers={suppliers}
                  currency={currency}
                  locale={locale}
                  pending={pending}
                  onSubmit={(payload) => run(() => updateUnpostedWorkOrderCostAction({ ...payload, costId: cost.id }))}
                />
              </div>
            ) : null}

            <div className="mt-3 flex flex-wrap gap-2">
              {canManage && cost.financial_status === "UNPOSTED" && cost.owner_charge_status === "NOT_CHARGED" ? (
                <>
                  <Button type="button" variant="outline" size="sm" className="rounded-xl" onClick={() => setEditingId(editingId === cost.id ? null : cost.id)} disabled={pending}>
                    {editingId === cost.id ? (isAr ? "إغلاق التعديل" : "Close Edit") : (isAr ? "تعديل" : "Edit")}
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    className="rounded-xl"
                    onClick={() => {
                      if (!window.confirm(isAr ? "هل تريد إلغاء هذه التكلفة؟" : "Void this cost?")) return;
                      run(() => voidUnpostedWorkOrderCostAction({ costId: cost.id, reason: "Voided from work order detail" }));
                    }}
                    disabled={pending}
                  >
                    <RotateCcw className="size-3.5" />
                    {isAr ? "إلغاء التكلفة" : "Void Cost"}
                  </Button>
                </>
              ) : null}

              {canPost && cost.financial_status === "UNPOSTED" ? (
                cost.cost_type === "SUPPLIER" ? (
                  <SupplierInvoicePostForm cost={cost} expenseAccounts={expenseAccounts} fiscalPeriods={fiscalPeriods} pending={pending} locale={locale} onSubmit={run} />
                ) : (
                  <ExpensePostForm cost={cost} expenseCategories={expenseCategories} paymentAccounts={paymentAccounts} fiscalPeriods={fiscalPeriods} pending={pending} locale={locale} onSubmit={run} />
                )
              ) : null}

              {canChargeOwner && cost.owner_charge_status === "NOT_CHARGED" && cost.financial_status !== "VOIDED" ? (
                <OwnerChargeForm cost={cost} dueTypes={dueTypes} receivableAccounts={receivableAccounts} pending={pending} locale={locale} onSubmit={run} />
              ) : null}

              {cost.expense_id ? <RecordLink label={isAr ? "سند صرف" : "Expense"} value={cost.expense_id} /> : null}
              {cost.supplier_invoice_id ? <RecordLink label={isAr ? "فاتورة مورد" : "Supplier invoice"} value={cost.supplier_invoice_id} /> : null}
              {cost.owner_due_id ? <RecordLink label={isAr ? "مستحق مالك" : "Owner due"} value={cost.owner_due_id} /> : null}
            </div>
          </article>
        )) : (
          <div className="rounded-xl border border-dashed border-border/80 p-4 text-sm text-slate-500">
            {isAr ? "لا توجد تكاليف مسجلة لأمر العمل." : "No costs have been recorded for this work order."}
          </div>
        )}
      </div>
    </section>
  );
}

function CostForm({
  mode,
  workOrderId,
  cost,
  suppliers,
  currency,
  locale,
  pending,
  onSubmit,
}: {
  mode: "add" | "edit";
  workOrderId?: string;
  cost?: WorkOrderCostItem;
  suppliers: Option[];
  currency: string;
  locale: "ar" | "en";
  pending: boolean;
  onSubmit: (payload: {
    workOrderId: string;
    costType: "LABOR" | "SUPPLIER" | "MATERIAL" | "OTHER";
    description: string;
    quantity: number;
    unitCost: number;
    currency: string;
    supplierId: string | null;
    sourceReference: string | null;
  }) => void;
}) {
  const isAr = locale === "ar";
  return (
    <form
      className="grid gap-3 rounded-xl border border-border/70 bg-background p-3 sm:grid-cols-2 lg:grid-cols-6"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        onSubmit({
          workOrderId: workOrderId ?? "",
          costType: String(form.get("costType") || "LABOR") as "LABOR" | "SUPPLIER" | "MATERIAL" | "OTHER",
          description: String(form.get("description") || ""),
          quantity: Number(form.get("quantity") || 0),
          unitCost: Number(form.get("unitCost") || 0),
          currency,
          supplierId: String(form.get("supplierId") || "") || null,
          sourceReference: String(form.get("sourceReference") || "") || null,
        });
      }}
    >
      <select name="costType" defaultValue={cost?.cost_type ?? "LABOR"} className="h-10 rounded-xl border border-input bg-background px-3 text-sm">
        {COST_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
      </select>
      <Input name="quantity" type="number" min="0.0001" step="0.0001" required defaultValue={cost?.quantity ?? 1} />
      <Input name="unitCost" type="number" min="0" step="0.0001" required defaultValue={cost?.unit_cost ?? ""} placeholder={isAr ? "سعر الوحدة" : "Unit cost"} />
      <select name="supplierId" defaultValue={cost?.supplier_id ?? ""} className="h-10 rounded-xl border border-input bg-background px-3 text-sm">
        <option value="">{isAr ? "بدون مورد" : "No supplier"}</option>
        {suppliers.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
      </select>
      <Input name="sourceReference" defaultValue={cost?.source_reference ?? ""} placeholder={isAr ? "مرجع اختياري" : "Optional reference"} />
      <Button type="submit" size="sm" className="rounded-xl" disabled={pending}>
        <Plus className="size-3.5" />
        {mode === "add" ? (isAr ? "إضافة تكلفة" : "Add Cost") : (isAr ? "حفظ التعديل" : "Save Cost")}
      </Button>
      <Textarea name="description" required defaultValue={cost?.description ?? ""} placeholder={isAr ? "وصف التكلفة" : "Cost description"} className="sm:col-span-2 lg:col-span-6" />
    </form>
  );
}

function ExpensePostForm({
  cost,
  expenseCategories,
  paymentAccounts,
  fiscalPeriods,
  pending,
  locale,
  onSubmit,
}: {
  cost: WorkOrderCostItem;
  expenseCategories: Option[];
  paymentAccounts: Option[];
  fiscalPeriods: Option[];
  pending: boolean;
  locale: "ar" | "en";
  onSubmit: (fn: () => Promise<{ ok: boolean; error?: string }>) => void;
}) {
  const isAr = locale === "ar";
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  return (
    <form
      className="flex flex-wrap gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (!window.confirm(isAr ? "هل تريد ترحيل هذه التكلفة كمصروف؟" : "Post this cost as an expense?")) return;
        const form = new FormData(event.currentTarget);
        onSubmit(() => postWorkOrderCostAsExpenseAction({
          costId: cost.id,
          expenseCategoryId: String(form.get("expenseCategoryId") || ""),
          paymentAccountId: String(form.get("paymentAccountId") || ""),
          fiscalPeriodId: String(form.get("fiscalPeriodId") || ""),
          expenseDate: String(form.get("expenseDate") || today),
        }));
      }}
    >
      <select name="expenseCategoryId" className="h-9 rounded-xl border border-input bg-background px-2 text-xs" required>
        {expenseCategories.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
      </select>
      <select name="paymentAccountId" className="h-9 rounded-xl border border-input bg-background px-2 text-xs" required>
        {paymentAccounts.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
      </select>
      <select name="fiscalPeriodId" className="h-9 rounded-xl border border-input bg-background px-2 text-xs" required>
        {fiscalPeriods.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
      </select>
      <Input name="expenseDate" type="date" className="h-9 w-36 text-xs" defaultValue={today} required />
      <Button type="submit" variant="outline" size="sm" className="rounded-xl" disabled={pending}>
        <ReceiptText className="size-3.5" />
        {isAr ? "ترحيل كمصروف" : "Post Expense"}
      </Button>
    </form>
  );
}

function SupplierInvoicePostForm({
  cost,
  expenseAccounts,
  fiscalPeriods,
  pending,
  locale,
  onSubmit,
}: {
  cost: WorkOrderCostItem;
  expenseAccounts: Option[];
  fiscalPeriods: Option[];
  pending: boolean;
  locale: "ar" | "en";
  onSubmit: (fn: () => Promise<{ ok: boolean; error?: string }>) => void;
}) {
  const isAr = locale === "ar";
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const defaultDueDate = useMemo(() => {
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 15);
    return dueDate.toISOString().slice(0, 10);
  }, []);
  return (
    <form
      className="flex flex-wrap gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (!window.confirm(isAr ? "هل تريد ترحيل هذه التكلفة كفاتورة مورد؟" : "Post this cost as a supplier invoice?")) return;
        const form = new FormData(event.currentTarget);
        onSubmit(() => postWorkOrderCostAsSupplierInvoiceAction({
          costId: cost.id,
          invoiceNumber: String(form.get("invoiceNumber") || ""),
          expenseAccountId: String(form.get("expenseAccountId") || ""),
          fiscalPeriodId: String(form.get("fiscalPeriodId") || ""),
          invoiceDate: String(form.get("invoiceDate") || today),
          dueDate: String(form.get("dueDate") || defaultDueDate),
        }));
      }}
    >
      <Input name="invoiceNumber" className="h-9 w-36 text-xs" placeholder={isAr ? "رقم الفاتورة" : "Invoice no."} required />
      <select name="expenseAccountId" className="h-9 rounded-xl border border-input bg-background px-2 text-xs" required>
        {expenseAccounts.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
      </select>
      <select name="fiscalPeriodId" className="h-9 rounded-xl border border-input bg-background px-2 text-xs" required>
        {fiscalPeriods.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
      </select>
      <Input name="invoiceDate" type="date" className="h-9 w-36 text-xs" defaultValue={today} required />
      <Input name="dueDate" type="date" className="h-9 w-36 text-xs" defaultValue={defaultDueDate} required />
      <Button type="submit" variant="outline" size="sm" className="rounded-xl" disabled={pending}>
        <FileText className="size-3.5" />
        {isAr ? "ترحيل فاتورة" : "Post Invoice"}
      </Button>
    </form>
  );
}

function OwnerChargeForm({
  cost,
  dueTypes,
  receivableAccounts,
  pending,
  locale,
  onSubmit,
}: {
  cost: WorkOrderCostItem;
  dueTypes: Option[];
  receivableAccounts: Option[];
  pending: boolean;
  locale: "ar" | "en";
  onSubmit: (fn: () => Promise<{ ok: boolean; error?: string }>) => void;
}) {
  const isAr = locale === "ar";
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const defaultDueDate = useMemo(() => {
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 15);
    return dueDate.toISOString().slice(0, 10);
  }, []);
  return (
    <form
      className="flex flex-wrap gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (!window.confirm(isAr ? "هل تريد تحميل هذه التكلفة على المالك؟" : "Charge this cost to the owner?")) return;
        const form = new FormData(event.currentTarget);
        onSubmit(() => chargeWorkOrderCostToOwnerAction({
          costId: cost.id,
          dueTypeId: String(form.get("dueTypeId") || ""),
          receivableAccountId: String(form.get("receivableAccountId") || ""),
          amount: Number(form.get("amount") || cost.total_cost),
          issueDate: String(form.get("issueDate") || today),
          dueDate: String(form.get("dueDate") || defaultDueDate),
          description: String(form.get("description") || ""),
        }));
      }}
    >
      <select name="dueTypeId" className="h-9 rounded-xl border border-input bg-background px-2 text-xs" required>
        {dueTypes.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
      </select>
      <select name="receivableAccountId" className="h-9 rounded-xl border border-input bg-background px-2 text-xs" required>
        {receivableAccounts.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
      </select>
      <Input name="amount" type="number" min="0.0001" step="0.0001" className="h-9 w-28 text-xs" defaultValue={cost.total_cost} required />
      <Input name="issueDate" type="date" className="h-9 w-36 text-xs" defaultValue={today} required />
      <Input name="dueDate" type="date" className="h-9 w-36 text-xs" defaultValue={defaultDueDate} required />
      <Input name="description" className="h-9 w-52 text-xs" placeholder={isAr ? "وصف المستحق" : "Due description"} />
      <Button type="submit" variant="outline" size="sm" className="rounded-xl" disabled={pending}>
        <Banknote className="size-3.5" />
        {isAr ? "تحميل المالك" : "Charge Owner"}
      </Button>
    </form>
  );
}

function RecordLink({ label, value }: { label: string; value: string }) {
  return (
    <Badge variant="secondary" className="max-w-full gap-1 rounded-xl">
      <span>{label}</span>
      <span className="max-w-32 truncate font-mono text-[10px]">{value}</span>
    </Badge>
  );
}
