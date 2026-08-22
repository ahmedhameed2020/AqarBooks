import { generateStructuredAi } from "./gateway-client";

export type FinancialMetricsInput = {
  currency: string;
  totalDues: number;
  totalCollected: number;
  totalArrears: number;
  collectionRatePct: number;
  occupancyRatePct?: number;
  totalUnits?: number;
  topOverdueBucket?: { label: string; amount: number };
  previousMonthCollectionRatePct?: number;
  periodLabel?: string;
};

export type ExecutiveAiInsight = {
  headline: string;
  healthStatus: "HEALTHY" | "WARNING" | "CRITICAL";
  keyObservations: string[];
  recommendations: string[];
  riskAlert?: string | null;
  generatedAt: string;
};

const SYSTEM_PROMPT = `
You are the Chief Financial Officer (CFO) AI Advisor for AqarBooks Real Estate ERP.
You receive deterministic, verified accounting numbers computed directly by the PostgreSQL database.
Your job is to provide an executive, high-level narrative summary for the property owner/board of directors in professional Arabic (or English if requested).

Rules:
1. NEVER alter, hallucinate, or recalculate the numbers. Always cite the exact amounts provided.
2. Focus on concentrations, collection velocity, variance from prior periods, and actionable steps.
3. Keep the tone executive, concise, and trustworthy.
`;

export async function generateExecutiveFinancialInsight(
  metrics: FinancialMetricsInput,
  locale: string = "ar"
): Promise<ExecutiveAiInsight> {
  const isAr = locale === "ar";

  const prompt = `
Accounting Metrics (Direct from PostgreSQL):
- Currency: ${metrics.currency}
- Total Dues Billed: ${metrics.totalDues.toLocaleString()} ${metrics.currency}
- Total Collected: ${metrics.totalCollected.toLocaleString()} ${metrics.currency}
- Total Arrears Outstanding: ${metrics.totalArrears.toLocaleString()} ${metrics.currency}
- Current Collection Rate: ${metrics.collectionRatePct.toFixed(1)}%
${metrics.previousMonthCollectionRatePct != null ? `- Previous Period Collection Rate: ${metrics.previousMonthCollectionRatePct.toFixed(1)}%` : ""}
${metrics.occupancyRatePct != null ? `- Occupancy Rate: ${metrics.occupancyRatePct.toFixed(1)}%` : ""}
${metrics.topOverdueBucket ? `- Largest Arrears Aging Bucket: ${metrics.topOverdueBucket.label} (${metrics.topOverdueBucket.amount.toLocaleString()} ${metrics.currency})` : ""}
- Period: ${metrics.periodLabel || "Current Month"}

Provide an executive JSON summary formatted as:
{
  "headline": "موجز تنفيذي في سطر واحد يصف الوضع المالي",
  "healthStatus": "HEALTHY | WARNING | CRITICAL",
  "keyObservations": [
    "ملاحظة تحليلية 1",
    "ملاحظة تحليلية 2",
    "ملاحظة تحليلية 3"
  ],
  "recommendations": [
    "توصية إدارية/تحصيلية 1",
    "توصية 2"
  ],
  "riskAlert": "تنبيه مخاطر إن وجد أو null"
}
`;

  // Deterministic fallback if AI is unconfigured or slow
  const delta = metrics.previousMonthCollectionRatePct != null 
    ? metrics.collectionRatePct - metrics.previousMonthCollectionRatePct 
    : 0;
  
  const fallbackHealth: "HEALTHY" | "WARNING" | "CRITICAL" = 
    metrics.collectionRatePct >= 80 ? "HEALTHY" : metrics.collectionRatePct >= 50 ? "WARNING" : "CRITICAL";

  const fallbackHeadline = isAr
    ? `معدل التحصيل المالي بلغ ${metrics.collectionRatePct.toFixed(1)}% بإجمالي متأخرات قائمة ${metrics.totalArrears.toLocaleString()} ${metrics.currency}`
    : `Collection rate reached ${metrics.collectionRatePct.toFixed(1)}% with outstanding arrears of ${metrics.totalArrears.toLocaleString()} ${metrics.currency}`;

  const fallbackObservations = isAr ? [
    `تم تحصيل ${metrics.totalCollected.toLocaleString()} ${metrics.currency} من إجمالي مطالبات بلغت ${metrics.totalDues.toLocaleString()} ${metrics.currency}.`,
    metrics.topOverdueBucket ? `تتركز أعلى المتأخرات في فئة (${metrics.topOverdueBucket.label}) بقيمة ${metrics.topOverdueBucket.amount.toLocaleString()} ${metrics.currency}.` : `إجمالي رصيد الذمم القائمة يبلغ ${metrics.totalArrears.toLocaleString()} ${metrics.currency}.`,
    delta >= 0 ? `تحسن في وتيرة التحصيل مقارنة بالفترة السابقة بمقدار +${delta.toFixed(1)}%.` : `انخفاض في نسبة التحصيل بمقدار ${Math.abs(delta).toFixed(1)}%.`,
  ] : [
    `Collected ${metrics.totalCollected.toLocaleString()} ${metrics.currency} out of ${metrics.totalDues.toLocaleString()} ${metrics.currency} billed.`,
    `Outstanding arrears stand at ${metrics.totalArrears.toLocaleString()} ${metrics.currency}.`,
  ];

  const fallbackRecommendations = isAr ? [
    "تفعيل إرسال إشعارات التذكير عبر الواتساب للوحدات المتأخرة أكثر من 30 يوماً.",
    "مراجعة حسابات كبار المدينين وجدولة خطط السداد أو التسوية.",
  ] : [
    "Send automated WhatsApp dunning notices to accounts overdue > 30 days.",
    "Review top debtor accounts for payment arrangements.",
  ];

  const aiResult = await generateStructuredAi<ExecutiveAiInsight>({
    systemPrompt: SYSTEM_PROMPT,
    prompt,
    taskType: "FINANCIAL_NARRATIVE",
    modelTier: "reasoning",
    temperature: 0.15,
  });

  if (aiResult.success && aiResult.data?.headline) {
    return {
      headline: aiResult.data.headline,
      healthStatus: aiResult.data.healthStatus || fallbackHealth,
      keyObservations: aiResult.data.keyObservations?.length ? aiResult.data.keyObservations : fallbackObservations,
      recommendations: aiResult.data.recommendations?.length ? aiResult.data.recommendations : fallbackRecommendations,
      riskAlert: aiResult.data.riskAlert || null,
      generatedAt: new Date().toISOString(),
    };
  }

  return {
    headline: fallbackHeadline,
    healthStatus: fallbackHealth,
    keyObservations: fallbackObservations,
    recommendations: fallbackRecommendations,
    riskAlert: metrics.collectionRatePct < 50 ? (isAr ? "تحذير: معدل التحصيل أقل من 50% مما قد يؤثر على تدفقات الصيانة التشغيلية." : "Warning: Collection rate is below 50%.") : null,
    generatedAt: new Date().toISOString(),
  };
}
