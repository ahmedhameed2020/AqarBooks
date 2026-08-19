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
  Scale,
  Plus,
  Building2,
  Calendar,
  Layers,
  DollarSign,
  AlertCircle,
  RefreshCw,
  CheckCircle2,
  Landmark,
  FileSpreadsheet,
} from "lucide-react";
import { createBankStatement } from "@/lib/actions/bank-reconciliation";
import { useToast } from "@/components/ui/toast";
import { getCurrencyLabel } from "@/lib/currency";

export type BankAccountOption = {
  id: string;
  label: string;
};

export function CreateStatementDialog({
  open,
  onOpenChange,
  organizationId,
  bankAccounts,
  currency = "EGP",
  locale,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  bankAccounts: BankAccountOption[];
  currency?: string;
  locale: string;
}) {
  const isAr = locale === "ar";
  const currencyLabel = getCurrencyLabel(currency, isAr);
  const router = useRouter();
  const toast = useToast();
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [bankAccountId, setBankAccountId] = useState<string>(bankAccounts[0]?.id ?? "");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [openingBalance, setOpeningBalance] = useState("");
  const [closingBalance, setClosingBalance] = useState("");
  const [note, setNote] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!bankAccountId || !periodStart || !periodEnd || !openingBalance || !closingBalance) {
      setErrorMsg(isAr ? "يرجى تعبئة جميع الحقول الإلزامية" : "Please fill in all required fields");
      return;
    }

    startTransition(async () => {
      const formData = new FormData();
      formData.set("organizationId", organizationId);
      formData.set("bankAccountId", bankAccountId);
      formData.set("periodStart", periodStart);
      formData.set("periodEnd", periodEnd);
      formData.set("openingBalance", openingBalance);
      formData.set("closingBalance", closingBalance);
      if (note.trim()) formData.set("note", note.trim());

      const res = await createBankStatement({ ok: true }, formData);

      if (res.ok) {
        toast.add({
          type: "success",
          title: isAr ? "تم إنشاء كشف الحساب البنكي" : "Bank Statement Created",
          description: isAr
            ? `تم فتح جلسة تسوية جديدة للفترة من ${periodStart} إلى ${periodEnd}`
            : `Opened reconciliation statement for period ${periodStart} to ${periodEnd}`,
        });
        onOpenChange(false);
        router.refresh();
      } else {
        const err = res.error || "";
        if (err === "duplicate_period") {
          setErrorMsg(
            isAr
              ? "يوجد كشف حساب لنفس الحساب البنكي بنفس تاريخ النهاية."
              : "A statement already exists for this bank account with the same end date."
          );
        } else if (err === "period_order") {
          setErrorMsg(isAr ? "تاريخ النهاية يجب ألا يسبق تاريخ البداية." : "The end date cannot precede start date.");
        } else {
          setErrorMsg(err || (isAr ? "فشل إنشاء كشف الحساب" : "Failed to create statement"));
        }
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <div className="flex size-10 items-center justify-center rounded-xl bg-blue-600/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400">
            <Scale className="size-5" />
          </div>
          <div>
            <DialogTitle>{isAr ? "إنشاء كشف حساب بنكي للمطابقة" : "New Bank Statement for Reconciliation"}</DialogTitle>
            <DialogDescription>
              {isAr
                ? "إدخال بيانات كشف الحساب الصادر من البنك لبدء مطابقة الحركات مع الدفاتر."
                : "Enter bank statement details to start matching transactions against ledger."}
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
                {isAr ? "الحساب البنكي المراد مطابقته *" : "Bank Account *"}
              </Label>
              <Select value={bankAccountId} onValueChange={(val) => setBankAccountId(val ?? "")} items={bankAccounts.map((b) => ({ value: b.id, label: b.label }))}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={isAr ? "اختر الحساب البنكي..." : "Select bank account..."} />
                </SelectTrigger>
                <SelectContent>
                  {bankAccounts.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5 text-start">
                <Label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                  <Calendar className="size-3 text-slate-400" />
                  <span>{isAr ? "من تاريخ *" : "Period Start *"}</span>
                </Label>
                <Input
                  type="date"
                  required
                  value={periodStart}
                  onChange={(e) => setPeriodStart(e.target.value)}
                  className="font-mono text-sm"
                />
              </div>

              <div className="space-y-1.5 text-start">
                <Label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                  <Calendar className="size-3 text-slate-400" />
                  <span>{isAr ? "إلى تاريخ *" : "Period End *"}</span>
                </Label>
                <Input
                  type="date"
                  required
                  value={periodEnd}
                  onChange={(e) => setPeriodEnd(e.target.value)}
                  className="font-mono text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5 text-start">
                <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  {isAr ? "الرصيد الافتتاحي (حسب البنك) *" : "Opening Balance (per Bank) *"}
                </Label>
                <div className="relative">
                  <Input
                    type="number"
                    step="0.01"
                    required
                    value={openingBalance}
                    onChange={(e) => setOpeningBalance(e.target.value)}
                    placeholder="0.00"
                    className="font-mono text-sm font-bold ps-3 pe-14 text-start"
                    dir="ltr"
                  />
                  <div className="absolute inset-y-0 end-0 flex items-center pe-3 pointer-events-none text-xs font-bold text-slate-400">
                    {currencyLabel}
                  </div>
                </div>
              </div>

              <div className="space-y-1.5 text-start">
                <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  {isAr ? "الرصيد الختامي (حسب البنك) *" : "Closing Balance (per Bank) *"}
                </Label>
                <div className="relative">
                  <Input
                    type="number"
                    step="0.01"
                    required
                    value={closingBalance}
                    onChange={(e) => setClosingBalance(e.target.value)}
                    placeholder="0.00"
                    className="font-mono text-sm font-bold ps-3 pe-14 text-start"
                    dir="ltr"
                  />
                  <div className="absolute inset-y-0 end-0 flex items-center pe-3 pointer-events-none text-xs font-bold text-slate-400">
                    {currencyLabel}
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-1.5 text-start">
              <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                {isAr ? "ملاحظات / وصف الكشف" : "Statement Description / Note"}
              </Label>
              <Input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={isAr ? "مثال: كشف حساب شهر مايو 2026" : "e.g. May 2026 Monthly Statement"}
                className="text-sm"
              />
            </div>
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
              {isAr ? "إلغاء" : "Cancel"}
            </Button>
            <Button type="submit" disabled={isPending || !bankAccountId || !periodStart || !periodEnd} className="bg-blue-600 hover:bg-blue-700 text-white font-bold gap-1.5">
              {isPending ? <RefreshCw className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
              <span>{isAr ? "إنشاء كشف الحساب" : "Create Statement"}</span>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
