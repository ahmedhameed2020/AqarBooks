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
import { getCurrentUser } from "@/lib/auth/session";
import { getPrimaryOrganization } from "@/lib/auth/org-context";
import { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/i18n/routing";
import { CreateFiscalYearForm } from "./create-fiscal-year-form";
import { PeriodStatusForm } from "./period-status-form";
import { RecognizeDuesForm } from "./recognize-dues-form";

export default async function FiscalPeriodsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const isAr = locale === "ar";

  const user = await getCurrentUser();
  const organization = user ? await getPrimaryOrganization(user.id) : null;
  if (!organization) return null;

  const supabase = await createClient();
  const { data: years } = await supabase
    .from("fiscal_years")
    .select("id, name, start_date, end_date, status")
    .eq("organization_id", organization.id)
    .order("start_date", { ascending: false });

  const { data: periods } = await supabase
    .from("fiscal_periods")
    .select("id, fiscal_year_id, period_number, name, start_date, end_date, status")
    .eq("organization_id", organization.id)
    .order("start_date", { ascending: true });

  // Dues dated beyond any open period are issued but not yet recognised in the
  // ledger. Surfacing the balance here -- next to the control that opens a
  // period -- is what keeps it a visible number rather than a silent omission.
  const { data: pendingRows } = await supabase.rpc("get_unrecognized_dues_summary", {
    p_organization_id: organization.id,
  });
  const pending = pendingRows?.[0];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">{isAr ? "السنوات والفترات المالية" : "Fiscal years & periods"}</h1>
      </div>
      <CreateFiscalYearForm organizationId={organization.id} locale={locale} />

      {pending && pending.pending_count > 0 && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          {isAr
            ? `${pending.pending_count} مستحقًا بقيمة ${pending.pending_total.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} صادرة لكنها لم تُقيَّد بعد في دفتر الأستاذ، لأن تواريخها (${pending.earliest_issue_date} → ${pending.latest_issue_date}) تقع خارج أي فترة مفتوحة. افتح الفترة التي تخصّها ثم اضغط «اعتراف بالمستحقات» بجوارها.`
            : `${pending.pending_count} due(s) totalling ${pending.pending_total.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} are issued but not yet in the ledger, because their dates (${pending.earliest_issue_date} → ${pending.latest_issue_date}) fall outside any open period. Open the period they belong to, then use "Recognise dues" on that row.`}
        </div>
      )}

      {years?.map((year) => (
        <section key={year.id} className="space-y-2">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-medium">{year.name}</h2>
            <Badge variant="outline">{year.status}</Badge>
            <span className="text-xs text-muted-foreground">
              {year.start_date} → {year.end_date}
            </span>
          </div>
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{isAr ? "الفترة" : "Period"}</TableHead>
                  <TableHead>{isAr ? "من" : "From"}</TableHead>
                  <TableHead>{isAr ? "إلى" : "To"}</TableHead>
                  <TableHead>{isAr ? "الحالة" : "Status"}</TableHead>
                  <TableHead>{isAr ? "تغيير" : "Change"}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {periods
                  ?.filter((p) => p.fiscal_year_id === year.id)
                  .map((period) => (
                    <TableRow key={period.id}>
                      <TableCell className="font-medium">{period.name}</TableCell>
                      <TableCell className="text-muted-foreground">{period.start_date}</TableCell>
                      <TableCell className="text-muted-foreground">{period.end_date}</TableCell>
                      <TableCell>
                        <Badge variant={period.status === "OPEN" ? "default" : "outline"}>
                          {period.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <PeriodStatusForm periodId={period.id} />
                          {period.status === "OPEN" && (
                            <RecognizeDuesForm
                              organizationId={organization.id}
                              periodId={period.id}
                              locale={locale}
                            />
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </div>
        </section>
      ))}
    </div>
  );
}
