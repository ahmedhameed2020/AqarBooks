import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type {
  EInvoiceAdapter,
  EInvoiceCredentials,
  EInvoiceStatus,
  SourceDocument,
  SubmissionResult,
} from "./types";

// Orchestration: the half of e-invoicing that is the same everywhere.
//
// claim -> build -> sign -> submit -> record. Every country-specific step is a
// call into the adapter, so this file contains no `if (jurisdiction === ...)`
// and must never grow one -- that check is the tripwire for the seam having
// been breached.
//
// Credentials are a PARAMETER, not something resolved here. Resolving them
// means reading Vault, which is security-critical and belongs in exactly one
// audited place; a convenience helper here would quietly become a second one.

type Client = SupabaseClient<Database>;

export interface FileDocumentInput {
  profileId: string;
  sourceType: "SUPPLIER_INVOICE" | "PAYMENT_RECEIPT" | "DUE" | "CREDIT_NOTE" | "DEBIT_NOTE";
  sourceId: string;
  documentType?: "INVOICE" | "CREDIT_NOTE" | "DEBIT_NOTE" | "RECEIPT";
  source: SourceDocument;
  credentials: EInvoiceCredentials;
}

export interface FileDocumentOutcome {
  documentId: string;
  status: EInvoiceStatus;
  authorityStatus: string | null;
  errorCode?: string | null;
  /** Safe to show an operator. Never a raw authority body. */
  errorDetail?: string | null;
}

/**
 * File one document with a tax authority and record what happened.
 *
 * A local failure -- signing, transport, an adapter throwing -- is recorded as
 * FAILED rather than swallowed. A document that was attempted must never look
 * untouched afterwards, because the next run would then attempt it again with
 * no record of why the first attempt did not finish.
 */
export async function fileEInvoiceDocument(
  supabase: Client,
  adapter: EInvoiceAdapter,
  input: FileDocumentInput,
): Promise<FileDocumentOutcome> {
  // The database owns the production gate and the idempotency guarantee: this
  // throws if the profile is not ACTIVE, and returns the existing row rather
  // than a rival one if this source has been attempted before.
  const { data: documentId, error: claimError } = await supabase.rpc("claim_einvoice_document", {
    p_profile_id: input.profileId,
    p_source_type: input.sourceType,
    p_source_id: input.sourceId,
    p_document_type: input.documentType ?? "INVOICE",
  });
  if (claimError) throw new Error(claimError.message);
  const docId = documentId as unknown as string;

  const idempotencyKey = `${input.profileId}:${input.sourceType}:${input.sourceId}`;

  let result: SubmissionResult;
  let requestSummary: Record<string, unknown> = {};
  try {
    const prepared = await adapter.buildDocument(input.source, input.credentials);
    const signed = await adapter.sign(prepared, input.credentials);
    requestSummary = adapter.redactRequest(signed);
    result = await adapter.submit(signed, input.credentials, idempotencyKey);
  } catch (err) {
    // Local fault, so FAILED rather than REJECTED: nothing was refused, the
    // attempt never reached a verdict, and retrying it unchanged is legitimate.
    const message = err instanceof Error ? err.message : String(err);
    await recordAttempt(supabase, docId, "SUBMIT", {
      status: "FAILED",
      authorityStatus: null,
      errorCode: "LOCAL_FAILURE",
      errorDetail: message,
    }, requestSummary, {});
    return {
      documentId: docId,
      status: "FAILED",
      authorityStatus: null,
      errorCode: "LOCAL_FAILURE",
      errorDetail: message,
    };
  }

  await recordAttempt(
    supabase,
    docId,
    "SUBMIT",
    result,
    requestSummary,
    adapter.redactResponse(result),
  );

  return {
    documentId: docId,
    status: result.status,
    authorityStatus: result.authorityStatus,
    errorCode: result.errorCode ?? null,
    errorDetail: result.errorDetail ?? null,
  };
}

/**
 * Resolve a document still awaiting a verdict. Safe to run on a schedule: the
 * ledger advances only when the authority actually reports something.
 */
export async function pollEInvoiceDocument(
  supabase: Client,
  adapter: EInvoiceAdapter,
  documentId: string,
  authorityUuid: string,
  credentials: EInvoiceCredentials,
): Promise<FileDocumentOutcome> {
  let result: SubmissionResult;
  try {
    result = await adapter.pollStatus(authorityUuid, credentials);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Deliberately NOT recorded as FAILED. The document is still SUBMITTED with
    // the authority; only our attempt to ask about it failed, and downgrading
    // its status here would invite a duplicate filing.
    return {
      documentId,
      status: "SUBMITTED",
      authorityStatus: null,
      errorCode: "POLL_FAILED",
      errorDetail: message,
    };
  }

  await recordAttempt(supabase, documentId, "POLL", result, {}, adapter.redactResponse(result));

  return {
    documentId,
    status: result.status,
    authorityStatus: result.authorityStatus,
    errorCode: result.errorCode ?? null,
    errorDetail: result.errorDetail ?? null,
  };
}

async function recordAttempt(
  supabase: Client,
  documentId: string,
  operation: "SUBMIT" | "POLL" | "CANCEL",
  result: SubmissionResult,
  requestSummary: Record<string, unknown>,
  responseSummary: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase.rpc("record_einvoice_attempt", {
    p_document_id: documentId,
    p_operation: operation,
    p_resulting_status: result.status,
    p_http_status: result.httpStatus ?? null,
    p_authority_status: result.authorityStatus,
    p_authority_uuid: result.authorityUuid ?? null,
    p_authority_long_id: result.authorityLongId ?? null,
    p_qr_payload: result.qrPayload ?? null,
    p_error_code: result.errorCode ?? null,
    p_error_detail: result.errorDetail ?? null,
    p_request_summary: requestSummary,
    p_response_summary: responseSummary,
  });
  if (error) throw new Error(error.message);
}
