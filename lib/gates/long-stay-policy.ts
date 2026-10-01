import "server-only";
import { DEFAULT_LONG_STAY_HOURS } from "@/lib/gates/evidence-csv";

type PolicyQuery = PromiseLike<{ data: unknown; error: unknown }> & {
  select(columns: string): PolicyQuery;
  eq(column: string, value: string): PolicyQuery;
  limit(count: number): PolicyQuery;
};
export type PolicyClient = { from(table: string): PolicyQuery };
export async function getGateLongStayPolicy(client: PolicyClient, organizationId: string) {
  const { data, error } = await client.from("gate_long_stay_policy")
    .select("threshold_hours,notifications_enabled").eq("organization_id", organizationId).limit(1);
  if (error) throw new Error("gate_policy_unavailable");
  const row = Array.isArray(data) ? data[0] : undefined;
  return { thresholdHours: row?.threshold_hours ?? DEFAULT_LONG_STAY_HOURS,
    notificationsEnabled: row?.notifications_enabled ?? false } as { thresholdHours: number; notificationsEnabled: boolean };
}
