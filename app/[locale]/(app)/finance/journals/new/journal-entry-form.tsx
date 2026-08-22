"use client";

import { useActionState, useMemo, useState } from "react";
import { Link } from "@/i18n/navigation";
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
import { createJournalEntryAction } from "@/lib/actions/accounting";
import type { ActionResult } from "@/lib/actions/platform";
import {
  Plus,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Calendar,
  Layers,
  RefreshCw,
  Scale,
} from "lucide-react";
import { getCurrencyLabel } from "@/lib/currency";
import { JournalCopilotCard } from "@/components/ai/journal-copilot-card";
import type { JournalEntryProposal } from "@/lib/ai/journal-copilot";

type Account = { id: string; code: string; name_ar: string; name_en: string };
type Period = { id: string; name: string };

type LineDraft = {
  key: number;
  account_id: string;
  description: string;
  debit: string;
  credit: string;
};

let keySeq = 0;
const emptyLine = (): LineDraft => ({
  key: keySeq++,
  account_id: "",
  description: "",
  debit: "",
  credit: "",
});

export function JournalEntryForm({
  organizationId,
  accounts,
  periods,
  currency = "EGP",
  locale,
}: {
  organizationId: string;
  accounts: Account[];
  periods: Period[];
  currency?: string;
  locale: string;
}) {
  const isAr = locale === "ar";
  const currencyLabel = getCurrencyLabel(currency, isAr);

  const [lines, setLines] = useState<LineDraft[]>([emptyLine(), emptyLine()]);
  const [entryDate, setEntryDate] = useState(new Date().toISOString().split("T")[0]);
  const [description, setDescription] = useState("");
  const [fiscalPeriodId, setFiscalPeriodId] = useState(periods[0]?.id ?? "");

  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    createJournalEntryAction,
    { ok: true },
  );

  const totals = useMemo(() => {
    const debit = lines.reduce((sum, l) => sum + (Number(l.debit) || 0), 0);
    const credit = lines.reduce((sum, l) => sum + (Number(l.credit) || 0), 0);
    const diff = Math.abs(debit - credit);
    const balanced = diff < 0.005 && debit > 0;
    return { debit, credit, diff, balanced };
  }, [lines]);

  function updateLine(key: number, patch: Partial<LineDraft>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function removeLine(key: number) {
    if (lines.length <= 2) return;
    setLines((prev) => prev.filter((l) => l.key !== key));
  }

  const linesJson = JSON.stringify(
    lines
      .filter((l) => l.account_id && (Number(l.debit) > 0 || Number(l.credit) > 0))
      .map((l) => ({
        account_id: l.account_id,
        description: l.description || undefined,
        debit: Number(l.debit) || 0,
        credit: Number(l.credit) || 0,
      })),
  );

  const handleApplyCopilotProposal = (proposal: JournalEntryProposal) => {
    if (proposal.description) setDescription(proposal.description);
    if (proposal.entryDate) setEntryDate(proposal.entryDate);

    if (proposal.lines && proposal.lines.length > 0) {
      const newLines: LineDraft[] = proposal.lines.map((l) => ({
        key: keySeq++,
        account_id: l.accountId,
        description: l.description,
        debit: l.debit > 0 ? String(l.debit) : "",
        credit: l.credit > 0 ? String(l.credit) : "",
      }));
      setLines(newLines);
    }
  };

  const fmt = (n: number) =>
    n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="organizationId" value={organizationId} />
      <input type="hidden" name="lines" value={linesJson} />

      {/* ──────────────────────────────────────────────────────────────────────────
          0. AI JOURNAL COPILOT CARD (SMART RECOMMENDATIONS & POLICY MEMORY)
          ────────────────────────────────────────────────────────────────────────── */}
      <JournalCopilotCard
        organizationId={organizationId}
        locale={locale}
        onApplyProposal={handleApplyCopilotProposal}
      />

      {/* ──────────────────────────────────────────────────────────────────────────
          1. HEADER & META CARD
          ────────────────────────────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 space-y-4">
        <h2 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
          <FileText className="size-4 text-blue-600" />
          <span>{isAr ? "بيانات وترويسة القيد اليومي" : "Journal Entry Header"}</span>
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-1.5 text-start">
            <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
              {isAr ? "الفترة المالية *" : "Fiscal Period *"}
            </Label>
            <Select
              name="fiscalPeriodId"
              value={fiscalPeriodId}
              onValueChange={(val) => setFiscalPeriodId(val ?? "")}
              items={periods.map((p) => ({ value: p.id, label: p.name }))}
            >
              <SelectTrigger id="fiscalPeriodId" className="w-full text-xs">
                <SelectValue placeholder={isAr ? "اختر الفترة..." : "Select period..."} />
              </SelectTrigger>
              <SelectContent>
                {periods.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5 text-start">
            <Label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
              <Calendar className="size-3 text-slate-400" />
              <span>{isAr ? "تاريخ القيد *" : "Entry Date *"}</span>
            </Label>
            <Input
              id="entryDate"
              name="entryDate"
              type="date"
              required
              value={entryDate}
              onChange={(e) => setEntryDate(e.target.value)}
              className="font-mono text-xs"
            />
          </div>

          <div className="space-y-1.5 text-start">
            <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
              {isAr ? "البيان والشرح العام *" : "Narration / Memo *"}
            </Label>
            <Input
              id="description"
              name="description"
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={isAr ? "مثال: إثبات مصاريف عمومية وإدارية..." : "e.g. Recording monthly office expenses..."}
              className="text-xs"
            />
          </div>
        </div>
      </div>

      {/* ──────────────────────────────────────────────────────────────────────────
          2. JOURNAL LINES TABLE (HIGH CONTRAST)
          ────────────────────────────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden dark:border-slate-800 dark:bg-slate-900 space-y-3 p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
            <Layers className="size-4 text-emerald-600" />
            <span>{isAr ? "الأسطر والحركات المحاسبية (مدين / دائن)" : "Accounting Ledger Lines"}</span>
          </h2>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setLines((prev) => [...prev, emptyLine()])}
            className="text-xs font-bold gap-1 h-8"
          >
            <Plus className="size-3.5" />
            <span>{isAr ? "إضافة سطر محاسبي" : "Add Line"}</span>
          </Button>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
          <table className="w-full text-xs text-start">
            <thead className="bg-slate-900 text-white dark:bg-slate-800/90 font-bold border-b border-slate-800">
              <tr>
                <th className="p-3 text-start w-[32%]">{isAr ? "الحساب المحاسبي (دليل الحسابات)" : "GL Account"}</th>
                <th className="p-3 text-start">{isAr ? "البيان التفصيلي للسطر" : "Line Memo"}</th>
                <th className="p-3 text-end w-36">{isAr ? "مدين (Dr)" : "Debit"}</th>
                <th className="p-3 text-end w-36">{isAr ? "دائن (Cr)" : "Credit"}</th>
                <th className="p-3 text-center w-12">{isAr ? "حذف" : "Del"}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {lines.map((line, idx) => (
                <tr key={line.key} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/50">
                  <td className="p-2">
                    <select
                      aria-label={isAr ? "الحساب المحاسبي" : "GL Account"}
                      className="w-full rounded-lg border border-slate-200 bg-white dark:bg-slate-800 dark:border-slate-700 p-2 text-xs font-semibold"
                      value={line.account_id}
                      onChange={(e) => updateLine(line.key, { account_id: e.target.value })}
                    >
                      <option value="">{isAr ? "— اختر الحساب المحاسبي —" : "— Select Account —"}</option>
                      {accounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.code} — {isAr ? a.name_ar : a.name_en}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="p-2">
                    <Input
                      aria-label={isAr ? "البيان التفصيلي للسطر" : "Line Memo"}
                      value={line.description}
                      onChange={(e) => updateLine(line.key, { description: e.target.value })}
                      placeholder={isAr ? "بيان فرعي للسطر (اختياري)..." : "Line memo (optional)..."}
                      className="text-xs h-9"
                    />
                  </td>
                  <td className="p-2 text-end">
                    <Input
                      aria-label={isAr ? "مدين" : "Debit"}
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      value={line.debit}
                      onChange={(e) => updateLine(line.key, { debit: e.target.value, credit: "" })}
                      className="font-mono text-xs font-bold text-end text-emerald-700 h-9"
                      dir="ltr"
                    />
                  </td>
                  <td className="p-2 text-end">
                    <Input
                      aria-label={isAr ? "دائن" : "Credit"}
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      value={line.credit}
                      onChange={(e) => updateLine(line.key, { credit: e.target.value, debit: "" })}
                      className="font-mono text-xs font-bold text-end text-blue-700 h-9"
                      dir="ltr"
                    />
                  </td>
                  <td className="p-2 text-center">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={lines.length <= 2}
                      onClick={() => removeLine(line.key)}
                      className="h-8 w-8 p-0 text-slate-400 hover:text-rose-600 disabled:opacity-30"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ──────────────────────────────────────────────────────────────────────────
            3. LIVE BALANCE & TOTALS SUMMARY BOX
            ────────────────────────────────────────────────────────────────────────── */}
        <div
          className={`flex flex-col sm:flex-row items-center justify-between gap-4 p-4 rounded-xl border font-bold text-xs ${
            totals.balanced
              ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300"
              : "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300"
          }`}
        >
          <div className="flex items-center gap-2">
            {totals.balanced ? (
              <CheckCircle2 className="size-5 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="size-5 text-amber-600 shrink-0" />
            )}
            <div>
              <div className="font-extrabold text-sm">
                {totals.balanced
                  ? isAr ? "✓ القيد متوازن محاسبياً وجاهز للحفظ" : "✓ Perfectly Balanced Journal Entry"
                  : isAr ? `✕ القيد غير متوازن (الفارق: ${fmt(totals.diff)} ${currencyLabel})` : `✕ Unbalanced Journal (Variance: ${fmt(totals.diff)} ${currencyLabel})`}
              </div>
              <div className="text-[11px] font-normal opacity-80">
                {isAr
                  ? "يشترط المحاسبياً تساوي إجمالي حركات المدين مع إجمالي حركات الدائن لترحيل القيد."
                  : "Total debits must equal total credits to successfully post."}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-6 font-mono text-sm shrink-0">
            <div>
              <span className="text-[10px] font-sans block text-slate-500">{isAr ? "إجمالي المدين (Dr):" : "Total Debit:"}</span>
              <span className="font-black text-emerald-700 dark:text-emerald-400">{fmt(totals.debit)} {currencyLabel}</span>
            </div>
            <div>
              <span className="text-[10px] font-sans block text-slate-500">{isAr ? "إجمالي الدائن (Cr):" : "Total Credit:"}</span>
              <span className="font-black text-blue-700 dark:text-blue-400">{fmt(totals.credit)} {currencyLabel}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Error state */}
      {!state.ok && (
        <div role="alert" className="p-3.5 rounded-xl border border-red-200 bg-red-50 text-red-700 text-xs font-semibold flex items-center gap-2">
          <AlertTriangle className="size-4 text-red-600 shrink-0" />
          <span>{state.error}</span>
        </div>
      )}

      {/* Submit Footer */}
      <div className="flex items-center justify-between gap-3 pt-2">
        <Link href="/finance/journals">
          <Button type="button" variant="outline" className="text-xs font-bold">
            {isAr ? "إلغاء والعودة" : "Cancel"}
          </Button>
        </Link>

        <Button
          type="submit"
          disabled={pending || !totals.balanced || !description.trim()}
          className="bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs gap-1.5 h-10 px-6 shadow-sm dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
        >
          {pending ? (
            <RefreshCw className="size-4 animate-spin" />
          ) : (
            <CheckCircle2 className="size-4" />
          )}
          <span>{isAr ? "حفظ القيد المحاسبي كمسودة" : "Save Journal Entry"}</span>
        </Button>
      </div>
    </form>
  );
}
