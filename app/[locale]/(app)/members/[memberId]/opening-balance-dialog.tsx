"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Check, Loader2, Scale } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { recordMemberOpeningBalanceAction } from "@/lib/actions/member-opening-balance";

export type OpeningBalanceUnit = {
  id: string;
  code: string;
  building_name_ar?: string | null;
  building_name_en?: string | null;
};

export type ReceivableAccountOption = { id: string; label: string };

/**
 * Records the debt a client already carried when the organization moved onto
 * AqarBooks. One opening balance per client per unit; the server refuses a
 * second one, so a correction is a credit note or a void, not a re-entry.
 */
export function OpeningBalanceDialog({
  organizationId,
  memberId,
  memberName,
  units,
  receivableAccounts,
  currency,
  locale,
  trigger,
}: {
  organizationId: string;
  memberId: string;
  memberName: string;
  units: OpeningBalanceUnit[];
  receivableAccounts: ReceivableAccountOption[];
  currency: string;
  locale: string;
  trigger?: React.ReactElement;
}) {
  const isAr = locale === "ar";
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [unitId, setUnitId] = useState<string>(units[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [asOfDate, setAsOfDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [receivableAccountId, setReceivableAccountId] = useState<string>("");
  const [description, setDescription] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const amountNumber = Number(amount);
  const amountValid = amount.trim() !== "" && Number.isFinite(amountNumber) && amountNumber > 0;
  const canSubmit = Boolean(unitId) && amountValid && Boolean(asOfDate) && !isPending;

  function unitLabel(u: OpeningBalanceUnit) {
    const building = isAr ? u.building_name_ar : u.building_name_en;
    return building ? `${u.code} • ${building}` : u.code;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setErrorMsg(null);

    const fd = new FormData();
    fd.set("organizationId", organizationId);
    fd.set("memberId", memberId);
    fd.set("unitId", unitId);
    fd.set("amount", amount.trim());
    fd.set("asOfDate", asOfDate);
    if (receivableAccountId) fd.set("receivableAccountId", receivableAccountId);
    if (description.trim()) fd.set("description", description.trim());

    startTransition(async () => {
      const res = await recordMemberOpeningBalanceAction({ ok: true }, fd);
      if (res.ok) {
        toast.add({
          type: "success",
          title: isAr ? "تم تسجيل الرصيد الافتتاحي" : "Opening balance recorded",
          description: isAr
            ? "أُضيف الرصيد إلى مستحقات العميل ورُحِّل إلى دفتر الأستاذ."
            : "Added to the client's dues and posted to the ledger.",
        });
        setOpen(false);
        setAmount("");
        setDescription("");
        router.refresh();
      } else {
        setErrorMsg(
          res.error === "invalid_input"
            ? isAr
              ? "تحقق من المبلغ والتاريخ والوحدة"
              : "Check the amount, date and unit"
            : res.error,
        );
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          trigger || (
            <Button variant="outline" size="sm">
              <Scale className="size-3.5 text-amber-600" />
              <span>{isAr ? "رصيد افتتاحي" : "Opening balance"}</span>
            </Button>
          )
        }
      />
      <DialogContent className="sm:max-w-[520px] p-6">
        <DialogHeader className="space-y-2">
          <div className="mb-1 flex size-10 items-center justify-center rounded-xl border border-amber-200/60 bg-amber-50 text-amber-600 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-400">
            <Scale className="size-5" />
          </div>
          <DialogTitle className="text-lg font-bold">
            {isAr ? "تسجيل رصيد افتتاحي للعميل" : "Record client opening balance"}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            {isAr
              ? `المبلغ الذي كان مستحقًا على (${memberName}) قبل بدء العمل على النظام. يُسجَّل كمستحق على الوحدة ويُرحَّل: مدين ذمم العملاء / دائن أرصدة افتتاحية (حقوق ملكية).`
              : `What (${memberName}) already owed before this system went live. Recorded as a due on the unit and posted: Dr receivables / Cr opening-balance equity.`}
          </DialogDescription>
        </DialogHeader>

        {units.length === 0 ? (
          <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <span>
              {isAr
                ? "اربط العميل بوحدة أولاً (ملكية أو عقد إيجار نشط). الرصيد يُسجَّل على الوحدة التي يُقرأ منها رصيد العميل."
                : "Link the client to a unit first (ownership or an active lease). The balance is recorded on the unit the client's balance is read from."}
            </span>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 py-2">
            {errorMsg && (
              <div
                role="alert"
                className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-600 dark:bg-rose-950/40"
              >
                <AlertCircle className="size-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">
                {isAr ? "الوحدة" : "Unit"} <span className="text-rose-500">*</span>
              </Label>
              <Select
                value={unitId}
                onValueChange={(v) => setUnitId(v ?? "")}
                items={units.map((u) => ({ value: u.id, label: unitLabel(u) }))}
              >
                <SelectTrigger className="h-10 w-full text-xs font-bold">
                  <SelectValue placeholder={isAr ? "اختر الوحدة..." : "Select unit..."} />
                </SelectTrigger>
                <SelectContent>
                  {units.map((u) => (
                    <SelectItem key={u.id} value={u.id} className="text-xs font-bold">
                      {unitLabel(u)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="ob-amount" className="text-xs font-semibold">
                  {isAr ? `المبلغ المستحق (${currency})` : `Amount owed (${currency})`}{" "}
                  <span className="text-rose-500">*</span>
                </Label>
                <Input
                  id="ob-amount"
                  type="number"
                  inputMode="decimal"
                  min="0.01"
                  step="0.01"
                  dir="ltr"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  aria-invalid={amount !== "" && !amountValid}
                  placeholder="0.00"
                  required
                  className="h-10 font-mono text-sm font-bold"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ob-date" className="text-xs font-semibold">
                  {isAr ? "الرصيد كما في تاريخ" : "Balance as of"} <span className="text-rose-500">*</span>
                </Label>
                <Input
                  id="ob-date"
                  type="date"
                  value={asOfDate}
                  max={new Date().toISOString().slice(0, 10)}
                  onChange={(e) => setAsOfDate(e.target.value)}
                  required
                  className="h-10 text-xs"
                />
              </div>
            </div>

            {receivableAccounts.length > 0 && (
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">
                  {isAr ? "حساب الذمم المدينة" : "Receivable account"}
                </Label>
                <Select
                  value={receivableAccountId}
                  onValueChange={(v) => setReceivableAccountId(v ?? "")}
                  items={receivableAccounts.map((a) => ({ value: a.id, label: a.label }))}
                >
                  <SelectTrigger className="h-10 w-full text-xs">
                    <SelectValue
                      placeholder={
                        isAr ? "الافتراضي: الحساب المستخدم في مستحقات المؤسسة" : "Default: the organization's usual receivable account"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {receivableAccounts.map((a) => (
                      <SelectItem key={a.id} value={a.id} className="text-xs">
                        {a.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="ob-description" className="text-xs font-semibold">
                {isAr ? "بيان (اختياري)" : "Memo (optional)"}
              </Label>
              <Input
                id="ob-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={500}
                placeholder={isAr ? "مثال: متأخرات رسوم صيانة 2024-2025" : "e.g. Maintenance arrears 2024-2025"}
                className="h-10 text-xs"
              />
            </div>

            <DialogFooter className="gap-2 pt-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
                {isAr ? "إلغاء" : "Cancel"}
              </Button>
              <Button
                type="submit"
                disabled={!canSubmit}
                className={cn("font-bold", "bg-amber-600 text-white hover:bg-amber-700")}
              >
                {isPending ? (
                  <>
                    <Loader2 className="me-2 size-4 animate-spin" />
                    {isAr ? "جارٍ التسجيل..." : "Recording..."}
                  </>
                ) : (
                  <>
                    <Check className="me-1.5 size-4" />
                    {isAr ? "تسجيل الرصيد" : "Record balance"}
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
