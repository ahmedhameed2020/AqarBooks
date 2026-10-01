import type { ScannerFeedbackPreferences } from "@/lib/gates/scanner-feedback";

export type ScannerPreferences = Required<ScannerFeedbackPreferences>;
export const SCANNER_PREFERENCES_KEY = "aqarbooks.gate-scanner.preferences.v1";

export function scannerCapabilities() {
  return {
    audio: typeof window !== "undefined" && Boolean(window.AudioContext || (window as Window & { webkitAudioContext?: unknown }).webkitAudioContext),
    vibration: typeof navigator !== "undefined" && typeof navigator.vibrate === "function",
    reducedMotion: typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches),
  };
}

export function readScannerPreferences(): ScannerPreferences {
  const capabilities = scannerCapabilities();
  const defaults = { mutedAudio: !capabilities.audio, vibrationDisabled: !capabilities.vibration, reducedMotion: capabilities.reducedMotion };
  try {
    const stored: unknown = JSON.parse(window.localStorage.getItem(SCANNER_PREFERENCES_KEY) ?? "null");
    if (!stored || typeof stored !== "object" || Array.isArray(stored)) return defaults;
    const value = stored as Record<string, unknown>;
    if (["mutedAudio", "vibrationDisabled", "reducedMotion"].some((key) => typeof value[key] !== "boolean")) return defaults;
    return {
      mutedAudio: !capabilities.audio || value.mutedAudio === true,
      vibrationDisabled: !capabilities.vibration || value.vibrationDisabled === true,
      reducedMotion: capabilities.reducedMotion || value.reducedMotion === true,
    };
  } catch {
    return defaults;
  }
}

// These device-wide accessibility choices may survive sign-out. Never persist scan or identity data.
export function saveScannerPreferences(preferences: ScannerPreferences): void {
  try {
    window.localStorage.setItem(SCANNER_PREFERENCES_KEY, JSON.stringify({
      mutedAudio: preferences.mutedAudio === true,
      vibrationDisabled: preferences.vibrationDisabled === true,
      reducedMotion: preferences.reducedMotion === true,
    }));
  } catch {
    // Storage is optional; the current session still uses the selected preferences.
  }
}
