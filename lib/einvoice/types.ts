// The e-invoicing adapter seam.
//
// Egypt (ETA) and Saudi Arabia (ZATCA/Fatoora) both mandate statutory invoice
// clearance and agree on almost nothing mechanically: ETA takes signed JSON over
// REST and returns a UUID plus a long id; ZATCA takes UBL 2.1 XML carrying a
// cryptographic stamp and a TLV QR code, and distinguishes clearance (B2B, held
// until the authority responds) from reporting (B2C, filed after the fact).
//
// Everything country-specific lives behind THIS interface. The submission
// ledger (supabase/migrations/20260908000001_einvoice_core.sql) owns lifecycle,
// idempotency, credentials and audit, and knows none of it. Adding Saudi Arabia
// is meant to be writing one file next to eta.ts -- if it ever requires changing
// the schema or the service layer, this seam was drawn in the wrong place.
//
// Modelled on lib/payments/providers/types.ts, which already solved this exact
// problem shape for payment gateways. The two lessons carried over deliberately:
// keep the authority's raw status alongside the normalized one, and make every
// adapter redact explicitly rather than inheriting a default that quietly stores
// everything.

export type Jurisdiction = "EG_ETA" | "SA_ZATCA" | "AE_PEPPOL";

export type EInvoiceEnvironment = "SANDBOX" | "PRODUCTION";

/**
 * Normalized lifecycle, shared by every jurisdiction and mirrored exactly by the
 * `status` check constraint on einvoice_documents.
 *
 * REJECTED and FAILED are separate on purpose. FAILED is a transport or local
 * fault and is safe to retry unchanged. REJECTED is the authority's verdict on
 * the document itself, and retrying it unchanged will fail forever -- collapsing
 * the two is how a system ends up in an infinite resubmission loop against a tax
 * authority.
 */
export type EInvoiceStatus =
  | "DRAFT"
  | "SIGNED"
  | "SUBMITTED"
  | "ACCEPTED"
  | "REJECTED"
  | "CANCELLED"
  | "FAILED";

/**
 * Resolved by the service layer from einvoice_profiles plus Vault, never read
 * from the environment by an adapter -- the same rule lib/payments enforces, so
 * that credential resolution has exactly one implementation to audit.
 */
export interface EInvoiceCredentials {
  environment: EInvoiceEnvironment;
  taxpayerId: string;
  branchCode: string | null;
  activityCode: string | null;
  clientId: string;
  clientSecret: string;
  /** PEM. Present only for jurisdictions that sign locally (both ETA and ZATCA do). */
  signingCertificate?: string;
  signingKey?: string;
  /** Set by the resolver per environment; adapters never choose a URL themselves. */
  baseUrl: string;
}

/** The invoice as this product understands it, before any country's format touches it. */
export interface SourceDocument {
  documentType: "INVOICE" | "CREDIT_NOTE" | "DEBIT_NOTE" | "RECEIPT";
  /** Human-facing number already assigned by our own sequence. */
  documentNumber: string;
  issuedAt: string;
  currency: string;
  /** ISO 4217 minor units — see currency_decimals(); never assume 2. */
  currencyDecimals: number;
  seller: PartyDetails;
  buyer: PartyDetails;
  lines: SourceLine[];
  totals: DocumentTotals;
  /** For a credit or debit note: the authority id of the invoice being corrected. */
  correctsAuthorityUuid?: string | null;
  notes?: string | null;
}

export interface PartyDetails {
  name: string;
  taxId: string | null;
  /** National/commercial registration, where the jurisdiction requires one. */
  registrationNumber?: string | null;
  countryCode: string;
  governorate?: string | null;
  city?: string | null;
  street?: string | null;
  buildingNumber?: string | null;
  postalCode?: string | null;
}

export interface SourceLine {
  description: string;
  /** Authority item code (Egypt: EGS/GS1; Saudi: not required today). */
  itemCode?: string | null;
  quantity: number;
  unitCode: string;
  unitPrice: number;
  discount: number;
  taxRate: number;
  taxAmount: number;
  lineTotal: number;
}

export interface DocumentTotals {
  netAmount: number;
  discountAmount: number;
  taxAmount: number;
  grandTotal: number;
}

/** Country-formatted payload, not yet signed. */
export interface PreparedDocument {
  jurisdiction: Jurisdiction;
  /** JSON for ETA, XML for ZATCA — opaque above this layer. */
  payload: string;
  contentType: "application/json" | "application/xml";
  /** Canonical hash the signature covers, where the jurisdiction defines one. */
  canonicalHash?: string;
}

export interface SignedDocument extends PreparedDocument {
  signature: string;
  /** ZATCA's TLV QR, base64. Printed on the invoice, so it must be stored. */
  qrPayload?: string | null;
}

/**
 * Outcome of one exchange. `status` is what the ledger stores; `authorityStatus`
 * is the authority's own string, verbatim and unmapped, because several distinct
 * authority states legitimately bucket into one normalized status and that
 * detail is lost forever if it is not captured at parse time.
 */
export interface SubmissionResult {
  status: EInvoiceStatus;
  authorityStatus: string | null;
  authorityUuid?: string | null;
  authorityLongId?: string | null;
  qrPayload?: string | null;
  httpStatus?: number | null;
  errorCode?: string | null;
  /**
   * Safe to show an operator: what went wrong and what to do. Never the raw
   * authority body — that goes through redactResponse() into the audit trail
   * and is logged server-side only, the rule established when the Fawry error
   * echo was fixed.
   */
  errorDetail?: string | null;
}

export interface EInvoiceAdapter {
  readonly jurisdiction: Jurisdiction;

  /** Format the document for this authority. Pure: no I/O, no credentials. */
  buildDocument(source: SourceDocument, credentials: EInvoiceCredentials): Promise<PreparedDocument>;

  /** Apply the jurisdiction's signature or cryptographic stamp. */
  sign(document: PreparedDocument, credentials: EInvoiceCredentials): Promise<SignedDocument>;

  /**
   * File it. `idempotencyKey` is stable across every retry of this document and
   * must be passed to the authority wherever its API accepts one, so a timed-out
   * request that actually succeeded is not filed twice.
   */
  submit(
    document: SignedDocument,
    credentials: EInvoiceCredentials,
    idempotencyKey: string,
  ): Promise<SubmissionResult>;

  /** Both authorities settle asynchronously; this is how SUBMITTED resolves. */
  pollStatus(
    authorityUuid: string,
    credentials: EInvoiceCredentials,
  ): Promise<SubmissionResult>;

  /** Withdraw an accepted document, where the jurisdiction permits it. */
  cancel?(
    authorityUuid: string,
    reason: string,
    credentials: EInvoiceCredentials,
  ): Promise<SubmissionResult>;

  /** Prove credentials against the sandbox. Gates a profile out of DRAFT. */
  verifyCredentials(credentials: EInvoiceCredentials): Promise<{ ok: boolean; error?: string }>;

  /**
   * Strip credentials, signing material and personal data before anything is
   * written to einvoice_submission_attempts. Every adapter implements this
   * explicitly -- even when the honest answer is "return as-is" -- so no adapter
   * inherits a default that silently persists an entire authority payload.
   */
  redactRequest(payload: unknown): Record<string, unknown>;
  redactResponse(payload: unknown): Record<string, unknown>;
}
