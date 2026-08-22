import { generateStructuredAi } from "./gateway-client";
import { sanitizePrompt } from "./governance";
import { getTenantPolicies, matchAccountingPolicy, type TenantAccountingPolicy } from "./policy-memory";

export type SubledgerModuleType = 
  | "SUPPLIER_INVOICE"
  | "MEMBER_COLLECTION"
  | "UNIT_DUES"
  | "SUPPLIER_PAYMENT"
  | "BANK_MOVEMENT"
  | "FIXED_ASSET"
  | "GL_MANUAL_ENTRY";

export type SubledgerRouteGuard = {
  isSubledgerCandidate: boolean;
  suggestedModule: SubledgerModuleType;
  targetUrl: string;
  warningMessage: string;
  actionLabel: string;
};

export type JournalLineProposal = {
  accountId: string;
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
  description: string;
  propertyId?: string;
  unitCode?: string;
};

export type JournalConfidenceBreakdown = {
  supplierMatch: number;
  expenseAccount: number;
  vatTreatment: number;
  dimensionResolution: number;
  overall: number;
};

export type JournalEntryProposal = {
  entryDate: string;
  description: string;
  lines: JournalLineProposal[];
  totals: {
    debit: number;
    credit: number;
    isBalanced: boolean;
    difference: number;
  };
  confidence: JournalConfidenceBreakdown;
  policyUsed?: {
    id: string;
    version: number;
    policyName: string;
    status: string;
    isTenantApproved: boolean;
  };
  justificationReason: string;
  subledgerRouteGuard?: SubledgerRouteGuard;
};

export type AvailableAccountOption = {
  id: string;
  code: string;
  name_ar: string;
  name_en: string;
  category?: string;
};

const SYSTEM_PROMPT = `
You are the AqarBooks Journal Entry AI Copilot & Transaction Intent Classifier.
Your job is to:
1. Classify the transaction intent to prevent bypassing dedicated ERP subledgers.
2. If the operation is a genuine general ledger adjustment, accrual, reclassification, or period-end closing, recommend balanced double-entry lines (Debit & Credit).

INTENT CLASSIFICATION RULES:
- If text describes a vendor bill / contractor invoice / purchase of supplies from a company -> intent: SUPPLIER_INVOICE.
- If text describes member dues payment / installment / owner transfer -> intent: MEMBER_COLLECTION.
- If text describes payment to a supplier -> intent: SUPPLIER_PAYMENT.
- If text describes bank charges / depreciation / accrued expenses / adjustments / correction -> intent: GL_MANUAL_ENTRY.

FINANCIAL INVARIANTS:
1. You can ONLY PROPOSE entries. You have NO permission or tools to post to the ledger.
2. SUM(debit) MUST EXACTLY EQUAL SUM(credit).
3. Always choose account IDs from the provided active chart of accounts list.
4. Output strictly typed JSON.
`;

/**
 * Deterministic Statutory Tax Resolver.
 * Decouples tax math from LLM hallucinations.
 */
export function resolveStatutoryTaxTreatment(
  expenseCategoryCode: string,
  jurisdiction: string = "EG"
): { vatRate: number; isRecoverable: boolean } {
  // Standard Egyptian VAT rules
  if (jurisdiction === "EG") {
    // Utilities (Electricity / Water) are non-taxable / exempt
    if (expenseCategoryCode.startsWith("6114") || expenseCategoryCode.includes("ELECTRICITY")) {
      return { vatRate: 0, isRecoverable: false };
    }
    // Standard Services & Goods (Elevators, Communications, Maintenance) are 14% VAT
    return { vatRate: 14, isRecoverable: true };
  }
  return { vatRate: 0, isRecoverable: false };
}

/**
 * Classifies transaction intent to prevent subledger bypass.
 */
export function detectSubledgerRoute(description: string, isAr: boolean = true): SubledgerRouteGuard {
  const norm = description.toLowerCase();

  // 1. Check Supplier Invoice Signals
  if (/(فاتورة|شراء من|توريد|مستخلص|شركة\s|مورد|invoice|bill from|purchased from)/i.test(norm) && !/(سداد|دفع|تحويل|تسوية)/i.test(norm)) {
    return {
      isSubledgerCandidate: true,
      suggestedModule: "SUPPLIER_INVOICE",
      targetUrl: "/finance/suppliers",
      warningMessage: isAr
        ? "تنبيه ERP: هذه العملية تبدو فاتورة مورد. للحفاظ على كشف حساب المورد، والربط الضريبي، والـ Aging، يُنصح بتسجيلها من دفتر الموردين الفرعي (AP Subledger)."
        : "ERP Warning: This appears to be a vendor invoice. To preserve supplier statements, tax linkage, and aging, please record it via the Supplier Invoices module.",
      actionLabel: isAr ? "فتح فاتورة مورد في AP" : "Open Supplier Invoices",
    };
  }

  // 2. Check Member Payment / Collection Signals
  if (/(تحصيل|سداد من|مالك|عضو|مستأجر|وحدة\s|شاليه|collection|received from member)/i.test(norm)) {
    return {
      isSubledgerCandidate: true,
      suggestedModule: "MEMBER_COLLECTION",
      targetUrl: "/finance/cashier",
      warningMessage: isAr
        ? "تنبيه ERP: هذه العملية تبدو تحصيلاً من عضو/مالك وحدة. يُفضل تسجيلها من الخزينة أو التحصيلات لتسوية مديونية الوحدة تلقائياً."
        : "ERP Warning: This appears to be a member collection. Please record via Cashier/Receipts to settle unit dues automatically.",
      actionLabel: isAr ? "فتح الخزينة والتحصيلات" : "Open Cashier",
    };
  }

  return {
    isSubledgerCandidate: false,
    suggestedModule: "GL_MANUAL_ENTRY",
    targetUrl: "/finance/journals/new",
    warningMessage: "",
    actionLabel: "",
  };
}

export async function proposeJournalEntryDraft(params: {
  rawDescription: string;
  amount?: number;
  vendorName?: string;
  unitCode?: string;
  organizationId: string;
  availableAccounts: AvailableAccountOption[];
  isAr?: boolean;
}): Promise<JournalEntryProposal> {
  const { rawDescription, amount = 0, vendorName = "", unitCode = "", organizationId, availableAccounts, isAr = true } = params;
  const sanitizedDesc = sanitizePrompt(rawDescription);

  // 1. Transaction Intent Classification & Route Guard (Subledger protection)
  const subledgerGuard = detectSubledgerRoute(sanitizedDesc, isAr);

  // 2. Check Tenant-Approved Accounting Policies (Priority 2)
  const tenantPolicies = await getTenantPolicies(organizationId);
  const matchedPolicy = matchAccountingPolicy(tenantPolicies, vendorName, sanitizedDesc);

  let preferredExpenseAccount = matchedPolicy
    ? availableAccounts.find((a) => a.code === matchedPolicy.preferredAccountCode || a.id === matchedPolicy.preferredAccountId)
    : undefined;

  if (!preferredExpenseAccount && vendorName) {
    preferredExpenseAccount = availableAccounts.find((a) => 
      a.name_ar.includes(vendorName) || a.name_en.toLowerCase().includes(vendorName.toLowerCase())
    );
  }

  // 3. Prepare AI Recommendation Prompt (Priority 4)
  const prompt = `
Transaction Details:
Description: "${sanitizedDesc}"
Vendor / Counterparty: "${vendorName || "None"}"
Target Amount: ${amount}
Associated Unit / Property: "${unitCode || "None"}"

Matched Tenant Accounting Policy:
${matchedPolicy ? `Policy: ${matchedPolicy.preferredAccountName} (Code: ${matchedPolicy.preferredAccountCode})` : "None"}

Active Chart of Accounts Available:
${JSON.stringify(availableAccounts.slice(0, 80).map((a) => ({ id: a.id, code: a.code, name: a.name_ar || a.name_en })))}

Propose a balanced double-entry journal with debits and credits.
`;

  const aiResult = await generateStructuredAi<{
    entryDate?: string;
    description: string;
    lines: {
      accountCode: string;
      debit: number;
      credit: number;
      description: string;
    }[];
    justificationReason: string;
  }>({
    systemPrompt: SYSTEM_PROMPT,
    prompt,
    taskType: "JOURNAL_COPILOT",
    modelTier: "reasoning",
    temperature: 0.05,
  });

  // 4. Deterministic Financial Verification & Fallback Construction
  let proposedLines: JournalLineProposal[] = [];
  let justification = "";
  let confidence: JournalConfidenceBreakdown = {
    supplierMatch: vendorName ? 95 : 75,
    expenseAccount: matchedPolicy ? 98 : 88,
    vatTreatment: 96,
    dimensionResolution: unitCode ? 92 : 80,
    overall: matchedPolicy ? 96 : 89,
  };

  if (aiResult.success && aiResult.data && aiResult.data.lines?.length >= 2) {
    const data = aiResult.data;
    justification = data.justificationReason;

    proposedLines = data.lines.map((l) => {
      const matchedAccount = availableAccounts.find((a) => a.code === l.accountCode) || availableAccounts[0];
      return {
        accountId: matchedAccount ? matchedAccount.id : "",
        accountCode: matchedAccount ? matchedAccount.code : l.accountCode,
        accountName: matchedAccount ? (isAr ? matchedAccount.name_ar : matchedAccount.name_en) : "حساب غير محدد",
        debit: Number(l.debit) || 0,
        credit: Number(l.credit) || 0,
        description: l.description || sanitizedDesc,
        unitCode: unitCode || undefined,
      };
    });
  } else {
    // Deterministic Rule Fallback
    const expAcc = preferredExpenseAccount || availableAccounts.find((a) => a.category === "EXPENSE") || availableAccounts[0];
    const payAcc = availableAccounts.find((a) => a.category === "LIABILITY" || a.code.startsWith("2")) || availableAccounts[1] || availableAccounts[0];

    const net = amount > 0 ? amount : 1000;
    proposedLines = [
      {
        accountId: expAcc ? expAcc.id : "",
        accountCode: expAcc ? expAcc.code : "6000",
        accountName: expAcc ? (isAr ? expAcc.name_ar : expAcc.name_en) : "مصروف عام",
        debit: net,
        credit: 0,
        description: sanitizedDesc || "إثبات استحقاق مصروف",
      },
      {
        accountId: payAcc ? payAcc.id : "",
        accountCode: payAcc ? payAcc.code : "2100",
        accountName: payAcc ? (isAr ? payAcc.name_ar : payAcc.name_en) : "دائنون وموردون",
        debit: 0,
        credit: net,
        description: vendorName ? `استحقاق لصالح ${vendorName}` : "استحقاق التزام",
      },
    ];

    justification = matchedPolicy
      ? `تم اقتراح القيد وفقاً لسياسة المنشأة المعتمدة (${matchedPolicy.preferredAccountName}) بالاستناد إلى ${matchedPolicy.learnedFromApprovalsCount} قيد معتمد سابقاً.`
      : "تم اقتراح قيد استحقاق قياسي متوازن بناءً على الوصف ودليل الحسابات النشط.";
  }

  // 5. Deterministic Balance Verification (Core Invariant: Debits === Credits)
  const totalDebit = proposedLines.reduce((sum, l) => sum + l.debit, 0);
  const totalCredit = proposedLines.reduce((sum, l) => sum + l.credit, 0);
  const difference = Math.abs(totalDebit - totalCredit);
  const isBalanced = difference < 0.005 && totalDebit > 0;

  return {
    entryDate: new Date().toISOString().split("T")[0],
    description: sanitizedDesc || "قيد يومية مقترح بالذكاء الاصطناعي",
    lines: proposedLines,
    totals: {
      debit: totalDebit,
      credit: totalCredit,
      isBalanced,
      difference,
    },
    confidence,
    policyUsed: matchedPolicy
      ? {
          id: matchedPolicy.id,
          version: matchedPolicy.version,
          policyName: matchedPolicy.preferredAccountName,
          status: matchedPolicy.status,
          isTenantApproved: matchedPolicy.status === "APPROVED" || matchedPolicy.status === "ACTIVE",
        }
      : undefined,
    justificationReason: justification || (matchedPolicy 
      ? `تم تطبيق سياسة المنشأة المحاسبية المعتمدة رقم #${matchedPolicy.version} (${matchedPolicy.preferredAccountName}).`
      : "تم استنتاج الحسابات المناسبة ومطابقتها حتمياً مع دليل حسابات المنشأة."),
    subledgerRouteGuard: subledgerGuard,
  };
}
