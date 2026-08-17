import { Fragment } from "react";
import { setRequestLocale } from "next-intl/server";
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

const SECTIONS = [
  {
    key: "OPERATING",
    labelAr: "التدفقات النقدية من الأنشطة التشغيلية",
    labelEn: "Cash Flows from Operating Activities",
  },
  {
    key: "INVESTING",
    labelAr: "التدفقات النقدية من الأنشطة الاستثمارية",
    labelEn: "Cash Flows from Investing Activities",
  },
  {
    key: "FINANCING",
    labelAr: "التدفقات النقدية من الأنشطة التمويلية",
    labelEn: "Cash Flows from Financing Activities",
  },
] as const;

/** Day before p_start_date -- the as-of date for the opening cash position. */
function previousDay(date: string) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export default async function CashFlowPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ start?: string; end?: string }>;
}) {
  const { locale } = await params;
  const { start, end } = await searchParams;
  setRequestLocale(locale as Locale);
  const isAr = locale === "ar";

  const user = await getCurrentUser();
  const organization = user ? await getPrimaryOrganization(user.id) : null;
  if (!organization) return null;

  const supabase = await createClient();

  let startDate = start;
  let endDate = end;
  if (!startDate || !endDate) {
    const { data: openPeriod } = await supabase
      .from("fiscal_periods")
      .select("start_date, end_date")
      .eq("organization_id", organization.id)
      .eq("status", "OPEN")
      .order("start_date", { ascending: true })
      .limit(1)
      .maybeSingle();
    startDate = startDate || openPeriod?.start_date || "1900-01-01";
    endDate = endDate || openPeriod?.end_date || new Date().toISOString().slice(0, 10);
  }

  const [{ data: rows, error }, { data: openingCash }, { data: closingCash }] = await Promise.all([
    supabase.rpc("get_cash_flow_statement", {
      p_organization_id: organization.id,
      p_start_date: startDate,
      p_end_date: endDate,
    }),
    supabase.rpc("get_cash_position", {
      p_organization_id: organization.id,
      p_as_of_date: previousDay(startDate),
    }),
    supabase.rpc("get_cash_position", {
      p_organization_id: organization.id,
      p_as_of_date: endDate,
    }),
  ]);

  if (error) {
    return (
      <div className="space-y-2">
        <h1 className="text-xl font-semibold">{isAr ? "قائمة التدفقات النقدية" : "Cash Flow Statement"}</h1>
        <p className="text-sm text-destructive">
          {isAr
            ? "غير مصرح لك بالاطلاع على التقارير المالية. تواصل مع مدير النظام لمنحك صلاحية «قراءة التقارير المالية»."
            : "You do not have permission to view financial reports. Ask an administrator to grant you the finance reports read permission."}
        </p>
      </div>
    );
  }

  const opening = openingCash ?? 0;
  const closing = closingCash ?? 0;
  const netChange = (rows ?? []).reduce((s, r) => s + r.net_amount, 0);
  // The direct method guarantees opening + movements = closing. If it ever
  // does not, the journal is telling us something the report must not hide.
  const reconciles = Math.abs(opening + netChange - closing) < 0.005;
  const unclassifiedCount = (rows ?? []).filter((r) => !r.is_classified).length;

  const fmt = (n: number) =>
    n.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const signed = (n: number) => (n >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">
            {isAr ? "قائمة التدفقات النقدية" : "Cash Flow Statement"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {startDate} → {endDate} · {isAr ? "الطريقة المباشرة" : "Direct method"}
          </p>
        </div>
        <form className="flex items-center gap-2">
          <input
            type="date"
            name="start"
            defaultValue={startDate}
            className="rounded-md border border-input bg-transparent p-1.5 text-sm"
          />
          <input
            type="date"
            name="end"
            defaultValue={endDate}
            className="rounded-md border border-input bg-transparent p-1.5 text-sm"
          />
          <button type="submit" className="rounded-md border px-3 py-1.5 text-sm">
            {isAr ? "تحديث" : "Update"}
          </button>
        </form>
      </div>

      {unclassifiedCount > 0 && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          {isAr
            ? `${unclassifiedCount} حساب لم يُصنَّف بعد ضمن أنشطة التدفق النقدي، ويظهر مؤقتًا ضمن الأنشطة التشغيلية. صنِّفها من صفحة دليل الحسابات ليصبح التقرير دقيقًا.`
            : `${unclassifiedCount} account(s) have no cash flow activity assigned and are shown under operating activities for now. Classify them in the chart of accounts to make this statement exact.`}
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{isAr ? "البيان" : "Description"}</TableHead>
              <TableHead className="text-end">{isAr ? "المبلغ" : "Amount"}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow className="font-medium">
              <TableCell>{isAr ? "النقدية في بداية الفترة" : "Cash at beginning of period"}</TableCell>
              <TableCell className="text-end tabular-nums">{fmt(opening)}</TableCell>
            </TableRow>

            {SECTIONS.map((section) => {
              const sectionRows = (rows ?? []).filter((r) => r.section === section.key);
              const subtotal = sectionRows.reduce((s, r) => s + r.net_amount, 0);
              return (
                <Fragment key={section.key}>
                  <TableRow className="bg-muted/40">
                    <TableCell className="font-semibold" colSpan={2}>
                      {isAr ? section.labelAr : section.labelEn}
                    </TableCell>
                  </TableRow>
                  {sectionRows.length === 0 ? (
                    <TableRow>
                      <TableCell className="ps-6 text-muted-foreground" colSpan={2}>
                        {isAr ? "لا توجد حركة" : "No activity"}
                      </TableCell>
                    </TableRow>
                  ) : (
                    sectionRows.map((r) => (
                      <TableRow key={r.account_id}>
                        <TableCell className="ps-6">
                          {isAr ? r.name_ar : r.name_en}
                          {!r.is_classified && (
                            <span className="ms-2 rounded bg-amber-500/15 px-1.5 py-0.5 text-xs text-amber-700 dark:text-amber-400">
                              {isAr ? "غير مصنَّف" : "unclassified"}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className={`text-end tabular-nums ${signed(r.net_amount)}`}>
                          {fmt(r.net_amount)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                  <TableRow className="font-medium">
                    <TableCell className="ps-6">
                      {isAr ? "صافي النشاط" : "Net cash from activity"}
                    </TableCell>
                    <TableCell className={`text-end tabular-nums ${signed(subtotal)}`}>
                      {fmt(subtotal)}
                    </TableCell>
                  </TableRow>
                </Fragment>
              );
            })}

            <TableRow className="border-t-2 font-semibold">
              <TableCell>{isAr ? "صافي التغير في النقدية" : "Net change in cash"}</TableCell>
              <TableCell className={`text-end tabular-nums ${signed(netChange)}`}>
                {fmt(netChange)}
              </TableCell>
            </TableRow>
            <TableRow className="font-semibold">
              <TableCell>{isAr ? "النقدية في نهاية الفترة" : "Cash at end of period"}</TableCell>
              <TableCell className="text-end tabular-nums">{fmt(closing)}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>

      <p className="text-sm text-muted-foreground">
        {reconciles
          ? isAr
            ? `مطابَقة: ${fmt(opening)} + ${fmt(netChange)} = ${fmt(closing)}`
            : `Reconciled: ${fmt(opening)} + ${fmt(netChange)} = ${fmt(closing)}`
          : null}
      </p>
      {!reconciles && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">
          {isAr
            ? `لا تتطابق الأرصدة: النقدية الافتتاحية (${fmt(opening)}) مضافًا إليها صافي التغير (${fmt(netChange)}) لا تساوي النقدية الختامية (${fmt(closing)}). راجع القيود المرحّلة في هذه الفترة.`
            : `Balances do not reconcile: opening cash (${fmt(opening)}) plus net change (${fmt(netChange)}) does not equal closing cash (${fmt(closing)}). Review the entries posted in this period.`}
        </div>
      )}
    </div>
  );
}
