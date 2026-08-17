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
import { hasPermission } from "@/lib/auth/authorize";
import { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/i18n/routing";
import {
  AGING_BUCKETS,
  AGING_ELIGIBLE_STATUSES,
  computeAgingRows,
  totalsByBucket,
} from "@/lib/finance/aging";

export default async function AgingPage({
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

  // RLS on `dues`/`payments` already enforces finance.dues.read /
  // finance.payments.read (see deferred_aging_rls_tightening, resolved
  // 2026-08-17) -- this check is purely a UX improvement so a user
  // without the permission sees a clear denial message instead of a
  // misleading empty "no outstanding receivables" table. No data query or
  // RLS behavior changes here.
  const canReadDues = await hasPermission(organization.id, "finance.dues.read");
  if (!canReadDues) {
    return (
      <div className="space-y-2">
        <h1 className="text-xl font-semibold">{isAr ? "أعمار الديون" : "Receivables Aging"}</h1>
        <p className="text-sm text-muted-foreground">
          {isAr ? "لا تملك صلاحية عرض هذا التقرير." : "You don't have permission to view this report."}
        </p>
      </div>
    );
  }

  const supabase = await createClient();
  const [{ data: dues }, { data: allocations }, { data: postedPayments }, { data: units }] = await Promise.all([
    supabase
      .from("dues")
      .select("id, unit_id, amount, due_date, status")
      .eq("organization_id", organization.id)
      .in("status", [...AGING_ELIGIBLE_STATUSES]),
    supabase.from("payment_allocations").select("due_id, amount, payment_id"),
    supabase.from("payments").select("id").eq("organization_id", organization.id).eq("status", "POSTED"),
    supabase.from("units").select("id, code").eq("organization_id", organization.id),
  ]);

  const postedIds = new Set((postedPayments ?? []).map((p) => p.id));
  const unitCodeById = new Map((units ?? []).map((u) => [u.id, u.code]));
  const rows = computeAgingRows(dues ?? [], allocations ?? [], postedIds).map((r) => ({
    ...r,
    unitCode: unitCodeById.get(r.unit_id) ?? r.unit_id,
  }));
  const totals = totalsByBucket(rows);
  const grandTotal = rows.reduce((s, r) => s + r.remaining, 0);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">{isAr ? "أعمار الديون" : "Receivables Aging"}</h1>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {AGING_BUCKETS.map((b) => (
          <div key={b.key} className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">{isAr ? b.labelAr : b.labelEn}</p>
            <p className="text-lg font-semibold tabular-nums">{(totals.get(b.key) ?? 0).toFixed(2)}</p>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{isAr ? "الوحدة" : "Unit"}</TableHead>
              <TableHead>{isAr ? "المتبقي" : "Remaining"}</TableHead>
              <TableHead>{isAr ? "الاستحقاق" : "Due date"}</TableHead>
              <TableHead>{isAr ? "الفئة" : "Bucket"}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length ? (
              rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.unitCode}</TableCell>
                  <TableCell>{r.remaining.toFixed(2)}</TableCell>
                  <TableCell className="text-muted-foreground">{r.due_date}</TableCell>
                  <TableCell>{isAr ? AGING_BUCKETS.find((b) => b.key === r.bucket)?.labelAr : AGING_BUCKETS.find((b) => b.key === r.bucket)?.labelEn}</TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  {isAr ? "لا توجد ذمم مستحقة" : "No outstanding receivables"}
                </TableCell>
              </TableRow>
            )}
            <TableRow className="font-semibold">
              <TableCell>{isAr ? "الإجمالي" : "Total"}</TableCell>
              <TableCell>{grandTotal.toFixed(2)}</TableCell>
              <TableCell colSpan={2} />
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
