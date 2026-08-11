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

const STATUS_LABELS: Record<string, { ar: string; en: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  DRAFT: { ar: "مسودة", en: "Draft", variant: "outline" },
  ISSUED: { ar: "غير مدفوع", en: "Unpaid", variant: "secondary" },
  PARTIALLY_PAID: { ar: "مدفوع جزئيًا", en: "Partially paid", variant: "secondary" },
  PAID: { ar: "مدفوع بالكامل", en: "Paid", variant: "default" },
  OVERDUE: { ar: "متأخر", en: "Overdue", variant: "destructive" },
  VOID: { ar: "ملغى", en: "Void", variant: "outline" },
};

const RECORD_LIMIT = 50;

// Accepts either a unitId (used on the unit detail page) or a memberId (for
// the member profile page, once it exists -- filters through the member's
// currently-active unit ownerships since dues have no direct member_id).
export async function DuesTable({
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

  let unitIds: string[] | null = null;
  if (memberId) {
    const { data: ownerships } = await supabase
      .from("unit_ownerships")
      .select("unit_id, end_date")
      .eq("organization_id", organizationId)
      .eq("member_id", memberId);
    unitIds = (ownerships ?? [])
      .filter((o) => !o.end_date || o.end_date >= new Date().toISOString().slice(0, 10))
      .map((o) => o.unit_id);
  }

  let query = supabase
    .from("dues")
    .select("id, unit_id, due_type_id, amount, issue_date, due_date, description, status", { count: "exact" })
    .eq("organization_id", organizationId)
    .order("due_date", { ascending: false })
    .limit(RECORD_LIMIT);

  if (unitId) {
    query = query.eq("unit_id", unitId);
  } else if (unitIds) {
    // .in() with an empty array is unreliable across postgrest versions, so
    // force a no-match filter instead when the member owns no active units.
    query = unitIds.length ? query.in("unit_id", unitIds) : query.eq("unit_id", "00000000-0000-0000-0000-000000000000");
  }

  const { data: dues, count } = await query;

  const dueTypeIds = [...new Set((dues ?? []).map((d) => d.due_type_id))];
  const { data: dueTypes } = dueTypeIds.length
    ? await supabase.from("due_types").select("id, name_ar, name_en").in("id", dueTypeIds)
    : { data: [] };
  const dueTypeNameById = new Map((dueTypes ?? []).map((t) => [t.id, isAr ? t.name_ar : t.name_en]));

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{isAr ? "التاريخ" : "Date"}</TableHead>
              <TableHead>{isAr ? "النوع" : "Type"}</TableHead>
              <TableHead>{isAr ? "المبلغ" : "Amount"}</TableHead>
              <TableHead>{isAr ? "الحالة" : "Status"}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {dues?.length ? (
              dues.map((due) => {
                const label = STATUS_LABELS[due.status] ?? { ar: due.status, en: due.status, variant: "outline" as const };
                return (
                  <TableRow key={due.id}>
                    <TableCell className="text-muted-foreground">{due.due_date}</TableCell>
                    <TableCell>{dueTypeNameById.get(due.due_type_id) ?? due.description ?? "—"}</TableCell>
                    <TableCell className="font-medium">
                      <Money amount={due.amount} currency={currency} locale={locale} />
                    </TableCell>
                    <TableCell>
                      <Badge variant={label.variant}>{isAr ? label.ar : label.en}</Badge>
                    </TableCell>
                  </TableRow>
                );
              })
            ) : (
              <TableRow>
                <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                  {isAr ? "لا توجد استحقاقات" : "No dues"}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      {(count ?? 0) > RECORD_LIMIT && (
        <p className="text-xs text-muted-foreground">
          {isAr ? `عرض آخر ${RECORD_LIMIT} سجل` : `Showing the last ${RECORD_LIMIT} records`}
        </p>
      )}
    </div>
  );
}
