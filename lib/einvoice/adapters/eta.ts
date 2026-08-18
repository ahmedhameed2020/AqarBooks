import type {
  EInvoiceAdapter,
  EInvoiceCredentials,
  PreparedDocument,
  SignedDocument,
  SourceDocument,
  SubmissionResult,
} from "../types";

// Egyptian Tax Authority (ETA) adapter — NOT IMPLEMENTED YET.
//
// This file exists so the seam is real and the shape is committed to before any
// integration work starts. Every method throws rather than returning a plausible
// fake: a stub that silently "succeeds" would let a document reach ACCEPTED in
// our ledger while nothing was ever filed, which is worse than no integration at
// all. Filing is gated anyway -- claim_einvoice_document() refuses unless the
// profile is ACTIVE, and a profile only becomes ACTIVE through
// verifyCredentials() below.
//
// What implementing this involves, so the next session does not re-derive it:
//   - OAuth2 client-credentials against ETA's identity host for a bearer token;
//     tokens are short-lived and must be cached per profile, not per request.
//   - Document JSON per ETA's published schema, then canonicalised by ETA's own
//     serialisation rules (their scheme, not JCS) before hashing.
//   - CAdES-BES detached signature over that canonical form, produced with the
//     taxpayer's certificate. In production this normally lives on an HSM or a
//     USB token, which is the main deployment question to settle early because
//     it constrains where this code can run.
//   - POST to /documentsubmissions, which accepts a batch and returns per
//     document acceptance or rejection; a 200 does NOT mean every document in
//     the batch cleared, so the response must be read per document.
//   - Poll GET /documents/{uuid}/raw for the settled state.
//
// Egypt-specific traps worth recording now:
//   - Rejections are frequently about item coding (EGS/GS1) rather than
//     arithmetic, so errorDetail must surface the offending line.
//   - ETA rounds to 5 decimal places internally; our totals must be presented
//     consistently or the authority recomputes a different tax figure.

const NOT_IMPLEMENTED = "EINVOICE_ETA_NOT_IMPLEMENTED: تكامل الفاتورة الإلكترونية المصرية غير مُفعَّل بعد";

export const etaAdapter: EInvoiceAdapter = {
  jurisdiction: "EG_ETA",

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

  async cancel(
    _authorityUuid: string,
    _reason: string,
    _credentials: EInvoiceCredentials,
  ): Promise<SubmissionResult> {
    throw new Error(NOT_IMPLEMENTED);
  },

  async verifyCredentials(_credentials: EInvoiceCredentials) {
    // Returning ok:false rather than throwing keeps the profile in DRAFT with a
    // readable reason, which is exactly the intended end state until this is
    // built.
    return { ok: false, error: NOT_IMPLEMENTED };
  },

  redactRequest(payload: unknown): Record<string, unknown> {
    // The ETA request carries the signed document, which contains buyer names,
    // addresses and tax ids. Only the envelope is ever safe to persist.
    if (payload && typeof payload === "object") {
      const p = payload as Record<string, unknown>;
      return {
        documentTypeVersion: p.documentTypeVersion ?? null,
        documentCount: Array.isArray(p.documents) ? p.documents.length : null,
      };
    }
    return {};
  },

  redactResponse(payload: unknown): Record<string, unknown> {
    // Keep only the identifiers and error codes needed for an audit trail.
    if (payload && typeof payload === "object") {
      const p = payload as Record<string, unknown>;
      return {
        submissionUuid: p.submissionUUID ?? null,
        acceptedCount: Array.isArray(p.acceptedDocuments) ? p.acceptedDocuments.length : null,
        rejectedCount: Array.isArray(p.rejectedDocuments) ? p.rejectedDocuments.length : null,
      };
    }
    return {};
  },
};
