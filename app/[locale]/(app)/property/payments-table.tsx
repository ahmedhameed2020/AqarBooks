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
import { Money } from "@/components/money";

const METHOD_LABELS: Record<string, { ar: string; en: string }> = {
  CASH: { ar: "نقدًا", en: "Cash" },
  BANK_TRANSFER: { ar: "تحويل بنكي", en: "Bank transfer" },
  CHEQUE: { ar: "شيك", en: "Cheque" },
  OTHER: { ar: "أخرى", en: "Other" },
};

const RECORD_LIMIT = 50;

type Row = {
  key: string;
  amount: number;
  method: string;
  paymentDate: string;
  receiptNumber: number | null;
  status: string;
};

// Accepts either a unitId (unit detail page) or a memberId (member profile
// page). These are NOT symmetric: payments.member_id is set directly by the
// real "record payment" form, but that form has no unit field at all --
// payments.unit_id is always null in production data. The only reliable
// unit-level link is payment_allocations -> dues.unit_id (same source the
// units_with_financials view uses for total_paid). So the unitId path shows
// the amount actually allocated to this unit's dues, which can be less than
// a payment's full amount if one payment covered dues on multiple units.
export async function PaymentsTable({
  organizationId,
  unitId,
  memberId,
  locale,
  currency,
}: {
  organizationId: string;
  unitId?: string;
  memberId?: string;
  locale: string;
  currency: string;
}) {
  const isAr = locale === "ar";
  const supabase = await createClient();

  let rows: Row[] = [];
  let totalCount = 0;

  if (unitId) {
    const { data: dues } = await supabase.from("dues").select("id").eq("organization_id", organizationId).eq("unit_id", unitId);
    const dueIds = (dues ?? []).map((d) => d.id);

    if (dueIds.length) {
      const { data: allocations, count } = await supabase
        .from("payment_allocations")
        .select("id, payment_id, amount, due_id", { count: "exact" })
        .in("due_id", dueIds);
      totalCount = count ?? 0;

      const paymentIds = [...new Set((allocations ?? []).map((a) => a.payment_id))];
      const { data: payments } = paymentIds.length
        ? await supabase
            .from("payments")
            .select("id, method, payment_date, receipt_number, status")
            .eq("organization_id", organizationId)
            .in("id", paymentIds)
        : { data: [] };
      const paymentById = new Map((payments ?? []).map((p) => [p.id, p]));

      rows = (allocations ?? [])
        .map((a): Row | null => {
          const p = paymentById.get(a.payment_id);
          if (!p) return null;
          return {
            key: a.id,
            amount: a.amount,
            method: p.method,
            paymentDate: p.payment_date,
            receiptNumber: p.receipt_number,
            status: p.status,
          };
        })
        .filter((r): r is Row => r !== null)
        .sort((a, b) => (a.paymentDate < b.paymentDate ? 1 : -1))
        .slice(0, RECORD_LIMIT);
    }
  } else if (memberId) {
    const { data: payments, count } = await supabase
      .from("payments")
      .select("id, amount, method, payment_date, receipt_number, status", { count: "exact" })
      .eq("organization_id", organizationId)
      .eq("member_id", memberId)
      .order("payment_date", { ascending: false })
      .limit(RECORD_LIMIT);
    totalCount = count ?? 0;
    rows = (payments ?? []).map((p) => ({
      key: p.id,
      amount: p.amount,
      method: p.method,
      paymentDate: p.payment_date,
      receiptNumber: p.receipt_number,
      status: p.status,
    }));
  }

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{isAr ? "التاريخ" : "Date"}</TableHead>
              <TableHead>{isAr ? "المبلغ" : "Amount"}</TableHead>
              <TableHead>{isAr ? "طريقة الدفع" : "Method"}</TableHead>
              {/* TODO: no memo/notes column exists on payments yet -- receipt
                  number is the only reference available. Revisit once a
                  "record payment" write flow needs a note field. */}
              <TableHead>{isAr ? "المرجع" : "Reference"}</TableHead>
              <TableHead>{isAr ? "الحالة" : "Status"}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length ? (
              rows.map((r) => (
                <TableRow key={r.key}>
                  <TableCell className="text-muted-foreground">{r.paymentDate}</TableCell>
                  <TableCell className="font-medium">
                    <Money amount={r.amount} currency={currency} locale={locale} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {isAr ? METHOD_LABELS[r.method]?.ar : METHOD_LABELS[r.method]?.en}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {r.receiptNumber ? `#${r.receiptNumber}` : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={r.status === "REVERSED" ? "destructive" : "default"}>
                      {r.status === "REVERSED" ? (isAr ? "معكوس" : "Reversed") : (isAr ? "مرحّل" : "Posted")}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                  {isAr ? "لا توجد دفعات" : "No payments"}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      {totalCount > RECORD_LIMIT && (
        <p className="text-xs text-muted-foreground">
          {isAr ? `عرض آخر ${RECORD_LIMIT} سجل` : `Showing the last ${RECORD_LIMIT} records`}
        </p>
      )}
    </div>
  );
}
