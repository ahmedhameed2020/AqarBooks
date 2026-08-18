import type {
  EInvoiceAdapter,
  EInvoiceCredentials,
  PreparedDocument,
  SignedDocument,
  SourceDocument,
  SubmissionResult,
} from "../types";

// A fake tax authority. Never touches a network.
//
// Mirrors lib/payments/providers/fake.ts and exists for the same reason: the
// orchestration pipeline needs something adapter-shaped to run against, and
// neither ETA nor ZATCA sandbox access is available. Without this, the service
// layer could not be tested at all until credentials arrived -- which is
// precisely the trap the payments module already avoided.
//
// It is deliberately NOT registered in registry.ts: the jurisdiction check
// constraint on einvoice_profiles only permits real authorities, so this can
// never be selected by accident in running code. Tests pass it in explicitly.

export const FAKE_AUTHORITY_UUID = "fake-authority-uuid-0001";

/** Lets a test steer the fake authority's verdict without stubbing the module. */
export type FakeBehaviour = {
  /** What submit() should report. Defaults to immediate acceptance. */
  submitAs?: "ACCEPTED" | "SUBMITTED" | "REJECTED" | "FAILED";
  /** Authority-side status string, preserved verbatim by the ledger. */
  authorityStatus?: string;
  /** Make sign() throw, standing in for a certificate or HSM failure. */
  failSigning?: boolean;
  /** Records what submit() was handed, so a test can assert idempotency. */
  seenIdempotencyKeys?: string[];
};

export function makeFakeEInvoiceAdapter(behaviour: FakeBehaviour = {}): EInvoiceAdapter {
  const submitAs = behaviour.submitAs ?? "ACCEPTED";

  return {
    // Typed as a real jurisdiction because the interface demands one; it is the
    // absence from the registry, not this field, that keeps it out of production.
    jurisdiction: "EG_ETA",

    async buildDocument(source: SourceDocument): Promise<PreparedDocument> {
      return {
        jurisdiction: "EG_ETA",
        payload: JSON.stringify({
          documentNumber: source.documentNumber,
          grandTotal: source.totals.grandTotal,
          lineCount: source.lines.length,
        }),
        contentType: "application/json",
        canonicalHash: `hash:${source.documentNumber}`,
      };
    },

    async sign(document: PreparedDocument): Promise<SignedDocument> {
      if (behaviour.failSigning) {
        throw new Error("FAKE_SIGNING_FAILED: certificate unavailable");
      }
      return { ...document, signature: `sig:${document.canonicalHash}`, qrPayload: "fake-qr" };
    },

    async submit(
      _document: SignedDocument,
      _credentials: EInvoiceCredentials,
      idempotencyKey: string,
    ): Promise<SubmissionResult> {
      behaviour.seenIdempotencyKeys?.push(idempotencyKey);

      if (submitAs === "FAILED") {
        return {
          status: "FAILED",
          authorityStatus: null,
          httpStatus: 503,
          errorCode: "UPSTREAM_UNAVAILABLE",
          errorDetail: "The authority did not respond.",
        };
      }
      if (submitAs === "REJECTED") {
        return {
          status: "REJECTED",
          authorityStatus: behaviour.authorityStatus ?? "Invalid",
          httpStatus: 200,
          errorCode: "ITEM_CODE_INVALID",
          errorDetail: "Line 1 carries an unrecognised item code.",
        };
      }
      return {
        status: submitAs,
        authorityStatus: behaviour.authorityStatus ?? "Valid",
        authorityUuid: FAKE_AUTHORITY_UUID,
        authorityLongId: "FAKE-LONG-ID-0001",
        qrPayload: "fake-qr",
        httpStatus: 200,
      };
    },

    async pollStatus(authorityUuid: string): Promise<SubmissionResult> {
      return {
        status: "ACCEPTED",
        authorityStatus: "Valid",
        authorityUuid,
        httpStatus: 200,
      };
    },

    async verifyCredentials() {
      return { ok: true };
    },

    redactRequest() {
      return { redacted: true };
    },
    redactResponse() {
      return { redacted: true };
    },
  };
}
