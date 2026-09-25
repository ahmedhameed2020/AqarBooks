export type ScannerDecision = "ALLOW" | "DENY" | "UNVERIFIED_OFFLINE";

export const DEFAULT_SCANNER_COOLDOWN_MS = 2_500;

export type ScannerState =
  | { status: "READY"; online: true }
  | { status: "OFFLINE"; online: false }
  | {
      status: "SUBMITTING";
      online: true;
      fingerprint: string;
      requestId: string;
    }
  | {
      status: "COOLDOWN";
      online: boolean;
      fingerprint: string;
      decision: ScannerDecision;
      cooldownUntil: number;
    };

export type ScannerEvent =
  | {
      type: "DECODED";
      fingerprint: string;
      requestId?: string;
      now?: number;
      cooldownMs?: number;
    }
  | {
      type: "RESOLVED";
      requestId?: string;
      decision: "ALLOW" | "DENY";
      now: number;
      cooldownMs?: number;
    }
  | {
      type: "FAILED_OFFLINE" | "ABORTED" | "TIMED_OUT";
      requestId?: string;
      now: number;
      cooldownMs?: number;
    }
  | { type: "COOLDOWN_EXPIRED"; now: number }
  | { type: "CONNECTIVITY_CHANGED"; online: boolean };

export const initialScannerState: ScannerState = { status: "READY", online: true };

function offlineCooldown(
  fingerprint: string,
  now: number,
  cooldownMs = DEFAULT_SCANNER_COOLDOWN_MS,
): ScannerState {
  return {
    status: "COOLDOWN",
    online: false,
    fingerprint,
    decision: "UNVERIFIED_OFFLINE",
    cooldownUntil: now + cooldownMs,
  };
}

export function reduceScannerState(state: ScannerState, event: ScannerEvent): ScannerState {
  switch (event.type) {
    case "CONNECTIVITY_CHANGED":
      if (event.online) {
        if (state.status === "OFFLINE") return initialScannerState;
        return state.online ? state : { ...state, online: true };
      }
      if (state.status === "SUBMITTING" || state.status === "READY") {
        return { status: "OFFLINE", online: false };
      }
      if (state.status === "OFFLINE") return state;
      return { ...state, online: false };

    case "DECODED": {
      if (state.status === "SUBMITTING") return state;
      if (state.status === "OFFLINE") {
        return offlineCooldown(
          event.fingerprint,
          event.now ?? Date.now(),
          event.cooldownMs,
        );
      }
      if (
        state.status === "COOLDOWN"
        && state.fingerprint === event.fingerprint
        && (event.now ?? Date.now()) < state.cooldownUntil
      ) {
        return state;
      }
      if (!state.online) {
        return offlineCooldown(
          event.fingerprint,
          event.now ?? Date.now(),
          event.cooldownMs,
        );
      }
      return {
        status: "SUBMITTING",
        online: true,
        fingerprint: event.fingerprint,
        requestId: event.requestId ?? event.fingerprint,
      };
    }

    case "RESOLVED":
      if (state.status !== "SUBMITTING" || (event.requestId && state.requestId !== event.requestId)) return state;
      return {
        status: "COOLDOWN",
        online: true,
        fingerprint: state.fingerprint,
        decision: event.decision,
        cooldownUntil: event.now + (event.cooldownMs ?? DEFAULT_SCANNER_COOLDOWN_MS),
      };

    case "FAILED_OFFLINE":
    case "TIMED_OUT":
      if (state.status !== "SUBMITTING" || (event.requestId && state.requestId !== event.requestId)) return state;
      return offlineCooldown(state.fingerprint, event.now, event.cooldownMs);

    case "ABORTED":
      if (state.status !== "SUBMITTING" || (event.requestId && state.requestId !== event.requestId)) return state;
      return initialScannerState;

    case "COOLDOWN_EXPIRED":
      if (state.status !== "COOLDOWN" || event.now < state.cooldownUntil) return state;
      return state.online ? initialScannerState : { status: "OFFLINE", online: false };
  }
}
