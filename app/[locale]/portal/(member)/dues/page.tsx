import { setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPortalMemberContext } from "@/lib/auth/portal-member";
import { Badge } from "@/components/ui/badge";
import { Money } from "@/components/money";
import type { Locale } from "@/i18n/routing";

// Row shape for the embedded units(code) join -- lib/supabase/types.ts is
// hand-maintained with empty Relationships arrays, so the typed client can't
// express this embed cleanly. Mirrors the DueDbRow pattern used on
// /finance/dues and /portal/statement.
type DueDbRow = {
  id: string;
  amount: number;
  issue_date: string;
  due_date: string;
  description: string | null;
  status: string;
  units: { code: string } | null;
};

const STATUS_LABELS: Record<string, { ar: string; en: string }> = {
  ISSUED: { ar: "مستحق", en: "Issued" },
  PARTIALLY_PAID: { ar: "مدفوع جزئيًا", en: "Partially paid" },
  OVERDUE: { ar: "متأخر", en: "Overdue" },
};

export default async function PortalDuesPage({
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

  // dues_select_own is intentionally full-history with no status filter at
  // the RLS layer (see /portal/statement) -- this allowlist is what keeps
  // VOID'd (and DRAFT/PAID) dues out of the "open dues" list. It mirrors the
  // current dues status check constraint (DRAFT, ISSUED, PARTIALLY_PAID,
  // PAID, OVERDUE, VOID) -- ISSUED/PARTIALLY_PAID/OVERDUE are the "open"
  // (still owed) statuses.
  const { data: duesData } = await supabase
    .from("dues")
    .select("id, amount, issue_date, due_date, description, status, units(code)")
    .in("status", ["ISSUED", "PARTIALLY_PAID", "OVERDUE"])
    .order("due_date", { ascending: true });

  const dues = (duesData ?? []) as unknown as DueDbRow[];
  const totalOpen = dues.reduce((sum, d) => sum + Number(d.amount), 0);

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold text-foreground">{isAr ? "المستحقات" : "Dues"}</h1>
      <p className="text-xs text-muted-foreground">
        {isAr
          ? "الدفع الإلكتروني غير متاح بعد — سيُضاف قريبًا."
          : "Online payment is not available yet — coming soon."}
      </p>
      {dues.length > 0 && (
        <div className="rounded-2xl border border-primary/30 bg-primary/10 p-4 w-fit">
          <p className="text-xs font-bold text-primary">{isAr ? "إجمالي المستحقات المفتوحة" : "Total Open Dues"}</p>
          <Money amount={totalOpen} locale={locale} className="text-lg font-bold" />
        </div>
      )}
      <div className="rounded-2xl border border-border bg-background divide-y divide-border">
        {dues.length === 0 && (
          <p className="p-4 text-sm text-muted-foreground">{isAr ? "لا توجد مستحقات مفتوحة." : "No open dues."}</p>
        )}
        {dues.map((d) => {
          const statusLabel = STATUS_LABELS[d.status];
          return (
            <div key={d.id} className="flex items-center justify-between p-4">
              <div>
                <p className="text-sm font-medium text-foreground">
                  {d.description ?? (isAr ? "استحقاق" : "Due")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {d.units?.code ?? "-"} · {isAr ? "الاستحقاق" : "Due"} {d.due_date}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Badge variant="outline">{statusLabel ? (isAr ? statusLabel.ar : statusLabel.en) : d.status}</Badge>
                <Money amount={Number(d.amount)} locale={locale} className="font-bold" />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
