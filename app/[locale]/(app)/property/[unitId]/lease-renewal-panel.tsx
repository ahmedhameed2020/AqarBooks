"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Check, Loader2, RefreshCw, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { decideLeaseRenewalAction, requestLeaseRenewalAction } from "@/lib/actions/lease-renewals";
import { formatLeaseDate, leaseRenewalErrorMessage, LEASE_RENEWAL_STATUS_COPY, type LeaseRenewalStatus } from "@/lib/lease-renewal-ui";
import type { ActionResult } from "@/lib/actions/platform";
import { useRouter } from "@/i18n/navigation";

export interface StaffRenewalRequest {
  id: string;
  status: LeaseRenewalStatus;
  requesterKind: "TENANT" | "STAFF";
  tenantName: string;
  proposedStartsOn: string;
  proposedEndsOn: string | null;
  proposedRentAmount: number;
  proposedRentFrequency: "MONTHLY" | "QUARTERLY" | "YEARLY";
  requestNote: string | null;
  createdAt: string;
}

export function LeaseRenewalPanel({
  requests,
  activeLease,
  canManage,
  locale,
  currency,
}: {
  requests: StaffRenewalRequest[];
  activeLease: { id: string; endsOn: string; rentAmount: number; rentFrequency: "MONTHLY" | "QUARTERLY" | "YEARLY" } | null;
  canManage: boolean;
  locale: "ar" | "en";
  currency: string;
}) {
  const isAr = locale === "ar";
  const pendingRequest = requests.find((request) => request.status === "REQUESTED");
  return (
    <section className="space-y-4 border-t border-border/70 pt-5" aria-labelledby="lease-renewals-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h3 id="lease-renewals-title" className="flex items-center gap-2 text-sm font-bold"><RefreshCw className="size-4 text-indigo-500" />{isAr ? "تجديد العقد" : "Lease renewal"}</h3><p className="mt-1 text-xs text-slate-500">{isAr ? "راجع الطلبات واتخذ القرار ضمن نطاق العقار المصرح لك به." : "Review requests and decide within your authorized property scope."}</p></div>
        {canManage && activeLease && !pendingRequest && requests.length === 0 ? <StaffRenewalRequestDialog lease={activeLease} locale={locale} /> : null}
      </div>

      {requests.length === 0 ? <p className="rounded-xl border border-dashed border-border/70 p-4 text-sm text-slate-500">{isAr ? "لا توجد طلبات تجديد لهذه الوحدة." : "No renewal requests for this unit."}</p> : (
        <ul className="space-y-3">
          {requests.map((request) => {
            const copy = LEASE_RENEWAL_STATUS_COPY[request.status];
            return <li key={request.id} className="rounded-xl border border-border/70 bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-semibold">{request.tenantName}</p><p className="mt-1 text-xs text-slate-500">{request.requesterKind === "TENANT" ? (isAr ? "طلب المستأجر" : "Tenant request") : (isAr ? "طلب الموظف" : "Staff request")} · {new Intl.DateTimeFormat(isAr ? "ar-EG" : "en-GB", { dateStyle: "medium" }).format(new Date(request.createdAt))}</p></div><Badge variant={copy.tone}>{isAr ? copy.ar : copy.en}</Badge></div>
              <dl className="mt-4 grid gap-3 border-y border-border/60 py-3 text-xs sm:grid-cols-3"><div><dt className="text-slate-500">{isAr ? "الفترة المقترحة" : "Proposed term"}</dt><dd className="mt-1 font-medium">{formatLeaseDate(request.proposedStartsOn, locale)} – {formatLeaseDate(request.proposedEndsOn, locale)}</dd></div><div><dt className="text-slate-500">{isAr ? "القيمة" : "Rent"}</dt><dd className="mt-1 font-medium tabular-nums">{new Intl.NumberFormat(isAr ? "ar-EG" : "en-US", { style: "currency", currency }).format(request.proposedRentAmount)}</dd></div><div><dt className="text-slate-500">{isAr ? "الدورية" : "Frequency"}</dt><dd className="mt-1 font-medium">{request.proposedRentFrequency}</dd></div></dl>
              {request.requestNote ? <p className="mt-3 text-xs text-slate-600 dark:text-slate-300"><span className="font-semibold">{isAr ? "ملاحظة الطلب:" : "Request note:"}</span> {request.requestNote}</p> : null}
              {request.status === "REQUESTED" && canManage ? <div className="mt-4 flex flex-wrap gap-2"><RenewalDecisionDialog requestId={request.id} decision="APPROVED" locale={locale} /><RenewalDecisionDialog requestId={request.id} decision="REJECTED" locale={locale} /></div> : null}
            </li>;
          })}
        </ul>
      )}
    </section>
  );
}

function StaffRenewalRequestDialog({ lease, locale }: { lease: NonNullable<Parameters<typeof LeaseRenewalPanel>[0]["activeLease"]>; locale: "ar" | "en" }) {
  const isAr = locale === "ar";
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<ActionResult, FormData>(requestLeaseRenewalAction, { ok: true });
  const startsOn = addOneDay(lease.endsOn);
  useCloseOnSuccess(state, pending, () => setOpen(false), locale, isAr ? "تم إنشاء طلب التجديد" : "Renewal request created");
  return <Dialog open={open} onOpenChange={setOpen}><DialogTrigger render={<Button type="button" size="sm" variant="outline" className="gap-2"><RefreshCw className="size-4" />{isAr ? "إنشاء طلب" : "Create request"}</Button>} /><DialogContent><form action={action}><DialogHeader><DialogTitle>{isAr ? "إنشاء طلب تجديد" : "Create renewal request"}</DialogTitle></DialogHeader><DialogBody className="space-y-4"><input type="hidden" name="leaseId" value={lease.id} /><div className="grid gap-4 sm:grid-cols-2"><Field label={isAr ? "البداية" : "Starts"} id="staff-renewal-start"><Input id="staff-renewal-start" name="proposedStartsOn" type="date" defaultValue={startsOn} required /></Field><Field label={isAr ? "النهاية (اختياري)" : "Ends (optional)"} id="staff-renewal-end"><Input id="staff-renewal-end" name="proposedEndsOn" type="date" min={startsOn} /></Field><Field label={isAr ? "القيمة" : "Rent"} id="staff-renewal-rent"><Input id="staff-renewal-rent" name="proposedRentAmount" type="number" min="0.01" step="0.01" defaultValue={lease.rentAmount} required /></Field><Field label={isAr ? "الدورية" : "Frequency"} id="staff-renewal-frequency"><Select name="proposedRentFrequency" defaultValue={lease.rentFrequency}><SelectTrigger id="staff-renewal-frequency"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="MONTHLY">MONTHLY</SelectItem><SelectItem value="QUARTERLY">QUARTERLY</SelectItem><SelectItem value="YEARLY">YEARLY</SelectItem></SelectContent></Select></Field></div><Field label={isAr ? "ملاحظة (اختياري)" : "Note (optional)"} id="staff-renewal-note"><Textarea id="staff-renewal-note" name="note" maxLength={1000} /></Field>{!state.ok ? <p role="alert" className="text-sm text-destructive">{leaseRenewalErrorMessage(state.error, locale)}</p> : null}</DialogBody><DialogFooter><Button type="submit" disabled={pending}>{pending && <Loader2 className="size-4 animate-spin" />}{isAr ? "إرسال" : "Submit"}</Button></DialogFooter></form></DialogContent></Dialog>;
}

function RenewalDecisionDialog({ requestId, decision, locale }: { requestId: string; decision: "APPROVED" | "REJECTED"; locale: "ar" | "en" }) {
  const isAr = locale === "ar";
  const approving = decision === "APPROVED";
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<ActionResult, FormData>(decideLeaseRenewalAction, { ok: true });
  useCloseOnSuccess(state, pending, () => setOpen(false), locale, approving ? (isAr ? "تمت الموافقة" : "Renewal approved") : (isAr ? "تم الرفض" : "Renewal rejected"));
  return <Dialog open={open} onOpenChange={setOpen}><DialogTrigger render={<Button type="button" size="sm" variant={approving ? "default" : "outline"} className="gap-2">{approving ? <Check className="size-4" /> : <X className="size-4" />}{approving ? (isAr ? "موافقة" : "Approve") : (isAr ? "رفض" : "Reject")}</Button>} /><DialogContent><form action={action}><DialogHeader><DialogTitle>{approving ? (isAr ? "تأكيد الموافقة" : "Confirm approval") : (isAr ? "تأكيد الرفض" : "Confirm rejection")}</DialogTitle></DialogHeader><DialogBody className="space-y-4"><input type="hidden" name="requestId" value={requestId} /><input type="hidden" name="decision" value={decision} /><p className="text-sm text-slate-600 dark:text-slate-300">{approving ? (isAr ? "سيُنشأ عقد مجدول يبدأ في التاريخ المقترح. لن تُنشأ مستحقات الآن." : "A scheduled successor will be created for the proposed date. No dues are created now.") : (isAr ? "لن يُنشأ عقد جديد. اكتب سببًا واضحًا للرفض." : "No successor will be created. Provide a clear rejection reason.")}</p>{!approving ? <Field label={isAr ? "سبب الرفض" : "Rejection reason"} id={`reason-${requestId}`}><Textarea id={`reason-${requestId}`} name="reason" required maxLength={1000} /></Field> : <input type="hidden" name="reason" value="" />}{!state.ok ? <p role="alert" aria-live="polite" className="text-sm text-destructive">{leaseRenewalErrorMessage(state.error, locale)}</p> : null}</DialogBody><DialogFooter><Button type="submit" variant={approving ? "default" : "destructive"} disabled={pending}>{pending ? <Loader2 className="size-4 animate-spin" /> : approving ? <Check className="size-4" /> : <X className="size-4" />}{pending ? (isAr ? "جارٍ الحفظ" : "Saving") : (isAr ? "تأكيد" : "Confirm")}</Button></DialogFooter></form></DialogContent></Dialog>;
}

function Field({ label, id, children }: { label: string; id: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label htmlFor={id}>{label}</Label>{children}</div>;
}

function useCloseOnSuccess(state: ActionResult, pending: boolean, close: () => void, locale: "ar" | "en", success: string) {
  const toast = useToast();
  const router = useRouter();
  const wasPending = useRef(false);
  useEffect(() => {
    if (wasPending.current && !pending && state.ok) { toast.add({ title: success, type: "success" }); close(); router.refresh(); }
    wasPending.current = pending;
  }, [close, locale, pending, router, state, success, toast]);
}

function addOneDay(value: string) { const date = new Date(`${value}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + 1); return date.toISOString().slice(0, 10); }
