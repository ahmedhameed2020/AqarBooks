import { describe, expect, it } from "vitest";
import { parseGateScanRequest } from "@/lib/gates/scanner-contract";

const deviceId = "e19ad3aa-0985-44cc-bb84-4d5e27535daf";
const gateId = "c50bd1c2-c5e7-4f20-9273-18f738f47f7a";
const invitationId = "37ef8d07-f5d1-40c7-aa60-82c5cd6526e8";
const clientScanId = "78c44c25-a70f-41f7-887f-a47442364b61";
const deviceCredential = "d".repeat(43);
const qrPayload = `AQP1.${invitationId}.${"q".repeat(43)}`;

describe("gate scanner request contract", () => {
  it("requires the enrolled device identity and credential with the requested gate and direction", () => {
    expect(parseGateScanRequest({
      deviceId,
      deviceCredential,
      gateId,
      direction: "ENTRY",
      qrPayload,
      clientScanId,
    })).toEqual(expect.objectContaining({ deviceId, deviceCredential, gateId, direction: "ENTRY" }));
  });

  it.each([
    ["device id", { deviceCredential, gateId, direction: "ENTRY", qrPayload, clientScanId }],
    ["device credential", { deviceId, gateId, direction: "ENTRY", qrPayload, clientScanId }],
    ["gate id", { deviceId, deviceCredential, direction: "ENTRY", qrPayload, clientScanId }],
  ])("rejects a request without its %s", (_label, input) => {
    expect(() => parseGateScanRequest(input)).toThrow();
  });

  it("rejects malformed credential material and unsupported directions", () => {
    expect(() => parseGateScanRequest({
      deviceId,
      deviceCredential: "not-a-device-credential",
      gateId,
      direction: "ENTRY",
      qrPayload,
      clientScanId,
    })).toThrow();
    expect(() => parseGateScanRequest({
      deviceId,
      deviceCredential,
      gateId,
      direction: "BOTH",
      qrPayload,
      clientScanId,
    })).toThrow();
  });
});
