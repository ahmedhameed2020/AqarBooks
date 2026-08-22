import { generateStructuredAi } from "./gateway-client";
import { sanitizePrompt } from "./governance";

export type ExtractedLineItem = {
  description: string;
  quantity?: number;
  unitPrice?: number;
  total: number;
};

export type ExtractedInvoiceData = {
  supplierName?: string;
  taxNumber?: string;
  invoiceNumber?: string;
  invoiceDate?: string;
  dueDate?: string;
  subtotal: number;
  vatRate?: number;
  vatAmount?: number;
  whtRate?: number;
  total: number;
  currency?: string;
  expenseCategorySuggestion?: string;
  lineItems: ExtractedLineItem[];
  confidence: {
    supplier: number;
    invoiceNumber: number;
    amounts: number;
    overall: number;
  };
  fingerprint: string;
};

export type DuplicateCheckResult = {
  isDuplicate: boolean;
  duplicateReason?: string;
  matchedInvoiceId?: string;
};

const SYSTEM_PROMPT = `
You are the AqarBooks Intelligent Document & OCR Extraction Engine.
Your job is to parse invoice text or OCR representations from supplier bills, expense receipts, maintenance invoices, and contractor claims.

Extract the following into strict JSON:
- supplierName: Name of the vendor / company (e.g. أوتيس للمصاعد, شركة النصر للمقاولات)
- taxNumber: Vendor Tax Registration Number / الرقم الضريبي
- invoiceNumber: Invoice / Bill # (رقم الفاتورة)
- invoiceDate: ISO YYYY-MM-DD
- dueDate: ISO YYYY-MM-DD
- subtotal: Net amount before tax (المبلغ قبل الضريبة)
- vatRate: Tax percentage (e.g. 14 for 14% VAT in Egypt)
- vatAmount: Tax amount (قيمة الضريبة)
- total: Final grand total (الإجمالي النهائي)
- currency: Currency code (e.g. EGP, USD, SAR, AED)
- expenseCategorySuggestion: Suggested GL expense type (e.g. صيانة مصاعد, أدوات ومهمات, كهرباء ومياه, نظافة, أمن, صيانة مباني)
- lineItems: Array of { description, quantity, unitPrice, total }
- confidence: Object with confidence scores between 0.0 and 1.0 for fields

Rules:
- Never guess or invent numbers that do not appear in the invoice.
- If VAT rate is 14% and total is given, calculate subtotal = total / 1.14 if subtotal is omitted.
- Output only valid JSON.
`;

/**
 * Computes deterministic financial fingerprint for duplicate detection.
 */
export function computeInvoiceFingerprint(
  supplierName: string,
  invoiceNumber: string,
  invoiceDate: string,
  totalAmount: number
): string {
  const normSupplier = supplierName.trim().toLowerCase().replace(/[\s\-_]/g, "");
  const normNum = invoiceNumber.trim().toLowerCase().replace(/[\s\-_]/g, "");
  const normDate = (invoiceDate || "").trim();
  const normAmount = Math.round(totalAmount * 100);
  return `${normSupplier}:${normNum}:${normDate}:${normAmount}`;
}

export async function extractInvoiceFromTextOrOcr(
  rawDocumentText: string,
  availableSuppliers: { id: string; name: string; taxNumber?: string }[] = [],
  locale: string = "ar"
): Promise<ExtractedInvoiceData> {
  const sanitizedText = sanitizePrompt(rawDocumentText);

  const prompt = `
Invoice Document Text / OCR Output:
${sanitizedText.slice(0, 4000)}

Known Registered Suppliers for Reference:
${JSON.stringify(availableSuppliers.map((s) => ({ id: s.id, name: s.name, tax: s.taxNumber })))}

Extract all invoice metadata and line items according to the system schema.
`;

  const fallbackData: ExtractedInvoiceData = {
    supplierName: availableSuppliers[0]?.name || "",
    invoiceNumber: "",
    invoiceDate: new Date().toISOString().split("T")[0],
    subtotal: 0,
    vatRate: 0,
    vatAmount: 0,
    total: 0,
    currency: "EGP",
    lineItems: [],
    confidence: {
      supplier: 0.5,
      invoiceNumber: 0.5,
      amounts: 0.5,
      overall: 0.5,
    },
    fingerprint: "",
  };

  const aiResult = await generateStructuredAi<ExtractedInvoiceData>({
    systemPrompt: SYSTEM_PROMPT,
    prompt,
    taskType: "INVOICE_OCR",
    modelTier: "multimodal",
    temperature: 0.05,
  });

  if (aiResult.success && aiResult.data) {
    const data = aiResult.data;
    const subtotal = Number(data.subtotal) || Number(data.total) || 0;
    const total = Number(data.total) || subtotal;
    const invDate = data.invoiceDate || new Date().toISOString().split("T")[0];
    const invNum = data.invoiceNumber || "";
    const supp = data.supplierName || "";

    const fingerprint = computeInvoiceFingerprint(supp, invNum, invDate, total);

    return {
      ...data,
      subtotal,
      total,
      invoiceDate: invDate,
      fingerprint,
      confidence: data.confidence || {
        supplier: 0.9,
        invoiceNumber: 0.9,
        amounts: 0.95,
        overall: 0.92,
      },
    };
  }

  return fallbackData;
}
