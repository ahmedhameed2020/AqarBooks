import { setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPortalMemberContext } from "@/lib/auth/portal-member";
import { Money } from "@/components/money";
import type { Locale } from "@/i18n/routing";

// Row shapes for the embedded units(code) join -- lib/supabase/types.ts is
// hand-maintained with empty Relationships arrays, so the typed client can't
// express this embed cleanly. Mirrors the DueDbRow pattern used on
// /finance/dues (app/[locale]/(app)/finance/dues/page.tsx).
type DueDbRow = {
  id: string;
  amount: number;
  issue_date: string;
  due_date: string;
  description: string | null;
  status: string;
  units: { code: string } | null;
};

type PaymentDbRow = {
  id: string;
  amount: number;
  payment_date: string;
  method: string;
  receipt_no: string | null;
  receipt_number: number | null;
};

export default async function PortalStatementPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const isAr = locale === "ar";

  const supabase = await createClient();
  const ctx = await getPortalMemberContext();
  if (ctx.status !== "ok") redirect("/portal/login");

  const { member } = ctx;

  // RLS (Task 10) already restricts these to the member's own rows -- the
  // explicit .eq() on payments below is defense in depth, not the actual
  // boundary. dues has no member_id column; its RLS scoping goes through the
  // unit-ownership chain instead, so there is no equivalent .eq() to add here.
  const [{ data: duesData, error: duesError }, { data: paymentsData, error: paymentsError }] = await Promise.all([
    supabase
      .from("dues")
      .select("id, amount, issue_date, due_date, description, status, units(code)")
      .order("issue_date", { ascending: false }),
    supabase
      .from("payments")
      .select("id, amount, payment_date, method, receipt_no, receipt_number")
      .eq("member_id", member.id)
      .order("payment_date", { ascending: false }),
  ]);
  if (duesError) console.error("[PortalStatementPage] dues query failed:", duesError.message);
  if (paymentsError) console.error("[PortalStatementPage] payments query failed:", paymentsError.message);

  const allDues = (duesData ?? []) as unknown as DueDbRow[];
  const payments = (paymentsData ?? []) as unknown as PaymentDbRow[];

  // dues_select_own (Task 10) is intentionally full-history and does not
  // filter status -- VOID'd dues are visible alongside live ones. A voided
  // due was never a real obligation, so it must not count toward the total
  // or appear as a debit in the movements list. PAID/ISSUED/OVERDUE/
  // PARTIALLY_PAID/DRAFT dues are all real obligations and stay included.
  const dues = allDues.filter((d) => d.status !== "VOID");

  const totalDue = dues.reduce((sum, d) => sum + Number(d.amount), 0);
  const totalPaid = payments.reduce((sum, p) => sum + Number(p.amount), 0);
  const balance = totalDue - totalPaid;

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-bold text-foreground">{isAr ? "كشف الحساب" : "Account Statement"}</h1>
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-2xl border border-border bg-background p-4">
          <p className="text-xs text-muted-foreground">{isAr ? "إجمالي المستحق" : "Total Due"}</p>
          <Money amount={totalDue} locale={locale} className="text-lg font-bold" />
        </div>
        <div className="rounded-2xl border border-border bg-background p-4">
          <p className="text-xs text-muted-foreground">{isAr ? "إجمالي المدفوع" : "Total Paid"}</p>
          <Money amount={totalPaid} locale={locale} className="text-lg font-bold" />
        </div>
        <div className="rounded-2xl border border-primary/30 bg-primary/10 p-4">
          <p className="text-xs font-bold text-primary">{isAr ? "الرصيد الحالي" : "Current Balance"}</p>
          <Money amount={balance} locale={locale} tone="auto" className="text-lg font-bold" />
        </div>
      </div>
      <div className="rounded-2xl border border-border bg-background p-4">
        <h2 className="mb-3 text-sm font-bold text-foreground">{isAr ? "الحركات" : "Movements"}</h2>
        <ul className="divide-y divide-border text-sm">
          {dues.map((d) => (
            <li key={d.id} className="flex justify-between py-2">
              <span>
                {d.description ?? (isAr ? "استحقاق" : "Due")} — {d.units?.code ?? "-"}
              </span>
              <Money amount={Number(d.amount)} locale={locale} tone="negative" />
            </li>
          ))}
          {payments.map((p) => (
            <li key={p.id} className="flex justify-between py-2">
              <span>
                {isAr ? "دفعة" : "Payment"} #{p.receipt_no || (p.receipt_number ? `REC-${p.receipt_number}` : "-")}
              </span>
              <Money amount={-Number(p.amount)} locale={locale} tone="positive" />
            </li>
          ))}
          {dues.length === 0 && payments.length === 0 && (
            <li className="py-2 text-muted-foreground">{isAr ? "لا توجد حركات" : "No movements"}</li>
          )}
        </ul>
      </div>
    </div>
  );
}
