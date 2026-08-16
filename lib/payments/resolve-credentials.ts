import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPaymentsEnv } from "./env";
import type { ProviderId } from "./providers/types";

export interface ProviderCredentials {
  merchantIdentifier: string;
  publicKey: string | null;
  apiKey: string;
  hmacSecret: string;
}

// Thrown when a tenant HAS a setting row for this scope but it isn't
// usable (not enabled, org inactive, etc.) -- callers must surface this
// as a clear error to the user/log, and must NEVER catch this and silently
// fall back to legacy env credentials. That distinction is the entire
// point of this module -- see docs/superpowers/specs/2026-08-16-owner-portal-payment-provider-settings-design.md.
export class TenantProviderUnusableError extends Error {
  constructor(public readonly provider: ProviderId, public readonly rpcError: string) {
    super(`Payment provider ${provider} is configured for this tenant but not currently usable: ${rpcError}`);
    this.name = "TenantProviderUnusableError";
  }
}

// Thrown when NEITHER a tenant setting NOR legacy env vars are available --
// genuinely nothing to use.
export class NoProviderCredentialsError extends Error {
  constructor(public readonly provider: ProviderId) {
    super(`No credentials available for payment provider ${provider} -- no tenant setting and no legacy env fallback configured`);
    this.name = "NoProviderCredentialsError";
  }
}

// The exact fallback rule (financial-safety-critical, see design doc):
//
//   Tenant setting exists (any row found for this org/resort/provider/
//   environment, regardless of status)
//     -> use it if enabled, OR throw TenantProviderUnusableError if it
//        exists but isn't usable (not enabled/not verified/org inactive).
//        NEVER fall back to legacy env vars in this case -- a tenant that
//        configured (even incompletely) their own credentials must never
//        silently have a payment routed through someone else's account or
//        a leftover dev/test config.
//
//   No tenant setting exists AT ALL for this org/resort/provider/environment
//     -> fall back to legacy env vars (getPaymentsEnv()), a TRANSITIONAL
//        path only, to be removed once all tenants have real settings
//        configured.
/**
 * Resolves usable payment-provider credentials for a given tenant scope.
 *
 * SECURITY: this function performs NO authorization of its own -- it uses
 * the service-role admin client and calls a service-role-only RPC with no
 * internal permission check (by design, matching record_online_payment's
 * trust model: it's meant to be called only from already-authorized
 * server-side contexts, e.g. a checkout/webhook flow that has already
 * validated the organizationId/resortId it's passing in belong together
 * and to the correct tenant). Callers MUST NOT pass organizationId/resortId
 * derived from unvalidated client input.
 */
export async function resolveProviderCredentials(
  organizationId: string,
  resortId: string | null,
  provider: ProviderId,
  environment: "SANDBOX" | "PRODUCTION",
): Promise<ProviderCredentials> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .rpc("get_payment_provider_credentials", {
      p_organization_id: organizationId,
      p_resort_id: resortId,
      p_provider: provider,
      p_environment: environment,
    })
    .single();

  if (error) {
    if (error.message?.startsWith("NO_TENANT_SETTING")) {
      // The ONLY case where falling back to legacy env is correct -- see
      // the module-level doc comment and the design doc for why every
      // OTHER error must not fall back.
      return resolveLegacyEnvCredentials(provider);
    }
    throw new TenantProviderUnusableError(provider, error.message);
  }
  if (!data) {
    throw new TenantProviderUnusableError(provider, "RPC returned no data despite no error");
  }
  return {
    merchantIdentifier: data.merchant_identifier,
    publicKey: data.public_key,
    apiKey: data.api_key,
    hmacSecret: data.hmac_secret,
  };
}

// TODO: TRANSITIONAL -- legacy, single shared, env-var-based credentials,
// the pre-multi-tenant-settings configuration. Delete this function (and
// the NO_TENANT_SETTING fallback branch above) once every tenant that
// needs online payments has a real payment_provider_settings row. Throws
// whatever getPaymentsEnv() throws (PAYMENTS_ENV_INVALID) if the required
// env vars are also absent -- let it propagate, don't swallow it into a
// different error type, since its message already lists exactly which env
// vars are missing.
function resolveLegacyEnvCredentials(provider: ProviderId): ProviderCredentials {
  // Observability for the transitional path: nothing else tracks when a
  // tenant is still running on shared legacy credentials instead of their
  // own configured settings, so this is the only signal available for
  // deciding when it's safe to delete this function.
  console.warn(
    JSON.stringify({
      event: "payment_provider_legacy_env_fallback_used",
      provider,
      note: "No tenant-specific payment_provider_settings row exists for this scope -- using transitional env-var credentials. This path should be removed once all tenants have real settings configured.",
    }),
  );
  const env = getPaymentsEnv();
  if (provider === "FAWRY") {
    return {
      merchantIdentifier: env.FAWRY_MERCHANT_CODE,
      publicKey: null,
      apiKey: "",
      hmacSecret: env.FAWRY_SECURE_KEY,
    };
  }
  return {
    merchantIdentifier: env.PAYMOB_INTEGRATION_ID,
    publicKey: env.PAYMOB_PUBLIC_KEY,
    apiKey: env.PAYMOB_SECRET_KEY,
    hmacSecret: env.PAYMOB_HMAC_SECRET,
  };
}
