import { generateStructuredAi } from "./gateway-client";
import { sanitizePrompt } from "./governance";

export type MatchTier = "STRONG_MATCH" | "SUGGESTED_MATCH" | "NEEDS_REVIEW" | "UNMATCHED";

export type InterpretedBankMemo = {
  rawDescription: string;
  extractedUnitCode?: string;
  extractedPayerName?: string;
  extractedInvoiceRef?: string;
  transactionCategory: 
    | "DUES_COLLECTION" 
    | "INSTALLMENT" 
    | "MAINTENANCE_FEE" 
    | "SUPPLIER_PAYMENT" 
    | "BANK_FEE" 
    | "INTEREST" 
    | "INTERNAL_TRANSFER" 
    | "UNKNOWN";
  paymentChannel?: "INSTAPAY" | "ACH" | "SWIFT" | "ATM_DEPOSIT" | "CHEQUE" | "POS" | "DIRECT_TRANSFER";
  confidence: number;
};

export type StatementLineCandidate = {
  id: string;
  entryNumber?: string;
  entryDate: string;
  amount: number;
  description?: string;
  reference?: string;
  memberId?: string;
  memberName?: string;
  unitCode?: string;
};

export type MatchScoreResult = {
  statementLineId: string;
  candidateId?: string;
  candidateLabel?: string;
  score: number;
  tier: MatchTier;
  matchReasons: string[];
  interpretedMemo?: InterpretedBankMemo;
  isBulkApprovable: boolean;
};

const SYSTEM_PROMPT = `
You are the AqarBooks Intelligent Banking Memo Interpreter.
Your job is to parse noisy, abbreviated, or messy bank transaction memos from Arab and Egyptian banks (e.g. CIB, NBE, Banque Misr, QNB, InstaPay IPN, ACH, SWIFT).

Extract:
- extractedUnitCode: e.g. B-101, V-12, Villa 4, Unit 204, شاليه 5
- extractedPayerName: Name of person or company transferring
- extractedInvoiceRef: e.g. INV-8891, REC-102
- transactionCategory: DUES_COLLECTION | INSTALLMENT | MAINTENANCE_FEE | SUPPLIER_PAYMENT | BANK_FEE | INTEREST | INTERNAL_TRANSFER | UNKNOWN
- paymentChannel: INSTAPAY | ACH | SWIFT | ATM_DEPOSIT | CHEQUE | POS | DIRECT_TRANSFER
- confidence: 0.0 to 1.0

Rules:
- If memo is a bank commission or charge (e.g. "COMM", "MAINT FEE", "TAX ON CHQ"), classify as BANK_FEE.
- Never invent unit numbers that do not appear in the text.
- Output strictly typed JSON.
`;

/**
 * Calculates string similarity ratio (0.0 to 1.0)
 */
function calculateSimilarity(str1: string, str2: string): number {
  if (!str1 || !str2) return 0;
  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();
  if (s1 === s2) return 1.0;
  if (s1.includes(s2) || s2.includes(s1)) return 0.85;

  const words1 = s1.split(/\s+/);
  const words2 = s2.split(/\s+/);
  const common = words1.filter((w) => w.length > 2 && words2.includes(w));
  if (common.length > 0) return Math.min(1.0, common.length / Math.max(words1.length, words2.length) + 0.3);

  return 0;
}

/**
 * Decodes messy bank memos using fast LLM interpretation.
 */
export async function interpretBankMemoAi(rawMemo: string): Promise<InterpretedBankMemo> {
  const sanitized = sanitizePrompt(rawMemo);

  // Fast Rule-Based heuristic for obvious bank fees
  if (/مصاريف|عمولة|دمغة|fee|comm|charge|vat on/i.test(sanitized)) {
    return {
      rawDescription: rawMemo,
      transactionCategory: "BANK_FEE",
      paymentChannel: "DIRECT_TRANSFER",
      confidence: 0.95,
    };
  }

  const prompt = `
Bank Transaction Memo:
"${sanitized}"

Extract metadata according to schema.
`;

  const fallback: InterpretedBankMemo = {
    rawDescription: rawMemo,
    transactionCategory: "UNKNOWN",
    confidence: 0.5,
  };

  const aiResult = await generateStructuredAi<InterpretedBankMemo>({
    systemPrompt: SYSTEM_PROMPT,
    prompt,
    taskType: "BANK_MATCHING",
    modelTier: "fast",
    temperature: 0.1,
  });

  if (aiResult.success && aiResult.data) {
    return {
      ...aiResult.data,
      rawDescription: rawMemo,
      confidence: aiResult.data.confidence || 0.88,
    };
  }

  return fallback;
}

/**
 * Deterministic Multi-Factor Bank Reconciliation Scoring Engine.
 * Evaluates candidate journal/ledger lines against a bank statement line.
 */
export function scoreBankReconciliationMatch(
  statementLine: {
    id: string;
    lineDate: string;
    amount: number;
    description?: string | null;
    reference?: string | null;
  },
  candidates: StatementLineCandidate[],
  interpretedMemo?: InterpretedBankMemo,
  confirmedHistoricalPairs: { payerPattern: string; matchedUnitOrMember: string }[] = []
): MatchScoreResult {
  if (!candidates || candidates.length === 0) {
    return {
      statementLineId: statementLine.id,
      score: 0,
      tier: "UNMATCHED",
      matchReasons: ["لا توجد قيود مرشحة في الدفاتر تطابق الفترة أو الحساب"],
      interpretedMemo,
      isBulkApprovable: false,
    };
  }

  let bestCandidate: StatementLineCandidate | null = null;
  let bestScore = -1;
  let bestReasons: string[] = [];

  const stmtDate = new Date(statementLine.lineDate);

  for (const cand of candidates) {
    let score = 0;
    const reasons: string[] = [];

    // 1. Amount Exact Match (+40 pts)
    const isAmountExact = Math.abs(cand.amount - statementLine.amount) <= 0.05;
    if (isAmountExact) {
      score += 40;
      reasons.push("تطابق تام في المبلغ (+40)");
    } else {
      continue; // Amount must match for basic candidate consideration
    }

    // 2. Reference Match (+30 pts)
    const stmtRef = (statementLine.reference || "").toLowerCase().trim();
    const candRef = (cand.reference || "").toLowerCase().trim();
    const memoUnit = (interpretedMemo?.extractedUnitCode || "").toLowerCase().trim();
    const candUnit = (cand.unitCode || "").toLowerCase().trim();

    if (stmtRef && candRef && (stmtRef === candRef || stmtRef.includes(candRef) || candRef.includes(stmtRef))) {
      score += 30;
      reasons.push(`تطابق المرجع البنكي (${cand.reference}) (+30)`);
    } else if (memoUnit && candUnit && (memoUnit === candUnit || memoUnit.includes(candUnit))) {
      score += 30;
      reasons.push(`تطابق كود الوحدة المستخرج (${cand.unitCode}) (+30)`);
    }

    // 3. Date Proximity (+15 pts)
    const candDate = new Date(cand.entryDate);
    const diffDays = Math.abs(Math.round((stmtDate.getTime() - candDate.getTime()) / (1000 * 60 * 60 * 24)));
    if (diffDays === 0) {
      score += 15;
      reasons.push("تطابق في نفس تاريخ العملية (+15)");
    } else if (diffDays <= 3) {
      score += 12;
      reasons.push(`فارق زمني قريب (${diffDays} أيام) (+12)`);
    } else if (diffDays <= 7) {
      score += 8;
      reasons.push(`فارق زمني أسبوع (+8)`);
    } else if (diffDays <= 14) {
      score += 5;
      reasons.push(`فارق زمني أسبوعين (+5)`);
    }

    // 4. Counterparty Similarity (+10 pts)
    const memoPayer = interpretedMemo?.extractedPayerName || statementLine.description || "";
    const candMember = cand.memberName || cand.description || "";
    const sim = calculateSimilarity(memoPayer, candMember);
    if (sim >= 0.7) {
      score += 10;
      reasons.push(`تشابه اسم المحول (${cand.memberName || ""}) (+10)`);
    }

    // 5. Historical Confirmed Pattern (+25 pts)
    const hasHistory = confirmedHistoricalPairs.some((p) => 
      memoPayer.toLowerCase().includes(p.payerPattern.toLowerCase()) && 
      (cand.unitCode === p.matchedUnitOrMember || cand.memberId === p.matchedUnitOrMember)
    );
    if (hasHistory) {
      score += 25;
      reasons.push("نمط مطابقة سابق مؤكد لنفس العميل (+25)");
    }

    if (score > bestScore) {
      bestScore = score;
      bestCandidate = cand;
      bestReasons = reasons;
    }
  }

  // Cap score to 100
  const finalScore = Math.min(100, bestScore);
  const tier: MatchTier = 
    finalScore >= 95 ? "STRONG_MATCH" : 
    finalScore >= 80 ? "SUGGESTED_MATCH" : 
    finalScore >= 60 ? "NEEDS_REVIEW" : "UNMATCHED";

  return {
    statementLineId: statementLine.id,
    candidateId: bestCandidate?.id,
    candidateLabel: bestCandidate ? `#${bestCandidate.entryNumber ?? "—"} · ${bestCandidate.entryDate} · ${bestCandidate.description ?? ""} (${bestCandidate.amount})` : undefined,
    score: Math.max(0, finalScore),
    tier,
    matchReasons: bestReasons,
    interpretedMemo,
    isBulkApprovable: tier === "STRONG_MATCH",
  };
}
