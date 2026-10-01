import "server-only";

export type CompletionPolicyClient = {
  rpc(name: "gate_completion_enabled", args: { p_organization_id: string }): PromiseLike<{ data: unknown; error: unknown }>;
};
export async function getGateCompletionEnabled(client: CompletionPolicyClient, organizationId: string): Promise<boolean> {
  const { data, error } = await client.rpc("gate_completion_enabled", { p_organization_id: organizationId });
  if (error) throw new Error("gate_completion_policy_unavailable");
  return data === true;
}
