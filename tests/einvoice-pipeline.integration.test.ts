/**
 * Exercises the jurisdiction-agnostic e-invoicing pipeline against the real
 * database, using the fake authority adapter.
 *
 * Neither ETA nor ZATCA sandbox access exists yet, and writing a statutory
 * integration that cannot be run is how unverifiable code ships. So this proves
 * the half that IS verifiable today: the ledger's guarantees and the service
 * that drives them -- the production gate, idempotency, the REJECTED/FAILED
 * distinction, and the audit trail advancing in step with the document.
 *
 * Same reasoning as lib/payments/providers/fake.ts, which exists so the payment
 * pipeline was testable before any gateway sandbox was reachable.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";
import type { Database } from "../lib/supabase/types";
import { makeFakeEInvoiceAdapter, FAKE_AUTHORITY_UUID } from "../lib/einvoice/adapters/fake";
import { fileEInvoiceDocument, pollEInvoiceDocument } from "../lib/einvoice/service";
import type { EInvoiceCredentials, SourceDocument } from "../lib/einvoice/types";

loadEnv({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const admin = createClient<Database>(url, serviceKey, { auth: { persistSession: false } });

const STAFF_PASSWORD = "E2E_Test_P@ssw0rd_2026!";

let orgId: string;
let userId: string;
let profileId: string;
/** Client authenticated AS the staff user, so RLS and has_permission apply. */
let asUser: ReturnType<typeof createClient<Database>>;

const CREDENTIALS: EInvoiceCredentials = {
  environment: "SANDBOX",
  taxpayerId: "100-000-000",
  branchCode: "0",
  activityCode: "6820",
  clientId: "fake-client",
  clientSecret: "fake-secret",
  baseUrl: "https://fake.invalid",
};

const SOURCE: SourceDocument = {
  documentType: "INVOICE",
  documentNumber: "INV-0001",
  issuedAt: "2026-08-18",
  currency: "EGP",
  currencyDecimals: 2,
  seller: { name: "AqarBooks Test", taxId: "100-000-000", countryCode: "EG" },
  buyer: { name: "Test Buyer", taxId: "200-000-000", countryCode: "EG" },
  lines: [
    {
      description: "Service charge",
      quantity: 1,
      unitCode: "EA",
      unitPrice: 1000,
      discount: 0,
      taxRate: 14,
      taxAmount: 140,
      lineTotal: 1140,
    },
  ],
  totals: { netAmount: 1000, discountAmount: 0, taxAmount: 140, grandTotal: 1140 },
};

const SOURCE_ID_A = "00000000-0000-0000-0000-00000000aaa1";
const SOURCE_ID_B = "00000000-0000-0000-0000-00000000bbb2";

beforeAll(async () => {
  const stamp = Date.now();
  const { data: org } = await admin
    .from("organizations")
    .insert({
      name: `E2E EInvoice ${stamp}`,
      slug: `e2e-einvoice-${stamp}`,
      default_currency: "EGP",
      status: "ACTIVE",
      // Required since ADR 0002: organizations.tax_id is the identity source,
      // and claim_einvoice_document refuses to file without it or when the
      // profile's taxpayer_id disagrees. This fixture predates that rule and
      // broke when the rule landed — correctly, since the invariant it now
      // violates is real. It must match the profile's taxpayer_id below.
      tax_id: "100-000-000",
    } as never)
    .select("id")
    .single();
  orgId = org!.id;

  await admin.rpc("clone_tenant_role_templates", { p_organization_id: orgId });

  const email = `e2e-einvoice-${stamp}@aqarbooks-test.local`;
  const { data: created } = await admin.auth.admin.createUser({
    email,
    password: STAFF_PASSWORD,
    email_confirm: true,
  });
  userId = created!.user!.id;

  await admin
    .from("organization_memberships")
    .insert({ organization_id: orgId, user_id: userId, status: "active" });

  const { data: role } = await admin
    .from("roles")
    .select("id")
    .eq("organization_id", orgId)
    .eq("key", "TENANT_OWNER")
    .single();
  await admin
    .from("user_role_assignments")
    .insert({ user_id: userId, role_id: role!.id, organization_id: orgId });

  const { data: profile } = await admin
    .from("einvoice_profiles")
    .insert({
      organization_id: orgId,
      jurisdiction: "EG_ETA",
      environment: "SANDBOX",
      taxpayer_id: "100-000-000",
    })
    .select("id")
    .single();
  profileId = profile!.id;

  asUser = createClient<Database>(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });
  const { error: signInErr } = await asUser.auth.signInWithPassword({
    email,
    password: STAFF_PASSWORD,
  });
  expect(signInErr, `sign-in failed: ${signInErr?.message}`).toBeNull();
}, 60_000);

afterAll(async () => {
  // Explicit unwind: platform_audit_logs has no cascade, and einvoice rows
  // reference the profile. Same lesson as the e2e teardown fix.
  await admin.from("einvoice_submission_attempts").delete().eq("organization_id", orgId);
  await admin.from("einvoice_documents").delete().eq("organization_id", orgId);
  await admin.from("einvoice_profiles").delete().eq("organization_id", orgId);
  await admin.from("platform_audit_logs").delete().eq("organization_id", orgId);
  if (userId) await admin.auth.admin.deleteUser(userId);
  const { error } = await admin.from("organizations").delete().eq("id", orgId);
  expect(error, `fixture org left behind: ${error?.message}`).toBeNull();
}, 60_000);

describe("e-invoicing pipeline", () => {
  it("refuses to file from an unverified profile", async () => {
    const adapter = makeFakeEInvoiceAdapter();
    await expect(
      fileEInvoiceDocument(asUser, adapter, {
        profileId,
        sourceType: "SUPPLIER_INVOICE",
        sourceId: SOURCE_ID_A,
        source: SOURCE,
        credentials: CREDENTIALS,
      }),
    ).rejects.toThrow(/EINVOICE_PROFILE_NOT_ACTIVE/);
  });

  it("files, records the authority verdict, and keeps the raw status", async () => {
    // Activating through the RPC is the only supported route out of DRAFT.
    await asUser.rpc("set_einvoice_profile_verification", {
      p_profile_id: profileId,
      p_success: true,
    });
    await admin.from("einvoice_profiles").update({ enabled: true }).eq("id", profileId);

    const seen: string[] = [];
    const adapter = makeFakeEInvoiceAdapter({
      submitAs: "ACCEPTED",
      authorityStatus: "Valid",
      seenIdempotencyKeys: seen,
    });

    const outcome = await fileEInvoiceDocument(asUser, adapter, {
      profileId,
      sourceType: "SUPPLIER_INVOICE",
      sourceId: SOURCE_ID_A,
      source: SOURCE,
      credentials: CREDENTIALS,
    });

    expect(outcome.status).toBe("ACCEPTED");
    expect(outcome.authorityStatus).toBe("Valid");
    expect(seen).toHaveLength(1);

    const { data: doc } = await admin
      .from("einvoice_documents")
      .select("status, authority_status, authority_uuid, qr_payload, attempt_count, settled_at")
      .eq("id", outcome.documentId)
      .single();
    expect(doc!.status).toBe("ACCEPTED");
    expect(doc!.authority_status).toBe("Valid");
    expect(doc!.authority_uuid).toBe(FAKE_AUTHORITY_UUID);
    expect(doc!.qr_payload).toBe("fake-qr");
    expect(doc!.attempt_count).toBe(1);
    expect(doc!.settled_at, "an accepted document must be settled").not.toBeNull();

    const { data: attempts } = await admin
      .from("einvoice_submission_attempts")
      .select("operation, resulting_status, response_summary")
      .eq("document_id", outcome.documentId);
    expect(attempts).toHaveLength(1);
    expect(attempts![0].operation).toBe("SUBMIT");
    // Redaction is not optional: nothing resembling a raw payload may land here.
    expect(attempts![0].response_summary).toEqual({ redacted: true });
  });

  it("refuses to file the same source document twice", async () => {
    const adapter = makeFakeEInvoiceAdapter();
    await expect(
      fileEInvoiceDocument(asUser, adapter, {
        profileId,
        sourceType: "SUPPLIER_INVOICE",
        sourceId: SOURCE_ID_A,
        source: SOURCE,
        credentials: CREDENTIALS,
      }),
    ).rejects.toThrow(/EINVOICE_ALREADY_FILED/);
  });

  it("records a local signing failure as FAILED, not REJECTED", async () => {
    // The distinction that matters: nothing was refused, so this is retryable.
    const adapter = makeFakeEInvoiceAdapter({ failSigning: true });
    const outcome = await fileEInvoiceDocument(asUser, adapter, {
      profileId,
      sourceType: "PAYMENT_RECEIPT",
      sourceId: SOURCE_ID_B,
      source: SOURCE,
      credentials: CREDENTIALS,
    });

    expect(outcome.status).toBe("FAILED");
    expect(outcome.errorCode).toBe("LOCAL_FAILURE");

    const { data: doc } = await admin
      .from("einvoice_documents")
      .select("status, settled_at, attempt_count")
      .eq("id", outcome.documentId)
      .single();
    expect(doc!.status).toBe("FAILED");
    // FAILED is not a settlement -- the document has no verdict yet.
    expect(doc!.settled_at).toBeNull();
    expect(doc!.attempt_count).toBe(1);
  });

  it("a failed document can be retried, and reuses the same row", async () => {
    const seen: string[] = [];
    const adapter = makeFakeEInvoiceAdapter({ submitAs: "ACCEPTED", seenIdempotencyKeys: seen });
    const outcome = await fileEInvoiceDocument(asUser, adapter, {
      profileId,
      sourceType: "PAYMENT_RECEIPT",
      sourceId: SOURCE_ID_B,
      source: SOURCE,
      credentials: CREDENTIALS,
    });

    expect(outcome.status).toBe("ACCEPTED");
    // Second attempt on the SAME document, not a rival one.
    const { data: docs } = await admin
      .from("einvoice_documents")
      .select("id, attempt_count")
      .eq("profile_id", profileId)
      .eq("source_id", SOURCE_ID_B);
    expect(docs).toHaveLength(1);
    expect(docs![0].attempt_count).toBe(2);
    // The idempotency key is stable across retries, which is what lets an
    // authority de-duplicate a request that timed out but actually landed.
    expect(seen[0]).toBe(`${profileId}:PAYMENT_RECEIPT:${SOURCE_ID_B}`);
  });

  it("a poll failure leaves the document SUBMITTED rather than downgrading it", async () => {
    const { data: doc } = await admin
      .from("einvoice_documents")
      .insert({
        organization_id: orgId,
        profile_id: profileId,
        source_type: "DUE",
        source_id: "00000000-0000-0000-0000-00000000ccc3",
        idempotency_key: `${profileId}:DUE:poll-test`,
        status: "SUBMITTED",
      } as never)
      .select("id")
      .single();

    const adapter = makeFakeEInvoiceAdapter();
    adapter.pollStatus = async () => {
      throw new Error("network down");
    };

    const outcome = await pollEInvoiceDocument(
      asUser,
      adapter,
      doc!.id,
      FAKE_AUTHORITY_UUID,
      CREDENTIALS,
    );

    expect(outcome.status).toBe("SUBMITTED");
    expect(outcome.errorCode).toBe("POLL_FAILED");

    const { data: after } = await admin
      .from("einvoice_documents")
      .select("status")
      .eq("id", doc!.id)
      .single();
    // Unchanged: the authority still holds it, and marking it FAILED here would
    // invite a duplicate filing.
    expect(after!.status).toBe("SUBMITTED");
  });
});
