"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";
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
  FileMinus2,
  Plus,
  Building2,
  Calendar,
  Layers,
  DollarSign,
  AlertCircle,
  RefreshCw,
  CheckCircle2,
} from "lucide-react";
import { issueCreditNoteAction } from "@/lib/actions/receivables";
import { useToast } from "@/components/ui/toast";
import { getCurrencyLabel } from "@/lib/currency";

export type DueCreditableOption = {
  id: string;
  unitCode: string;
  amount: number;
  remainingCreditable: number;
  label: string;
};

export function IssueCreditNoteDialog({
  open,
  onOpenChange,
  dues,
  currency = "EGP",
  locale,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dues: DueCreditableOption[];
  currency?: string;
  locale: string;
}) {
  const isAr = locale === "ar";
  const currencyLabel = getCurrencyLabel(currency, isAr);
  const router = useRouter();
  const toast = useToast();
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [dueId, setDueId] = useState<string>(dues[0]?.id ?? "");
  const [grossAmount, setGrossAmount] = useState("");
  const [reason, setReason] = useState("");
  const [creditDate, setCreditDate] = useState(new Date().toISOString().split("T")[0]);

  const selectedDue = dues.find((d) => d.id === dueId);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!dueId || !grossAmount || Number(grossAmount) <= 0 || !reason.trim()) {
      setErrorMsg(isAr ? "يرجى تعبئة جميع الحقول المطلوبة" : "Please fill in all required fields");
      return;
    }

    if (selectedDue && Number(grossAmount) > selectedDue.remainingCreditable) {
      setErrorMsg(
        isAr
          ? `مبلغ الخصم (${Number(grossAmount).toLocaleString()} ${currencyLabel}) يتجاوز الحد الأقصى المتبقي القابل للخصم (${selectedDue.remainingCreditable.toLocaleString()} ${currencyLabel})`
          : `Amount exceeds maximum creditable remaining (${selectedDue.remainingCreditable.toLocaleString()} ${currencyLabel})`
      );
      return;
    }

    startTransition(async () => {
      const formData = new FormData();
      formData.set("dueId", dueId);
      formData.set("grossAmount", grossAmount);
      formData.set("reason", reason.trim());
      formData.set("creditDate", creditDate);

      const res = await issueCreditNoteAction({ ok: true }, formData);

      if (res.ok) {
        toast.add({
          type: "success",
          title: isAr ? "تم إصدار إشعار الخصم بنجاح" : "Credit Note Issued",
          description: isAr
            ? `تم تسجيل إشعار خصم بمبلغ ${Number(grossAmount).toLocaleString()} ${currencyLabel} وعكس القيد والضريبة`
            : `Issued credit note for ${Number(grossAmount).toLocaleString()} ${currencyLabel}`,
        });
        onOpenChange(false);
        setGrossAmount("");
        setReason("");
        router.refresh();
      } else {
        setErrorMsg(res.error || (isAr ? "فشل إصدار إشعار الخصم" : "Failed to issue credit note"));
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <div className="flex size-10 items-center justify-center rounded-xl bg-rose-600/10 text-rose-600 dark:bg-rose-500/20 dark:text-rose-400">
            <FileMinus2 className="size-5" />
          </div>
          <div>
            <DialogTitle>{isAr ? "إصدار إشعار خصم ضريبي (Credit Note)" : "Issue Tax Credit Note"}</DialogTitle>
            <DialogDescription>
              {isAr
                ? "تصحيح أو تخفيض مطالبة صادرة وعكس المعالجة الضريبية وقيد الاستحقاق بقاعدة الأصل."
                : "Issue credit adjustment against issued demand and reverse tax/revenue accrual."}
            </DialogDescription>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <DialogBody className="space-y-4">
            {errorMsg && (
              <div role="alert" className="flex items-center gap-2.5 rounded-xl border border-red-200 bg-red-50/90 p-3 text-xs font-semibold text-red-700 dark:border-red-900/50 dark:bg-red-950/50 dark:text-red-300">
                <AlertCircle className="size-4 shrink-0 text-red-600 dark:text-red-400" />
                <span>{errorMsg}</span>
              </div>
            )}

            <div className="space-y-1.5 text-start">
              <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                {isAr ? "المطالبة / المستحق المراد خصمه *" : "Target Due Demand *"}
              </Label>
              <Select value={dueId} onValueChange={(val) => setDueId(val ?? "")} items={dues.map((d) => ({ value: d.id, label: d.label }))}>
                <SelectTrigger className="w-full text-xs">
                  <SelectValue placeholder={isAr ? "اختر المطالبة..." : "Select due..."} />
                </SelectTrigger>
                <SelectContent>
                  {dues.map((d) => (
                    <SelectItem key={d.id} value={d.id} className="text-xs">
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedDue && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/60 flex items-center justify-between text-xs">
                <span className="text-slate-500">{isAr ? "الحد الأقصى المتبقي القابل للخصم:" : "Max Creditable Remaining:"}</span>
                <span className="font-mono font-bold text-rose-600 dark:text-rose-400">
                  {selectedDue.remainingCreditable.toLocaleString()} {currencyLabel}
                </span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5 text-start">
                <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  {isAr ? "مبلغ الخصم المطلوب *" : "Credit Amount *"}
                </Label>
                <div className="relative">
                  <Input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    value={grossAmount}
                    onChange={(e) => setGrossAmount(e.target.value)}
                    placeholder="0.00"
                    className="font-mono text-sm font-bold ps-3 pe-12 text-start"
                    dir="ltr"
                  />
                  <div className="absolute inset-y-0 end-0 flex items-center pe-2.5 pointer-events-none text-xs font-bold text-slate-400">
                    {currencyLabel}
                  </div>
                </div>
              </div>

              <div className="space-y-1.5 text-start">
                <Label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                  <Calendar className="size-3 text-slate-400" />
                  <span>{isAr ? "تاريخ إشعار الخصم *" : "Credit Date *"}</span>
                </Label>
                <Input
                  type="date"
                  required
                  value={creditDate}
                  onChange={(e) => setCreditDate(e.target.value)}
                  className="font-mono text-xs"
                />
              </div>
            </div>

            <div className="space-y-1.5 text-start">
              <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                {isAr ? "سبب إصدار إشعار الخصم *" : "Reason for Credit Note *"}
              </Label>
              <Input
                required
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={isAr ? "مثال: خصم تسوية صيانة / تصحيح خطأ حسابي" : "e.g. Settlement discount or pricing adjustment"}
                className="text-xs"
              />
            </div>
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
              {isAr ? "إلغاء" : "Cancel"}
            </Button>
            <Button type="submit" disabled={isPending || !dueId || !grossAmount || Number(grossAmount) <= 0 || !reason.trim()} className="bg-rose-600 hover:bg-rose-700 text-white font-bold gap-1.5">
              {isPending ? <RefreshCw className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />}
              <span>{isAr ? "إصدار وترحيل إشعار الخصم" : "Issue Credit Note"}</span>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
