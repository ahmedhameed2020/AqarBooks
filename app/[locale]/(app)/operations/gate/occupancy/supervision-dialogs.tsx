"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, ShieldAlert, UserRoundX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  approveGateManualExceptionAction,
  createGateManualExceptionAction,
  reconcileVisitorAccessStateAction,
} from "@/lib/actions/gate-supervision";

export type SupervisionGateOption = { id: string; label: string };
export type SupervisionInvitationOption = { id: string; label: string };
export type PendingExceptionItem = {
  id: string;
  visitorLabel: string;
  gateLabel: string;
  direction: "ENTRY" | "EXIT";
  outcome: "ENTERED" | "EXITED" | "DENIED";
  category: string;
  reason: string;
  occurredAt: string;
};

function resultMessage(error: string | undefined, isAr: boolean) {
  if (!error) return isAr ? "تم الحفظ" : "Saved";
  const messages: Record<string, [string, string]> = {
    forbidden: ["ليست لديك الصلاحية المطلوبة.", "You do not have the required permission."],
    self_approval: ["لا يمكن للمشغل اعتماد طلبه بنفسه.", "An operator cannot approve their own request."],
    already_approved: ["تم اعتماد هذا الطلب من قبل.", "This request was already approved."],
    state_unchanged: ["الحالة المحددة مطابقة للحالة الحالية.", "The requested state matches the current state."],
    invalid_input: ["تحقق من جميع الحقول.", "Check all fields."],
  };
  const message = messages[error] ?? ["تعذر حفظ الإجراء.", "Could not save the action."];
  return isAr ? message[0] : message[1];
}

export function ManualExceptionDialog({
  gates,
  invitations,
  locale,
}: {
  gates: SupervisionGateOption[];
  invitations: SupervisionInvitationOption[];
  locale: "ar" | "en";
}) {
  const isAr = locale === "ar";
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [gateId, setGateId] = useState(gates[0]?.id ?? "");
  const [invitationId, setInvitationId] = useState("");
  const [direction, setDirection] = useState<"ENTRY" | "EXIT">("ENTRY");
  const [denied, setDenied] = useState(false);
  const [category, setCategory] = useState<"POLICY_EXCEPTION" | "EMERGENCY" | "CONNECTIVITY_FAILURE" | "MISSED_SCAN" | "OTHER">("OTHER");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();

  function submit() {
    setMessage("");
    startTransition(async () => {
      const response = await createGateManualExceptionAction({
        gateId,
        invitationId: invitationId || null,
        direction,
        outcome: denied ? "DENIED" : direction === "ENTRY" ? "ENTERED" : "EXITED",
        category,
        reason,
      });
      setMessage(resultMessage(response.ok ? undefined : response.error, isAr));
      if (response.ok) {
        router.refresh();
        setReason("");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button type="button" variant="outline" className="gap-2 rounded-xl"><ShieldAlert className="size-4" />{isAr ? "استثناء يدوي" : "Manual exception"}</Button>} />
      <DialogContent>
        <DialogHeader><div><DialogTitle>{isAr ? "تسجيل استثناء بوابة" : "Record gate exception"}</DialogTitle><DialogDescription>{isAr ? "يسجل دليلاً مستقلاً ولا يغيّر قرار مسح سابق." : "Records separate evidence and never changes an earlier scan decision."}</DialogDescription></div></DialogHeader>
        <DialogBody className="space-y-4">
          <label className="block space-y-1 text-xs font-bold"><span>{isAr ? "البوابة" : "Gate"}</span><select value={gateId} onChange={(event) => setGateId(event.target.value)} className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm">{gates.map((gate) => <option key={gate.id} value={gate.id}>{gate.label}</option>)}</select></label>
          <label className="block space-y-1 text-xs font-bold"><span>{isAr ? "الزائر (اختياري)" : "Visitor (optional)"}</span><select value={invitationId} onChange={(event) => setInvitationId(event.target.value)} className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm"><option value="">{isAr ? "زائر غير محدد" : "Unidentified visitor"}</option>{invitations.map((invitation) => <option key={invitation.id} value={invitation.id}>{invitation.label}</option>)}</select></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1 text-xs font-bold"><span>{isAr ? "الاتجاه" : "Direction"}</span><select value={direction} onChange={(event) => setDirection(event.target.value as "ENTRY" | "EXIT")} className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm"><option value="ENTRY">{isAr ? "دخول" : "Entry"}</option><option value="EXIT">{isAr ? "خروج" : "Exit"}</option></select></label>
            <label className="space-y-1 text-xs font-bold"><span>{isAr ? "النتيجة" : "Outcome"}</span><select value={denied ? "DENIED" : "COMPLETED"} onChange={(event) => setDenied(event.target.value === "DENIED")} className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm"><option value="COMPLETED">{direction === "ENTRY" ? (isAr ? "تم الدخول" : "Entered") : (isAr ? "تم الخروج" : "Exited")}</option><option value="DENIED">{isAr ? "مرفوض" : "Denied"}</option></select></label>
          </div>
          <label className="block space-y-1 text-xs font-bold"><span>{isAr ? "التصنيف" : "Category"}</span><select value={category} onChange={(event) => setCategory(event.target.value as typeof category)} className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm"><option value="POLICY_EXCEPTION">POLICY_EXCEPTION</option><option value="EMERGENCY">EMERGENCY</option><option value="CONNECTIVITY_FAILURE">CONNECTIVITY_FAILURE</option><option value="MISSED_SCAN">MISSED_SCAN</option><option value="OTHER">OTHER</option></select></label>
          <label className="block space-y-1 text-xs font-bold"><span>{isAr ? "السبب" : "Reason"}</span><Input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} className="h-10 rounded-xl" /></label>
          {message ? <p role="status" className="text-xs font-semibold text-slate-500">{message}</p> : null}
        </DialogBody>
        <DialogFooter><Button type="button" onClick={submit} disabled={pending || !gateId || !reason.trim()}>{pending ? <Loader2 className="size-4 animate-spin" /> : <ShieldAlert className="size-4" />}{isAr ? "تسجيل" : "Record"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ReconcileVisitorDialog({
  invitationId,
  visitorLabel,
  gateId,
  gates,
  locale,
}: {
  invitationId: string;
  visitorLabel: string;
  gateId: string | null;
  gates: SupervisionGateOption[];
  locale: "ar" | "en";
}) {
  const isAr = locale === "ar";
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selectedGateId, setSelectedGateId] = useState(gateId ?? gates[0]?.id ?? "");
  const [category, setCategory] = useState<"MISSED_SCAN" | "STATE_CORRECTION" | "OTHER">("MISSED_SCAN");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();

  function submit() {
    setMessage("");
    startTransition(async () => {
      const response = await reconcileVisitorAccessStateAction({ gateId: selectedGateId, invitationId, isInside: false, category, reason });
      setMessage(resultMessage(response.ok ? undefined : response.error, isAr));
      if (response.ok) router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button type="button" size="sm" variant="outline" className="h-8 gap-1 rounded-xl text-xs"><UserRoundX className="size-3.5" />{isAr ? "تصحيح خروج" : "Correct exit"}</Button>} />
      <DialogContent>
        <DialogHeader><div><DialogTitle>{isAr ? "تسوية حالة الزائر" : "Reconcile visitor state"}</DialogTitle><DialogDescription>{isAr ? `تسجيل خروج مصحح لـ ${visitorLabel} مع أثر تدقيق دائم.` : `Record a corrected exit for ${visitorLabel} with an immutable audit trail.`}</DialogDescription></div></DialogHeader>
        <DialogBody className="space-y-4">
          <label className="block space-y-1 text-xs font-bold"><span>{isAr ? "البوابة" : "Gate"}</span><select value={selectedGateId} onChange={(event) => setSelectedGateId(event.target.value)} className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm">{gates.map((gate) => <option key={gate.id} value={gate.id}>{gate.label}</option>)}</select></label>
          <label className="block space-y-1 text-xs font-bold"><span>{isAr ? "التصنيف" : "Category"}</span><select value={category} onChange={(event) => setCategory(event.target.value as typeof category)} className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm"><option value="MISSED_SCAN">MISSED_SCAN</option><option value="STATE_CORRECTION">STATE_CORRECTION</option><option value="OTHER">OTHER</option></select></label>
          <label className="block space-y-1 text-xs font-bold"><span>{isAr ? "سبب التصحيح" : "Correction reason"}</span><Input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} className="h-10 rounded-xl" /></label>
          {message ? <p role="status" className="text-xs font-semibold text-slate-500">{message}</p> : null}
        </DialogBody>
        <DialogFooter><Button type="button" onClick={submit} disabled={pending || !selectedGateId || !reason.trim()}>{pending ? <Loader2 className="size-4 animate-spin" /> : <UserRoundX className="size-4" />}{isAr ? "تأكيد الخروج المصحح" : "Confirm corrected exit"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function PendingExceptionApprovals({ items, locale }: { items: PendingExceptionItem[]; locale: "ar" | "en" }) {
  const isAr = locale === "ar";
  const router = useRouter();
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [messages, setMessages] = useState<Record<string, string>>({});
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  if (items.length === 0) return null;

  function approve(id: string) {
    setPendingId(id);
    startTransition(async () => {
      const response = await approveGateManualExceptionAction({ exceptionId: id, reason: reasons[id] ?? "" });
      setMessages((current) => ({ ...current, [id]: resultMessage(response.ok ? undefined : response.error, isAr) }));
      setPendingId(null);
      if (response.ok) router.refresh();
    });
  }

  return (
    <section className="rounded-2xl border border-amber-200 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/20">
      <div className="border-b border-amber-200 p-4 dark:border-amber-900"><h2 className="text-sm font-black">{isAr ? "استثناءات بانتظار اعتماد مشرف" : "Exceptions awaiting supervisor approval"}</h2></div>
      <div className="divide-y divide-amber-200 dark:divide-amber-900">{items.map((item) => <div key={item.id} className="space-y-3 p-4"><div className="grid gap-2 text-xs sm:grid-cols-3"><div><p className="font-black">{item.visitorLabel}</p><p className="text-slate-500">{item.gateLabel}</p></div><p>{item.direction} · {item.outcome}<br />{item.category}</p><p className="text-slate-500">{item.reason}<br />{new Date(item.occurredAt).toLocaleString(isAr ? "ar-QA" : "en-QA")}</p></div><div className="flex flex-col gap-2 sm:flex-row"><Input value={reasons[item.id] ?? ""} onChange={(event) => setReasons((current) => ({ ...current, [item.id]: event.target.value }))} maxLength={500} placeholder={isAr ? "سبب الاعتماد" : "Approval reason"} className="h-9 rounded-xl sm:max-w-md" /><Button type="button" size="sm" onClick={() => approve(item.id)} disabled={pending || !(reasons[item.id]?.trim())} className="h-9 gap-1 rounded-xl">{pending && pendingId === item.id ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}{isAr ? "اعتماد" : "Approve"}</Button>{messages[item.id] ? <p role="status" className="self-center text-xs text-slate-500">{messages[item.id]}</p> : null}</div></div>)}</div>
    </section>
  );
}
