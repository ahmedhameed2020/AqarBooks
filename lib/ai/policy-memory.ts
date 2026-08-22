import { createClient } from "@/lib/supabase/server";
export * from "./policy-memory-types";
import { DEFAULT_REAL_ESTATE_POLICIES, type TenantAccountingPolicy } from "./policy-memory-types";

/**
 * In-memory / Database Hybrid Tenant Policy Resolver.
 * Returns active governed accounting policies for the specific tenant.
 */
export async function getTenantPolicies(tenantId: string): Promise<TenantAccountingPolicy[]> {
  try {
    const supabase = await createClient();
    const { data: dbPolicies } = await (supabase as any)
      .from("tenant_accounting_policies")
      .select("*")
      .eq("tenant_id", tenantId)
      .neq("status", "DISABLED");

    if (dbPolicies && dbPolicies.length > 0) {
      return dbPolicies.map((p: any) => ({
        id: p.id,
        tenantId: p.tenant_id,
        vendorPattern: p.vendor_pattern,
        descriptionPattern: p.description_pattern,
        preferredAccountId: p.preferred_account_id,
        preferredAccountCode: p.preferred_account_code,
        preferredAccountName: p.preferred_account_name,
        vatTreatment: p.vat_treatment,
        effectiveFrom: p.effective_from,
        learnedFromApprovalsCount: p.learned_from_approvals_count,
        status: p.status,
        version: p.version,
        lastUsedAt: p.last_used_at,
      }));
    }
  } catch {
    // fallback to defaults if table is not yet migrated
  }

  return DEFAULT_REAL_ESTATE_POLICIES.map((p, idx) => ({
    ...p,
    id: `default-pol-${idx + 1}`,
    tenantId,
  }));
}

/**
 * Matches a vendor and transaction text against active tenant accounting policies.
 */
export function matchAccountingPolicy(
  policies: TenantAccountingPolicy[],
  vendorName: string = "",
  description: string = ""
): TenantAccountingPolicy | null {
  const combined = `${vendorName} ${description}`.toLowerCase();

  for (const policy of policies) {
    if (policy.status === "DISABLED") continue;

    try {
      const vendorRegex = new RegExp(policy.vendorPattern, "i");
      if (vendorRegex.test(combined)) {
        if (!policy.descriptionPattern) return policy;

        const descRegex = new RegExp(policy.descriptionPattern, "i");
        if (descRegex.test(combined)) return policy;
      }
    } catch {
      // Regex parsing safety fallback
      if (combined.includes(policy.vendorPattern.toLowerCase())) return policy;
    }
  }

  return null;
}
