"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { createInstallmentPlanAction } from "@/lib/actions/property";
import type { ActionResult } from "@/lib/actions/platform";

type Option = { id: string; label: string };

export function CreateInstallmentPlanForm({
  organizationId,
  unitId,
  members,
  dueTypes,
  receivableAccounts,
  locale,
  onSuccess,
}: {
  organizationId: string;
  unitId: string;
  members: Option[];
  dueTypes: Option[];
  receivableAccounts: Option[];
  locale: string;
  onSuccess?: () => void;
}) {
  const isAr = locale === "ar";
  const router = useRouter();
  const toast = useToast();
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(createInstallmentPlanAction, { ok: true });
  const wasPending = useRef(false);

  const [buyerMemberId, setBuyerMemberId] = useState("");
  const [dueTypeId, setDueTypeId] = useState("");
  const [receivableAccountId, setReceivableAccountId] = useState("");
  const [touched, setTouched] = useState(false);

  const buyerError = touched && !buyerMemberId ? (isAr ? "اختر المشتري" : "Select the buyer") : undefined;
  const dueTypeError = touched && !dueTypeId ? (isAr ? "اختر نوع الاستحقاق" : "Select a due type") : undefined;
  const accountError = touched && !receivableAccountId ? (isAr ? "اختر حساب الذمم" : "Select a receivable account") : undefined;

  useEffect(() => {
    if (wasPending.current && !pending && state.ok) {
      toast.add({ title: isAr ? "تم إنشاء خطة التقسيط" : "Installment plan created", type: "success" });
      onSuccess?.();
      router.refresh();
    }
    wasPending.current = pending;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, state]);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    setTouched(true);
    if (!buyerMemberId || !dueTypeId || !receivableAccountId) e.preventDefault();
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <form action={formAction} onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
      <input type="hidden" name="organizationId" value={organizationId} />
      <input type="hidden" name="unitId" value={unitId} />

      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="buyerMemberId">{isAr ? "المشتري" : "Buyer"}</Label>
        <SearchableSelect
          name="buyerMemberId"
          value={buyerMemberId}
          onValueChange={setBuyerMemberId}
          items={members.map((m) => ({ value: m.id, label: m.label }))}
          placeholder={isAr ? "ابحث عن عضو…" : "Search for a member…"}
          emptyLabel={isAr ? "لا يوجد أعضاء مطابقون" : "No matching members"}
          error={buyerError}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="totalPrice">{isAr ? "السعر الإجمالي" : "Total price"}</Label>
        <Input id="totalPrice" name="totalPrice" type="number" step="0.01" min="0.01" required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="downPayment">{isAr ? "الدفعة المقدمة" : "Down payment"}</Label>
        <Input id="downPayment" name="downPayment" type="number" step="0.01" min="0" defaultValue={0} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="installmentCount">{isAr ? "عدد الأقساط" : "Number of installments"}</Label>
        <Input id="installmentCount" name="installmentCount" type="number" step="1" min="1" required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="installmentFrequency">{isAr ? "دورية الأقساط" : "Installment frequency"}</Label>
        <Select
          name="installmentFrequency"
          defaultValue="MONTHLY"
          items={[
            { value: "MONTHLY", label: isAr ? "شهري" : "Monthly" },
            { value: "QUARTERLY", label: isAr ? "ربع سنوي" : "Quarterly" },
            { value: "YEARLY", label: isAr ? "سنوي" : "Yearly" },
          ]}
        >
          <SelectTrigger id="installmentFrequency" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="MONTHLY">{isAr ? "شهري" : "Monthly"}</SelectItem>
            <SelectItem value="QUARTERLY">{isAr ? "ربع سنوي" : "Quarterly"}</SelectItem>
            <SelectItem value="YEARLY">{isAr ? "سنوي" : "Yearly"}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="startsOn">{isAr ? "تاريخ البداية" : "Start date"}</Label>
        <Input id="startsOn" name="startsOn" type="date" defaultValue={today} required />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="dueTypeId">{isAr ? "نوع الاستحقاق" : "Due type"}</Label>
        <SearchableSelect
          name="dueTypeId"
          value={dueTypeId}
          onValueChange={setDueTypeId}
          items={dueTypes.map((d) => ({ value: d.id, label: d.label }))}
          placeholder={isAr ? "اختر نوع الاستحقاق…" : "Select a due type…"}
          emptyLabel={isAr ? "لا يوجد أنواع استحقاق" : "No due types"}
          error={dueTypeError}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="receivableAccountId">{isAr ? "حساب الذمم" : "Receivable account"}</Label>
        <SearchableSelect
          name="receivableAccountId"
          value={receivableAccountId}
          onValueChange={setReceivableAccountId}
          items={receivableAccounts.map((a) => ({ value: a.id, label: a.label }))}
          placeholder={isAr ? "اختر حساب الذمم…" : "Select a receivable account…"}
          emptyLabel={isAr ? "لا توجد حسابات" : "No accounts"}
          error={accountError}
        />
      </div>

      {!state.ok && (
        <p role="alert" className="text-sm text-destructive sm:col-span-2">
          {state.error}
        </p>
      )}
      <div className="sm:col-span-2">
        <Button type="submit" disabled={pending} className="w-full">
          {pending && <Loader2 className="size-3.5 animate-spin" />}
          {pending ? (isAr ? "جارٍ الإنشاء…" : "Creating…") : isAr ? "إنشاء خطة التقسيط" : "Create installment plan"}
        </Button>
      </div>
    </form>
  );
}
