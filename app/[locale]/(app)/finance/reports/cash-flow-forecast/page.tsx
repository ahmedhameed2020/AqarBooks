import { setRequestLocale } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getPrimaryOrganization } from "@/lib/auth/org-context";
import { buildPermissionChecker } from "@/lib/auth/nav-permissions";
import { createClient } from "@/lib/supabase/server";
import { DASHBOARD_KEYS } from "@/lib/dashboard/finance-visibility";
import type { Locale } from "@/i18n/routing";
import { AlertCircle, Info } from "lucide-react";

/**
 * Cash-flow forecast — STATUS: not enabled as a projection.
 *
 * What this page used to do: add received cheques AND the remaining balance of open dues to the inflows of
 * each future bucket and project a running cash balance. The two overlap: a cheque in hand is not linked to
 * the due it will settle until it clears (cheques.payment_id is set only on clearance), so the same money
 * was counted twice. Overdue items were dropped (negative day offsets) and outgoing cheques cannot be
 * created yet, so the "outgoing" side was incomplete. A projected balance built on that is not a number
 * anyone should plan with, so the projection is withheld.
 *
 * What it shows instead: the four figures that ARE exact today, each from its own source and each shown
 * only to a viewer allowed to read that source. Nothing is added up across the overlap.
 *
 * Access: the page itself needs finance.reports.read (the approved report key; the previously accepted
 * finance.treasury.read does not exist in the permissions table). Each figure additionally needs the key
 * that gates its source data.
 */
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const isAr = locale === "ar";
  return {
    title: isAr ? "توقعات التدفق النقدي — AqarBooks" : "Cash Flow Forecast — AqarBooks",
    description: isAr
      ? "حالة ميزة توقعات التدفق النقدي والأرقام المتاحة حاليًا."
      : "Status of the cash flow forecast and the figures available today.",
  };
}

type Figure = { state: "ok"; value: number } | { state: "denied" } | { state: "error" };

export default async function CashFlowForecastPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const isAr = locale === "ar";

  const user = await getCurrentUser();
  const organization = user ? await getPrimaryOrganization(user.id) : null;
  if (!organization || !user) return null;

  const has = await buildPermissionChecker(
    organization.id,
    ["finance.reports.read", "finance.dues.read", "finance.payments.read", "finance.suppliers.read", ...DASHBOARD_KEYS.cheques],
    user.id,
  );

  if (!has("finance.reports.read")) {
    return (
      <div className="p-8 text-center space-y-3">
        <div className="size-12 mx-auto rounded-2xl bg-amber-50 dark:bg-amber-950/50 flex items-center justify-center text-amber-600">
          <AlertCircle className="size-6" />
        </div>
        <h1 className="text-lg font-bold text-slate-900 dark:text-white">
          {isAr ? "توقعات التدفق النقدي" : "Cash Flow Forecast"}
        </h1>
        <p className="text-xs text-slate-500 max-w-sm mx-auto">
          {isAr ? "لا تملك صلاحية استعراض التقارير المالية." : "You don't have permission to view financial reports."}
        </p>
      </div>
    );
  }

  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);
  const currency = organization.default_currency || "EGP";

  // 1. Cash position: general ledger (get_cash_position is itself guarded by finance.reports.read).
  const cashRes = await supabase.rpc("get_cash_position", { p_organization_id: organization.id, p_as_of_date: today });
  const cash: Figure = cashRes.error ? { state: "error" } : { state: "ok", value: Number(cashRes.data ?? 0) };

  // 2. Open receivables: dues minus allocations of POSTED payments. Needs BOTH tables, otherwise it would
  //    silently overstate what is owed.
  let receivables: Figure = { state: "denied" };
  let overdueReceivables: Figure = { state: "denied" };
  if (has("finance.dues.read") && has("finance.payments.read")) {
    const [dues, allocations, payments] = await Promise.all([
      supabase
        .from("dues")
        .select("id, amount, due_date, status")
        .eq("organization_id", organization.id)
        .in("status", ["ISSUED", "PARTIALLY_PAID", "OVERDUE"]),
      supabase.from("effective_payment_allocations").select("due_id, amount, payment_id"),
      supabase.from("payments").select("id").eq("organization_id", organization.id).eq("status", "POSTED"),
    ]);
    if (dues.error || allocations.error || payments.error) {
      receivables = { state: "error" };
      overdueReceivables = { state: "error" };
    } else {
      const posted = new Set((payments.data ?? []).map((p) => p.id));
      const paid = new Map<string, number>();
      for (const a of allocations.data ?? []) {
        if (!posted.has(a.payment_id)) continue;
        paid.set(a.due_id, (paid.get(a.due_id) ?? 0) + Number(a.amount));
      }
      let open = 0;
      let overdue = 0;
      for (const d of dues.data ?? []) {
        const remaining = Math.max(0, Number(d.amount) - (paid.get(d.id) ?? 0));
        open += remaining;
        if (d.due_date < today) overdue += remaining;
      }
      receivables = { state: "ok", value: open };
      overdueReceivables = { state: "ok", value: overdue };
    }
  }

  // 3. Cheques in hand (received or deposited, not yet cleared). Shown on their own: NOT added to receivables.
  let chequesInHand: Figure = { state: "denied" };
  if (DASHBOARD_KEYS.cheques.some((k) => has(k))) {
    const res = await supabase
      .from("cheques")
      .select("amount")
      .eq("organization_id", organization.id)
      .eq("direction", "INCOMING")
      .in("status", ["RECEIVED", "DEPOSITED"]);
    chequesInHand = res.error ? { state: "error" } : { state: "ok", value: (res.data ?? []).reduce((s, c) => s + Number(c.amount), 0) };
  }

  // 4. Supplier invoices still payable.
  let payables: Figure = { state: "denied" };
  if (has("finance.suppliers.read")) {
    const [invoices, allocations] = await Promise.all([
      supabase.from("supplier_invoices").select("id, amount").eq("organization_id", organization.id).in("status", ["POSTED", "PARTIALLY_PAID"]),
      supabase.from("supplier_payment_allocations").select("invoice_id, amount, reversed_at"),
    ]);
    if (invoices.error || allocations.error) payables = { state: "error" };
    else {
      const paid = new Map<string, number>();
      for (const a of allocations.data ?? []) {
        if (a.reversed_at) continue;
        paid.set(a.invoice_id, (paid.get(a.invoice_id) ?? 0) + Number(a.amount));
      }
      payables = { state: "ok", value: (invoices.data ?? []).reduce((s, i) => s + Math.max(0, Number(i.amount) - (paid.get(i.id) ?? 0)), 0) };
    }
  }

  const fmt = (n: number) => n.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const cards: { key: string; ar: string; en: string; figure: Figure; noteAr: string; noteEn: string }[] = [
    { key: "cash", ar: "الرصيد النقدي الحالي", en: "Cash position today", figure: cash, noteAr: "من دفتر الأستاذ (حسابات النقدية والبنوك)", noteEn: "From the general ledger (cash and bank accounts)" },
    { key: "receivables", ar: "مستحقات مفتوحة", en: "Open receivables", figure: receivables, noteAr: "المستحقات ناقص المحصّل المرحّل", noteEn: "Open dues minus posted collections" },
    { key: "overdue", ar: "منها متأخرة", en: "Of which overdue", figure: overdueReceivables, noteAr: "تاريخ استحقاقها قبل اليوم", noteEn: "Due date before today" },
    { key: "cheques", ar: "شيكات واردة قيد التحصيل", en: "Incoming cheques in hand", figure: chequesInHand, noteAr: "لا تُضاف إلى المستحقات: الشيك لا يرتبط بالمستحق قبل صرفه", noteEn: "Not added to receivables: a cheque is not linked to its due until it clears" },
    { key: "payables", ar: "فواتير موردين مستحقة", en: "Supplier invoices payable", figure: payables, noteAr: "الفواتير المرحّلة ناقص المسدّد", noteEn: "Posted invoices minus payments" },
  ];

  return (
    <div className="space-y-6 pb-12" data-testid="cash-forecast-status">
      <div>
        <h1 className="text-2xl font-black tracking-tight text-slate-950 dark:text-white">
          {isAr ? "توقعات التدفق النقدي" : "Cash Flow Forecast"}
        </h1>
        <p className="text-xs text-slate-500 mt-1">{organization.name}</p>
      </div>

      <div
        role="status"
        data-testid="forecast-withheld"
        className="flex gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-xs font-medium text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
      >
        <Info className="size-5 shrink-0 text-amber-600" />
        <div className="space-y-1.5">
          <p className="font-extrabold">
            {isAr ? "الإسقاط المستقبلي غير مفعّل بعد" : "The forward projection is not enabled yet"}
          </p>
          <p>
            {isAr
              ? "لا يمكن تقدير رصيد مستقبلي موثوق الآن: الشيك الوارد لا يرتبط بالمستحق الذي سيسدّده قبل صرفه فيُحتسب المبلغ مرتين، وشيكات الصرف الصادرة لا يمكن إصدارها بعد فيكون جانب المدفوعات ناقصًا، والمتأخرات لا تدخل في أي فترة مستقبلية. لذلك لا نعرض رصيدًا متوقعًا ولا مجاميع."
              : "A trustworthy projected balance is not possible yet: an incoming cheque is not linked to the due it will settle until it clears, so the same money would be counted twice; outgoing cheques cannot be issued yet, so the payments side is incomplete; and overdue items fall into no future bucket. So no projected balance or totals are shown."}
          </p>
          <p>
            {isAr ? "الأرقام أدناه دقيقة كلٌّ من مصدرها، ولا يُجمع بينها." : "The figures below are exact from their own sources and are not added together."}
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((c) => (
          <div
            key={c.key}
            data-testid={`forecast-figure-${c.key}`}
            data-state={c.figure.state}
            className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900"
          >
            <p className="text-[11px] font-bold text-slate-500">{isAr ? c.ar : c.en}</p>
            <p className="mt-1 text-xl font-black tabular-nums text-slate-900 dark:text-white">
              {c.figure.state === "ok" ? `${fmt(c.figure.value)} ${currency}` : "—"}
            </p>
            <p className="mt-1 text-[11px] text-slate-500">
              {c.figure.state === "ok"
                ? isAr ? c.noteAr : c.noteEn
                : c.figure.state === "denied"
                  ? isAr ? "غير متاح لصلاحياتك" : "Not available for your permissions"
                  : isAr ? "تعذّر تحميل هذا الرقم" : "Could not load this figure"}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
