import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpc, revalidatePath } = vi.hoisted(() => ({ rpc: vi.fn(), revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => ({ rpc })) }));
vi.mock("next/cache", () => ({ revalidatePath }));
import { processVisitorGateScanAction } from "@/lib/actions/gates";

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
