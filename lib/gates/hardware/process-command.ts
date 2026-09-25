import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getGateHardwareAdapter } from "./registry";
import type { ClaimedGateHardwareCommand, GateHardwareDispatchResult, HardwareCommandOutcome } from "./types";

export async function processGateHardwareCommand(command: ClaimedGateHardwareCommand): Promise<HardwareCommandOutcome> {
  const admin = createAdminClient();
  const lease = { p_command_id: command.id, p_claim_token: command.claim_token };
  const validation = await admin.rpc("validate_gate_hardware_command" as never, lease as never);
  if (validation.error) throw new Error("hardware_validation_failed");
  if (validation.data !== true) return "STALE";

  const adapter = getGateHardwareAdapter(command.adapter);
  let result: GateHardwareDispatchResult = { status: "PERMANENT_ERROR" };
  if (adapter) {
    try {
      result = await adapter.dispatchOpen({
        idempotencyKey: command.access_event_id,
        endpointId: command.endpoint_id,
        gateId: command.gate_id,
        direction: command.direction,
      });
    } catch {
      // Never persist/log raw exceptions or arbitrary vendor responses.
      result = { status: "RETRYABLE_ERROR" };
    }
  }
  const completion = await admin.rpc("complete_gate_hardware_command" as never, { ...lease, p_result: result.status } as never);
  if (completion.error) throw new Error("hardware_completion_failed");
  if (["ACKNOWLEDGED", "FAILED", "DEAD", "STALE"].includes(completion.data as string)) return completion.data as HardwareCommandOutcome;
  throw new Error("hardware_completion_failed");
}
