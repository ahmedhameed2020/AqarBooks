import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc }) }));
import { noopAdapter } from "@/lib/gates/hardware/noop-adapter";
import { getGateHardwareAdapter } from "@/lib/gates/hardware/registry";
import { processGateHardwareCommand } from "@/lib/gates/hardware/process-command";
const command = { id: "command", access_event_id: "event", endpoint_id: "endpoint", gate_id: "gate", direction: "ENTRY" as const, adapter: "NOOP", claim_token: "lease" };
describe("hardware processor", () => {
  beforeEach(() => { rpc.mockReset(); rpc.mockImplementation((name: string) => Promise.resolve({ data: name === "validate_gate_hardware_command" ? true : "DEAD", error: null })); });
  it("NOOP never acknowledges an opening", async () => {
    expect(await noopAdapter.dispatchOpen({ idempotencyKey: "event", endpointId: "endpoint", gateId: "gate", direction: "ENTRY" })).toEqual({ status: "NOT_CONFIGURED" });
    expect(await processGateHardwareCommand(command)).toBe("DEAD");
    expect(rpc).toHaveBeenLastCalledWith("complete_gate_hardware_command", { p_command_id: "command", p_claim_token: "lease", p_result: "NOT_CONFIGURED" });
  });
  it("only exposes the approved NOOP adapter", () => {
    expect(getGateHardwareAdapter("NOOP")).toBe(noopAdapter);
    expect(getGateHardwareAdapter("https://attacker.test")).toBeNull();
    expect(getGateHardwareAdapter("__proto__")).toBeNull();
  });
  it("revalidates the lease and current policy before dispatch", async () => {
    rpc.mockResolvedValueOnce({ data: false, error: null });
    expect(await processGateHardwareCommand(command)).toBe("STALE");
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it("never dispatches on database errors", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: "secret" } });
    await expect(processGateHardwareCommand(command)).rejects.toThrow("hardware_validation_failed");
  });
  it("rejects unknown adapters without treating them as success", async () => {
    expect(await processGateHardwareCommand({ ...command, adapter: "VENDOR" })).toBe("DEAD");
  });
  it("sends only command identifiers and direction to adapters", async () => {
    const dispatch = vi.spyOn(noopAdapter, "dispatchOpen").mockResolvedValueOnce({ status: "ACKNOWLEDGED" });
    rpc.mockResolvedValueOnce({ data: true, error: null }).mockResolvedValueOnce({ data: "ACKNOWLEDGED", error: null });
    await processGateHardwareCommand({ ...command, guest_name: "private", qr: "secret" } as typeof command);
    expect(dispatch).toHaveBeenCalledWith({ idempotencyKey: "event", endpointId: "endpoint", gateId: "gate", direction: "ENTRY" });
    dispatch.mockRestore();
  });
  it("redacts adapter exceptions and records retryable failure", async () => {
    const dispatch = vi.spyOn(noopAdapter, "dispatchOpen").mockRejectedValueOnce(new Error("private QR secret"));
    rpc.mockResolvedValueOnce({ data: true, error: null }).mockResolvedValueOnce({ data: "FAILED", error: null });
    expect(await processGateHardwareCommand(command)).toBe("FAILED");
    expect(rpc).toHaveBeenLastCalledWith("complete_gate_hardware_command", expect.objectContaining({ p_result: "RETRYABLE_ERROR" }));
    expect(JSON.stringify(rpc.mock.calls)).not.toContain("private QR");
    dispatch.mockRestore();
  });
  it("surfaces completion failure so the lease can recover", async () => {
    rpc.mockResolvedValueOnce({ data: true, error: null }).mockResolvedValueOnce({ data: null, error: { message: "private" } });
    await expect(processGateHardwareCommand(command)).rejects.toThrow("hardware_completion_failed");
  });
});
