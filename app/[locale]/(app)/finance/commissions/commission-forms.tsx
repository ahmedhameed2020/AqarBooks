"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  accrueCommissionAction,
  createBroker,
  payCommissionAction,
} from "@/lib/actions/commissions";
import type { ActionResult } from "@/lib/actions/platform";

export type Option = { id: string; label: string };

const SELECT = "w-full rounded-md border border-input bg-transparent p-2 text-sm";

function message(error: string, isAr: boolean) {
  if (error === "duplicate_broker")
    return isAr ? "يوجد وسيط بنفس الاسم." : "A broker with that name already exists.";
  if (error === "amount_required")
    return isAr ? "حدّد نسبة العمولة أو مبلغها." : "Give either a commission rate or an amount.";
  if (error.includes("COMMISSION_ACCOUNTS_NOT_SET"))
    return isAr
      ? "لم تُحدَّد حسابات مصروف العمولة والتزامها في إعدادات المالية. حدِّدها أولًا."
      : "Commission expense and payable accounts are not configured in finance settings. Set them first.";
  if (error.includes("WHT_ACCOUNT_REQUIRED"))
    return isAr
      ? "اخترت نسبة خصم منبع، فيجب تحديد حساب الضريبة."
      : "You set a withholding rate, so a withholding tax account is required.";
  if (error.includes("NO_OPEN_FISCAL_PERIOD"))
    return isAr
      ? "لا توجد فترة مالية مفتوحة تغطي هذا التاريخ."
      : "No open fiscal period covers this date.";
  if (error.includes("COMMISSION_NOT_ACCRUED"))
    return isAr ? "العمولة مسددة بالفعل." : "This commission is already settled.";
  if (error.includes("BROKER_INACTIVE"))
    return isAr ? "الوسيط غير نشط." : "That broker is inactive.";
  if (error.includes("FORBIDDEN"))
    return isAr ? "لا تملك صلاحية تنفيذ هذا الإجراء." : "You don't have permission for this action.";
  if (error === "invalid_input") return isAr ? "تحقق من البيانات." : "Check the values entered.";
  return error;
}

function Err({ state, isAr }: { state: ActionResult; isAr: boolean }) {
  if (state.ok !== false) return null;
  return <p className="text-sm text-destructive">{message(state.error, isAr)}</p>;
}

export function CreateBrokerForm({
  organizationId,
  locale,
}: {
  organizationId: string;
  locale: string;
}) {
  const isAr = locale === "ar";
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(createBroker, {
    ok: true,
  });

  return (
    <form action={formAction} className="grid gap-4 rounded-lg border p-4 sm:grid-cols-3">
      <input type="hidden" name="organizationId" value={organizationId} />
      <div className="space-y-2">
        <Label htmlFor="name">{isAr ? "اسم الوسيط" : "Broker name"}</Label>
        <Input id="name" name="name" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="brokerType">{isAr ? "النوع" : "Type"}</Label>
        <select id="brokerType" name="brokerType" defaultValue="EXTERNAL" className={SELECT}>
          <option value="EXTERNAL">{isAr ? "مكتب خارجي" : "External agency"}</option>
          <option value="INTERNAL">{isAr ? "مندوب داخلي" : "In-house agent"}</option>
        </select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="defaultWhtRate">
          {isAr ? "نسبة الخصم من المنبع %" : "Default withholding %"}
        </Label>
        <Input
          id="defaultWhtRate"
          name="defaultWhtRate"
          type="number"
          step="0.01"
          min="0"
          max="100"
          defaultValue={0}
          className="tabular-nums"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="taxId">{isAr ? "الرقم الضريبي" : "Tax ID"}</Label>
        <Input id="taxId" name="taxId" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="phone">{isAr ? "الهاتف" : "Phone"}</Label>
        <Input id="phone" name="phone" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="email">{isAr ? "البريد" : "Email"}</Label>
        <Input id="email" name="email" type="email" />
      </div>
      <div className="flex items-center gap-3 sm:col-span-3">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? (isAr ? "جارٍ الحفظ…" : "Saving…") : isAr ? "إضافة وسيط" : "Add broker"}
        </Button>
        <Err state={state} isAr={isAr} />
      </div>
    </form>
  );
}

export function AccrueCommissionForm({
  organizationId,
  brokers,
  properties,
  liabilityAccounts,
  locale,
}: {
  organizationId: string;
  brokers: Option[];
  properties: Option[];
  liabilityAccounts: Option[];
  locale: string;
}) {
  const isAr = locale === "ar";
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    accrueCommissionAction,
    { ok: true },
  );
  const today = new Date().toISOString().slice(0, 10);

  if (brokers.length === 0 || properties.length === 0) {
    return (
      <p className="rounded-lg border p-4 text-sm text-muted-foreground">
        {isAr
          ? "أضف وسيطًا واحدًا على الأقل قبل تسجيل استحقاق عمولة."
          : "Add at least one broker before accruing a commission."}
      </p>
    );
  }

  return (
    <form action={formAction} className="grid gap-4 rounded-lg border p-4 sm:grid-cols-3">
      <input type="hidden" name="organizationId" value={organizationId} />
      <div className="space-y-2">
        <Label htmlFor="brokerId">{isAr ? "الوسيط" : "Broker"}</Label>
        <select id="brokerId" name="brokerId" required className={SELECT}>
          {brokers.map((b) => (
            <option key={b.id} value={b.id}>{b.label}</option>
          ))}
        </select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="propertyId">{isAr ? "العقار" : "Property"}</Label>
        <select id="propertyId" name="propertyId" required className={SELECT}>
          {properties.map((p) => (
            <option key={p.id} value={p.id}>{p.label}</option>
          ))}
        </select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="earnedDate">{isAr ? "تاريخ الاستحقاق" : "Earned date"}</Label>
        <Input id="earnedDate" name="earnedDate" type="date" required defaultValue={today} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="basisAmount">{isAr ? "قيمة التعاقد" : "Contract value"}</Label>
        <Input id="basisAmount" name="basisAmount" type="number" step="0.001" min="0" className="tabular-nums" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="ratePercent">{isAr ? "نسبة العمولة %" : "Commission %"}</Label>
        <Input id="ratePercent" name="ratePercent" type="number" step="0.001" min="0" max="100" className="tabular-nums" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="grossAmount">
          {isAr ? "أو مبلغ ثابت" : "or fixed amount"}
        </Label>
        <Input id="grossAmount" name="grossAmount" type="number" step="0.001" min="0" className="tabular-nums" />
      </div>

      <div className="space-y-2">
        <Label htmlFor="whtRate">{isAr ? "خصم منبع % (اختياري)" : "Withholding % (optional)"}</Label>
        <Input id="whtRate" name="whtRate" type="number" step="0.01" min="0" max="100" className="tabular-nums" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="whtAccountId">{isAr ? "حساب ضريبة الخصم" : "Withholding tax account"}</Label>
        <select id="whtAccountId" name="whtAccountId" className={SELECT}>
          <option value="">{isAr ? "بدون" : "None"}</option>
          {liabilityAccounts.map((a) => (
            <option key={a.id} value={a.id}>{a.label}</option>
          ))}
        </select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="note">{isAr ? "ملاحظة" : "Note"}</Label>
        <Input id="note" name="note" />
      </div>

      <div className="flex items-center gap-3 sm:col-span-3">
        <Button type="submit" disabled={pending}>
          {pending
            ? isAr
              ? "جارٍ التسجيل…"
              : "Recording…"
            : isAr
              ? "تسجيل استحقاق العمولة"
              : "Accrue commission"}
        </Button>
        <Err state={state} isAr={isAr} />
      </div>
    </form>
  );
}

export function PayCommissionForm({
  commissionId,
  cashAccounts,
  locale,
}: {
  commissionId: string;
  cashAccounts: Option[];
  locale: string;
}) {
  const isAr = locale === "ar";
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(payCommissionAction, {
    ok: true,
  });
  const today = new Date().toISOString().slice(0, 10);

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="commissionId" value={commissionId} />
      <select name="cashAccountId" required className="max-w-48 rounded-md border border-input bg-transparent p-1.5 text-sm">
        {cashAccounts.map((a) => (
          <option key={a.id} value={a.id}>{a.label}</option>
        ))}
      </select>
      <Input name="paidDate" type="date" defaultValue={today} className="h-8 w-36" />
      <Button type="submit" size="sm" variant="outline" disabled={pending || cashAccounts.length === 0}>
        {isAr ? "سداد الصافي" : "Pay net"}
      </Button>
      <Err state={state} isAr={isAr} />
    </form>
  );
}
