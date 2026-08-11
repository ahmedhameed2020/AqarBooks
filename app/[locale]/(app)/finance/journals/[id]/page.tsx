import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/i18n/routing";
import { EntryActions } from "./entry-actions";

export default async function JournalEntryDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale as Locale);
  const isAr = locale === "ar";

  const supabase = await createClient();
  const { data: entry } = await supabase
    .from("journal_entries")
    .select(
      "id, organization_id, entry_number, entry_date, description, status, source_type, reversed_entry_id",
    )
    .eq("id", id)
    .single();

  if (!entry) notFound();

  const [{ data: lines }, { data: accounts }, { data: openPeriods }] = await Promise.all([
    supabase
      .from("journal_entry_lines")
      .select("id, line_number, account_id, description, debit, credit")
      .eq("journal_entry_id", id)
      .order("line_number"),
    supabase.from("chart_of_accounts").select("id, code, name_ar, name_en"),
    supabase
      .from("fiscal_periods")
      .select("id, name")
      .eq("organization_id", entry.organization_id)
      .eq("status", "OPEN")
      .order("start_date"),
  ]);

  const accountById = new Map((accounts ?? []).map((a) => [a.id, a]));
  const totalDebit = (lines ?? []).reduce((s, l) => s + l.debit, 0);
  const totalCredit = (lines ?? []).reduce((s, l) => s + l.credit, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold">
          {entry.entry_number ? `#${entry.entry_number}` : isAr ? "مسودة" : "Draft"}
        </h1>
        <Badge>{entry.status}</Badge>
      </div>
      <dl className="grid grid-cols-2 gap-2 text-sm sm:w-md">
        <dt className="text-muted-foreground">{isAr ? "التاريخ" : "Date"}</dt>
        <dd>{entry.entry_date}</dd>
        <dt className="text-muted-foreground">{isAr ? "البيان" : "Description"}</dt>
        <dd>{entry.description}</dd>
        <dt className="text-muted-foreground">{isAr ? "النوع" : "Source"}</dt>
        <dd>{entry.source_type}</dd>
      </dl>

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{isAr ? "الحساب" : "Account"}</TableHead>
              <TableHead>{isAr ? "البيان" : "Memo"}</TableHead>
              <TableHead>{isAr ? "مدين" : "Debit"}</TableHead>
              <TableHead>{isAr ? "دائن" : "Credit"}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines?.map((line) => {
              const account = accountById.get(line.account_id);
              return (
                <TableRow key={line.id}>
                  <TableCell>
                    {account ? `${account.code} — ${isAr ? account.name_ar : account.name_en}` : line.account_id}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{line.description}</TableCell>
                  <TableCell>{line.debit > 0 ? line.debit.toFixed(2) : ""}</TableCell>
                  <TableCell>{line.credit > 0 ? line.credit.toFixed(2) : ""}</TableCell>
                </TableRow>
              );
            })}
            <TableRow className="font-medium">
              <TableCell colSpan={2}>{isAr ? "الإجمالي" : "Total"}</TableCell>
              <TableCell>{totalDebit.toFixed(2)}</TableCell>
              <TableCell>{totalCredit.toFixed(2)}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>

      <EntryActions
        journalEntryId={entry.id}
        status={entry.status}
        openPeriods={openPeriods ?? []}
        locale={locale}
      />
    </div>
  );
}
