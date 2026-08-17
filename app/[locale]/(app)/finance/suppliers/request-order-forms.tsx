"use client";

import { useActionState } from "react";
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
import {
  createPurchaseRequestAction,
  decidePurchaseRequestAction,
  createPurchaseOrderAction,
  approvePurchaseOrderAction,
  setPurchaseOrderStatusAction,
} from "@/lib/actions/purchasing";
import type { ActionResult } from "@/lib/actions/platform";

type Option = { id: string; label: string };

export function CreateRequestForm({
  organizationId,
  resortId,
  locale,
}: {
  organizationId: string;
  resortId: string;
  locale: string;
}) {
  const isAr = locale === "ar";
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    createPurchaseRequestAction,
    { ok: true },
  );

  return (
    <form action={formAction} className="grid gap-4 rounded-lg border p-4 sm:grid-cols-3">
      <input type="hidden" name="organizationId" value={organizationId} />
      <input type="hidden" name="resortId" value={resortId} />
      <div className="space-y-2 sm:col-span-2">
        <Label>{isAr ? "الوصف" : "Description"}</Label>
        <Input name="description" required />
      </div>
      <div className="space-y-2">
        <Label>{isAr ? "المبلغ التقديري" : "Estimated amount"}</Label>
        <Input name="estimatedAmount" type="number" step="0.01" min="0.01" required />
      </div>
      {!state.ok && <p className="text-sm text-destructive sm:col-span-3">{state.error}</p>}
      <div className="sm:col-span-3">
        <Button type="submit" disabled={pending}>
          {isAr ? "إرسال طلب شراء" : "Submit purchase request"}
        </Button>
      </div>
    </form>
  );
}

export function DecideRequestForm({ requestId, locale }: { requestId: string; locale: string }) {
  const isAr = locale === "ar";
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    decidePurchaseRequestAction,
    { ok: true },
  );

  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="requestId" value={requestId} />
      <Button type="submit" name="approve" value="true" size="sm" disabled={pending}>
        {isAr ? "موافقة" : "Approve"}
      </Button>
      <Button type="submit" name="approve" value="false" size="sm" variant="outline" disabled={pending}>
        {isAr ? "رفض" : "Reject"}
      </Button>
      {!state.ok && <span className="text-xs text-destructive">{state.error}</span>}
    </form>
  );
}

export function CreateOrderForm({
  organizationId,
  resortId,
  suppliers,
  approvedRequests,
  locale,
}: {
  organizationId: string;
  resortId: string;
  suppliers: Option[];
  approvedRequests: Option[];
  locale: string;
}) {
  const isAr = locale === "ar";
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    createPurchaseOrderAction,
    { ok: true },
  );

  return (
    <form action={formAction} className="grid gap-4 rounded-lg border p-4 sm:grid-cols-5">
      <input type="hidden" name="organizationId" value={organizationId} />
      <input type="hidden" name="resortId" value={resortId} />
      <div className="space-y-2">
        <Label>{isAr ? "المورد" : "Supplier"}</Label>
        <Select name="supplierId" items={suppliers.map((s) => ({ value: s.id, label: s.label }))}>
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
        <Label>{isAr ? "طلب شراء (اختياري)" : "Purchase request (optional)"}</Label>
        <Select name="purchaseRequestId" items={approvedRequests.map((r) => ({ value: r.id, label: r.label }))}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder={isAr ? "بدون" : "None"} />
          </SelectTrigger>
          <SelectContent>
            {approvedRequests.map((r) => (
              <SelectItem key={r.id} value={r.id}>
                {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>{isAr ? "الوصف" : "Description"}</Label>
        <Input name="description" required />
      </div>
      <div className="space-y-2">
        <Label>{isAr ? "المبلغ" : "Amount"}</Label>
        <Input name="amount" type="number" step="0.01" min="0.01" required />
      </div>
      <div className="space-y-2">
        <Label>{isAr ? "التاريخ" : "Date"}</Label>
        <Input name="orderDate" type="date" required />
      </div>
      {!state.ok && <p className="text-sm text-destructive sm:col-span-5">{state.error}</p>}
      <div className="sm:col-span-5">
        <Button type="submit" disabled={pending}>
          {isAr ? "إنشاء أمر شراء" : "Create purchase order"}
        </Button>
      </div>
    </form>
  );
}

export function OrderActions({
  purchaseOrderId,
  status,
  locale,
}: {
  purchaseOrderId: string;
  status: string;
  locale: string;
}) {
  const isAr = locale === "ar";
  const [approveState, approveAction, approvePending] = useActionState<ActionResult, FormData>(
    approvePurchaseOrderAction,
    { ok: true },
  );
  const [statusState, statusAction, statusPending] = useActionState<ActionResult, FormData>(
    setPurchaseOrderStatusAction,
    { ok: true },
  );

  return (
    <div className="flex items-center gap-2">
      {status === "DRAFT" && (
        <form action={approveAction}>
          <input type="hidden" name="purchaseOrderId" value={purchaseOrderId} />
          <Button type="submit" size="sm" disabled={approvePending}>
            {isAr ? "اعتماد" : "Approve"}
          </Button>
        </form>
      )}
      {status === "APPROVED" && (
        <form action={statusAction}>
          <input type="hidden" name="purchaseOrderId" value={purchaseOrderId} />
          <input type="hidden" name="status" value="RECEIVED" />
          <Button type="submit" size="sm" variant="outline" disabled={statusPending}>
            {isAr ? "تأكيد الاستلام" : "Mark received"}
          </Button>
        </form>
      )}
      {!approveState.ok && <span className="text-xs text-destructive">{approveState.error}</span>}
      {!statusState.ok && <span className="text-xs text-destructive">{statusState.error}</span>}
    </div>
  );
}
