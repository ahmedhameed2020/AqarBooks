import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { extractInvoiceFromTextOrOcr, computeInvoiceFingerprint } from "@/lib/ai/invoice-extractor";

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

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

    // 2. Perform AI Document Extraction
    const extracted = await extractInvoiceFromTextOrOcr(documentText, availableSuppliers, locale);

    // 3. Match Supplier in database (Exact or Fuzzy)
    let matchedSupplierId: string | null = null;
    if (extracted.supplierName) {
      const normExtracted = extracted.supplierName.toLowerCase().replace(/[\s\-_]/g, "");
      const exactMatch = (suppliers || []).find((s) => {
        const normS = s.name.toLowerCase().replace(/[\s\-_]/g, "");
        return normS.includes(normExtracted) || normExtracted.includes(normS);
      });
      if (exactMatch) {
        matchedSupplierId = exactMatch.id;
      }
    }

    // 4. Duplicate Invoice Detection (Fingerprint & Invoice Number checks)
    let isDuplicate = false;
    let duplicateWarning: string | null = null;

    if (extracted.invoiceNumber && matchedSupplierId) {
      const { data: existingInvoices } = await supabase
        .from("supplier_invoices")
        .select("id, invoice_number, amount, due_date")
        .eq("organization_id", organizationId || user.id)
        .eq("supplier_id", matchedSupplierId)
        .eq("invoice_number", extracted.invoiceNumber.trim())
        .limit(1);

      if (existingInvoices && existingInvoices.length > 0) {
        const existing = existingInvoices[0];
        isDuplicate = true;
        duplicateWarning = isAr
          ? `تنبيه أمني: تم العثور على فاتورة سابقة مسجلة بنفس الرقم (${existing.invoice_number}) بمبلغ ${existing.amount}.`
          : `Warning: Duplicate invoice detected with matching number (${existing.invoice_number}) for amount ${existing.amount}.`;
      }
    }

    return NextResponse.json({
      success: true,
      extracted,
      matchedSupplierId,
      duplicateCheck: {
        isDuplicate,
        warning: duplicateWarning,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
