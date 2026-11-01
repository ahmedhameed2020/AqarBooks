import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Creates a fiscal year through the product RPC `create_fiscal_year` (which also creates its
 * monthly periods) and opens every period through `set_fiscal_period_status`.
 *
 * Both RPCs call `auth.uid()` and check `finance.periods.manage`, so `ownerClient` MUST be a
 * signed-in user session with that permission (e.g. a TENANT_OWNER). A service-role client has no
 * `auth.uid()` and is refused with 42501. `admin` is only used to read the periods back.
 */
export async function createOpenFiscalYear(
  admin: SupabaseClient<any, any, any>,
  ownerClient: SupabaseClient<any, any, any>,
  args: { orgId: string; name: string; startDate: string; endDate: string },
): Promise<string> {
  const { data: fyId, error: fyErr } = await ownerClient.rpc("create_fiscal_year", {
    p_organization_id: args.orgId,
    p_name: args.name,
    p_start_date: args.startDate,
    p_end_date: args.endDate,
  });
  if (fyErr) throw new Error(`create_fiscal_year failed: ${fyErr.message}`);

  const { data: periods, error: pErr } = await admin
    .from("fiscal_periods")
    .select("id")
    .eq("fiscal_year_id", fyId as string);
  if (pErr) throw new Error(`reading fiscal periods failed: ${pErr.message}`);

  for (const p of periods ?? []) {
    const { error } = await ownerClient.rpc("set_fiscal_period_status", {
      p_fiscal_period_id: p.id as string,
      p_status: "OPEN",
      p_reason: "test setup",
    });
    if (error) throw new Error(`open fiscal period failed: ${error.message}`);
  }
  return fyId as string;
}
