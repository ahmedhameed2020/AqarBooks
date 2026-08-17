"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getPrimaryOrganization } from "@/lib/auth/org-context";
import type { ActionResult } from "@/lib/actions/platform";

const providerSchema = z.enum(["FAWRY", "PAYMOB"]);
const environmentSchema = z.enum(["SANDBOX", "PRODUCTION"]);

// Every RPC below (upsert/enable/disable/record_payment_provider_verification)
// carries its own has_permission(auth.uid(), organization_id,
// 'finance.online_payments.manage') + organization_is_active() check inside
// the function body (SECURITY DEFINER) -- these actions do not duplicate
// that check, matching this codebase's established pattern (see
// lib/actions/treasury.ts). The one exception is testPaymentProviderConnectionAction,
// which additionally calls the service-role-only get_payment_provider_credentials
// RPC -- that one has no internal permission check by design (see
// resolve-credentials.ts's doc comment), so that action self-authorizes
// before using the admin client. See its own comment below.

const upsertSchema = z.object({
  organizationId: z.string().uuid(),
  resortId: z.string().uuid().nullable(),
  provider: providerSchema,
  environment: environmentSchema,
  merchantIdentifier: z.string().min(1),
  publicKey: z.string().nullable(),
  // Blank/absent means "leave the existing secret unchanged" -- matches
  // upsert_payment_provider_settings's own contract exactly (it only calls
  // vault.update_secret when the incoming value is non-null and non-empty).
  apiKey: z.string(),
  hmacSecret: z.string(),
});

export async function upsertPaymentProviderSettingsAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const resortIdRaw = formData.get("resortId");
  const parsed = upsertSchema.safeParse({
    organizationId: formData.get("organizationId"),
    resortId: resortIdRaw && resortIdRaw !== "" ? resortIdRaw : null,
    provider: formData.get("provider"),
    environment: formData.get("environment"),
    merchantIdentifier: formData.get("merchantIdentifier"),
    publicKey: formData.get("publicKey") || null,
    apiKey: formData.get("apiKey") ?? "",
    hmacSecret: formData.get("hmacSecret") ?? "",
  });
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("upsert_payment_provider_settings", {
    p_organization_id: parsed.data.organizationId,
    p_resort_id: parsed.data.resortId,
    p_provider: parsed.data.provider,
    p_environment: parsed.data.environment,
    p_merchant_identifier: parsed.data.merchantIdentifier,
    p_public_key: parsed.data.publicKey,
    p_api_key: parsed.data.apiKey,
    p_hmac_secret: parsed.data.hmacSecret,
  });

  if (error) return { ok: false, error: error.message };
  revalidatePath("/[locale]/finance/payment-providers", "page");
  return { ok: true };
}

const settingsIdSchema = z.object({ settingsId: z.string().uuid() });

export async function enablePaymentProviderAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = settingsIdSchema.safeParse({ settingsId: formData.get("settingsId") });
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("enable_payment_provider", { p_settings_id: parsed.data.settingsId });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/[locale]/finance/payment-providers", "page");
  return { ok: true };
}

export async function disablePaymentProviderAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = settingsIdSchema.safeParse({ settingsId: formData.get("settingsId") });
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("disable_payment_provider", { p_settings_id: parsed.data.settingsId });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/[locale]/finance/payment-providers", "page");
  return { ok: true };
}

// Best-effort connectivity/decryption check, NOT a full merchant-credential
// validation -- there is no documented Fawry endpoint that validates
// merchantCode+secureKey without submitting a real charge, so this proves
// the credentials round-trip through Vault correctly and the provider host
// is reachable, but does not prove a charge would actually be accepted.
// Paymob's auth-token endpoint (accept.paymob.com/api/auth/tokens) DOES
// perform a real api_key validation, so that path is a genuine check.
async function probeProvider(
  provider: "FAWRY" | "PAYMOB",
  credentials: { apiKey: string; baseUrl?: string },
): Promise<{ success: boolean; error: string | null }> {
  try {
    if (provider === "FAWRY") {
      const baseUrl = credentials.baseUrl ?? "https://atfawry.fawrystaging.com";
      const res = await fetch(baseUrl, { method: "GET", signal: AbortSignal.timeout(8000) });
      // Any completed HTTP response (even a 404 on the bare host) proves
      // the host is reachable over the network -- that is the only thing
      // this probe can honestly claim for Fawry.
      return res ? { success: true, error: null } : { success: false, error: "no_response" };
    }
    const res = await fetch("https://accept.paymob.com/api/auth/tokens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: credentials.apiKey }),
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) return { success: true, error: null };
    return { success: false, error: `paymob_auth_failed_${res.status}` };
  } catch {
    return { success: false, error: "network_error" };
  }
}

export async function testPaymentProviderConnectionAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = settingsIdSchema.safeParse({ settingsId: formData.get("settingsId") });
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const { settingsId } = parsed.data;

  const user = await getCurrentUser();
  const organization = user ? await getPrimaryOrganization(user.id) : null;
  if (!organization) return { ok: false, error: "unauthenticated" };

  // list_payment_provider_settings runs as the CALLER (plain SQL, not
  // SECURITY DEFINER) and is gated by the payment_provider_settings_manage
  // RLS policy (has_permission(..., 'finance.online_payments.manage') AND
  // organization_is_active(...)) -- finding settingsId in this list, scoped
  // to this session's own primary organization, proves both that the row
  // belongs to this org and that this session may manage it.
  const supabase = await createClient();
  const { data: rows, error: listError } = await supabase.rpc("list_payment_provider_settings", {
    p_organization_id: organization.id,
  });
  if (listError) return { ok: false, error: listError.message };
  const row = (rows ?? []).find((r) => r.id === settingsId);
  if (!row) return { ok: false, error: "not_found" };

  // get_payment_provider_credentials (the runtime resolver's RPC) requires
  // enabled=true by design -- it must never hand back credentials for a
  // not-yet-enabled row during real payment processing. Testing a DRAFT
  // row is exactly the opposite case, so this uses a separate,
  // narrowly-scoped RPC (get_payment_provider_settings_credentials, keyed
  // by settings_id, self-permission-checked, works regardless of status)
  // instead -- see its migration for the full rationale.
  const { data: credentials, error: credError } = await supabase
    .rpc("get_payment_provider_settings_credentials", { p_settings_id: settingsId })
    .single();

  if (credError || !credentials) {
    // Decryption/lookup itself failed -- record a generic failure (never
    // the raw RPC error, which could in principle include Vault/Postgres
    // internals) and surface a generic message to the UI.
    await supabase.rpc("record_payment_provider_verification", {
      p_settings_id: settingsId,
      p_success: false,
      p_error_message: "تعذر قراءة بيانات الاعتماد المُخزَّنة",
    });
    return { ok: false, error: "credentials_unreadable" };
  }

  const probe = await probeProvider(row.provider as "FAWRY" | "PAYMOB", {
    apiKey: credentials.api_key ?? "",
    baseUrl: row.provider === "FAWRY" ? "https://atfawry.fawrystaging.com" : undefined,
  });

  const { error: recordError } = await supabase.rpc("record_payment_provider_verification", {
    p_settings_id: settingsId,
    p_success: probe.success,
    // record_payment_provider_verification caps this at 500 chars itself
    // (left(p_error_message, 500)) and never receives anything but this
    // fixed, secret-free code -- never the raw fetch error or response body.
    p_error_message: probe.success ? null : probe.error,
  });
  if (recordError) return { ok: false, error: recordError.message };

  revalidatePath("/[locale]/finance/payment-providers", "page");
  return probe.success ? { ok: true } : { ok: false, error: probe.error ?? "connection_failed" };
}
