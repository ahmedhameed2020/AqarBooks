import type { ScannerDecision } from "@/lib/gates/scanner-machine";

export interface ScannerFeedbackPreferences {
  reducedMotion?: boolean;
  mutedAudio?: boolean;
  vibrationDisabled?: boolean;
}

export interface ScannerFeedback {
  tone: "GREEN" | "RED" | "AMBER";
  allowSignal: boolean;
  animate: boolean;
  audio: { frequencyHz: number; durationMs: number } | null;
  vibration: number[];
}

const FEEDBACK: Record<ScannerDecision, Omit<ScannerFeedback, "animate" | "audio"> & {
  audio: NonNullable<ScannerFeedback["audio"]>;
}> = {
  ALLOW: {
    tone: "GREEN",
    allowSignal: true,
    audio: { frequencyHz: 880, durationMs: 120 },
    vibration: [80],
  },
  DENY: {
    tone: "RED",
    allowSignal: false,
    audio: { frequencyHz: 220, durationMs: 420 },
    vibration: [300],
  },
  UNVERIFIED_OFFLINE: {
    tone: "AMBER",
    allowSignal: false,
    audio: { frequencyHz: 440, durationMs: 180 },
    vibration: [80, 80, 80],
  },
};

export function feedbackForDecision(
  decision: ScannerDecision,
  preferences: ScannerFeedbackPreferences = {},
): ScannerFeedback {
  const feedback = FEEDBACK[decision];
  return {
    ...feedback,
    animate: !preferences.reducedMotion,
    audio: preferences.mutedAudio ? null : feedback.audio,
    vibration: preferences.vibrationDisabled ? [] : feedback.vibration,
  };
}

export async function fingerprintQrPayload(payload: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

type AudioContextConstructor = new () => AudioContext;

export function emitScannerFeedback(
  decision: ScannerDecision,
  preferences: ScannerFeedbackPreferences = {},
): ScannerFeedback {
  const feedback = feedbackForDecision(decision, preferences);

  if (typeof navigator !== "undefined" && feedback.vibration.length > 0 && "vibrate" in navigator) {
    try {
      navigator.vibrate(feedback.vibration);
    } catch {
      // Feedback capabilities are optional and never affect the access decision.
    }
  }

  if (typeof window !== "undefined" && feedback.audio) {
    const AudioContextClass = (
      window.AudioContext
      ?? (window as typeof window & { webkitAudioContext?: AudioContextConstructor }).webkitAudioContext
    );
    if (AudioContextClass) {
      try {
        const context = new AudioContextClass();
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.frequency.value = feedback.audio.frequencyHz;
        gain.gain.setValueAtTime(0.08, context.currentTime);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start();
        oscillator.stop(context.currentTime + feedback.audio.durationMs / 1_000);
        oscillator.addEventListener("ended", () => void context.close(), { once: true });
      } catch {
        // Feedback capabilities are optional and never affect the access decision.
      }
    }
  }

  return feedback;
}

interface WakeLockSentinelLike {
  release(): Promise<void>;
}

export async function acquireScannerWakeLock(): Promise<WakeLockSentinelLike | null> {
  if (typeof navigator === "undefined") return null;
  const wakeLock = (navigator as Navigator & {
    wakeLock?: { request(type: "screen"): Promise<WakeLockSentinelLike> };
  }).wakeLock;
  if (!wakeLock) return null;

  try {
    return await wakeLock.request("screen");
  } catch {
    return null;
  }
}
