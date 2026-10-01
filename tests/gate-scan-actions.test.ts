import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpc, revalidatePath } = vi.hoisted(() => ({ rpc: vi.fn(), revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => ({ rpc })) }));
vi.mock("next/cache", () => ({ revalidatePath }));
import { processVisitorGateScanAction, processLegacyVisitorGateScanAction } from "@/lib/actions/gates";

const id = "e19ad3aa-0985-44cc-bb84-4d5e27535daf";
const input = {
  deviceId: id, deviceCredential: "d".repeat(43), gateId: id,
  direction: "ENTRY" as const, qrPayload: `AQP1.${id}.${"q".repeat(43)}`, clientScanId: id,
};

describe("gate scan action error boundary", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    ["DEVICE_BINDING_NOT_AUTHORIZED", "device_not_authorized"],
    ["GATE_SCAN_NOT_AUTHORIZED", "forbidden"],
  ])("maps raw RPC denial %s to %s", async (message, error) => {
    rpc.mockResolvedValue({ data: null, error: { message } });
    await expect(processVisitorGateScanAction(input)).resolves.toEqual({ ok: false, error });
    expect(rpc).toHaveBeenCalledWith("process_visitor_gate_scan", expect.objectContaining({
      p_device_id: id, p_gate_id: id, p_device_credential: input.deviceCredential,
    }));
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("legacy scanner action compatibility", () => {
  beforeEach(() => vi.clearAllMocks());
  it("calls only the disabled-only five-argument scanner and maps rollout rejection", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "GATE_TRUSTED_DEVICE_REQUIRED" } });
    expect(await processLegacyVisitorGateScanAction(input)).toEqual({ ok: false, error: "trusted_device_required" });
    expect(rpc).toHaveBeenCalledWith("process_visitor_gate_scan", {
      p_gate_id: id, p_invitation_id: id, p_raw_secret: "q".repeat(43), p_direction: "ENTRY", p_client_scan_id: id,
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
  it("rejects malformed pass input without contacting database", async () => {
    expect(await processLegacyVisitorGateScanAction({ ...input, qrPayload: `${input.qrPayload}.extra` })).toEqual({ ok: false, error: "invalid_qr_payload" });
    expect(rpc).not.toHaveBeenCalled();
  });
  it("returns a valid disabled legacy decision and refreshes evidence", async () => {
    rpc.mockResolvedValue({ data: [{ decision: "ALLOW", reason_code: "VALID_ENTRY", event_id: id, gate_id: id }], error: null });
    expect(await processLegacyVisitorGateScanAction(input)).toMatchObject({ ok: true, decision: "ALLOW", eventId: id });
    expect(revalidatePath).toHaveBeenCalledWith("/[locale]/operations/access-events", "page");
  });
});
