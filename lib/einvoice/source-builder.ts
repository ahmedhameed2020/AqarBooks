import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { SourceDocument } from "./types";

/**
 * Turns a due into the document this product would file, before any country's
 * format touches it.
 *
 * The assembly lives in `get_einvoice_source_for_due` rather than here, for the
 * same reason credential resolution lives in one audited place: the document is
 * built from the SEALED tax decision, not from today's rows. A customer renamed
 * after issue, a rule superseded, a mapping re-approved -- none of them may
 * change a document that was already issued, and reading through the snapshot is
 * what guarantees that. Rebuilding it here in TypeScript would put a second
 * interpretation of the same decision next to the first.
 *
 * This does NOT file anything. Filing is `fileEInvoiceDocument`, and against a
 * real authority it stays blocked on credentials, a certificate and a signing
 * service outside the Worker (ADR 0001).
 */

type Client = SupabaseClient<Database>;

/** What the database returns, before it is narrowed to the adapter's contract. */
interface RawSource {
  documentType: SourceDocument["documentType"];
  documentNumber: string;
  issuedAt: string;
  currency: string;
  currencyDecimals: number;
  seller: Record<string, unknown>;
  buyer: Record<string, unknown>;
  lines: Record<string, unknown>[];
  totals: Record<string, number | string>;
  taxDecisionId: string;
  taxTreatment: string;
  revenueNature: string;
}

export interface BuiltSourceDocument {
  document: SourceDocument;
  /** The decision the document was built from, for the audit trail. */
  taxDecisionId: string;
  taxTreatment: string;
  revenueNature: string;
}

/**
 * Numeric fields arrive as strings from PostgREST for `numeric` columns, which
 * is correct of it -- a float would silently lose the third decimal a Kuwaiti
 * dinar needs. They are converted once, here, rather than at each use site.
 */
function num(value: unknown): number {
  return typeof value === "number" ? value : Number(value ?? 0);
}

export async function buildSourceDocumentForDue(
  client: Client,
  dueId: string,
): Promise<BuiltSourceDocument> {
  const { data, error } = await client.rpc("get_einvoice_source_for_due", {
    p_due_id: dueId,
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("EINVOICE_SOURCE_EMPTY");

  const raw = data as unknown as RawSource;

  const document: SourceDocument = {
    documentType: raw.documentType,
    documentNumber: raw.documentNumber,
    issuedAt: raw.issuedAt,
    currency: raw.currency,
    currencyDecimals: raw.currencyDecimals,
    seller: {
      name: String(raw.seller.name ?? ""),
      taxId: (raw.seller.taxId as string | null) ?? null,
      countryCode: String(raw.seller.countryCode ?? "EG"),
      governorate: (raw.seller.governorate as string | null) ?? null,
      city: (raw.seller.city as string | null) ?? null,
      street: (raw.seller.street as string | null) ?? null,
    },
    buyer: {
      name: String(raw.buyer.name ?? ""),
      taxId: (raw.buyer.taxId as string | null) ?? null,
      countryCode: String(raw.buyer.countryCode ?? "EG"),
      street: (raw.buyer.street as string | null) ?? null,
    },
    lines: raw.lines.map((line) => ({
      description: String(line.description ?? ""),
      // Egypt requires an EGS/GS1 code with no free-text path. Nothing in this
      // product carries one yet, so it is explicitly null rather than filled
      // with something plausible -- a real ETA adapter must refuse on it.
      itemCode: (line.itemCode as string | null) ?? null,
      quantity: num(line.quantity),
      unitCode: String(line.unitCode ?? "EA"),
      unitPrice: num(line.unitPrice),
      discount: num(line.discount),
      taxRate: num(line.taxRate),
      taxAmount: num(line.taxAmount),
      lineTotal: num(line.lineTotal),
    })),
    totals: {
      netAmount: num(raw.totals.netAmount),
      discountAmount: num(raw.totals.discountAmount),
      taxAmount: num(raw.totals.taxAmount),
      grandTotal: num(raw.totals.grandTotal),
    },
  };

  return {
    document,
    taxDecisionId: raw.taxDecisionId,
    taxTreatment: raw.taxTreatment,
    revenueNature: raw.revenueNature,
  };
}
