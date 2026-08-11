"use client";

import { useActionState, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { postSupplierInvoiceAction, recordSupplierPaymentAction } from "@/lib/actions/purchasing";
import type { ActionResult } from "@/lib/actions/platform";

type Option = { id: string; label: string };

export function PostInvoiceForm({
  organizationId,
  resortId,
  suppliers,
  expenseAccounts,
  periods,
  locale,
}: {
  organizationId: string;
  resortId: string;
  suppliers: Option[];
  expenseAccounts: Option[];
  periods: Option[];
  locale: string;
}) {
  const isAr = locale === "ar";
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    postSupplierInvoiceAction,
    { ok: true },
  );

  return (
    <form action={formAction} className="grid gap-4 rounded-lg border p-4 sm:grid-cols-4">
      <input type="hidden" name="organizationId" value={organizationId} />
      <input type="hidden" name="resortId" value={resortId} />
      <div className="space-y-2">
        <Label>{isAr ? "المورد" : "Supplier"}</Label>
        <Select name="supplierId">
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {suppliers.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>{isAr ? "رقم الفاتورة" : "Invoice number"}</Label>
        <Input name="invoiceNumber" required />
      </div>
      <div className="space-y-2">
        <Label>{isAr ? "حساب المصروف" : "Expense account"}</Label>
        <Select name="expenseAccountId">
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {expenseAccounts.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>{isAr ? "الفترة المالية" : "Fiscal period"}</Label>
        <Select name="fiscalPeriodId">
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {periods.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>{isAr ? "المبلغ" : "Amount"}</Label>
        <Input name="amount" type="number" step="0.01" min="0.01" required />
      </div>
      <div className="space-y-2">
        <Label>{isAr ? "تاريخ الفاتورة" : "Invoice date"}</Label>
        <Input name="invoiceDate" type="date" required />
      </div>
      <div className="space-y-2">
        <Label>{isAr ? "تاريخ الاستحقاق" : "Due date"}</Label>
        <Input name="dueDate" type="date" required />
      </div>
      {!state.ok && <p className="text-sm text-destructive sm:col-span-4">{state.error}</p>}
      <div className="sm:col-span-4">
        <Button type="submit" disabled={pending}>
          {isAr ? "ترحيل فاتورة مورد" : "Post supplier invoice"}
        </Button>
      </div>
    </form>
  );
}

type InvoiceOption = Option & { remaining: number };
type AllocationDraft = { key: number; invoice_id: string; amount: string };
let keySeq = 0;

export function RecordSupplierPaymentForm({
  organizationId,
  resortId,
  suppliers,
  invoices,
  paymentAccounts,
  periods,
  locale,
}: {
  organizationId: string;
  resortId: string;
  suppliers: Option[];
  invoices: InvoiceOption[];
  paymentAccounts: Option[];
  periods: Option[];
  locale: string;
}) {
  const isAr = locale === "ar";
  const [allocations, setAllocations] = useState<AllocationDraft[]>([
    { key: keySeq++, invoice_id: "", amount: "" },
  ]);
  const [amount, setAmount] = useState("");
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    recordSupplierPaymentAction,
    { ok: true },
  );

  const allocatedTotal = useMemo(
    () => allocations.reduce((s, a) => s + (Number(a.amount) || 0), 0),
    [allocations],
  );

  function updateAllocation(key: number, patch: Partial<AllocationDraft>) {
    setAllocations((prev) => prev.map((a) => (a.key === key ? { ...a, ...patch } : a)));
  }

  const allocationsJson = JSON.stringify(
    allocations
      .filter((a) => a.invoice_id && Number(a.amount) > 0)
      .map((a) => ({ invoice_id: a.invoice_id, amount: Number(a.amount) })),
  );

  return (
    <form action={formAction} className="space-y-4 rounded-lg border p-4">
      <input type="hidden" name="organizationId" value={organizationId} />
      <input type="hidden" name="resortId" value={resortId} />
      <input type="hidden" name="allocations" value={allocationsJson} />

      <div className="grid gap-4 sm:grid-cols-4">
        <div className="space-y-2">
          <Label>{isAr ? "المورد" : "Supplier"}</Label>
          <Select name="supplierId">
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {suppliers.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>{isAr ? "طريقة الدفع" : "Method"}</Label>
          <Select name="method" defaultValue="BANK_TRANSFER">
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="CASH">{isAr ? "نقدًا" : "Cash"}</SelectItem>
              <SelectItem value="BANK_TRANSFER">{isAr ? "تحويل بنكي" : "Bank transfer"}</SelectItem>
              <SelectItem value="CHEQUE">{isAr ? "شيك" : "Cheque"}</SelectItem>
              <SelectItem value="OTHER">{isAr ? "أخرى" : "Other"}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>{isAr ? "حساب الدفع" : "Payment account"}</Label>
          <Select name="paymentAccountId">
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {paymentAccounts.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>{isAr ? "الفترة المالية" : "Fiscal period"}</Label>
          <Select name="fiscalPeriodId">
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {periods.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>{isAr ? "تاريخ الدفع" : "Payment date"}</Label>
          <Input name="paymentDate" type="date" required />
        </div>
        <div className="space-y-2">
          <Label>{isAr ? "المبلغ الإجمالي" : "Total amount"}</Label>
          <Input
            name="amount"
            type="number"
            step="0.01"
            min="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">{isAr ? "توزيع المبلغ على الفواتير" : "Allocate to invoices"}</p>
        {allocations.map((allocation) => (
          <div key={allocation.key} className="flex items-center gap-2">
            <select
              className="flex-1 rounded-md border border-input bg-transparent p-1.5 text-sm"
              value={allocation.invoice_id}
              onChange={(e) => updateAllocation(allocation.key, { invoice_id: e.target.value })}
            >
              <option value="" />
              {invoices.map((inv) => (
                <option key={inv.id} value={inv.id}>
                  {inv.label} ({isAr ? "متبقي" : "remaining"}: {inv.remaining.toFixed(2)})
                </option>
              ))}
            </select>
            <Input
              className="w-32"
              type="number"
              step="0.01"
              value={allocation.amount}
              onChange={(e) => updateAllocation(allocation.key, { amount: e.target.value })}
            />
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setAllocations((prev) => [...prev, { key: keySeq++, invoice_id: "", amount: "" }])}
        >
          {isAr ? "+ إضافة توزيع" : "+ Add allocation"}
        </Button>
        <p className="text-sm text-muted-foreground">
          {isAr ? "إجمالي الموزّع" : "Total allocated"}: {allocatedTotal.toFixed(2)}
        </p>
      </div>

      {!state.ok && <p className="text-sm text-destructive">{state.error}</p>}
      <Button type="submit" disabled={pending}>
        {isAr ? "تسجيل دفعة مورد" : "Record supplier payment"}
      </Button>
    </form>
  );
}
