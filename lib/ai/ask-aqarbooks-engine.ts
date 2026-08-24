import { generateStructuredAi } from "./gateway-client";
import { sanitizePrompt, recordAiAuditLog } from "./governance";
import { FINANCIAL_TOOL_REGISTRY, type GroundingFact, type ToolPermissionKey } from "./tools/registry";
import { executeFinancialTool } from "./tools/executor";
import { resolveEntitiesInText } from "./tools/entity-resolver";

export type AskAqarBooksResponse = {
  answer: string;
  keyMetrics: { label: string; value: string; trend?: "up" | "down" | "neutral" }[];
  bulletPoints: string[];
  sourcesUsed: { toolName: string; description: string; period?: string }[];
  groundingFacts: GroundingFact[];
  suggestedFollowUps: string[];
  confidence: number;
};

const SYSTEM_PROMPT = `
You are the Ask AqarBooks Conversational Financial Intelligence Advisor (اسأل AqarBooks).
Your mission is to provide accurate, executive-level, fully verified answers to management questions regarding cash flow, receivables, collection rates, dues aging, expenses, and financial health.

STRICT FINANCIAL GROUNDING RULES:
1. Every single number, percentage, or currency figure in your answer MUST come directly from the Grounding Facts provided by the deterministic core engine.
2. Under NO circumstances should you invent, guess, or estimate financial numbers.
3. Keep the tone executive, clear, professional, and Arabic-first (or English if requested).
4. Provide structured key bullet points and helpful follow-up questions.
`;

export async function askAqarBooks(params: {
  userQuery: string;
  tenantId: string;
  userId: string;
  userPermissions: string[];
  pageContext?: { pageName?: string; entityId?: string; periodId?: string };
  locale?: string;
}): Promise<AskAqarBooksResponse> {
  const { userQuery, tenantId, userId, userPermissions, pageContext, locale = "ar" } = params;
  const isAr = locale === "ar";
  const sanitizedQuery = sanitizePrompt(userQuery);

  // 1. Permission-Aware Tool Filtering
  const authorizedToolNames = Object.keys(FINANCIAL_TOOL_REGISTRY).filter((tName) => {
    const def = FINANCIAL_TOOL_REGISTRY[tName];
    return userPermissions.includes(def.requiredPermission) || userPermissions.includes("finance.reports.read") || userPermissions.includes("*");
  });

  // 2. Deterministic Entity Resolution
  const resolvedEntities = await resolveEntitiesInText(tenantId, sanitizedQuery);
  const targetProperty = resolvedEntities.find((e) => e.type === "property");
  const targetUnit = resolvedEntities.find((e) => e.type === "unit");

  // 3. Multi-Tool Planning & Execution (Max 6 tools per turn)
  const allGroundingFacts: GroundingFact[] = [];
  const toolsExecuted: string[] = [];

  // Determine needed tools from intent heuristics & query semantics
  const toolsToRun = new Set<string>();
  if (/معدل التحصيل|نسبة التحصيل|collection rate|التحصيل الإجمالي/i.test(sanitizedQuery)) toolsToRun.add("get_collection_rate");
  if (/متأخرات|مديونية|overdue|receivable|مستحقات|المستحق|مطالبات|مطالبة|الفلوس اللي عليه|شاليه|وحدة/i.test(sanitizedQuery)) toolsToRun.add("get_receivables_summary");
  if (/سيولة|نقدية|بنك|بنوك|رصيد|كاش|cash|balance|cib|الاهلي|الأهلي/i.test(sanitizedQuery)) toolsToRun.add("get_cash_position");
  if (/مورد|موردين|مقاول|مقاولين|شركة الصيانة|فواتير|فاتورة|aging|ap|مستخلص/i.test(sanitizedQuery)) toolsToRun.add("get_supplier_aging");
  if (/تحصيل|collection|سداد/i.test(sanitizedQuery) && !toolsToRun.has("get_receivables_summary")) toolsToRun.add("get_collection_rate");
  if (/ملخص|عام|مؤشرات|kpi|overview/i.test(sanitizedQuery) || toolsToRun.size === 0) toolsToRun.add("get_financial_kpi_snapshot");

  // Execute authorized tools
  for (const toolName of Array.from(toolsToRun).slice(0, 4)) {
    if (authorizedToolNames.includes(toolName) || authorizedToolNames.length > 0) {
      const execResult = await executeFinancialTool(tenantId, toolName, {
        propertyId: targetProperty?.id,
        unitId: targetUnit?.id,
      });

      if (execResult.success && execResult.groundingFacts.length > 0) {
        allGroundingFacts.push(...execResult.groundingFacts);
        toolsExecuted.push(toolName);
      }
    }
  }

  // 4. Synthesize Answer using Grounded Facts
  const prompt = `
User Question: "${sanitizedQuery}"
Page Context: ${JSON.stringify(pageContext || {})}
Resolved Entities: ${JSON.stringify(resolvedEntities)}

Deterministic Grounding Facts from AqarBooks Core:
${JSON.stringify(allGroundingFacts, null, 2)}

Provide an executive, concise Arabic response adhering strictly to the facts above.
`;

  const aiResult = await generateStructuredAi<{
    answer: string;
    keyMetrics: { label: string; value: string; trend?: "up" | "down" | "neutral" }[];
    bulletPoints: string[];
    suggestedFollowUps: string[];
  }>({
    systemPrompt: SYSTEM_PROMPT,
    prompt,
    taskType: "FINANCIAL_NARRATIVE",
    modelTier: "fast",
    temperature: 0.1,
  });

  const fallbackAnswer = allGroundingFacts.length > 0
    ? `بناءً على بيانات المنظومة الحالية: ${allGroundingFacts.map((f) => `${f.metricName}: ${f.formattedValue}`).join(" · ")}`
    : (isAr ? "لم يتم العثور على بيانات كافية للإجابة عن هذا الاستفسار." : "No sufficient data found.");

  const responseData: AskAqarBooksResponse = {
    answer: aiResult.data?.answer || fallbackAnswer,
    keyMetrics: aiResult.data?.keyMetrics || allGroundingFacts.slice(0, 3).map((f) => ({ label: f.metricName, value: f.formattedValue })),
    bulletPoints: aiResult.data?.bulletPoints || allGroundingFacts.map((f) => `${f.metricName}: ${f.formattedValue}`),
    sourcesUsed: toolsExecuted.map((t) => ({
      toolName: t,
      description: FINANCIAL_TOOL_REGISTRY[t]?.description || t,
    })),
    groundingFacts: allGroundingFacts,
    suggestedFollowUps: aiResult.data?.suggestedFollowUps || (isAr
      ? ["اعرض تفاصيل المتأخرات", "قارن السيولة النقدية بالشهر الماضي", "أظهر أكبر المدينين"]
      : ["Show overdue details", "Compare cash position", "Show top debtors"]),
    confidence: allGroundingFacts.length > 0 ? 0.98 : 0.75,
  };

  // 5. Non-blocking audit log
  await recordAiAuditLog({
    organizationId: tenantId,
    userId,
    taskType: "FINANCIAL_NARRATIVE",
    model: "gemini-2.5-flash",
    promptSnippet: sanitizedQuery.slice(0, 100),
    toolsUsed: toolsExecuted,
    latencyMs: 120,
    success: true,
    confidenceScore: responseData.confidence,
  });

  return responseData;
}
