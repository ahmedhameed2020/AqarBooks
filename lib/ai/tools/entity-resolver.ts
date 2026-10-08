import { createClient } from "@/lib/supabase/server";

type EntityRow = {
  id: string;
  name?: string | null;
  unit_number?: string | null;
  account_name?: string | null;
  account_number?: string | null;
};
type EntityQuery = {
  select: (columns: string) => {
    eq: (column: string, value: string) => {
      limit: (count: number) => Promise<{ data: EntityRow[] | null }>;
    };
  };
};

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
    const db = supabase as unknown as { from: (table: string) => EntityQuery };
    // 1. Resolve Properties / Resorts
    const { data: properties } = await db
      .from("resorts")
      .select("id, name")
      .eq("organization_id", tenantId)
      .limit(30);

    for (const prop of properties || []) {
      const name = prop.name?.trim();
      if (name && queryLower.includes(name.toLowerCase())) {
        resolved.push({ id: prop.id, type: "property", name });
      }
    }

    // 2. Resolve Units
    const { data: units } = await db
      .from("units")
      .select("id, unit_number")
      .eq("organization_id", tenantId)
      .limit(100);

    for (const unit of units || []) {
      const uNum = (unit.unit_number || "").toLowerCase();
      if (queryLower.includes(uNum) || queryLower.includes(`وحدة ${uNum}`) || queryLower.includes(`شاليه ${uNum}`)) {
        resolved.push({ id: unit.id, type: "unit", name: `Unit ${unit.unit_number ?? ""}`, code: unit.unit_number ?? undefined });
      }
    }

    // 3. Resolve Suppliers
    const { data: suppliers } = await db
      .from("suppliers")
      .select("id, name")
      .eq("organization_id", tenantId)
      .limit(50);

    for (const supp of suppliers || []) {
      const name = supp.name?.trim();
      if (name && queryLower.includes(name.toLowerCase())) {
        resolved.push({ id: supp.id, type: "supplier", name });
      }
    }

    // 4. Resolve Bank Accounts
    const { data: bankAccounts } = await db
      .from("bank_accounts")
      .select("id, account_name, account_number")
      .eq("organization_id", tenantId)
      .limit(20);

    for (const bank of bankAccounts || []) {
      const name = bank.account_name?.trim();
      if (name && queryLower.includes(name.toLowerCase())) {
        resolved.push({ id: bank.id, type: "bank", name, code: bank.account_number ?? undefined });
      }
    }

    // 5. Resolve Fiscal Periods
    const { data: periods } = await db
      .from("fiscal_periods")
      .select("id, name")
      .eq("organization_id", tenantId)
      .limit(20);

    for (const period of periods || []) {
      const name = period.name?.trim();
      if (name && queryLower.includes(name.toLowerCase())) {
        resolved.push({ id: period.id, type: "period", name });
      }
    }
  } catch {
    // ignore query errors
  }

  return resolved;
}
