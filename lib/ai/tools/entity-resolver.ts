import { createClient } from "@/lib/supabase/server";

export type ResolvedEntity = {
  id: string;
  type: "property" | "unit" | "supplier" | "bank" | "period";
  name: string;
  code?: string;
};

/**
 * Resolves natural language entity mentions to strict database UUIDs
 * within the tenant's security boundary.
 */
export async function resolveEntitiesInText(
  tenantId: string,
  userQuery: string
): Promise<ResolvedEntity[]> {
  const queryLower = userQuery.toLowerCase().trim();
  const resolved: ResolvedEntity[] = [];

  try {
    const supabase = await createClient();
    // 1. Resolve Properties / Resorts
    const { data: properties } = await (supabase as any)
      .from("resorts")
      .select("id, name")
      .eq("organization_id", tenantId)
      .limit(30);

    for (const prop of properties || []) {
      if (queryLower.includes(prop.name.toLowerCase())) {
        resolved.push({ id: prop.id, type: "property", name: prop.name });
      }
    }

    // 2. Resolve Units
    const { data: units } = await (supabase as any)
      .from("units")
      .select("id, unit_number")
      .eq("organization_id", tenantId)
      .limit(100);

    for (const unit of units || []) {
      const uNum = (unit.unit_number || "").toLowerCase();
      if (queryLower.includes(uNum) || queryLower.includes(`وحدة ${uNum}`) || queryLower.includes(`شاليه ${uNum}`)) {
        resolved.push({ id: unit.id, type: "unit", name: `Unit ${unit.unit_number}`, code: unit.unit_number });
      }
    }

    // 3. Resolve Suppliers
    const { data: suppliers } = await (supabase as any)
      .from("suppliers")
      .select("id, name")
      .eq("organization_id", tenantId)
      .limit(50);

    for (const supp of suppliers || []) {
      if (queryLower.includes((supp.name || "").toLowerCase())) {
        resolved.push({ id: supp.id, type: "supplier", name: supp.name });
      }
    }

    // 4. Resolve Bank Accounts
    const { data: bankAccounts } = await (supabase as any)
      .from("bank_accounts")
      .select("id, account_name, account_number")
      .eq("organization_id", tenantId)
      .limit(20);

    for (const bank of bankAccounts || []) {
      if (queryLower.includes((bank.account_name || "").toLowerCase())) {
        resolved.push({ id: bank.id, type: "bank", name: bank.account_name, code: bank.account_number });
      }
    }

    // 5. Resolve Fiscal Periods
    const { data: periods } = await (supabase as any)
      .from("fiscal_periods")
      .select("id, name")
      .eq("organization_id", tenantId)
      .limit(20);

    for (const period of periods || []) {
      if (queryLower.includes((period.name || "").toLowerCase())) {
        resolved.push({ id: period.id, type: "period", name: period.name });
      }
    }
  } catch {
    // ignore query errors
  }

  return resolved;
}
