"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import {
  recordGateConnectivityIncidentAction,
  type GateConnectivityIncidentInput,
} from "@/lib/actions/gate-connectivity";
import { processVisitorGateScanAction, type GateScanResult } from "@/lib/actions/gates";
import {
  DEFAULT_SCANNER_COOLDOWN_MS,
  initialScannerState,
  reduceScannerState,
  type ScannerEvent,
  type ScannerState,
} from "@/lib/gates/scanner-machine";
import {
  acquireScannerWakeLock,
  emitScannerFeedback,
  fingerprintQrPayload,
} from "@/lib/gates/scanner-feedback";

const DEFAULT_REQUEST_TIMEOUT_MS = 12_000;

interface UseGateScannerOptions {
  deviceId: string | null;
  deviceCredential: string;
  gateId: string | null;
  direction: "ENTRY" | "EXIT";
  mutedAudio?: boolean;
  vibrationDisabled?: boolean;
  cooldownMs?: number;
  requestTimeoutMs?: number;
  onAuthorizationFailure?: () => void;
}

type PendingIncident = Omit<GateConnectivityIncidentInput, "deviceCredential">;

function browserIsOnline() {
  return typeof navigator === "undefined" || navigator.onLine !== false;
}

export function useGateScanner({
  deviceId,
  deviceCredential,
  gateId,
  direction,
  mutedAudio = false,
  vibrationDisabled = false,
  cooldownMs = DEFAULT_SCANNER_COOLDOWN_MS,
  requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
  onAuthorizationFailure,
}: UseGateScannerOptions) {
  const [state, dispatch] = useReducer(reduceScannerState, browserIsOnline()
    ? initialScannerState
    : { status: "OFFLINE", online: false });
  const [result, setResult] = useState<GateScanResult | null>(null);
  const stateRef = useRef<ScannerState>(state);
  const inFlightRef = useRef(false);
  const pendingIncidentsRef = useRef<PendingIncident[]>([]);
  const mountedRef = useRef(true);
  const reducedMotionRef = useRef(false);

  const transition = useCallback((event: ScannerEvent) => {
    const next = reduceScannerState(stateRef.current, event);
    stateRef.current = next;
    dispatch(event);
    return next;
  }, []);

  const feedback = useCallback((decision: "ALLOW" | "DENY" | "UNVERIFIED_OFFLINE") => {
    emitScannerFeedback(decision, {
      mutedAudio,
      reducedMotion: reducedMotionRef.current,
      vibrationDisabled,
    });
  }, [mutedAudio, vibrationDisabled]);

  const persistIncident = useCallback(async (incident: PendingIncident) => {
    if (!deviceCredential || !browserIsOnline()) {
      pendingIncidentsRef.current.push(incident);
      return;
    }
    const persisted = await recordGateConnectivityIncidentAction({
      ...incident,
      deviceCredential,
    }).catch(() => ({ ok: false as const, error: "failed" as const }));
    if (!persisted.ok) pendingIncidentsRef.current.push(incident);
  }, [deviceCredential]);

  const flushIncidents = useCallback(async () => {
    if (!deviceCredential || !browserIsOnline() || pendingIncidentsRef.current.length === 0) return;
    const queued = pendingIncidentsRef.current;
    pendingIncidentsRef.current = [];
    for (const incident of queued) await persistIncident(incident);
  }, [deviceCredential, persistIncident]);

  useEffect(() => {
    mountedRef.current = true;
    const browserWindow = typeof window !== "undefined" ? window : null;
    const motionQuery = browserWindow
      ? browserWindow.matchMedia?.("(prefers-reduced-motion: reduce)")
      : undefined;
    reducedMotionRef.current = motionQuery?.matches ?? false;
    const updateMotion = (event: MediaQueryListEvent) => {
      reducedMotionRef.current = event.matches;
    };
    motionQuery?.addEventListener?.("change", updateMotion);

    const updateConnectivity = () => {
      const online = browserIsOnline();
      transition({ type: "CONNECTIVITY_CHANGED", online });
      if (online) void flushIncidents();
    };
    browserWindow?.addEventListener?.("online", updateConnectivity);
    browserWindow?.addEventListener?.("offline", updateConnectivity);

    let wakeLock: Awaited<ReturnType<typeof acquireScannerWakeLock>> = null;
    void acquireScannerWakeLock().then((sentinel) => {
      if (mountedRef.current) wakeLock = sentinel;
      else void sentinel?.release();
    });

    return () => {
      mountedRef.current = false;
      motionQuery?.removeEventListener?.("change", updateMotion);
      browserWindow?.removeEventListener?.("online", updateConnectivity);
      browserWindow?.removeEventListener?.("offline", updateConnectivity);
      void wakeLock?.release();
    };
  }, [flushIncidents, transition]);

  useEffect(() => {
    if (state.status !== "COOLDOWN") return;
    const delay = Math.max(0, state.cooldownUntil - Date.now());
    const timer = globalThis.setTimeout(() => {
      transition({ type: "COOLDOWN_EXPIRED", now: Date.now() });
    }, delay);
    return () => globalThis.clearTimeout(timer);
  }, [state, transition]);

  const submitScan = useCallback(async (qrPayload: string) => {
    if (!deviceId || !deviceCredential || !gateId || inFlightRef.current) return;

    const fingerprint = await fingerprintQrPayload(qrPayload);
    const clientScanId = crypto.randomUUID();
    const occurredAt = new Date().toISOString();
    const previousState = stateRef.current;
    const decoded = transition({
      type: "DECODED",
      fingerprint,
      requestId: clientScanId,
      now: Date.now(),
      cooldownMs,
    });

    if (decoded === previousState) return;

    const incident = (errorCode: "OFFLINE" | "NETWORK_ERROR" | "TIMEOUT"): PendingIncident => ({
      deviceId,
      gateId,
      direction,
      clientScanId,
      occurredAt,
      payloadFingerprint: fingerprint,
      errorCode,
    });

    if (decoded.status !== "SUBMITTING" || decoded.requestId !== clientScanId) {
      if (decoded.status === "COOLDOWN" && decoded.decision === "UNVERIFIED_OFFLINE") {
        setResult({ ok: false, error: "unverified_offline" });
        feedback("UNVERIFIED_OFFLINE");
        await persistIncident(incident("OFFLINE"));
      }
      return;
    }

    inFlightRef.current = true;
    let timedOut = false;
    const timeout = globalThis.setTimeout(() => {
      timedOut = true;
      transition({ type: "TIMED_OUT", requestId: clientScanId, now: Date.now(), cooldownMs });
      if (mountedRef.current) setResult({ ok: false, error: "unverified_offline" });
      feedback("UNVERIFIED_OFFLINE");
      void persistIncident(incident("TIMEOUT"));
    }, requestTimeoutMs);

    try {
      const scanResult = await processVisitorGateScanAction({
        deviceId,
        deviceCredential,
        gateId,
        qrPayload,
        direction,
        clientScanId,
      });
      if (timedOut || !mountedRef.current) return;

      setResult(scanResult);
      if (scanResult.ok) {
        transition({
          type: "RESOLVED",
          requestId: clientScanId,
          decision: scanResult.decision,
          now: Date.now(),
          cooldownMs,
        });
        feedback(scanResult.decision);
      } else if (scanResult.error === "failed") {
        transition({ type: "FAILED_OFFLINE", requestId: clientScanId, now: Date.now(), cooldownMs });
        setResult({ ok: false, error: "unverified_offline" });
        feedback("UNVERIFIED_OFFLINE");
        await persistIncident(incident("NETWORK_ERROR"));
      } else {
        transition({ type: "ABORTED", requestId: clientScanId, now: Date.now(), cooldownMs });
        if (["device_not_authorized", "unauthenticated"].includes(scanResult.error)) {
          onAuthorizationFailure?.();
        }
      }
    } catch {
      if (!timedOut && mountedRef.current) {
        transition({ type: "FAILED_OFFLINE", requestId: clientScanId, now: Date.now(), cooldownMs });
        setResult({ ok: false, error: "unverified_offline" });
        feedback("UNVERIFIED_OFFLINE");
        await persistIncident(incident("NETWORK_ERROR"));
      }
    } finally {
      globalThis.clearTimeout(timeout);
      inFlightRef.current = false;
    }
  }, [
    cooldownMs,
    deviceCredential,
    deviceId,
    direction,
    feedback,
    gateId,
    onAuthorizationFailure,
    persistIncident,
    requestTimeoutMs,
    transition,
  ]);

  return {
    state,
    result,
    isPending: state.status === "SUBMITTING",
    submitScan,
  };
}
