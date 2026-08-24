import { Sparkles, AlertTriangle, CheckCircle2, FileText, ArrowRightLeft, ShieldCheck } from "lucide-react";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { Badge } from "@/components/ui/badge";

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
        icon: <CheckCircle2 className="size-4.5 text-emerald-600 dark:text-emerald-400" />,
        title: isAr ? "تحصيل مالي ممتاز" : "Excellent Collection Rate",
        description: isAr
          ? `نسبة التحصيل بلغت ${collectionRate}% وهو أداء قوي يشير إلى انضباط التدفقات النقدية.`
          : `Collection rate reached ${collectionRate}%, indicating robust cash flow stability.`,
      });
    } else if (collectionRate < 70) {
      insights.push({
        type: "warning",
        icon: <AlertTriangle className="size-4.5 text-amber-600 dark:text-amber-400" />,
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
      icon: <AlertTriangle className="size-4.5 text-rose-600 dark:text-rose-400" />,
      title: isAr ? `${overdueCount} مستحقات متأخرة الدفع` : `${overdueCount} Overdue Payments`,
      description: isAr
        ? `توجد مبالغ متأخرة بقيمة إجمالية ${overdueAmount.toLocaleString(locale)} ${currency}. تتطلب تذكير الملاك.`
        : `Totaling ${overdueAmount.toLocaleString(locale)} ${currency} overdue. Action needed to follow up with members.`,
      actionLabel: isAr ? "متابعة الأعمار" : "Aging report",
      actionHref: "/finance/reports",
    });
  }

  // Insight 3: Pending Approvals Queue
  if (unpostedCount > 0) {
    insights.push({
      type: "info",
      icon: <FileText className="size-4.5 text-blue-600 dark:text-blue-400" />,
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
      icon: <ArrowRightLeft className="size-4.5 text-purple-600 dark:text-purple-400" />,
      title: isAr ? "شيكات قيد الإيداع والتحصيل" : "Pending Cheques for Clearance",
      description: isAr
        ? `يوجد ${outstandingCheques} شيكات بحوزتك جاهزة للإيداع في الحساب البنكي.`
        : `${outstandingCheques} cheques in portfolio ready for bank deposit.`,
      actionLabel: isAr ? "حافظة الشيكات" : "Track cheques",
      actionHref: "/finance/cashier",
    });
  }

  // Fallback if no issues
  if (insights.length === 0) {
    insights.push({
      type: "positive",
      icon: <CheckCircle2 className="size-4.5 text-emerald-600 dark:text-emerald-400" />,
      title: isAr ? "النظام يعمل بكفاءة مكتملة" : "System Operating Smoothly",
      description: isAr
        ? "جميع العمليات المالية متوازنة، والقيود مرحلة بدقة 100% ولا توجد تنبيهات عاجلة."
        : "All financial operations are balanced with zero variance and no pending alerts.",
    });
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border/80 bg-card p-5 shadow-xs motion-surface">
      <div className="flex items-center justify-between border-b border-border/80 pb-3">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-xl bg-[#7e1898] text-white shadow-xs">
            <Sparkles className="size-4.5" />
          </div>
          <div>
            <h3 className="text-sm font-extrabold text-foreground">
              {isAr ? "الملخص التنفيذي والرؤى المباشرة" : "Executive Insights & Financial Digest"}
            </h3>
            <p className="text-xs font-medium text-muted-foreground">
              {isAr ? "تحليل مباشر استناداً لأحدث البيانات المحاسبية المسجلة" : "Real-time analysis based on active financial logs"}
            </p>
          </div>
        </div>
        <Badge variant="ai" className="px-2.5 py-0.5 text-xs font-bold">
          {isAr ? "تحديث مباشر" : "Live Feed"}
        </Badge>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {insights.slice(0, 4).map((item, idx) => (
          <div
            key={idx}
            className="flex items-start gap-3 rounded-xl border border-border/80 bg-background p-4 shadow-xs transition-colors hover:border-primary/40"
          >
            <div className="mt-0.5 shrink-0">{item.icon}</div>
            <div className="min-w-0 flex-1">
              <h4 className="text-xs font-bold text-foreground">{item.title}</h4>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{item.description}</p>
              {item.actionHref && (
                <Link
                  href={item.actionHref}
                  locale={locale}
                  className="mt-2 inline-flex items-center text-xs font-bold text-primary hover:underline"
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
