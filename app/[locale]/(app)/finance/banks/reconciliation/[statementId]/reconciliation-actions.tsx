"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  autoMatchStatement,
  finalizeReconciliation,
  importBankStatementLines,
  reopenReconciliation,
  setLineMatch,
} from "@/lib/actions/bank-reconciliation";
import type { ActionResult } from "@/lib/actions/platform";

function ErrorNote({ state, isAr }: { state: ActionResult; isAr: boolean }) {
  if (state.ok !== false) return null;

  let message: string;
  if (state.error.startsWith("parse_error:")) {
    const lines = state.error.slice("parse_error:".length);
    message = isAr
      ? `تعذّر قراءة السطور رقم ${lines}. الصيغة المتوقعة لكل سطر: التاريخ (YYYY-MM-DD)، البيان، المبلغ، ثم المرجع اختياريًا. لم يُستورد أي سطر.`
      : `Could not read line(s) ${lines}. Each line must be: date (YYYY-MM-DD), description, amount, optional reference. Nothing was imported.`;
  } else if (state.error === "no_rows") {
    message = isAr ? "لم يُعثر على أي سطر صالح." : "No valid rows found.";
  } else if (state.error === "already_matched") {
    message = isAr
      ? "هذا القيد مرتبط بالفعل بسطر آخر في كشف حساب. ألغِ ارتباطه أولًا."
      : "That journal line already backs another statement line. Unmatch it there first.";
  } else if (state.error.includes("RECONCILIATION_NOT_BALANCED")) {
    message = isAr
      ? "لا يمكن الاعتماد ما دام الفرق غير صفري. طابِق السطور المتبقية أو أنشئ قيودًا للبنود غير المسجّلة."
      : "Cannot finalize while the difference is non-zero. Match the remaining lines, or post entries for the unrecorded items.";
  } else if (state.error.includes("FORBIDDEN_FINANCE_PERMISSION")) {
    message = isAr ? "لا تملك صلاحية تنفيذ هذا الإجراء." : "You don't have permission for this action.";
  } else {
    message = state.error;
  }

  return <p className="text-sm text-destructive">{message}</p>;
}

export function ImportLinesForm({
  organizationId,
  statementId,
  locale,
}: {
  organizationId: string;
  statementId: string;
  locale: string;
}) {
  const isAr = locale === "ar";
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    importBankStatementLines,
    { ok: true },
  );

  return (
    <form action={formAction} className="space-y-3 rounded-lg border p-4">
      <input type="hidden" name="organizationId" value={organizationId} />
      <input type="hidden" name="statementId" value={statementId} />
      <div className="space-y-2">
        <Label htmlFor="raw">{isAr ? "الصق سطور كشف الحساب" : "Paste statement rows"}</Label>
        <textarea
          id="raw"
          name="raw"
          required
          rows={6}
          dir="ltr"
          spellCheck={false}
          placeholder={"2026-01-12\tTransfer from tenant\t5000\tREF-8891\n2026-01-20\tService fee\t-25"}
          className="w-full rounded-md border border-input bg-transparent p-2 font-mono text-sm"
        />
        <p className="text-xs text-muted-foreground">
          {isAr
            ? "كل سطر: التاريخ (YYYY-MM-DD)، البيان، المبلغ، ثم المرجع اختياريًا — مفصولة بفاصلة أو Tab. المبلغ بالموجب للوارد وبالسالب للمنصرف."
            : "One row per line: date (YYYY-MM-DD), description, amount, optional reference — comma or tab separated. Amount is positive for money in, negative for money out."}
        </p>
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? (isAr ? "جارٍ الاستيراد…" : "Importing…") : isAr ? "استيراد" : "Import"}
        </Button>
        <ErrorNote state={state} isAr={isAr} />
      </div>
    </form>
  );
}

export function AutoMatchForm({ statementId, locale }: { statementId: string; locale: string }) {
  const isAr = locale === "ar";
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(autoMatchStatement, {
    ok: true,
  });

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3 rounded-lg border p-4">
      <input type="hidden" name="statementId" value={statementId} />
      <div className="space-y-2">
        <Label htmlFor="toleranceDays">
          {isAr ? "التسامح في التاريخ (أيام)" : "Date tolerance (days)"}
        </Label>
        <Input
          id="toleranceDays"
          name="toleranceDays"
          type="number"
          min="0"
          max="60"
          defaultValue={5}
          className="w-28 tabular-nums"
        />
      </div>
      <Button type="submit" variant="outline" disabled={pending}>
        {pending ? (isAr ? "جارٍ المطابقة…" : "Matching…") : isAr ? "مطابقة تلقائية" : "Auto-match"}
      </Button>
      <p className="text-xs text-muted-foreground">
        {isAr
          ? "تُطابَق السطور التي لها قيد واحد فقط مطابق في المبلغ وضمن نطاق التاريخ. أي سطر له أكثر من احتمال يُترك للمراجعة اليدوية."
          : "Only lines with exactly one candidate matching in amount and within the date window are matched. Anything ambiguous is left for manual review."}
      </p>
      <ErrorNote state={state} isAr={isAr} />
    </form>
  );
}

export function MatchLineForm({
  lineId,
  candidates,
  currentMatchId,
  locale,
}: {
  lineId: string;
  candidates: { id: string; label: string }[];
  currentMatchId: string | null;
  locale: string;
}) {
  const isAr = locale === "ar";
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(setLineMatch, {
    ok: true,
  });

  if (currentMatchId) {
    return (
      <form action={formAction} className="flex items-center gap-2">
        <input type="hidden" name="lineId" value={lineId} />
        <input type="hidden" name="journalLineId" value="" />
        <Button type="submit" variant="ghost" size="sm" disabled={pending}>
          {isAr ? "إلغاء المطابقة" : "Unmatch"}
        </Button>
        <ErrorNote state={state} isAr={isAr} />
      </form>
    );
  }

  if (candidates.length === 0) {
    return (
      <span className="text-xs text-muted-foreground">
        {isAr ? "لا يوجد قيد مطابق — قد يحتاج قيدًا جديدًا" : "No candidate — may need a journal entry"}
      </span>
    );
  }

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="lineId" value={lineId} />
      <select
        name="journalLineId"
        required
        defaultValue=""
        className="max-w-64 rounded-md border border-input bg-transparent p-1.5 text-sm"
      >
        <option value="" disabled>
          {isAr ? "اختر القيد…" : "Choose entry…"}
        </option>
        {candidates.map((c) => (
          <option key={c.id} value={c.id}>
            {c.label}
          </option>
        ))}
      </select>
      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        {isAr ? "ربط" : "Match"}
      </Button>
      <ErrorNote state={state} isAr={isAr} />
    </form>
  );
}

export function FinalizeForm({
  statementId,
  status,
  balanced,
  locale,
}: {
  statementId: string;
  status: "DRAFT" | "RECONCILED";
  balanced: boolean;
  locale: string;
}) {
  const isAr = locale === "ar";
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    status === "DRAFT" ? finalizeReconciliation : reopenReconciliation,
    { ok: true },
  );

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="statementId" value={statementId} />
      <Button type="submit" disabled={pending || (status === "DRAFT" && !balanced)}>
        {status === "DRAFT"
          ? isAr
            ? "اعتماد المطابقة"
            : "Finalize reconciliation"
          : isAr
            ? "إعادة فتح"
            : "Reopen"}
      </Button>
      {status === "DRAFT" && !balanced && (
        <span className="text-sm text-muted-foreground">
          {isAr
            ? "الاعتماد متاح فقط عندما يصبح الفرق صفرًا."
            : "Finalizing unlocks once the difference reaches zero."}
        </span>
      )}
      <ErrorNote state={state} isAr={isAr} />
    </form>
  );
}
