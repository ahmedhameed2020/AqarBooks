"use client";

import { useActionState, useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  BellRing,
  Send,
  Printer,
  CheckCircle2,
  AlertCircle,
  Clock,
  Layers,
} from "lucide-react";
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
  raised_at: string;
  days_overdue: number;
  outstanding_amount: number;
  status: string;
  delivered_at: string | null;
  delivery_channel: string | null;
  contact_snapshot: string | null;
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
  if (error === "invalid_input") return isAr ? "تحقق من البيانات المدخلة." : "Check the values entered.";
  return error;
}

export function PolicyForm({
  open = true,
  onOpenChange,
  organizationId,
  locale,
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  organizationId: string;
  locale: string;
}) {
  const isAr = locale === "ar";
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    saveDunningPolicy,
    { ok: true }
  );

  useEffect(() => {
    if (state.ok && state.id && onOpenChange) {
      onOpenChange(false);
    }
  }, [state, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl rounded-3xl p-6 text-start">
        <DialogHeader className="space-y-1 border-b border-slate-100 pb-4 text-start">
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600 border border-blue-100">
              <Layers className="size-4.5" />
            </div>
            <DialogTitle className="text-lg font-black text-slate-900">
              {isAr ? "إضافة / تعديل مرحلة تحصيل" : "Dunning Policy Stage"}
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-slate-500">
            {isAr
              ? "حدد معايير التأخير بالشهور والأيام والحد الأدنى للمبلغ لتفعيل هذه المرحلة."
              : "Configure stage number, grace days, and minimum overdue amount."}
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="space-y-4 pt-2">
          <input type="hidden" name="organizationId" value={organizationId} />

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            <div className="space-y-1.5">
              <Label htmlFor="pol-stage" className="text-xs font-bold text-slate-700">
                {isAr ? "رقم المرحلة" : "Stage #"}
              </Label>
              <Input
                id="pol-stage"
                name="stage"
                type="number"
                min="1"
                step="1"
                defaultValue="1"
                required
                dir="ltr"
                className="font-mono text-sm rounded-xl"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pol-ar" className="text-xs font-bold text-slate-700">
                {isAr ? "الاسم بالعربية" : "Arabic Name"}
              </Label>
              <Input
                id="pol-ar"
                name="nameAr"
                required
                placeholder={isAr ? "تذكير أولي بالاستحقاق" : "First Reminder"}
                className="text-sm rounded-xl"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pol-en" className="text-xs font-bold text-slate-700">
                {isAr ? "الاسم بالإنجليزية" : "English Name"}
              </Label>
              <Input
                id="pol-en"
                name="nameEn"
                required
                placeholder="Initial Friendly Reminder"
                dir="ltr"
                className="text-sm rounded-xl"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="space-y-1.5">
              <Label htmlFor="pol-days" className="text-xs font-bold text-slate-700">
                {isAr ? "أيام التأخير المطلوبة" : "Days Overdue"}
              </Label>
              <Input
                id="pol-days"
                name="daysOverdue"
                type="number"
                min="0"
                step="1"
                defaultValue="30"
                required
                dir="ltr"
                className="font-mono text-sm rounded-xl"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pol-min" className="text-xs font-bold text-slate-700">
                {isAr ? "الحد الأدنى للمبلغ" : "Minimum Amount"}
              </Label>
              <Input
                id="pol-min"
                name="minimumAmount"
                type="number"
                min="0"
                step="0.01"
                defaultValue="0"
                dir="ltr"
                className="font-mono text-sm rounded-xl"
              />
            </div>
          </div>

          {!state.ok && (
            <div
              role="alert"
              className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-bold text-red-800"
            >
              <AlertCircle className="size-4 shrink-0 text-red-600" />
              <span>{message(state.error, isAr)}</span>
            </div>
          )}

          <DialogFooter className="gap-2 pt-2 border-t border-slate-100">
            {onOpenChange && (
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="rounded-xl text-xs font-bold"
              >
                {isAr ? "إلغاء" : "Cancel"}
              </Button>
            )}
            <Button
              type="submit"
              disabled={pending}
              className="rounded-xl bg-blue-600 text-xs font-bold text-white hover:bg-blue-700"
            >
              {pending ? (isAr ? "جارٍ الحفظ..." : "Saving...") : isAr ? "حفظ المرحلة" : "Save Stage"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function RaiseStageForm({
  open = true,
  onOpenChange,
  organizationId,
  stages,
  locale,
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  organizationId: string;
  stages: { stage: number; label: string }[];
  locale: string;
}) {
  const isAr = locale === "ar";
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    raiseDunningStage,
    { ok: true }
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg rounded-3xl p-6 text-start">
        <DialogHeader className="space-y-1 border-b border-slate-100 pb-4 text-start">
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600 border border-blue-100">
              <BellRing className="size-4.5" />
            </div>
            <DialogTitle className="text-lg font-black text-slate-900">
              {isAr ? "رفع إشعارات تحصيل جماعية" : "Raise Dunning Notices"}
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-slate-500">
            {isAr
              ? "سيقوم النظام بإنشاء إشعارات رسمية لجميع المستحقات المتأخرة المؤهلة في المرحلة المحددة."
              : "Generate official dunning notices for all eligible overdue invoices in this stage."}
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="space-y-4 pt-2">
          <input type="hidden" name="organizationId" value={organizationId} />

          <div className="space-y-1.5">
            <Label htmlFor="raise-stage" className="text-xs font-bold text-slate-700">
              {isAr ? "اختر مرحلة التحصيل" : "Dunning Stage"}
            </Label>
            <select
              id="raise-stage"
              name="stage"
              required
              className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-xs font-bold text-slate-800 focus:border-blue-600 focus:outline-none"
            >
              {stages.map((s) => (
                <option key={s.stage} value={s.stage}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          {state.ok === true && state.id !== undefined && (
            <div
              role="status"
              className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-bold text-emerald-800"
            >
              <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
              <span>
                {state.id === "0"
                  ? isAr
                    ? "لا توجد مستحقات جديدة مؤهلة لهذه المرحلة."
                    : "No new overdue items qualify for this stage."
                  : isAr
                  ? `تم إصدار ${state.id} إشعار تحصيل بنجاح.`
                  : `Raised ${state.id} notices.`}
              </span>
            </div>
          )}

          {!state.ok && (
            <div
              role="alert"
              className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-bold text-red-800"
            >
              <AlertCircle className="size-4 shrink-0 text-red-600" />
              <span>{message(state.error, isAr)}</span>
            </div>
          )}

          <DialogFooter className="gap-2 pt-2 border-t border-slate-100">
            {onOpenChange && (
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="rounded-xl text-xs font-bold"
              >
                {isAr ? "إغلاق" : "Close"}
              </Button>
            )}
            <Button
              type="submit"
              disabled={pending || stages.length === 0}
              className="rounded-xl bg-blue-600 text-xs font-bold text-white hover:bg-blue-700 gap-1.5"
            >
              <BellRing className="size-3.5" />
              <span>{pending ? (isAr ? "جارٍ الإصدار..." : "Raising...") : isAr ? "إصدار الإشعارات" : "Raise Notices"}</span>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function NoticeActions({
  notice,
  locale,
}: {
  notice: NoticeRow;
  locale: string;
}) {
  const isAr = locale === "ar";
  const [deliverOpen, setDeliverOpen] = useState(false);
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    recordDunningDelivery,
    { ok: true }
  );

  useEffect(() => {
    if (state.ok && state.id) {
      setDeliverOpen(false);
    }
  }, [state]);

  const handleDownloadPdf = () => {
    generateDunningNoticePdf(
      {
        organizationName: "AqarBooks",
        stageName: (isAr ? notice.stage_name_ar : notice.stage_name_en) || `Stage ${notice.stage}`,
        stageNumber: notice.stage,
        raisedOn: notice.raised_at.slice(0, 10),
        memberName: notice.member_name || "",
        unitCode: notice.unit_code,
        dueDescription: notice.due_description,
        dueDate: notice.due_date,
        daysOverdue: notice.days_overdue,
        outstandingAmount: notice.outstanding_amount,
        currencyLabel: "EGP",
      },
      locale
    );
  };

  return (
    <div className="flex items-center justify-end gap-1.5">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={handleDownloadPdf}
        className="h-8 gap-1 px-2 text-xs font-bold text-blue-700 hover:bg-blue-50"
      >
        <Printer className="size-3.5" />
        <span>{isAr ? "PDF" : "PDF"}</span>
      </Button>

      {notice.status === "RAISED" && (
        <>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setDeliverOpen(true)}
            className="h-8 gap-1 px-2 text-xs font-bold text-emerald-700 hover:bg-emerald-50 border-emerald-300"
          >
            <Send className="size-3.5" />
            <span>{isAr ? "تسليم" : "Deliver"}</span>
          </Button>

          <Dialog open={deliverOpen} onOpenChange={setDeliverOpen}>
            <DialogContent className="max-w-md rounded-3xl p-6 text-start">
              <DialogHeader className="space-y-1 border-b border-slate-100 pb-4 text-start">
                <DialogTitle className="text-lg font-black text-slate-900">
                  {isAr ? "تسجيل تسليم الإشعار للعميل" : "Record Notice Delivery"}
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-500">
                  {isAr
                    ? `إثبات تسليم إشعار المرحلة ${notice.stage} للعميل (${notice.member_name}).`
                    : `Record delivery confirmation for ${notice.member_name}.`}
                </DialogDescription>
              </DialogHeader>

              <form action={formAction} className="space-y-4 pt-2">
                <input type="hidden" name="noticeId" value={notice.id} />

                <div className="space-y-1.5">
                  <Label htmlFor="del-channel" className="text-xs font-bold text-slate-700">
                    {isAr ? "قناة الإرسال / التسليم" : "Channel"}
                  </Label>
                  <select
                    id="del-channel"
                    name="deliveryChannel"
                    required
                    className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-xs font-bold text-slate-800 focus:border-blue-600 focus:outline-none"
                  >
                    <option value="EMAIL">{isAr ? "بريد إلكتروني (Email)" : "Email"}</option>
                    <option value="WHATSAPP">{isAr ? "واتساب (WhatsApp)" : "WhatsApp"}</option>
                    <option value="SMS">{isAr ? "رسالة نصية (SMS)" : "SMS"}</option>
                    <option value="REGISTERED_MAIL">{isAr ? "بريد مسجل / تسليم يدوي" : "Registered Mail"}</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="del-notes" className="text-xs font-bold text-slate-700">
                    {isAr ? "ملاحظات التسليم" : "Delivery Notes"}
                  </Label>
                  <Input
                    id="del-notes"
                    name="deliveryNotes"
                    placeholder={isAr ? "تم الإرسال واستلام التأكيد" : "Sent and confirmed"}
                    className="text-sm rounded-xl"
                  />
                </div>

                {!state.ok && (
                  <div
                    role="alert"
                    className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-bold text-red-800"
                  >
                    <AlertCircle className="size-4 shrink-0 text-red-600" />
                    <span>{message(state.error, isAr)}</span>
                  </div>
                )}

                <DialogFooter className="gap-2 pt-2 border-t border-slate-100">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setDeliverOpen(false)}
                    className="rounded-xl text-xs font-bold"
                  >
                    {isAr ? "إلغاء" : "Cancel"}
                  </Button>
                  <Button
                    type="submit"
                    disabled={pending}
                    className="rounded-xl bg-emerald-600 text-xs font-bold text-white hover:bg-emerald-700"
                  >
                    {pending ? (isAr ? "جارٍ الحفظ..." : "Saving...") : isAr ? "تأكيد التسليم" : "Confirm Delivery"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  );
}
