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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">{isAr ? "السنوات والفترات المالية" : "Fiscal years & periods"}</h1>
      </div>
      <CreateFiscalYearForm organizationId={organization.id} locale={locale} />

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
                        <PeriodStatusForm periodId={period.id} />
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
