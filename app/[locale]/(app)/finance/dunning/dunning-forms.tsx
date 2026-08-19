"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  saveDunningPolicy,
  raiseDunningStage,
  recordDunningDelivery,
} from "@/lib/actions/dunning";
import { generateDunningNoticePdf } from "@/lib/reports/dunning-notice-pdf";
import type { ActionResult } from "@/lib/actions/platform";

export type NoticeRow = {
  id: string;
  stage: number;
  stage_name_ar: string | null;
  stage_name_en: string | null;
  raised_on: string;
  days_overdue: number;
  outstanding_amount: number;
  status: string;
  delivered_at: string | null;
  delivery_channel: string | null;
  member_name: string | null;
  due_description: string;
  due_date: string;
  unit_code: string | null;
};

function message(error: string, isAr: boolean) {
  if (error.includes("DUNNING_STAGE_NOT_FOUND")) {
    return isAr ? "لا يوجد مستوى تحصيل نشط بهذا الرقم." : "There is no active dunning stage with that number.";
  }
  if (error.includes("DUNNING_NOTICE_ALREADY_DELIVERED")) {
    return isAr
      ? "سُجِّل تسليم هذا الإشعار من قبل — التسليم واقعة لا تتكرر."
      : "This notice was already recorded as delivered: delivery happens once.";
  }
  if (error.includes("DUNNING_NOTICE_CANCELLED")) {
    return isAr ? "الإشعار ملغى." : "That notice is cancelled.";
  }
  if (error.includes("dunning_policies_stage_positive")) {
    return isAr ? "رقم المستوى يجب أن يكون أكبر من صفر." : "The stage number must be greater than zero.";
  }
  if (error.includes("FORBIDDEN")) {
    return isAr ? "لا تملك صلاحية إدارة التحصيل." : "You don't have permission to manage collections.";
  }
  if (error === "invalid_input") return isAr ? "تحقق من البيانات." : "Check the values entered.";
  return error;
}

export function PolicyForm({
  organizationId,
  locale,
}: {
  organizationId: string;
  locale: string;
}) {
  const isAr = locale === "ar";
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    saveDunningPolicy,
    { ok: true },
  );

  return (
    <form action={formAction} className="grid gap-3 sm:grid-cols-5">
      <input type="hidden" name="organizationId" value={organizationId} />

      <div className="space-y-1.5">
        <Label htmlFor="pol-stage" className="text-xs">{isAr ? "رقم المستوى" : "Stage"}</Label>
        <Input id="pol-stage" name="stage" type="number" min="1" step="1" required dir="ltr" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="pol-ar" className="text-xs">{isAr ? "الاسم بالعربية" : "Arabic name"}</Label>
        <Input id="pol-ar" name="nameAr" required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="pol-en" className="text-xs">{isAr ? "الاسم بالإنجليزية" : "English name"}</Label>
        <Input id="pol-en" name="nameEn" required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="pol-days" className="text-xs">{isAr ? "بعد كم يوم" : "Days overdue"}</Label>
        <Input id="pol-days" name="daysOverdue" type="number" min="0" step="1" required dir="ltr" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="pol-min" className="text-xs">{isAr ? "أقل مبلغ" : "Minimum amount"}</Label>
        <Input id="pol-min" name="minimumAmount" type="number" min="0" step="0.01" defaultValue="0" dir="ltr" />
      </div>

      <div className="flex items-end sm:col-span-5">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? (isAr ? "جارٍ…" : "Saving…") : isAr ? "حفظ المستوى" : "Save stage"}
        </Button>
      </div>

      {state.ok === false && (
        <p role="alert" className="text-sm text-destructive sm:col-span-5">
          {message(state.error, isAr)}
        </p>
      )}
    </form>
  );
}

export function RaiseStageForm({
  organizationId,
  stages,
  locale,
}: {
  organizationId: string;
  stages: { stage: number; label: string }[];
  locale: string;
}) {
  const isAr = locale === "ar";
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    raiseDunningStage,
    { ok: true },
  );
  const select = "h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm";

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="organizationId" value={organizationId} />

      <div className="space-y-1.5 min-w-56">
        <Label htmlFor="raise-stage" className="text-xs">{isAr ? "المستوى" : "Stage"}</Label>
        <select id="raise-stage" name="stage" required className={select}>
          {stages.map((s) => <option key={s.stage} value={s.stage}>{s.label}</option>)}
        </select>
      </div>

      <Button type="submit" size="sm" disabled={pending || stages.length === 0}>
        {pending ? (isAr ? "جارٍ…" : "Raising…") : isAr ? "رفع إشعارات هذا المستوى" : "Raise this stage"}
      </Button>

      {/* Raising nothing is a SUCCESS: every eligible debt already has its
          notice. Showing that as an error would send an operator hunting. */}
      {state.ok === true && state.id !== undefined && (
        <p data-raise-result={state.id} className="text-sm text-muted-foreground">
          {state.id === "0"
            ? isAr ? "لا جديد — كل المستحقات المؤهَّلة لها إشعار بالفعل." : "Nothing new — every eligible debt already has its notice."
            : isAr ? `رُفع ${state.id} إشعارًا.` : `Raised ${state.id} notice(s).`}
        </p>
      )}
      {state.ok === false && (
        <p role="alert" className="text-sm text-destructive">{message(state.error, isAr)}</p>
      )}
    </form>
  );
}

export function NoticeActions({
  notice,
  organizationName,
  organizationAddress,
  organizationPhone,
  taxNumber,
  currencyLabel,
  canManage,
  locale,
}: {
  notice: NoticeRow;
  organizationName: string;
  organizationAddress: string | null;
  organizationPhone: string | null;
  taxNumber: string | null;
  currencyLabel: string;
  canManage: boolean;
  locale: string;
}) {
  const isAr = locale === "ar";
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    recordDunningDelivery,
    { ok: true },
  );
  const select = "h-9 rounded-md border border-input bg-transparent px-2 text-sm";

  const print = () =>
    generateDunningNoticePdf(
      {
        organizationName,
        organizationAddress,
        organizationPhone,
        taxNumber,
        stageName: (isAr ? notice.stage_name_ar : notice.stage_name_en) ?? String(notice.stage),
        stageNumber: notice.stage,
        raisedOn: notice.raised_on,
        memberName: notice.member_name,
        unitCode: notice.unit_code,
        dueDescription: notice.due_description,
        dueDate: notice.due_date,
        daysOverdue: notice.days_overdue,
        outstandingAmount: Number(notice.outstanding_amount),
        currencyLabel,
      },
      locale,
    );

  return (
    <div className="flex flex-wrap items-end gap-2">
      <Button type="button" size="sm" variant="outline" onClick={print}>
        {isAr ? "طباعة" : "Print"}
      </Button>

      {/* Printing is NOT delivery. The notice stays RAISED until someone says
          it actually reached the debtor and by what means -- and that is the
          only way this system can ever reach DELIVERED, because nothing here
          sends anything by itself. */}
      {canManage && notice.status === "RAISED" && (
        <form action={formAction} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="noticeId" value={notice.id} />
          <select name="channel" required className={select} aria-label={isAr ? "قناة التسليم" : "Delivery channel"}>
            <option value="PRINTED">{isAr ? "طُبع وسُلِّم" : "Printed & given"}</option>
            <option value="HAND_DELIVERED">{isAr ? "سُلِّم باليد" : "Hand delivered"}</option>
            <option value="PHONE">{isAr ? "اتصال هاتفي" : "Phone call"}</option>
            <option value="EMAIL_EXTERNAL">{isAr ? "بريد (من خارج النظام)" : "Email (outside system)"}</option>
            <option value="WHATSAPP_EXTERNAL">{isAr ? "واتساب (من خارج النظام)" : "WhatsApp (outside system)"}</option>
            <option value="POST">{isAr ? "بريد مسجَّل" : "Registered post"}</option>
          </select>
          <Input
            name="reference"
            placeholder={isAr ? "مرجع (اختياري)" : "Reference (optional)"}
            className="h-9 w-40 text-xs"
          />
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? (isAr ? "جارٍ…" : "Recording…") : isAr ? "تسجيل التسليم" : "Record delivery"}
          </Button>
        </form>
      )}

      {state.ok === false && (
        <p role="alert" className="w-full text-sm text-destructive">
          {message(state.error, isAr)}
        </p>
      )}
    </div>
  );
}
