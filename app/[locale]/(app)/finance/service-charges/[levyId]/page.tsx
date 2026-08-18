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
import { ComputeForm, IssueForm, WeightForm } from "../levy-forms";

export default async function LevyDetailPage({
  params,
}: {
  params: Promise<{ locale: string; levyId: string }>;
}) {
  const { locale, levyId } = await params;
  setRequestLocale(locale as Locale);
  const isAr = locale === "ar";

  const user = await getCurrentUser();
  const organization = user ? await getPrimaryOrganization(user.id) : null;
  if (!organization) return null;

  const [canManage, canRead] = await Promise.all([
    hasPermission(organization.id, "finance.service_charges.manage"),
    hasPermission(organization.id, "finance.service_charges.read"),
  ]);
  if (!canManage && !canRead) {
    return (
      <div className="space-y-2">
        <h1 className="text-xl font-semibold">{isAr ? "رسوم الخدمة" : "Service Charges"}</h1>
        <p className="text-sm text-muted-foreground">
          {isAr ? "لا تملك صلاحية الاطلاع." : "You don't have permission to view this."}
        </p>
      </div>
    );
  }

  const supabase = await createClient();
  const { data: levy } = await supabase
    .from("service_charge_levies")
    .select("id, name, property_id, period_start, period_end, total_amount, allocation_basis, status, issue_date, due_date, note")
    .eq("id", levyId)
    .eq("organization_id", organization.id)
    .maybeSingle();
  if (!levy) notFound();

  const { data: allocations } = await supabase.rpc("get_service_charge_allocations", {
    p_levy_id: levy.id,
  });

  const rows = allocations ?? [];
  const allocated = rows.reduce((s, r) => s + r.share_amount, 0);
  const balanced = Math.abs(allocated - levy.total_amount) < 0.005;
  const isDraft = levy.status === "DRAFT";
  const billed = rows.filter((r) => r.share_amount > 0).length;

  const fmt = (n: number) =>
    n.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href="/finance/service-charges"
            locale={locale as Locale}
            className="text-sm text-muted-foreground underline-offset-4 hover:underline"
          >
            ← {isAr ? "كل التحصيلات" : "All levies"}
          </Link>
          <h1 className="mt-1 text-xl font-semibold">{levy.name}</h1>
          <p className="text-sm text-muted-foreground tabular-nums">
            {levy.period_start} → {levy.period_end} · {isAr ? "الإصدار" : "issued"} {levy.issue_date} ·{" "}
            {isAr ? "الاستحقاق" : "due"} {levy.due_date}
          </p>
        </div>
        <Badge variant={isDraft ? "secondary" : "default"}>
          {isDraft ? (isAr ? "مسودة" : "Draft") : isAr ? "صادرة" : "Issued"}
        </Badge>
      </div>

      <div className="space-y-3 rounded-lg border p-4">
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">{isAr ? "إجمالي التحصيلة" : "Levy total"}</dt>
            <dd className="tabular-nums">{fmt(levy.total_amount)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">{isAr ? "مجموع الأنصبة" : "Allocated"}</dt>
            <dd className="tabular-nums">{fmt(allocated)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">{isAr ? "وحدات ستُحمَّل" : "Units billed"}</dt>
            <dd className="tabular-nums">{billed}</dd>
          </div>
        </dl>
        <div
          className={`rounded-md border p-3 text-sm font-medium ${
            balanced
              ? "border-emerald-500/40 bg-emerald-500/10"
              : "border-amber-500/40 bg-amber-500/10"
          }`}
        >
          {rows.length === 0
            ? isAr
              ? "لم يُحسب التوزيع بعد."
              : "The allocation has not been computed yet."
            : balanced
              ? isAr
                ? `مطابق: مجموع أنصبة ${rows.length} وحدة يساوي إجمالي التحصيلة بالضبط.`
                : `Balanced: the shares across ${rows.length} units sum to the levy total exactly.`
              : isAr
                ? `فرق ${fmt(levy.total_amount - allocated)} بين الأنصبة والإجمالي — أعد حساب التوزيع.`
                : `${fmt(levy.total_amount - allocated)} between the shares and the total — recompute the allocation.`}
        </div>
        {canManage && isDraft && (
          <div className="flex flex-wrap items-start gap-4">
            <ComputeForm levyId={levy.id} locale={locale} />
            <IssueForm levyId={levy.id} balanced={balanced && rows.length > 0} locale={locale} />
          </div>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{isAr ? "الوحدة" : "Unit"}</TableHead>
              <TableHead className="text-end">
                {levy.allocation_basis === "AREA"
                  ? isAr
                    ? "المساحة"
                    : "Area"
                  : isAr
                    ? "الوزن"
                    : "Weight"}
              </TableHead>
              <TableHead className="text-end">{isAr ? "النسبة" : "Share"}</TableHead>
              <TableHead className="text-end">{isAr ? "المبلغ" : "Amount"}</TableHead>
              <TableHead>{isAr ? "المستحق" : "Due"}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground">
                  {isAr
                    ? "اضغط «حساب التوزيع» لتوليد أنصبة الوحدات."
                    : 'Use "Compute allocation" to generate the unit shares.'}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
                <TableRow key={r.allocation_id}>
                  <TableCell className="font-medium">{r.unit_code}</TableCell>
                  <TableCell className="text-end tabular-nums">
                    {canManage && isDraft && levy.allocation_basis === "CUSTOM" ? (
                      <div className="flex justify-end">
                        <WeightForm
                          allocationId={r.allocation_id}
                          value={r.basis_value}
                          locale={locale}
                        />
                      </div>
                    ) : (
                      fmt(r.basis_value)
                    )}
                  </TableCell>
                  <TableCell className="text-end tabular-nums text-muted-foreground">
                    {r.share_percent.toFixed(2)}%
                  </TableCell>
                  <TableCell className="text-end tabular-nums">{fmt(r.share_amount)}</TableCell>
                  <TableCell>
                    {r.due_id ? (
                      <Badge variant="outline">{isAr ? "صدر" : "Issued"}</Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        {isAr ? "—" : "—"}
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {levy.note && <p className="text-sm text-muted-foreground">{levy.note}</p>}
    </div>
  );
}
