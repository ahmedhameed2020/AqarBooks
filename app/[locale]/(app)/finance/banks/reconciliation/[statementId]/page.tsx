import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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

  // Candidates are only fetched for unmatched lines, and only when the user
  // can actually act on them -- the RPC requires the manage permission and
  // would throw for a read-only viewer.
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
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href="/finance/banks/reconciliation"
            locale={locale as Locale}
            className="text-sm text-muted-foreground underline-offset-4 hover:underline"
          >
            ← {isAr ? "كل كشوف الحسابات" : "All statements"}
          </Link>
          <h1 className="mt-1 text-xl font-semibold">
            {account ? account.account_name : isAr ? "حساب بنكي" : "Bank account"}
          </h1>
          <p className="text-sm text-muted-foreground tabular-nums">
            {statement.period_start} → {statement.period_end}
            {account ? ` · ${account.account_number}` : ""}
          </p>
        </div>
        <Badge variant={isDraft ? "secondary" : "default"}>
          {isDraft ? (isAr ? "قيد المطابقة" : "In progress") : isAr ? "مطابَق" : "Reconciled"}
        </Badge>
      </div>

      {summary && (
        <div className="space-y-3 rounded-lg border p-4">
          <h2 className="text-sm font-medium">
            {isAr ? "إثبات المطابقة" : "Reconciliation proof"}
          </h2>
          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">{isAr ? "الرصيد الختامي حسب البنك" : "Closing balance per bank"}</dt>
              <dd className="tabular-nums">{fmt(summary.closing_balance)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">
                {isAr ? `+ حركة بالدفاتر لم تظهر بالبنك (${summary.unmatched_gl_count})` : `+ In books, not yet on statement (${summary.unmatched_gl_count})`}
              </dt>
              <dd className="tabular-nums">{fmt(summary.unmatched_gl_total)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">
                {isAr ? `− حركة بالبنك لم تُقيَّد بالدفاتر (${summary.unmatched_statement_count})` : `− On statement, not yet in books (${summary.unmatched_statement_count})`}
              </dt>
              <dd className="tabular-nums">{fmt(summary.unmatched_statement_total)}</dd>
            </div>
            <div className="flex justify-between gap-4 border-t pt-2 sm:border-t-0 sm:pt-0">
              <dt className="text-muted-foreground">{isAr ? "الرصيد حسب الدفاتر" : "Balance per books"}</dt>
              <dd className="tabular-nums">{fmt(summary.book_balance)}</dd>
            </div>
          </dl>
          <div
            className={`flex items-center justify-between gap-4 rounded-md border p-3 text-sm font-medium ${
              balanced
                ? "border-emerald-500/40 bg-emerald-500/10"
                : "border-destructive/40 bg-destructive/10"
            }`}
          >
            <span>{isAr ? "الفرق غير المفسَّر" : "Unexplained difference"}</span>
            <span className="tabular-nums">{fmt(summary.difference)}</span>
          </div>
          {!balanced && (
            <p className="text-sm text-muted-foreground">
              {isAr
                ? "الفرق هنا لا يعني بنودًا معلّقة — تلك محسوبة بالفعل أعلاه. الفرق يعني خطأً حقيقيًا: مبلغ مختلف، قيد مكرر، أو رصيد افتتاحي/ختامي أُدخل خطأً."
                : "This difference does not mean outstanding items — those are already accounted for above. It means a real error: a wrong amount, a duplicated posting, or a mis-keyed opening or closing balance."}
            </p>
          )}
          {canManage && (
            <FinalizeForm
              statementId={statement.id}
              status={statement.status}
              balanced={balanced}
              locale={locale}
            />
          )}
        </div>
      )}

      {canManage && isDraft && (
        <>
          <ImportLinesForm
            organizationId={organization.id}
            statementId={statement.id}
            locale={locale}
          />
          {statementLines.length > 0 && <AutoMatchForm statementId={statement.id} locale={locale} />}
        </>
      )}

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{isAr ? "التاريخ" : "Date"}</TableHead>
              <TableHead>{isAr ? "البيان" : "Description"}</TableHead>
              <TableHead className="text-end">{isAr ? "المبلغ" : "Amount"}</TableHead>
              <TableHead>{isAr ? "المطابقة" : "Match"}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {statementLines.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-muted-foreground">
                  {isAr
                    ? "لم تُستورد أي سطور بعد."
                    : "No statement lines imported yet."}
                </TableCell>
              </TableRow>
            ) : (
              statementLines.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="tabular-nums">{l.line_date}</TableCell>
                  <TableCell>
                    {l.description}
                    {l.reference && (
                      <span className="ms-2 text-xs text-muted-foreground">{l.reference}</span>
                    )}
                  </TableCell>
                  <TableCell
                    className={`text-end tabular-nums ${
                      l.amount >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"
                    }`}
                  >
                    {fmt(l.amount)}
                  </TableCell>
                  <TableCell>
                    {l.matched_journal_entry_line_id ? (
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">
                          {l.match_type === "AUTO"
                            ? isAr
                              ? "تلقائي"
                              : "Auto"
                            : isAr
                              ? "يدوي"
                              : "Manual"}
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
                      <span className="text-xs text-muted-foreground">
                        {isAr ? "غير مطابَق" : "Unmatched"}
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
