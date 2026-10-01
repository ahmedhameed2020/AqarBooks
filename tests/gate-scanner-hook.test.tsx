import { useEffect } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const {
  acquireScannerWakeLock,
  emitScannerFeedback,
  fingerprintQrPayload,
  processVisitorGateScanAction,
  recordGateConnectivityIncidentAction,
} = vi.hoisted(() => ({
  acquireScannerWakeLock: vi.fn(async () => null),
  emitScannerFeedback: vi.fn(),
  fingerprintQrPayload: vi.fn(),
  processVisitorGateScanAction: vi.fn(),
  recordGateConnectivityIncidentAction: vi.fn(),
}));

vi.mock("@/lib/actions/gates", () => ({ processVisitorGateScanAction }));
vi.mock("@/lib/actions/gate-connectivity", () => ({ recordGateConnectivityIncidentAction }));
vi.mock("@/lib/gates/scanner-feedback", () => ({
  acquireScannerWakeLock,
  emitScannerFeedback,
  fingerprintQrPayload,
}));

import { useGateScanner } from "@/app/[locale]/(app)/operations/gate/use-gate-scanner";

const deviceId = "e19ad3aa-0985-44cc-bb84-4d5e27535daf";
const gateId = "c50bd1c2-c5e7-4f20-9273-18f738f47f7a";
const deviceCredential = "d".repeat(43);

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((accept, decline) => {
    resolve = accept;
    reject = decline;
  });
  return { promise, reject, resolve };
}

type ScannerHook = ReturnType<typeof useGateScanner>;
let scanner!: ScannerHook;

function HookHarness({
  onAuthorizationFailure,
  mutedAudio = false,
  vibrationDisabled = false,
  reducedMotion = false,
  requestTimeoutMs = 12_000,
}: {
  onAuthorizationFailure?: () => void;
  mutedAudio?: boolean;
  vibrationDisabled?: boolean;
  reducedMotion?: boolean;
  requestTimeoutMs?: number;
}) {
  const currentScanner = useGateScanner({
    deviceId,
    mutedAudio,
    vibrationDisabled,
    reducedMotion,
    deviceCredential,
    gateId,
    direction: "ENTRY",
    cooldownMs: 100,
    requestTimeoutMs,
    onAuthorizationFailure,
  });
  useEffect(() => {
    scanner = currentScanner;
  }, [currentScanner]);
  return null;
}

describe("useGateScanner request interleavings", () => {
  let renderer: ReactTestRenderer;
  let browserWindow: EventTarget & {
    matchMedia: () => {
      matches: boolean;
      addEventListener: () => void;
      removeEventListener: () => void;
    };
  };
  let browserNavigator: { onLine: boolean };

  beforeAll(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  });

  beforeEach(async () => {
    vi.useFakeTimers();
    let uuidCounter = 0;
    browserWindow = Object.assign(new EventTarget(), {
      matchMedia: () => ({
        matches: false,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }),
    });
    browserNavigator = { onLine: true };
    vi.stubGlobal("window", browserWindow);
    vi.stubGlobal("navigator", browserNavigator);
    vi.stubGlobal("crypto", {
      randomUUID: vi.fn(() => `00000000-0000-4000-8000-${String(++uuidCounter).padStart(12, "0")}`),
    });

    acquireScannerWakeLock.mockClear();
    emitScannerFeedback.mockReset();
    fingerprintQrPayload.mockReset().mockResolvedValue("a".repeat(64));
    processVisitorGateScanAction.mockReset();
    recordGateConnectivityIncidentAction.mockReset().mockResolvedValue({ ok: true });

    await act(async () => {
      renderer = create(<HookHarness />);
    });
  });

  afterEach(async () => {
    await act(async () => renderer.unmount());
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("uses preferences changed while a scan is pending for its eventual feedback", async () => {
    const response = deferred<{ ok: false; error: string }>();
    processVisitorGateScanAction.mockReturnValue(response.promise);
    let submission!: Promise<void>;
    await act(async () => {
      submission = scanner.submitScan("preference-payload");
      await Promise.resolve();
    });
    await act(async () => renderer.update(<HookHarness mutedAudio vibrationDisabled reducedMotion />));
    await act(async () => {
      response.resolve({ ok: false, error: "failed" });
      await submission;
    });
    expect(emitScannerFeedback).toHaveBeenLastCalledWith("UNVERIFIED_OFFLINE", { mutedAudio: true, vibrationDisabled: true, reducedMotion: true });
  });

  it("suppresses a late ALLOW after connectivity invalidates the active request", async () => {
    const response = deferred<{
      ok: true;
      decision: "ALLOW";
      reasonCode: string;
      eventId: string;
      guestName: null;
      invitationNo: null;
      unitId: null;
      invitationId: null;
      usagePolicy: null;
      validUntil: null;
      isInside: null;
      gateId: string;
      propertyId: string;
      occurredAt: string;
    }>();
    processVisitorGateScanAction.mockReturnValue(response.promise);

    let submission!: Promise<void>;
    await act(async () => {
      submission = scanner.submitScan("raw-allow-payload");
      await Promise.resolve();
    });
    await act(async () => {
      browserNavigator.onLine = false;
      browserWindow.dispatchEvent(new Event("offline"));
    });
    await act(async () => {
      response.resolve({
        ok: true,
        decision: "ALLOW",
        reasonCode: "VALID_ENTRY",
        eventId: crypto.randomUUID(),
        guestName: null,
        invitationNo: null,
        unitId: null,
        invitationId: null,
        usagePolicy: null,
        validUntil: null,
        isInside: null,
        gateId,
        propertyId: crypto.randomUUID(),
        occurredAt: new Date().toISOString(),
      });
      await submission;
    });

    expect(scanner.state.status).toBe("OFFLINE");
    expect(scanner.result).toEqual({ ok: false, error: "unverified_offline" });
    expect(emitScannerFeedback).toHaveBeenCalledWith("UNVERIFIED_OFFLINE", expect.anything());
    expect(emitScannerFeedback).not.toHaveBeenCalledWith("ALLOW", expect.anything());
  });

  it("flushes one safe incident when an offline-invalidated request later rejects", async () => {
    const response = deferred<never>();
    processVisitorGateScanAction.mockReturnValue(response.promise);

    let submission!: Promise<void>;
    await act(async () => {
      submission = scanner.submitScan("raw-network-payload");
      await Promise.resolve();
    });
    await act(async () => {
      browserNavigator.onLine = false;
      browserWindow.dispatchEvent(new Event("offline"));
      response.reject(new Error("network unavailable"));
      await submission;
    });
    expect(recordGateConnectivityIncidentAction).not.toHaveBeenCalled();

    await act(async () => {
      browserNavigator.onLine = true;
      browserWindow.dispatchEvent(new Event("online"));
      await Promise.resolve();
    });

    expect(recordGateConnectivityIncidentAction).toHaveBeenCalledTimes(1);
    const incident = recordGateConnectivityIncidentAction.mock.calls[0]?.[0];
    expect(incident).toMatchObject({
      deviceId,
      gateId,
      direction: "ENTRY",
      payloadFingerprint: "a".repeat(64),
      errorCode: "OFFLINE",
      deviceCredential,
    });
    expect(incident).not.toHaveProperty("qrPayload");
  });

  it("flushes one safe incident when an offline-invalidated request later times out", async () => {
    const response = deferred<{ ok: false; error: "failed" }>();
    processVisitorGateScanAction.mockReturnValue(response.promise);
    await act(async () => {
      void scanner.submitScan("raw-timeout-payload");
      await Promise.resolve();
    });
    await act(async () => {
      browserNavigator.onLine = false;
      browserWindow.dispatchEvent(new Event("offline"));
      await vi.advanceTimersByTimeAsync(12_000);
    });
    expect(recordGateConnectivityIncidentAction).not.toHaveBeenCalled();

    await act(async () => {
      browserNavigator.onLine = true;
      browserWindow.dispatchEvent(new Event("online"));
      await Promise.resolve();
    });

    expect(recordGateConnectivityIncidentAction).toHaveBeenCalledTimes(1);
    const incident = recordGateConnectivityIncidentAction.mock.calls[0]?.[0];
    expect(incident).toMatchObject({
      deviceId,
      gateId,
      direction: "ENTRY",
      payloadFingerprint: "a".repeat(64),
      errorCode: "OFFLINE",
      deviceCredential,
    });
    expect(incident).not.toHaveProperty("qrPayload");

    await act(async () => {
      response.resolve({ ok: false, error: "failed" });
      await Promise.resolve();
    });
    expect(recordGateConnectivityIncidentAction).toHaveBeenCalledTimes(1);
  });

  it("retries successfully after a transient network failure without an online event", async () => {
    processVisitorGateScanAction
      .mockResolvedValueOnce({ ok: false, error: "failed" })
      .mockResolvedValueOnce({
        ok: true,
        decision: "ALLOW",
        reasonCode: "VALID_ENTRY",
        eventId: crypto.randomUUID(),
        guestName: null,
        invitationNo: null,
        unitId: null,
        invitationId: null,
        usagePolicy: null,
        validUntil: null,
        isInside: null,
        gateId,
        propertyId: crypto.randomUUID(),
        occurredAt: new Date().toISOString(),
      });

    await act(async () => scanner.submitScan("first-payload"));
    expect(scanner.state).toMatchObject({ status: "COOLDOWN", online: true });
    await act(async () => vi.advanceTimersByTimeAsync(100));
    expect(scanner.state.status).toBe("READY");

    fingerprintQrPayload.mockResolvedValueOnce("b".repeat(64));
    await act(async () => scanner.submitScan("second-payload"));

    expect(processVisitorGateScanAction).toHaveBeenCalledTimes(2);
    expect(scanner.result).toMatchObject({ ok: true, decision: "ALLOW" });
  });

  it("clears authorization for a rejection that arrives after timeout without replacing timeout UI", async () => {
    const onAuthorizationFailure = vi.fn();
    const response = deferred<{ ok: false; error: "device_not_authorized" }>();
    processVisitorGateScanAction.mockReturnValue(response.promise);
    await act(async () => {
      renderer.update(<HookHarness requestTimeoutMs={50} onAuthorizationFailure={onAuthorizationFailure} />);
    });

    let submission!: Promise<void>;
    await act(async () => {
      submission = scanner.submitScan("late-auth-payload");
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(50);
    });
    expect(scanner.result).toEqual({ ok: false, error: "unverified_offline" });

    await act(async () => {
      response.resolve({ ok: false, error: "device_not_authorized" });
      await submission;
    });

    expect(onAuthorizationFailure).toHaveBeenCalledTimes(1);
    expect(scanner.result).toEqual({ ok: false, error: "unverified_offline" });
  });

  it("acquires serialization before fingerprinting across connectivity changes", async () => {
    const fingerprint = deferred<string>();
    fingerprintQrPayload.mockReturnValue(fingerprint.promise);
    processVisitorGateScanAction.mockResolvedValue({
      ok: false,
      error: "invalid_qr_payload",
    });

    let first!: Promise<void>;
    await act(async () => {
      first = scanner.submitScan("first-raw-payload");
      void scanner.submitScan("second-raw-payload");
      browserNavigator.onLine = false;
      browserWindow.dispatchEvent(new Event("offline"));
      browserNavigator.onLine = true;
      browserWindow.dispatchEvent(new Event("online"));
      await Promise.resolve();
    });
    await act(async () => {
      fingerprint.resolve("c".repeat(64));
      await first;
    });

    expect(fingerprintQrPayload).toHaveBeenCalledTimes(1);
    expect(processVisitorGateScanAction).toHaveBeenCalledTimes(1);
  });
});
