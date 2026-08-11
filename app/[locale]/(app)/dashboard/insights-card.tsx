import { Sparkles, AlertTriangle, CheckCircle2, FileText, ArrowRightLeft } from "lucide-react";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";

interface InsightsCardProps {
  collectionRate: number | null;
  overdueCount: number;
  overdueAmount: number;
  unpostedCount: number;
  outstandingCheques: number;
  surplus: number;
  currency: string;
  locale: Locale;
}

export function InsightsCard({
  collectionRate,
  overdueCount,
  overdueAmount,
  unpostedCount,
  outstandingCheques,
  surplus,
  currency,
  locale,
}: InsightsCardProps) {
  const isAr = locale === "ar";

  const insights: {
    type: "positive" | "warning" | "info" | "neutral";
    icon: React.ReactNode;
    title: string;
    description: string;
    actionLabel?: string;
    actionHref?: string;
  }[] = [];

  // Insight 1: Collection Rate Analysis
  if (collectionRate !== null) {
    if (collectionRate >= 85) {
      insights.push({
        type: "positive",
        icon: <CheckCircle2 className="size-4 text-emerald-500" />,
        title: isAr ? "تحصيل مالي ممتاز" : "Excellent Collection Rate",
        description: isAr
          ? `نسبة التحصيل بلغت ${collectionRate}% وهو أداء قوي يشير إلى انضباط التدفقات النقدية.`
          : `Collection rate reached ${collectionRate}%, indicating robust cash flow stability.`,
      });
    } else if (collectionRate < 70) {
      insights.push({
        type: "warning",
        icon: <AlertTriangle className="size-4 text-amber-500" />,
        title: isAr ? "تحذير: تدفقات بحاجة إلى متابعة" : "Warning: Low Collection Rate",
        description: isAr
          ? `نسبة التحصيل الحالية ${collectionRate}% أقل من النسبة المستهدفة (80%).`
          : `Current collection rate at ${collectionRate}% is below the target benchmark (80%).`,
        actionLabel: isAr ? "عرض المستحقات" : "View dues",
        actionHref: "/finance/dues",
      });
    }
  }

  // Insight 2: Overdue Dues Attention
  if (overdueCount > 0) {
    insights.push({
      type: "warning",
      icon: <AlertTriangle className="size-4 text-rose-500" />,
      title: isAr ? `${overdueCount} مستحقات متأخرة الدفع` : `${overdueCount} Overdue Payments`,
      description: isAr
        ? `توجد مبالغ متأخرة بقيمة إجمالية ${overdueAmount.toLocaleString(locale)} ${currency}. تتطلب تذكير الملاك.`
        : `Totaling ${overdueAmount.toLocaleString(locale)} ${currency} overdue. Action needed to follow up with members.`,
      actionLabel: isAr ? "متابعة الأعمار" : "Aging report",
      actionHref: "/finance/reports/aging",
    });
  }

  // Insight 3: Pending Approvals Queue
  if (unpostedCount > 0) {
    insights.push({
      type: "info",
      icon: <FileText className="size-4 text-blue-500" />,
      title: isAr ? "قيود بانتظار الاعتماد والترحيل" : "Unposted Journal Entries",
      description: isAr
        ? `لديك ${unpostedCount} قيد محاسبي مسودة تحتاج لمراجعتك لاعتمادها في الدفاتر.`
        : `${unpostedCount} draft journal entries are awaiting review and posting.`,
      actionLabel: isAr ? "مراجعة القيود" : "Review entries",
      actionHref: "/finance/journals",
    });
  }

  // Insight 4: Pending Cheques Clearance
  if (outstandingCheques > 0) {
    insights.push({
      type: "neutral",
      icon: <ArrowRightLeft className="size-4 text-indigo-500" />,
      title: isAr ? "شيكات قيد الإيداع والتحصيل" : "Pending Cheques for Clearance",
      description: isAr
        ? `يوجد ${outstandingCheques} شيكات بحوزتك جاهزة للإيداع في الحساب البنكي.`
        : `${outstandingCheques} cheques in portfolio ready for bank deposit.`,
      actionLabel: isAr ? "حفظ وتتبع الشيكات" : "Track cheques",
      actionHref: "/finance/payments",
    });
  }

  // Fallback if no issues
  if (insights.length === 0) {
    insights.push({
      type: "positive",
      icon: <CheckCircle2 className="size-4 text-emerald-500" />,
      title: isAr ? "النظام يعمل بكفاءة مكتملة" : "System Operating Smoothly",
      description: isAr
        ? "جميع العمليات المالية متوازنة، ولا توجد تنبيهات عاجلة تتطلب التدخل."
        : "All financial operations are balanced with no urgent alerts required.",
    });
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/5 via-card to-card p-5 shadow-sm">
      <div className="flex items-center justify-between border-b border-border/50 pb-3">
        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Sparkles className="size-4 animate-pulse-subtle" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              {isAr ? "الملخص التنفيذي والرؤى المباشرة" : "Executive Insights & Financial Digest"}
            </h3>
            <p className="text-[11px] text-muted-foreground">
              {isAr ? "تحليل مباشر استناداً لأحدث البيانات المالية" : "Real-time analysis based on active financial logs"}
            </p>
          </div>
        </div>
        <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-medium text-primary">
          {isAr ? "تحديث تلقائي" : "Live Feed"}
        </span>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {insights.slice(0, 4).map((item, idx) => (
          <div
            key={idx}
            className="flex items-start gap-3 rounded-xl border border-border/40 bg-card/60 p-3.5 backdrop-blur-sm transition-all hover:bg-card hover:shadow-xs"
          >
            <div className="mt-0.5 shrink-0">{item.icon}</div>
            <div className="min-w-0 flex-1">
              <h4 className="text-xs font-semibold text-foreground">{item.title}</h4>
              <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{item.description}</p>
              {item.actionHref && (
                <Link
                  href={item.actionHref}
                  locale={locale}
                  className="mt-2 inline-flex items-center text-[11px] font-medium text-primary hover:underline"
                >
                  {item.actionLabel} →
                </Link>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
