import type {
  EInvoiceAdapter,
  EInvoiceCredentials,
  PreparedDocument,
  SignedDocument,
  SourceDocument,
  SubmissionResult,
} from "../types";

// Saudi ZATCA / Fatoora adapter — NOT IMPLEMENTED YET.
//
// This file exists to prove the seam holds. Its value right now is that writing
// it required no change to the interface, the schema, or the service layer --
// which is the whole claim the adapter architecture makes. If ZATCA had needed a
// schema change, the seam would have been drawn in the wrong place and it is far
// cheaper to discover that here than three months into an ETA build.
//
// Where ZATCA genuinely differs from Egypt, all of it absorbed by this file:
//   - UBL 2.1 XML, not JSON, and the signature is an XML digital signature
//     embedded in the document rather than a detached CAdES blob.
//   - Onboarding issues a CSID via a CSR before anything can be filed, so
//     verifyCredentials() here means "complete or confirm onboarding", not just
//     "authenticate".
//   - Two flows, chosen by transaction type rather than by configuration:
//     CLEARANCE for B2B (the invoice is not legally issued until ZATCA returns
//     it stamped) and REPORTING for B2C (filed within 24 hours after issue).
//     That distinction maps onto the existing normalized statuses -- clearance
//     goes SIGNED -> SUBMITTED -> ACCEPTED synchronously, reporting settles
//     afterwards -- so it needs no new lifecycle states.
//   - A TLV-encoded, base64 QR code must be printed on the invoice. That is what
//     einvoice_documents.qr_payload exists for, and why it is on the ledger
//     rather than invented per adapter.
//   - Every invoice carries a hash chain to its predecessor (PIH), so documents
//     must be filed in order per profile. The pending index on
//     (profile_id, submitted_at) supports finding the tail cheaply.
//
// One open question to settle before implementation, not during: ZATCA expects
// invoice counter values (ICV) to be strictly sequential per device/solution.
// That interacts with our per-organization sequencing and is a data-model
// decision, not an adapter detail.

const NOT_IMPLEMENTED = "EINVOICE_ZATCA_NOT_IMPLEMENTED: تكامل فاتورة السعودية غير مُفعَّل بعد";

export const zatcaAdapter: EInvoiceAdapter = {
  jurisdiction: "SA_ZATCA",

  async buildDocument(_source: SourceDocument, _credentials: EInvoiceCredentials): Promise<PreparedDocument> {
    throw new Error(NOT_IMPLEMENTED);
  },

  async sign(_document: PreparedDocument, _credentials: EInvoiceCredentials): Promise<SignedDocument> {
    throw new Error(NOT_IMPLEMENTED);
  },

  async submit(
    _document: SignedDocument,
    _credentials: EInvoiceCredentials,
    _idempotencyKey: string,
  ): Promise<SubmissionResult> {
    throw new Error(NOT_IMPLEMENTED);
  },

  async pollStatus(_authorityUuid: string, _credentials: EInvoiceCredentials): Promise<SubmissionResult> {
    throw new Error(NOT_IMPLEMENTED);
  },

  // No cancel(): ZATCA does not withdraw a cleared invoice. A mistake is
  // corrected by filing a credit note against it, which is an ordinary document
  // of its own. Omitting the optional method is the honest encoding of that,
  // rather than implementing one that always fails.

  async verifyCredentials(_credentials: EInvoiceCredentials) {
    return { ok: false, error: NOT_IMPLEMENTED };
  },

  redactRequest(payload: unknown): Record<string, unknown> {
    // The request body is the signed UBL invoice: buyer identity, addresses and
    // the cryptographic stamp. None of it belongs in the audit trail.
    if (payload && typeof payload === "object") {
      const p = payload as Record<string, unknown>;
      return {
        invoiceHash: typeof p.invoiceHash === "string" ? p.invoiceHash : null,
        uuid: typeof p.uuid === "string" ? p.uuid : null,
      };
    }
    return {};
  },

  redactResponse(payload: unknown): Record<string, unknown> {
    // clearedInvoice is the full stamped XML — identifiers and validation
    // outcomes only.
    if (payload && typeof payload === "object") {
      const p = payload as Record<string, unknown>;
      return {
        clearanceStatus: p.clearanceStatus ?? p.reportingStatus ?? null,
        validationWarnings: Array.isArray(p.warningMessages) ? p.warningMessages.length : null,
        validationErrors: Array.isArray(p.errorMessages) ? p.errorMessages.length : null,
      };
    }
    return {};
  },
};
