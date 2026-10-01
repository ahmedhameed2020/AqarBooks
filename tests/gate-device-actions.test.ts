import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockRpc, mockRevalidatePath } = vi.hoisted(() => ({
  mockRpc: vi.fn(),
  mockRevalidatePath: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: mockRevalidatePath }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ rpc: mockRpc })),
}));

import {
  createGateDeviceEnrollmentAction,
  redeemGateDeviceEnrollmentAction,
  revokeGateDeviceAction,
} from "@/lib/actions/gate-devices";
import { generateDeviceSecret } from "@/lib/gates/device-credentials";

const gateId = "c50bd1c2-c5e7-4f20-9273-18f738f47f7a";
const enrollmentId = "37ef8d07-f5d1-40c7-aa60-82c5cd6526e8";
const deviceId = "e19ad3aa-0985-44cc-bb84-4d5e27535daf";

describe("gate device credential boundary", () => {
  beforeEach(() => {
    vi.useRealTimers();
    mockRpc.mockReset();
    mockRevalidatePath.mockReset();
  });

  it("generates a 32-byte base64url secret, its SHA-256 digest, and a safe hint", () => {
    const secret = generateDeviceSecret();

    expect(secret.raw).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(secret.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(secret.hint).toBe(secret.raw.slice(-8));
    expect(secret.sha256).not.toContain(secret.raw);
  });

  it("rejects invalid gate ids and directions before calling the RPC", async () => {
    await expect(createGateDeviceEnrollmentAction({ gateId: "not-a-uuid", direction: "ENTRY" })).resolves.toEqual({
      ok: false,
      error: "invalid_input",
    });
    await expect(
      createGateDeviceEnrollmentAction({ gateId, direction: "SIDEWAYS" as "ENTRY" }),
    ).resolves.toEqual({ ok: false, error: "invalid_input" });
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("creates a 15-minute enrollment while sending only the secret hash to the RPC", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-25T10:00:00.000Z"));
    mockRpc.mockResolvedValue({ data: enrollmentId, error: null });

    const result = await createGateDeviceEnrollmentAction({ gateId, direction: "ENTRY" });

    expect(result).toMatchObject({
      ok: true,
      enrollmentId,
      expiresAt: "2026-09-25T10:15:00.000Z",
    });
    if (!result.ok) throw new Error("expected enrollment success");
    expect(result.code).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(result.hint).toBe(result.code.slice(-8));
    expect(mockRpc).toHaveBeenCalledWith("create_gate_device_enrollment", {
      p_gate_id: gateId,
      p_direction: "ENTRY",
      p_code_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
      p_expires_at: "2026-09-25T10:15:00.000Z",
    });
    expect(JSON.stringify(mockRpc.mock.calls)).not.toContain(result.code);
    expect(mockRevalidatePath).toHaveBeenCalledWith("/[locale]/operations/gates", "page");
  });

  it("maps opaque RPC failures to a generic action error", async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: "database internals: relation unavailable" } });

    await expect(createGateDeviceEnrollmentAction({ gateId, direction: "BOTH" })).resolves.toEqual({
      ok: false,
      error: "failed",
    });
  });

  it("redeems an enrollment with hashed installation and credential values only", async () => {
    mockRpc.mockResolvedValue({
      data: {
        id: deviceId,
        gate_id: gateId,
        allowed_direction: "EXIT",
        display_name: "South exit tablet",
        status: "ACTIVE",
        credential_hash: null,
        installation_id_hash: null,
      },
      error: null,
    });

    const result = await redeemGateDeviceEnrollmentAction({
      enrollmentId,
      code: "a".repeat(43),
      displayName: "South exit tablet",
    });

    expect(result).toMatchObject({
      ok: true,
      deviceId,
      gateId,
      allowedDirection: "EXIT",
      displayName: "South exit tablet",
    });
    if (!result.ok) throw new Error("expected redemption success");
    expect(result.installationId).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(result.deviceCredential).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(JSON.stringify(mockRpc.mock.calls)).not.toContain(result.installationId);
    expect(JSON.stringify(mockRpc.mock.calls)).not.toContain(result.deviceCredential);
    expect(mockRpc).toHaveBeenCalledWith("redeem_gate_device_enrollment", {
      p_enrollment_id: enrollmentId,
      p_code: "a".repeat(43),
      p_installation_id_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
      p_credential_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
      p_display_name: "South exit tablet",
    });
  });

  it("revokes a device and revalidates the management page", async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });

    await expect(revokeGateDeviceAction({ deviceId, reason: "Retired from service" })).resolves.toEqual({ ok: true });
    expect(mockRpc).toHaveBeenCalledWith("revoke_gate_device", {
      p_device_id: deviceId,
      p_reason: "Retired from service",
    });
    expect(mockRevalidatePath).toHaveBeenCalledWith("/[locale]/operations/gates", "page");
  });
});
