import { describe, expect, it } from "vitest";
import {
  initialScannerState,
  reduceScannerState,
  type ScannerState,
} from "@/lib/gates/scanner-machine";
import {
  feedbackForDecision,
  fingerprintQrPayload,
} from "@/lib/gates/scanner-feedback";

const submitting: ScannerState = {
  status: "SUBMITTING",
  online: true,
  fingerprint: "abc",
  requestId: "request-1",
};

describe("gate scanner state machine", () => {
  it("moves a decoded QR from ready to submitting", () => {
    expect(reduceScannerState(initialScannerState, {
      type: "DECODED",
      fingerprint: "abc",
    }).status).toBe("SUBMITTING");
  });

  it("keeps exactly one request active while submitting", () => {
    expect(reduceScannerState(submitting, {
      type: "DECODED",
      fingerprint: "def",
      requestId: "request-2",
    })).toBe(submitting);
  });

  it("ignores duplicate and stale responses", () => {
    const cooldown = reduceScannerState(submitting, {
      type: "RESOLVED",
      requestId: "request-1",
      decision: "ALLOW",
      now: 1_000,
      cooldownMs: 2_000,
    });

    expect(reduceScannerState(cooldown, {
      type: "RESOLVED",
      requestId: "request-1",
      decision: "DENY",
      now: 1_100,
      cooldownMs: 2_000,
    })).toBe(cooldown);
    expect(reduceScannerState(submitting, {
      type: "RESOLVED",
      requestId: "request-stale",
      decision: "DENY",
      now: 1_100,
      cooldownMs: 2_000,
    })).toBe(submitting);
  });

  it("ignores the same QR during cooldown and accepts a different QR", () => {
    const cooldown = reduceScannerState(submitting, {
      type: "RESOLVED",
      requestId: "request-1",
      decision: "DENY",
      now: 1_000,
      cooldownMs: 2_000,
    });

    expect(reduceScannerState(cooldown, {
      type: "DECODED",
      fingerprint: "abc",
      requestId: "request-2",
      now: 2_000,
    })).toBe(cooldown);
    expect(reduceScannerState(cooldown, {
      type: "DECODED",
      fingerprint: "def",
      requestId: "request-2",
      now: 2_000,
    })).toMatchObject({
      status: "SUBMITTING",
      fingerprint: "def",
      requestId: "request-2",
    });
  });

  it("expires cooldown and accepts the same QR again", () => {
    const cooldown = reduceScannerState(submitting, {
      type: "RESOLVED",
      requestId: "request-1",
      decision: "ALLOW",
      now: 1_000,
      cooldownMs: 2_000,
    });
    const ready = reduceScannerState(cooldown, { type: "COOLDOWN_EXPIRED", now: 3_000 });

    expect(ready).toEqual(initialScannerState);
    expect(reduceScannerState(ready, {
      type: "DECODED",
      fingerprint: "abc",
      requestId: "request-2",
    }).status).toBe("SUBMITTING");
  });

  it("returns to ready when a request is aborted", () => {
    expect(reduceScannerState(submitting, {
      type: "ABORTED",
      requestId: "request-1",
      now: 1_000,
      cooldownMs: 2_000,
    })).toEqual(initialScannerState);
  });

  it("fails closed when a request times out", () => {
    const state = reduceScannerState(submitting, {
      type: "TIMED_OUT",
      requestId: "request-1",
      now: 1_000,
      cooldownMs: 2_000,
    });

    expect(state).toMatchObject({
      status: "COOLDOWN",
      decision: "UNVERIFIED_OFFLINE",
      fingerprint: "abc",
    });
  });

  it("moves offline without inventing an allow decision", () => {
    const offline = reduceScannerState(initialScannerState, {
      type: "CONNECTIVITY_CHANGED",
      online: false,
    });

    expect(offline).toEqual({ status: "OFFLINE", online: false });
    expect(reduceScannerState(offline, {
      type: "DECODED",
      fingerprint: "abc",
      requestId: "request-1",
      now: 1_000,
    })).toMatchObject({
      status: "COOLDOWN",
      decision: "UNVERIFIED_OFFLINE",
    });
  });
});

describe("gate scanner feedback", () => {
  it("maps allow, deny, and offline outcomes without an offline allow signal", () => {
    expect(feedbackForDecision("ALLOW")).toMatchObject({ tone: "GREEN", allowSignal: true });
    expect(feedbackForDecision("DENY")).toMatchObject({ tone: "RED", allowSignal: false });
    expect(feedbackForDecision("UNVERIFIED_OFFLINE")).toMatchObject({
      tone: "AMBER",
      allowSignal: false,
    });
  });

  it("honors reduced-motion and muted-audio preferences", () => {
    expect(feedbackForDecision("ALLOW", { reducedMotion: true, mutedAudio: true })).toMatchObject({
      animate: false,
      audio: null,
      allowSignal: true,
    });
  });

  it("fingerprints the QR locally without returning the raw payload", async () => {
    const payload = "AQP1.secret-value-that-must-not-persist";
    const fingerprint = await fingerprintQrPayload(payload);

    expect(fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(fingerprint).toBe(await fingerprintQrPayload(payload));
    expect(fingerprint).not.toContain(payload);
  });
});
