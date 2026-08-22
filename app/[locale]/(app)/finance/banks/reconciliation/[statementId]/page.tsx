import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Badge } from "@/components/ui/badge";
import { getCurrentUser } from "@/lib/auth/session";
import { getPrimaryOrganization } from "@/lib/auth/org-context";
import { hasPermission } from "@/lib/auth/authorize";
import { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/i18n/routing";
import {
  AutoMatchForm,
  FinalizeForm,
  ImportLinesForm,
  MatchLineForm,
} from "./reconciliation-actions";
import { BankReconciliationAiPanel } from "@/components/ai/bank-reconciliation-ai-panel";
import { Scale, CheckCircle2, AlertTriangle, ArrowLeft, ArrowRight, Landmark } from "lucide-react";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ReconciliationDetailPage({
  params,
}: {
  params: Promise<{ locale: string; statementId: string }>;
}) {
  const { locale, statementId } = await params;
  setRequestLocale(locale as Locale);
  const isAr = locale === "ar";

  const user = await getCurrentUser();
  const organization = user ? await getPrimaryOrganization(user.id) : null;
  if (!organization) return null;

  const [canManage, canRead] = await Promise.all([
    hasPermission(organization.id, "finance.bank_reconciliation.manage"),
    hasPermission(organization.id, "finance.bank_reconciliation.read"),
  ]);
  if (!canManage && !canRead) {
    return (
      <div className="space-y-2">
        <h1 className="text-xl font-semibold">{isAr ? "المطابقة البنكية" : "Bank Reconciliation"}</h1>
        <p className="text-sm text-muted-foreground">
          {isAr ? "لا تملك صلاحية الاطلاع على المطابقات البنكية." : "You don't have permission to view bank reconciliations."}
        </p>
      </div>
    );
  }

  const supabase = await createClient();

  const { data: statement } = await supabase
    .from("bank_statements")
    .select("id, bank_account_id, period_start, period_end, opening_balance, closing_balance, status, note")
    .eq("id", statementId)
    .eq("organization_id", organization.id)
    .maybeSingle();
  if (!statement) notFound();

  const [{ data: account }, { data: lines }, { data: summaryRows }] = await Promise.all([
    supabase
      .from("bank_accounts")
      .select("account_name, account_number")
      .eq("id", statement.bank_account_id)
      .maybeSingle(),
    supabase
      .from("bank_statement_lines")
      .select("id, line_date, description, reference, amount, matched_journal_entry_line_id, match_type")
      .eq("statement_id", statement.id)
      .order("line_date")
      .order("sort_order"),
    supabase.rpc("get_bank_reconciliation_summary", { p_statement_id: statement.id }),
  ]);

  const summary = summaryRows?.[0];
  const statementLines = lines ?? [];
  const isDraft = statement.status === "DRAFT";

  const candidatesByLine = new Map<string, { id: string; label: string }[]>();
  if (canManage && isDraft) {
    const unmatched = statementLines.filter((l) => !l.matched_journal_entry_line_id);
    const results = await Promise.all(
      unmatched.map((l) =>
        supabase.rpc("get_bank_match_candidates", {
          p_statement_line_id: l.id,
          p_date_tolerance_days: 30,
        }),
      ),
    );
    unmatched.forEach((l, i) => {
      const rows = results[i]?.data ?? [];
      candidatesByLine.set(
        l.id,
        rows.map((c) => ({
          id: c.journal_entry_line_id,
          label: `#${c.entry_number ?? "—"} · ${c.entry_date} · ${c.description ?? ""}`.trim(),
        })),
      );
    });
  }

  const fmt = (n: number) =>
    n.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const balanced = summary ? Math.abs(summary.difference) < 0.005 : false;

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href="/finance/banks/reconciliation"
            locale={locale as Locale}
            className="text-xs font-bold text-slate-500 hover:text-slate-900 dark:hover:text-white flex items-center gap-1 mb-2"
          >
            {isAr ? <ArrowRight className="size-3.5" /> : <ArrowLeft className="size-3.5" />}
            <span>{isAr ? "العودة إلى كشوف الحسابات" : "Back to all statements"}</span>
          </Link>
          <div className="flex items-center gap-2">
            <div className="flex size-9 items-center justify-center rounded-xl bg-blue-600/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400">
              <Landmark className="size-4" />
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-950 dark:text-white">
                {account ? account.account_name : isAr ? "حساب بنكي" : "Bank account"}
              </h1>
              <p className="text-xs text-slate-500 font-mono">
                {statement.period_start} → {statement.period_end}
                {account ? ` · ${account.account_number}` : ""}
              </p>
            </div>
          </div>
        </div>

        <Badge
          className={`font-bold text-xs px-3 py-1 ${
            isDraft
              ? "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950 dark:text-blue-300"
              : "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300"
          }`}
        >
          {isDraft ? (isAr ? "قيد المطابقة والتسوية" : "In progress") : isAr ? "✓ مطابَق ومعتمَد" : "Reconciled"}
        </Badge>
      </div>

      {summary && (
        <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
            <h2 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-1.5">
              <Scale className="size-4 text-blue-600" />
              <span>{isAr ? "جدول إثبات المطابقة والتسوية البنكية" : "Reconciliation Proof Table"}</span>
            </h2>
          </div>

          <dl className="grid gap-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-900/60">
              <dt className="text-slate-500 mb-1">{isAr ? "الرصيد الختامي حسب البنك" : "Closing balance per bank"}</dt>
              <dd className="font-mono text-base font-black text-slate-900 dark:text-white">{fmt(summary.closing_balance)}</dd>
            </div>

            <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-900/60">
              <dt className="text-slate-500 mb-1">
                {isAr ? `+ بالدفاتر لم تظهر بالبنك (${summary.unmatched_gl_count})` : `+ In books, not in bank (${summary.unmatched_gl_count})`}
              </dt>
              <dd className="font-mono text-base font-bold text-blue-600">{fmt(summary.unmatched_gl_total)}</dd>
            </div>

            <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-900/60">
              <dt className="text-slate-500 mb-1">
                {isAr ? `− بالبنك لم تُقيَّد بالدفاتر (${summary.unmatched_statement_count})` : `− In bank, not in books (${summary.unmatched_statement_count})`}
              </dt>
              <dd className="font-mono text-base font-bold text-amber-600">{fmt(summary.unmatched_statement_total)}</dd>
            </div>

            <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-900/60">
              <dt className="text-slate-500 mb-1">{isAr ? "الرصيد حسب دفاتر الأستاذ" : "Balance per ledger books"}</dt>
              <dd className="font-mono text-base font-black text-slate-900 dark:text-white">{fmt(summary.book_balance)}</dd>
            </div>
          </dl>

          <div
            className={`flex items-center justify-between gap-4 rounded-xl border p-3.5 text-xs font-bold ${
              balanced
                ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300"
                : "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300"
            }`}
          >
            <span className="flex items-center gap-2">
              {balanced ? <CheckCircle2 className="size-4 text-emerald-600" /> : <AlertTriangle className="size-4 text-rose-600" />}
              <span>
                {balanced
                  ? isAr ? "✓ مطابقة تامة ومتوازنة بالكامل (الفارق: صفر)" : "✓ Perfectly Balanced (Zero Variance)"
                  : isAr ? "الفرق غير المفسَّر بين البنك والدفاتر:" : "Unexplained Difference:"}
              </span>
            </span>
            <span className="font-mono text-sm font-black">{fmt(summary.difference)}</span>
          </div>

          {!balanced && (
            <p className="text-xs text-slate-500">
              {isAr
                ? "الفرق هنا يعني خطأً دفترياً أو بنكياً: مبلغ مختلف، قيد مكرر، أو رصيد افتتاحي/ختامي غير صحيح."
                : "This difference means a posting error: wrong amount, duplicate entry, or mis-keyed balance."}
            </p>
          )}

          {canManage && (
            <div className="pt-2">
              <FinalizeForm
                statementId={statement.id}
                status={statement.status}
                balanced={balanced}
                locale={locale}
              />
            </div>
          )}
        </div>
      )}

      {canManage && isDraft && (
        <div className="space-y-3">
          <BankReconciliationAiPanel
            statementId={statement.id}
            organizationId={organization.id}
            locale={locale}
          />
          <ImportLinesForm
            organizationId={organization.id}
            statementId={statement.id}
            locale={locale}
          />
          {statementLines.length > 0 && <AutoMatchForm statementId={statement.id} locale={locale} />}
        </div>
      )}

      {/* Statement Lines Table */}
      <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-start">
            <thead className="bg-slate-900 text-white dark:bg-slate-800/90 font-bold border-b border-slate-800">
              <tr>
                <th className="p-3 text-start">{isAr ? "التاريخ" : "Date"}</th>
                <th className="p-3 text-start">{isAr ? "البيان والمرجع" : "Description & Reference"}</th>
                <th className="p-3 text-end">{isAr ? "المبلغ" : "Amount"}</th>
                <th className="p-3 text-start">{isAr ? "حالة المطابقة والقيد المقابل" : "Match Status & Candidate"}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {statementLines.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-8 text-center text-slate-400 text-xs">
                    {isAr ? "لم تُستورد أي سطور بعد في هذا الكشف." : "No statement lines imported yet."}
                  </td>
                </tr>
              ) : (
                statementLines.map((l) => (
                  <tr key={l.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/50 transition-colors">
                    <td className="p-3 font-mono text-[11px] font-bold text-slate-700 dark:text-slate-300">
                      {l.line_date}
                    </td>
                    <td className="p-3">
                      <div className="font-semibold text-slate-900 dark:text-white">{l.description}</div>
                      {l.reference && (
                        <span className="text-[10px] font-mono text-slate-400">Ref: {l.reference}</span>
                      )}
                    </td>
                    <td
                      className={`p-3 text-end font-mono font-bold text-sm ${
                        l.amount >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
                      }`}
                    >
                      {l.amount >= 0 ? "+" : ""}{fmt(l.amount)}
                    </td>
                    <td className="p-3">
                      {l.matched_journal_entry_line_id ? (
                        <div className="flex items-center gap-2">
                          <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 text-[10px] font-bold">
                            {l.match_type === "AUTO"
                              ? isAr ? "✓ مطابق تلقائياً" : "Auto Matched"
                              : isAr ? "✓ مطابق يدوياً" : "Manual Matched"}
                          </Badge>
                          {canManage && isDraft && (
                            <MatchLineForm
                              lineId={l.id}
                              candidates={[]}
                              currentMatchId={l.matched_journal_entry_line_id}
                              locale={locale}
                            />
                          )}
                        </div>
                      ) : canManage && isDraft ? (
                        <MatchLineForm
                          lineId={l.id}
                          candidates={candidatesByLine.get(l.id) ?? []}
                          currentMatchId={null}
                          locale={locale}
                        />
                      ) : (
                        <span className="text-xs text-slate-400">
                          {isAr ? "غير مطابَق" : "Unmatched"}
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
