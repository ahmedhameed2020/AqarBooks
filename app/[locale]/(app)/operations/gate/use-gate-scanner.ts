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
  reducedMotion?: boolean;
  cooldownMs?: number;
  requestTimeoutMs?: number;
  onAuthorizationFailure?: () => void;
}

type PendingIncident = Omit<GateConnectivityIncidentInput, "deviceCredential">;
type PendingIncidentBase = Omit<PendingIncident, "errorCode">;

interface ActiveIncident {
  requestId: string;
  incident: PendingIncidentBase;
  recorded: boolean;
}

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
  reducedMotion = false,
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
  const activeIncidentRef = useRef<ActiveIncident | null>(null);
  const pendingIncidentsRef = useRef<PendingIncident[]>([]);
  const mountedRef = useRef(true);
  const reducedMotionRef = useRef(false);
  const preferencesRef = useRef({ mutedAudio, vibrationDisabled, reducedMotion });
  useEffect(() => {
    preferencesRef.current = { mutedAudio, vibrationDisabled, reducedMotion };
  }, [mutedAudio, vibrationDisabled, reducedMotion]);

  const transition = useCallback((event: ScannerEvent) => {
    const next = reduceScannerState(stateRef.current, event);
    stateRef.current = next;
    dispatch(event);
    return next;
  }, []);

  const feedback = useCallback((decision: "ALLOW" | "DENY" | "UNVERIFIED_OFFLINE") => {
    emitScannerFeedback(decision, {
      ...preferencesRef.current,
      reducedMotion: reducedMotionRef.current || preferencesRef.current.reducedMotion,
    });
  }, []);

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

  const recordActiveIncident = useCallback((requestId: string, errorCode: PendingIncident["errorCode"]) => {
    const active = activeIncidentRef.current;
    if (!active || active.requestId !== requestId || active.recorded) return;
    active.recorded = true;
    void persistIncident({ ...active.incident, errorCode });
  }, [persistIncident]);

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
      const beforeConnectivity = stateRef.current;
      const afterConnectivity = transition({ type: "CONNECTIVITY_CHANGED", online });
      if (!online && beforeConnectivity.status === "SUBMITTING" && afterConnectivity !== beforeConnectivity) {
        setResult({ ok: false, error: "unverified_offline" });
        feedback("UNVERIFIED_OFFLINE");
        recordActiveIncident(beforeConnectivity.requestId, "OFFLINE");
      }
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
  }, [feedback, flushIncidents, recordActiveIncident, transition]);

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
    inFlightRef.current = true;

    try {
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

      const incidentBase: PendingIncidentBase = {
        deviceId,
        gateId,
        direction,
        clientScanId,
        occurredAt,
        payloadFingerprint: fingerprint,
      };
      const incident = (errorCode: PendingIncident["errorCode"]): PendingIncident => ({
        ...incidentBase,
        errorCode,
      });

      if (decoded.status !== "SUBMITTING" || decoded.requestId !== clientScanId) {
        if (decoded.status === "COOLDOWN" && decoded.decision === "UNVERIFIED_OFFLINE") {
          setResult({ ok: false, error: "unverified_offline" });
          feedback("UNVERIFIED_OFFLINE");
          void persistIncident(incident("OFFLINE"));
        }
        return;
      }
      activeIncidentRef.current = {
        requestId: clientScanId,
        incident: incidentBase,
        recorded: false,
      };
      setResult(null);

      let timedOut = false;
      const timeout = globalThis.setTimeout(() => {
        timedOut = true;
        recordActiveIncident(clientScanId, "TIMEOUT");
        const beforeTimeout = stateRef.current;
        const afterTimeout = transition({
          type: "TIMED_OUT",
          requestId: clientScanId,
          now: Date.now(),
          cooldownMs,
          online: browserIsOnline(),
        });
        if (afterTimeout === beforeTimeout) return;
        if (mountedRef.current) setResult({ ok: false, error: "unverified_offline" });
        feedback("UNVERIFIED_OFFLINE");
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

        if (!scanResult.ok && ["device_not_authorized", "unauthenticated"].includes(scanResult.error)) {
          onAuthorizationFailure?.();
        }
        if (timedOut || !mountedRef.current) return;

        if (scanResult.ok) {
          const beforeResolution = stateRef.current;
          const afterResolution = transition({
            type: "RESOLVED",
            requestId: clientScanId,
            decision: scanResult.decision,
            now: Date.now(),
            cooldownMs,
          });
          if (afterResolution === beforeResolution) return;
          setResult(scanResult);
          feedback(scanResult.decision);
        } else if (scanResult.error === "failed") {
          recordActiveIncident(clientScanId, "NETWORK_ERROR");
          const beforeFailure = stateRef.current;
          const afterFailure = transition({
            type: "FAILED_OFFLINE",
            requestId: clientScanId,
            now: Date.now(),
            cooldownMs,
            online: browserIsOnline(),
          });
          if (afterFailure === beforeFailure) return;
          setResult({ ok: false, error: "unverified_offline" });
          feedback("UNVERIFIED_OFFLINE");
        } else {
          const beforeAbort = stateRef.current;
          const afterAbort = transition({
            type: "ABORTED",
            requestId: clientScanId,
            now: Date.now(),
            cooldownMs,
          });
          if (afterAbort !== beforeAbort) setResult(scanResult);
        }
      } catch {
        if (!timedOut && mountedRef.current) {
          recordActiveIncident(clientScanId, "NETWORK_ERROR");
          const beforeFailure = stateRef.current;
          const afterFailure = transition({
            type: "FAILED_OFFLINE",
            requestId: clientScanId,
            now: Date.now(),
            cooldownMs,
            online: browserIsOnline(),
          });
          if (afterFailure !== beforeFailure) {
            setResult({ ok: false, error: "unverified_offline" });
            feedback("UNVERIFIED_OFFLINE");
          }
        }
      } finally {
        globalThis.clearTimeout(timeout);
        if (activeIncidentRef.current?.requestId === clientScanId) activeIncidentRef.current = null;
      }
    } finally {
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
    recordActiveIncident,
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
