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
  CreditCard,
  Plus,
  Building2,
  Calendar,
  Layers,
  DollarSign,
  AlertCircle,
  RefreshCw,
  CheckCircle2,
  Receipt,
  User,
} from "lucide-react";
import { recordPaymentAction } from "@/lib/actions/receivables";
import { useToast } from "@/components/ui/toast";
import { getCurrencyLabel } from "@/lib/currency";

export type Option = { id: string; label: string };
export type DueOption = { id: string; unitId: string; label: string; remaining: number };

const PAYMENT_METHODS = [
  { value: "CASH", labelAr: "نقدي (Cash)", labelEn: "Cash" },
  { value: "BANK_TRANSFER", labelAr: "تحويل بنكي (Transfer)", labelEn: "Bank Transfer" },
  { value: "CHEQUE", labelAr: "شيك بنكي (Cheque)", labelEn: "Cheque" },
  { value: "POS", labelAr: "نقاط بيع / شبكة (POS)", labelEn: "POS" },
  { value: "ONLINE", labelAr: "دفع إلكتروني (Online)", labelEn: "Online" },
] as const;

export function RecordPaymentDialog({
  open,
  onOpenChange,
  organizationId,
  resortId,
  members,
  dues,
  depositAccounts,
  periods,
  currency = "EGP",
  locale,
  preselectedUnitId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  resortId: string;
  members: Option[];
  dues: DueOption[];
  depositAccounts: Option[];
  periods: Option[];
  currency?: string;
  locale: string;
  preselectedUnitId?: string;
}) {
  const isAr = locale === "ar";
  const currencyLabel = getCurrencyLabel(currency, isAr);
  const router = useRouter();
  const toast = useToast();
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [memberId, setMemberId] = useState<string>(members[0]?.id ?? "");
  const [method, setMethod] = useState<string>("CASH");
  const [depositAccountId, setDepositAccountId] = useState<string>(depositAccounts[0]?.id ?? "");
  const [fiscalPeriodId, setFiscalPeriodId] = useState<string>(periods[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split("T")[0]);
  const [reference, setReference] = useState("");
  const [selectedDueId, setSelectedDueId] = useState<string>("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!memberId || !depositAccountId || !fiscalPeriodId || !amount || Number(amount) <= 0) {
      setErrorMsg(isAr ? "يرجى تعبئة جميع الحقول المطلوبة" : "Please fill in all required fields");
      return;
    }

    startTransition(async () => {
      const formData = new FormData();
      formData.set("organizationId", organizationId);
      formData.set("resortId", resortId);
      formData.set("memberId", memberId);
      formData.set("method", method);
      formData.set("depositAccountId", depositAccountId);
      formData.set("fiscalPeriodId", fiscalPeriodId);
      formData.set("amount", amount);
      formData.set("paymentDate", paymentDate);
      if (reference.trim()) formData.set("reference", reference.trim());

      // If due selected, allocate full or partial
      if (selectedDueId) {
        const allocations = [{ dueId: selectedDueId, amount: Number(amount) }];
        formData.set("allocations", JSON.stringify(allocations));
      }

      const res = await recordPaymentAction({ ok: true }, formData);

      if (res.ok) {
        toast.add({
          type: "success",
          title: isAr ? "تم تسجيل سند القبض بنجاح" : "Payment Recorded Successfully",
          description: isAr
            ? `تم تحصيل ${Number(amount).toLocaleString()} ${currencyLabel} وتوليد القيد المحاسبي`
            : `Recorded payment of ${Number(amount).toLocaleString()} ${currencyLabel}`,
        });
        onOpenChange(false);
        setAmount("");
        setReference("");
        router.refresh();
      } else {
        setErrorMsg(res.error || (isAr ? "فشل تسجيل الدفعة" : "Failed to record payment"));
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <div className="flex size-10 items-center justify-center rounded-xl bg-emerald-600/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400">
            <Receipt className="size-5" />
          </div>
          <div>
            <DialogTitle>{isAr ? "تسجيل سند قبض وتحصيل مالي" : "Record Payment Receipt"}</DialogTitle>
            <DialogDescription>
              {isAr
                ? "إثبات استلام دفعة نقدية أو بنكية من عميل وإسقاطها على المطالبات المفتوحة."
                : "Record customer receipt and allocate payment against open dues."}
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5 text-start">
                <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  {isAr ? "العميل / القائم بالسداد *" : "Client / Member *"}
                </Label>
                <Select value={memberId} onValueChange={(val) => setMemberId(val ?? "")} items={members.map((m) => ({ value: m.id, label: m.label }))}>
                  <SelectTrigger className="w-full text-xs">
                    <SelectValue placeholder={isAr ? "اختر العميل..." : "Select member..."} />
                  </SelectTrigger>
                  <SelectContent>
                    {members.map((m) => (
                      <SelectItem key={m.id} value={m.id} className="text-xs">
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5 text-start">
                <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  {isAr ? "طريقة السداد *" : "Payment Method *"}
                </Label>
                <Select value={method} onValueChange={(val) => setMethod(val ?? "CASH")} items={PAYMENT_METHODS.map((m) => ({ value: m.value, label: isAr ? m.labelAr : m.labelEn }))}>
                  <SelectTrigger className="w-full text-xs font-bold">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHODS.map((m) => (
                      <SelectItem key={m.value} value={m.value} className="text-xs">
                        {isAr ? m.labelAr : m.labelEn}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5 text-start">
                <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  {isAr ? "حساب الإيداع (الخزينة / البنك) *" : "Deposit Account *"}
                </Label>
                <Select value={depositAccountId} onValueChange={(val) => setDepositAccountId(val ?? "")} items={depositAccounts.map((a) => ({ value: a.id, label: a.label }))}>
                  <SelectTrigger className="w-full text-xs">
                    <SelectValue placeholder={isAr ? "اختر الحساب..." : "Select account..."} />
                  </SelectTrigger>
                  <SelectContent>
                    {depositAccounts.map((a) => (
                      <SelectItem key={a.id} value={a.id} className="text-xs">
                        {a.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5 text-start">
                <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  {isAr ? "الفترة المالية *" : "Fiscal Period *"}
                </Label>
                <Select value={fiscalPeriodId} onValueChange={(val) => setFiscalPeriodId(val ?? "")} items={periods.map((p) => ({ value: p.id, label: p.label }))}>
                  <SelectTrigger className="w-full text-xs">
                    <SelectValue placeholder={isAr ? "اختر الفترة..." : "Select period..."} />
                  </SelectTrigger>
                  <SelectContent>
                    {periods.map((p) => (
                      <SelectItem key={p.id} value={p.id} className="text-xs">
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5 text-start">
                <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  {isAr ? "المبلغ المحصل *" : "Amount Paid *"}
                </Label>
                <div className="relative">
                  <Input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
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
                  <span>{isAr ? "تاريخ السداد *" : "Payment Date *"}</span>
                </Label>
                <Input
                  type="date"
                  required
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  className="font-mono text-xs"
                />
              </div>
            </div>

            {/* Allocate against open due item */}
            {dues.length > 0 && (
              <div className="space-y-1.5 text-start pt-1">
                <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  {isAr ? "إسقاط وتخصيص الدفعة على مطالبة (اختياري)" : "Allocate to Open Due (Optional)"}
                </Label>
                <Select value={selectedDueId} onValueChange={(val) => setSelectedDueId(val ?? "")} items={[{ value: "", label: isAr ? "— دفعة تحت الحساب (غير مخصصة) —" : "— Unallocated Deposit —" }, ...dues.map((d) => ({ value: d.id, label: `${d.label} (متبقي: ${d.remaining.toLocaleString()} ${currencyLabel})` })) ]}>
                  <SelectTrigger className="w-full text-xs">
                    <SelectValue placeholder={isAr ? "اختر المطالبة..." : "Select due..."} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">{isAr ? "— دفعة تحت الحساب (غير مخصصة) —" : "— Unallocated Deposit —"}</SelectItem>
                    {dues.map((d) => (
                      <SelectItem key={d.id} value={d.id} className="text-xs">
                        {d.label} ({isAr ? "متبقي:" : "Rem:"} {d.remaining.toLocaleString()} {currencyLabel})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-1.5 text-start">
              <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                {isAr ? "المرجع / رقم الشيك أو الإشعار البنكي" : "Reference / Cheque #"}
              </Label>
              <Input
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder={isAr ? "مثال: تحويل رقم TR-987654" : "e.g. Wire Ref #"}
                className="text-xs font-mono"
              />
            </div>
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
              {isAr ? "إلغاء" : "Cancel"}
            </Button>
            <Button type="submit" disabled={isPending || !memberId || !depositAccountId || !amount || Number(amount) <= 0} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold gap-1.5">
              {isPending ? <RefreshCw className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />}
              <span>{isAr ? "حفظ وترحيل سند القبض" : "Record Receipt"}</span>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
