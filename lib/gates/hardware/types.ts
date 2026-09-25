import "server-only";

/** Reviewed adapters must honor this event id across retries and timeouts. */
export type GateHardwareOpenCommand = {
  idempotencyKey: string;
  endpointId: string;
  gateId: string;
  direction: "ENTRY" | "EXIT";
};
export type GateHardwareDispatchResult = {
  status: "ACKNOWLEDGED" | "NOT_CONFIGURED" | "RETRYABLE_ERROR" | "PERMANENT_ERROR";
};
export interface GateHardwareAdapter {
  dispatchOpen(command: GateHardwareOpenCommand): Promise<GateHardwareDispatchResult>;
}
export type ClaimedGateHardwareCommand = {
  id: string;
  access_event_id: string;
  endpoint_id: string;
  gate_id: string;
  direction: "ENTRY" | "EXIT";
  adapter: string;
  claim_token: string;
};
export type HardwareCommandOutcome = "ACKNOWLEDGED" | "FAILED" | "DEAD" | "STALE";
