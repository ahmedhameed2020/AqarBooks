import { User, Wallet, Calendar } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Money } from "@/components/money";
import { createClient } from "@/lib/supabase/server";
import { CreateInstallmentPlanDialog } from "./create-installment-plan-dialog";
import { CancelInstallmentPlanButton } from "./installment-plan-action-buttons";

const STATUS_LABEL: Record<string, { ar: string; en: string; className: string }> = {
  ACTIVE: { ar: "نشطة", en: "Active", className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
  COMPLETED: { ar: "مكتملة", en: "Completed", className: "bg-blue-500/10 text-blue-600 dark:text-blue-400" },
  CANCELLED: { ar: "ملغاة", en: "Cancelled", className: "bg-rose-500/10 text-rose-600 dark:text-rose-400" },
};

const DUE_STATUS_LABEL: Record<string, { ar: string; en: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  ISSUED: { ar: "غير مدفوع", en: "Unpaid", variant: "secondary" },
  PARTIALLY_PAID: { ar: "مدفوع جزئيًا", en: "Partial", variant: "secondary" },
  PAID: { ar: "مدفوع", en: "Paid", variant: "default" },
  OVERDUE: { ar: "متأخر", en: "Overdue", variant: "destructive" },
  VOID: { ar: "ملغى", en: "Void", variant: "outline" },
};

export async function TabInstallments({
  organizationId,
  unitId,
  locale,
  currency,
}: {
  organizationId: string;
  unitId: string;
  locale: string;
  currency: string;
}) {
  const isAr = locale === "ar";
  const supabase = await createClient();

  const [{ data: plans }, { data: members }, { data: dueTypes }, { data: accounts }] = await Promise.all([
    supabase
      .from("installment_plans")
      .select("id, buyer_member_id, status, total_price, down_payment, installment_count, installment_frequency, starts_on, cancel_reason, created_at")
      .eq("organization_id", organizationId)
      .eq("unit_id", unitId)
      .order("created_at", { ascending: false }),
    supabase.from("members").select("id, full_name").eq("organization_id", organizationId).order("full_name"),
    supabase.from("due_types").select("id, name_ar, name_en").eq("organization_id", organizationId),
    supabase
      .from("chart_of_accounts")
      .select("id, code, name_ar, name_en, category")
      .eq("organization_id", organizationId)
      .eq("is_group", false)
      .eq("category", "ASSET"),
  ]);

  const memberName = new Map((members ?? []).map((m) => [m.id, m.full_name]));
  const activePlan = (plans ?? []).find((p) => p.status === "ACTIVE");
  const historyPlans = (plans ?? []).filter((p) => p.status !== "ACTIVE");

  let schedule: { sequence_no: number; amount: number; due_date: string; status: string }[] = [];
  if (activePlan) {
    const { data: rows } = await supabase
      .from("plan_installments")
      .select("sequence_no, due_id, dues:due_id(amount, due_date, status)")
      .eq("plan_id", activePlan.id)
      .order("sequence_no");
    schedule = (rows ?? [])
      .map((r) => {
        const due = Array.isArray(r.dues) ? r.dues[0] : r.dues;
        return due ? { sequence_no: r.sequence_no, amount: due.amount, due_date: due.due_date, status: due.status } : null;
      })
      .filter((r): r is { sequence_no: number; amount: number; due_date: string; status: string } => r !== null);
  }

  const paidSoFar = schedule.filter((s) => s.status === "PAID").reduce((sum, s) => sum + s.amount, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">{isAr ? "خطط التقسيط" : "Installment plans"}</h2>
        <CreateInstallmentPlanDialog
          organizationId={organizationId}
          unitId={unitId}
          members={(members ?? []).map((m) => ({ id: m.id, label: m.full_name }))}
          dueTypes={(dueTypes ?? []).map((d) => ({ id: d.id, label: isAr ? d.name_ar : d.name_en }))}
          receivableAccounts={(accounts ?? []).map((a) => ({ id: a.id, label: `${a.code} — ${isAr ? a.name_ar : a.name_en}` }))}
          locale={locale}
        />
      </div>

      {activePlan ? (
        <>
          <section className="rounded-2xl border border-border/60 bg-card p-5 shadow-xs">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="flex items-center gap-1.5 font-semibold">
                    <User className="size-4 text-muted-foreground" />
                    {memberName.get(activePlan.buyer_member_id) ?? "—"}
                  </span>
                  <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${STATUS_LABEL.ACTIVE.className}`}>
                    {isAr ? STATUS_LABEL.ACTIVE.ar : STATUS_LABEL.ACTIVE.en}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <Wallet className="size-3.5" />
                    {isAr ? "الإجمالي" : "Total"}: <Money amount={activePlan.total_price} currency={currency} locale={locale} />
                    {" · "}
                    {isAr ? "المدفوع" : "Paid"}: <Money amount={paidSoFar} currency={currency} locale={locale} tone="positive" />
                    {" · "}
                    {isAr ? "المتبقي" : "Remaining"}: <Money amount={activePlan.total_price - paidSoFar} currency={currency} locale={locale} />
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Calendar className="size-3.5" />
                    {activePlan.installment_count} {isAr ? "قسط" : "installments"}
                    {" · "}
                    {activePlan.starts_on}
                  </span>
                </div>
              </div>
              <CancelInstallmentPlanButton planId={activePlan.id} locale={locale} />
            </div>
          </section>

          <section className="space-y-2">
            <h3 className="text-xs font-semibold text-muted-foreground">{isAr ? "جدول الأقساط" : "Installment schedule"}</h3>
            <div className="overflow-x-auto rounded-2xl border border-border/60 bg-card shadow-xs">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead>#</TableHead>
                    <TableHead>{isAr ? "تاريخ الاستحقاق" : "Due date"}</TableHead>
                    <TableHead>{isAr ? "المبلغ" : "Amount"}</TableHead>
                    <TableHead>{isAr ? "الحالة" : "Status"}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {schedule.map((s) => {
                    const label = DUE_STATUS_LABEL[s.status] ?? { ar: s.status, en: s.status, variant: "outline" as const };
                    return (
                      <TableRow key={s.sequence_no}>
                        <TableCell className="tabular-nums">{s.sequence_no === 0 ? (isAr ? "مقدم" : "Down") : s.sequence_no}</TableCell>
                        <TableCell className="text-muted-foreground tabular-nums">{s.due_date}</TableCell>
                        <TableCell className="font-medium tabular-nums">
                          <Money amount={s.amount} currency={currency} locale={locale} />
                        </TableCell>
                        <TableCell>
                          <Badge variant={label.variant}>{isAr ? label.ar : label.en}</Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </section>
        </>
      ) : (
        <div className="rounded-2xl border border-dashed border-border/60 p-6 text-center text-sm text-muted-foreground">
          {isAr ? "لا توجد خطة تقسيط نشطة لهذه الوحدة" : "No active installment plan for this unit"}
        </div>
      )}

      {historyPlans.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-xs font-semibold text-muted-foreground">{isAr ? "سجل الخطط السابقة" : "Plan history"}</h3>
          <ul className="space-y-2">
            {historyPlans.map((p) => {
              const label = STATUS_LABEL[p.status];
              return (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/40 p-3 text-sm opacity-80">
                  <div>
                    <p className="font-medium">{memberName.get(p.buyer_member_id) ?? "—"}</p>
                    <p className="text-xs text-muted-foreground">
                      <Money amount={p.total_price} currency={currency} locale={locale} />
                      {p.cancel_reason ? ` · ${p.cancel_reason}` : ""}
                    </p>
                  </div>
                  <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${label.className}`}>
                    {isAr ? label.ar : label.en}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
