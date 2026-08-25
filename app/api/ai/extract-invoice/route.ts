import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { demoAiGate } from "@/lib/demo/ai-gate";
import { createClient } from "@/lib/supabase/server";
import { extractInvoiceFromTextOrOcr, computeInvoiceFingerprint } from "@/lib/ai/invoice-extractor";

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    // Public demo policy: allowlist + abuse ceiling. A no-op for real tenants.
    const demoRefusal = await demoAiGate(req, "invoice_ocr");
    if (demoRefusal) return demoRefusal;

    const body = await req.json();
    const documentText = body?.documentText as string;
    const organizationId = body?.organizationId as string;
    const locale = (body?.locale as string) || "ar";
    const isAr = locale === "ar";

    if (!documentText || !documentText.trim()) {
      return NextResponse.json({ error: "EMPTY_DOCUMENT_TEXT" }, { status: 400 });
    }

    const supabase = await createClient();

    // 1. Fetch existing suppliers for fuzzy/exact matching
    const { data: suppliers } = await supabase
      .from("suppliers")
      .select("id, name, tax_number")
      .eq("organization_id", organizationId || user.id)
      .limit(100);

    const availableSuppliers = (suppliers || []).map((s) => ({
      id: s.id,
      name: s.name,
      taxNumber: s.tax_number || undefined,
    }));

    // 2. Perform AI Document Extraction with Tenant Scoping
    const extracted = await extractInvoiceFromTextOrOcr(documentText, availableSuppliers, organizationId || user.id, locale);

    // 3. Match Supplier in database (Exact or Fuzzy)
    let matchedSupplierId: string | null = null;
    if (extracted.supplierName) {
      const normExtracted = extracted.supplierName.toLowerCase().replace(/[\s\-_/\\#]/g, "");
      const exactMatch = (suppliers || []).find((s) => {
        const normS = s.name.toLowerCase().replace(/[\s\-_/\\#]/g, "");
        return normS.includes(normExtracted) || normExtracted.includes(normS);
      });
      if (exactMatch) {
        matchedSupplierId = exactMatch.id;
      }
    }

    // 4. Graded Duplicate Detection (EXACT, PROBABLE, POSSIBLE, UNIQUE)
    let duplicateSeverity: "EXACT_DUPLICATE" | "PROBABLE_DUPLICATE" | "POSSIBLE_DUPLICATE" | "UNIQUE" = "UNIQUE";
    let isDuplicate = false;
    let duplicateWarning: string | null = null;
    let matchedInvoiceNumber: string | undefined;
    let matchedAmount: number | undefined;

    const normInvNum = (extracted.invoiceNumber || "").toLowerCase().replace(/[\s\-_/\\#]/g, "");

    if (normInvNum && matchedSupplierId) {
      // Query supplier invoices for this supplier
      const { data: existingInvoices } = await supabase
        .from("supplier_invoices")
        .select("id, invoice_number, amount, due_date, currency")
        .eq("organization_id", organizationId || user.id)
        .eq("supplier_id", matchedSupplierId)
        .limit(100);

      for (const inv of existingInvoices || []) {
        const existingNorm = (inv.invoice_number || "").toLowerCase().replace(/[\s\-_/\\#]/g, "");
        const isSameNumber = existingNorm === normInvNum;
        const isSameAmount = Math.abs(inv.amount - extracted.total) <= 0.05;

        if (isSameNumber && isSameAmount) {
          duplicateSeverity = "EXACT_DUPLICATE";
          isDuplicate = true;
          matchedInvoiceNumber = inv.invoice_number;
          matchedAmount = inv.amount;
          duplicateWarning = isAr
            ? `تطابق تام ومؤكد (Exact Duplicate): توجد فاتورة مسجلة بالفعل بنفس الرقم (${inv.invoice_number}) وبنفس المبلغ (${inv.amount}).`
            : `Exact Duplicate: An invoice with matching number (${inv.invoice_number}) and amount (${inv.amount}) is already recorded.`;
          break;
        } else if (isSameNumber) {
          duplicateSeverity = "PROBABLE_DUPLICATE";
          isDuplicate = true;
          matchedInvoiceNumber = inv.invoice_number;
          matchedAmount = inv.amount;
          duplicateWarning = isAr
            ? `تطابق مرجح (Probable Duplicate): يوجد رقم فاتورة متطابق (${inv.invoice_number}) بمبلغ (${inv.amount}) يختلف عن المسجل حالياً.`
            : `Probable Duplicate: Invoice number (${inv.invoice_number}) matches an existing invoice of amount (${inv.amount}).`;
        } else if (isSameAmount && duplicateSeverity === "UNIQUE") {
          duplicateSeverity = "POSSIBLE_DUPLICATE";
          duplicateWarning = isAr
            ? `تطابق محتمل (Possible Duplicate): تم العثور على فاتورة للمورد نفسه بنفس القيمة (${inv.amount}) برقم مختلف (${inv.invoice_number}).`
            : `Possible Duplicate: Found an invoice for the same supplier with identical amount (${inv.amount}).`;
        }
      }
    }

    return NextResponse.json({
      success: true,
      extracted,
      matchedSupplierId,
      duplicateCheck: {
        severity: duplicateSeverity,
        isDuplicate,
        warning: duplicateWarning,
        matchedInvoiceNumber,
        matchedAmount,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
