"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  FileCheck2,
  FolderLock,
  LoaderCircle,
  ShieldCheck,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  closeFiscalYearAction,
  getFiscalYearClosingPreviewAction,
} from "@/lib/actions/fiscal-year-closing";
import { financeErrorMessage } from "@/lib/actions/error-messages";
import {
  CLOSING_CONFIRMATION,
  closingConfirmationMatches,
  type FiscalYearClosingPreview,
  type FiscalYearClosingResult,
} from "@/lib/finance/fiscal-year-closing-journey";
import { useOperationSubmit } from "@/lib/finance/use-operation-submit";

type Stage = "precheck" | "preview" | "confirm" | "result";

function amount(value: string, locale: string): string {
  return Number(value).toLocaleString(locale === "ar" ? "ar-EG" : "en-US", {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  });
}

export function YearEndClosingDialog({
  open,
  onOpenChange,
  organizationId,
  year,
  locale,
  currencyLabel,
  onClosed,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  year: { id: string; name: string } | null;
  locale: string;
  currencyLabel: string;
  onClosed: (yearId: string) => void;
}) {
  const isAr = locale === "ar";
  const router = useRouter();
  const { pending, run, reset } = useOperationSubmit();
  const [stage, setStage] = useState<Stage>("precheck");
  const [preview, setPreview] = useState<FiscalYearClosingPreview | null>(null);
  const [result, setResult] = useState<FiscalYearClosingResult | null>(null);
  const [reason, setReason] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const confirmationValid = closingConfirmationMatches(confirmation, locale);

  useEffect(() => {
    if (!open) return;
    setStage("precheck");
    setPreview(null);
    setResult(null);
    setReason("");
    setConfirmation("");
    setError(null);
    reset();
  }, [open, year?.id, reset]);

  if (!year) return null;

  const close = (next: boolean) => {
    if (!next && !pending && !checking) onOpenChange(false);
  };

  async function runPrecheck() {
    if (!year || checking) return;
    setChecking(true);
    setError(null);
    try {
      const response = await getFiscalYearClosingPreviewAction({
        organizationId,
        fiscalYearId: year.id,
        locale: isAr ? "ar" : "en",
      });
      if (!response.ok) {
        setError(financeErrorMessage(response.error, isAr));
        return;
      }
      setPreview(response.preview);
      setStage("preview");
    } catch {
      setError(financeErrorMessage("query_failed", isAr));
    } finally {
      setChecking(false);
    }
  }

  async function submitClosing(event: React.FormEvent) {
    event.preventDefault();
    if (!preview || !reason.trim() || !confirmationValid || pending) return;
    setError(null);
    const input = {
      organizationId,
      fiscalYearId: year!.id,
      retainedEarningsAccountId: preview.retainedEarningsAccountId,
      reason: reason.trim(),
      confirmation,
      locale: isAr ? "ar" as const : "en" as const,
    };
    const response = await run(input, (operationKey) =>
      closeFiscalYearAction({ ...input, operationKey }),
    );
    if (!response) return;
    if (!response.ok) {
      setError(financeErrorMessage(response.error, isAr));
      return;
    }
    setResult(response.result);
    setStage("result");
    if (!response.result.alreadyClosed) onClosed(year!.id);
    router.refresh();
  }

  const steps = [
    { id: "precheck", label: isAr ? "الفحص المسبق" : "Precheck" },
    { id: "preview", label: isAr ? "معاينة القيد" : "Entry preview" },
    { id: "confirm", label: isAr ? "التأكيد" : "Confirmation" },
    { id: "result", label: isAr ? "النتيجة" : "Result" },
  ] as const;
  const stageIndex = steps.findIndex((step) => step.id === stage);

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-3xl" data-testid="year-end-closing-dialog">
        <DialogHeader>
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-indigo-600/10 text-indigo-600 dark:bg-indigo-400/10 dark:text-indigo-400">
            <FolderLock className="size-5" />
          </div>
          <div className="space-y-1">
            <DialogTitle>{isAr ? `إقفال السنة المالية ${year.name}` : `Close fiscal year ${year.name}`}</DialogTitle>
            <DialogDescription>
              {isAr
                ? "راجع الفحوص والقيد المقترح قبل التنفيذ. تعيد قاعدة البيانات التحقق من كل الشروط عند الإقفال."
                : "Review the checks and proposed entry before posting. The database revalidates every condition at closing."}
            </DialogDescription>
          </div>
        </DialogHeader>

        <DialogBody className="space-y-5">
          <ol className="grid grid-cols-4 gap-1.5" aria-label={isAr ? "مراحل إقفال السنة" : "Year-end closing stages"}>
            {steps.map((step, index) => (
              <li
                key={step.id}
                className={`rounded-lg border px-1.5 py-2 text-center text-[10px] font-bold sm:text-xs ${
                  index <= stageIndex
                    ? "border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-300"
                    : "border-slate-200 bg-slate-50 text-slate-400 dark:border-slate-800 dark:bg-slate-900"
                }`}
                aria-current={step.id === stage ? "step" : undefined}
              >
                <span className="me-1 font-mono">{index + 1}</span>{step.label}
              </li>
            ))}
          </ol>

          {error && (
            <div role="alert" className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {stage === "precheck" && (
            <section className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50/80 p-5 dark:border-slate-800 dark:bg-slate-900/60">
              <div className="flex items-center gap-2 text-sm font-extrabold text-slate-900 dark:text-slate-100">
                <ShieldCheck className="size-5 text-indigo-600" />
                {isAr ? "فحص حقيقي قبل أي كتابة" : "Real checks before any write"}
              </div>
              <ul className="space-y-2.5 text-xs leading-6 text-slate-600 dark:text-slate-300">
                <li className="flex gap-2"><Check className="mt-1 size-4 shrink-0 text-emerald-600" />{isAr ? "جميع فترات السنة مغلقة أو مقفلة." : "Every period in the year is closed or locked."}</li>
                <li className="flex gap-2"><Check className="mt-1 size-4 shrink-0 text-emerald-600" />{isAr ? "لا توجد قيود مسودة أو قيد المراجعة داخل السنة." : "No draft or under-review entries exist in the year."}</li>
                <li className="flex gap-2"><Check className="mt-1 size-4 shrink-0 text-emerald-600" />{isAr ? "حساب الأرباح المبقاة محدد ودفتر السنة متوازن." : "Retained earnings is designated and the year's ledger balances."}</li>
              </ul>
              <p className="border-t border-slate-200 pt-3 text-[11px] leading-5 text-slate-500 dark:border-slate-800 dark:text-slate-400">
                {isAr ? "هذه العملية لا ترحّل أرصدة افتتاحية إلى سنة أخرى." : "This operation does not roll opening balances into another year."}
              </p>
            </section>
          )}

          {stage === "preview" && preview && (
            <section className="space-y-4" data-testid="closing-entry-preview">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-800"><p className="text-[10px] font-bold text-slate-500">{isAr ? "الفترات المستوفاة" : "Eligible periods"}</p><p className="mt-1 font-mono text-lg font-black">{preview.periodCount}</p></div>
                <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-800"><p className="text-[10px] font-bold text-slate-500">{isAr ? "أسطر الدفتر المفحوصة" : "Ledger lines checked"}</p><p className="mt-1 font-mono text-lg font-black">{preview.postedLineCount}</p></div>
                <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-800"><p className="text-[10px] font-bold text-slate-500">{isAr ? "أسطر قيد الإقفال" : "Closing lines"}</p><p className="mt-1 font-mono text-lg font-black">{preview.lines.length}</p></div>
                <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-3 dark:border-indigo-900 dark:bg-indigo-950/30"><p className="text-[10px] font-bold text-indigo-600 dark:text-indigo-300">{isAr ? "صافي الربح / (الخسارة)" : "Net income / (loss)"}</p><p className="mt-1 font-mono text-sm font-black text-indigo-800 dark:text-indigo-200">{amount(preview.netIncome, locale)}</p></div>
              </div>

              <div className="flex items-start gap-2 rounded-xl bg-emerald-50 p-3 text-xs font-semibold text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
                <span>{isAr ? `حساب الأرباح المبقاة: ${preview.retainedEarningsAccountLabel}` : `Retained earnings: ${preview.retainedEarningsAccountLabel}`}</span>
              </div>

              <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                <table className="w-full min-w-[560px] text-start text-xs">
                  <thead className="bg-slate-50 text-[10px] text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                    <tr><th className="p-3 text-start">{isAr ? "الحساب" : "Account"}</th><th className="p-3 text-start">{isAr ? "البند" : "Purpose"}</th><th className="p-3 text-end">{isAr ? "مدين" : "Debit"}</th><th className="p-3 text-end">{isAr ? "دائن" : "Credit"}</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {preview.lines.map((line, index) => (
                      <tr key={`${line.accountId}-${line.costCentreId ?? "none"}-${index}`}>
                        <td className="p-3"><span className="font-mono font-bold">{line.accountCode}</span><span className="mt-0.5 block text-[11px] text-slate-500">{line.accountName}</span></td>
                        <td className="p-3"><Badge variant="outline" className="text-[10px]">{line.reason === "RETAINED_EARNINGS" ? (isAr ? "الأرباح المبقاة" : "Retained earnings") : (isAr ? "إقفال حساب نتيجة" : "Close temporary account")}</Badge></td>
                        <td className="p-3 text-end font-mono">{amount(line.debit, locale)}</td>
                        <td className="p-3 text-end font-mono">{amount(line.credit, locale)}</td>
                      </tr>
                    ))}
                    <tr className="bg-slate-50/80 font-black dark:bg-slate-900/70"><td className="p-3" colSpan={2}>{isAr ? "الإجمالي المتوازن" : "Balanced total"}</td><td className="p-3 text-end font-mono">{amount(preview.totalDebit, locale)}</td><td className="p-3 text-end font-mono">{amount(preview.totalCredit, locale)}</td></tr>
                  </tbody>
                </table>
              </div>
              <p className="text-[11px] leading-5 text-slate-500">{isAr ? `المبالغ بعملة ${currencyLabel}. هذه معاينة فقط؛ لم يُكتب أي قيد بعد.` : `Amounts in ${currencyLabel}. This is a preview only; no entry has been written.`}</p>
            </section>
          )}

          {stage === "confirm" && preview && (
            <form id="year-end-closing-form" onSubmit={submitClosing} className="space-y-4" data-testid="closing-confirmation-form">
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs leading-6 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
                {isAr
                  ? `سينشئ النظام قيد إقفال مرحّلًا من ${preview.lines.length} أسطر ويغلق سنة ${year.name}. لا يمكن التراجع عن الإقفال من هذه الشاشة.`
                  : `The system will create a posted closing entry with ${preview.lines.length} lines and close ${year.name}. This screen cannot undo the closing.`}
              </div>
              <div className="space-y-2">
                <Label htmlFor="closing-reason">{isAr ? "سبب الإقفال (يظهر في سجل التدقيق)" : "Closing reason (recorded in the audit log)"}</Label>
                <Textarea id="closing-reason" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} required placeholder={isAr ? "مثال: اعتماد نتائج السنة ومراجعة ميزان المراجعة" : "Example: Annual results approved and trial balance reviewed"} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="closing-confirmation">{isAr ? <>اكتب <span className="font-mono font-black">إقفال السنة</span> للتأكيد</> : <>Type <span className="font-mono font-black">CLOSE YEAR</span> to confirm</>}</Label>
                <Input id="closing-confirmation" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" required aria-invalid={confirmation.length > 0 && !confirmationValid} placeholder={CLOSING_CONFIRMATION[isAr ? "ar" : "en"]} />
                {confirmation.length > 0 && !confirmationValid && <p role="alert" className="text-xs font-semibold text-rose-600">{isAr ? "عبارة التأكيد غير مطابقة." : "The confirmation phrase does not match."}</p>}
              </div>
            </form>
          )}

          {stage === "result" && result && (
            <section className="space-y-4 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-5 dark:border-emerald-900/60 dark:bg-emerald-950/20" data-testid="closing-result">
              <div className="flex items-center gap-3 text-emerald-800 dark:text-emerald-300"><span className="flex size-10 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/50"><FileCheck2 className="size-5" /></span><div><h3 className="font-black">{result.alreadyClosed ? (isAr ? "الإقفال مسجل مسبقًا" : "Closing already recorded") : (isAr ? "تم إقفال السنة بنجاح" : "Fiscal year closed successfully")}</h3><p className="mt-1 text-xs">{isAr ? "هذه هي النتيجة المحفوظة التي أعادتها قاعدة البيانات." : "This is the persisted result returned by the database."}</p></div></div>
              <dl className="grid gap-3 border-t border-emerald-200 pt-4 text-xs dark:border-emerald-900/60 sm:grid-cols-3">
                <div className="sm:col-span-3"><dt className="font-bold text-emerald-700 dark:text-emerald-400">{isAr ? "معرّف قيد الإقفال" : "Closing entry ID"}</dt><dd className="mt-1 break-all rounded-lg bg-white/70 p-2 font-mono dark:bg-slate-950/40" data-testid="closing-entry-id">{result.closingEntryId}</dd></div>
                <div><dt className="font-bold text-emerald-700 dark:text-emerald-400">{isAr ? "عدد الأسطر" : "Line count"}</dt><dd className="mt-1 font-mono text-lg font-black">{result.lineCount}</dd></div>
                <div><dt className="font-bold text-emerald-700 dark:text-emerald-400">{isAr ? "صافي الربح / (الخسارة)" : "Net income / (loss)"}</dt><dd className="mt-1 font-mono text-lg font-black">{amount(result.netIncome, locale)}</dd></div>
                <div><dt className="font-bold text-emerald-700 dark:text-emerald-400">{isAr ? "إعادة محاولة لإقفال سابق" : "Replay of previous close"}</dt><dd className="mt-1 font-mono text-lg font-black">{result.alreadyClosed ? (isAr ? "نعم" : "Yes") : (isAr ? "لا" : "No")}</dd></div>
              </dl>
            </section>
          )}
        </DialogBody>

        <DialogFooter>
          {stage === "precheck" && <Button variant="outline" onClick={() => onOpenChange(false)} disabled={checking}>{isAr ? "إلغاء" : "Cancel"}</Button>}
          {(stage === "preview" || stage === "confirm") && <Button variant="outline" onClick={() => { setError(null); setStage(stage === "preview" ? "precheck" : "preview"); }} disabled={pending}>{isAr ? <><ArrowRight className="size-4" />السابق</> : <><ArrowLeft className="size-4" />Back</>}</Button>}
          {stage === "precheck" && <Button onClick={runPrecheck} disabled={checking} className="bg-indigo-600 text-white hover:bg-indigo-700" data-testid="run-closing-precheck">{checking ? <LoaderCircle className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}{checking ? (isAr ? "جارٍ الفحص…" : "Checking…") : (isAr ? "تشغيل الفحص والمعاينة" : "Run checks and preview")}</Button>}
          {stage === "preview" && <Button onClick={() => { setError(null); setStage("confirm"); }} className="bg-indigo-600 text-white hover:bg-indigo-700" data-testid="continue-closing">{isAr ? "مراجعة التأكيد" : "Review confirmation"}{isAr ? <ArrowLeft className="size-4" /> : <ArrowRight className="size-4" />}</Button>}
          {stage === "confirm" && <Button type="submit" form="year-end-closing-form" disabled={pending || !reason.trim() || !confirmationValid} className="bg-rose-600 text-white hover:bg-rose-700" data-testid="confirm-year-closing">{pending ? <LoaderCircle className="size-4 animate-spin" /> : <FolderLock className="size-4" />}{pending ? (isAr ? "جارٍ إقفال السنة…" : "Closing year…") : (isAr ? "تنفيذ إقفال السنة" : "Close fiscal year")}</Button>}
          {stage === "result" && <Button onClick={() => onOpenChange(false)} className="bg-emerald-600 text-white hover:bg-emerald-700" data-testid="finish-year-closing">{isAr ? "إنهاء" : "Done"}</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
