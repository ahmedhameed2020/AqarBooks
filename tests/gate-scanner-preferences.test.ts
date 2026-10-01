import { afterEach, describe, expect, it, vi } from "vitest";
import { readScannerPreferences, saveScannerPreferences, SCANNER_PREFERENCES_KEY } from "@/lib/gates/scanner-preferences";

describe("scanner preference storage", () => {
  afterEach(() => vi.unstubAllGlobals());
  function browser(stored: string | null, reducedMotion = false) {
    const setItem = vi.fn();
    vi.stubGlobal("window", { AudioContext: class {}, matchMedia: () => ({ matches: reducedMotion }), localStorage: { getItem: () => stored, setItem } });
    vi.stubGlobal("navigator", { vibrate: vi.fn() });
    return setItem;
  }
  it.each(["{", "null", "[]", '{"mutedAudio":"false"}', '{"mutedAudio":false,"vibrationDisabled":false,"reducedMotion":null}'])("defaults on malformed storage: %s", (stored) => {
    browser(stored, true);
    expect(readScannerPreferences()).toEqual({ mutedAudio: false, vibrationDisabled: false, reducedMotion: true });
  });
  it("respects OS motion and unsupported capabilities even when persisted values request feedback", () => {
    vi.stubGlobal("window", { matchMedia: () => ({ matches: true }), localStorage: { getItem: () => '{"mutedAudio":false,"vibrationDisabled":false,"reducedMotion":false}' } });
    vi.stubGlobal("navigator", {});
    expect(readScannerPreferences()).toEqual({ mutedAudio: true, vibrationDisabled: true, reducedMotion: true });
  });
  it("stores only the three safe booleans even when runtime input carries sensitive extras", () => {
    const setItem = browser(null);
    saveScannerPreferences({ mutedAudio: true, vibrationDisabled: false, reducedMotion: true, qrPayload: "secret", guestName: "guest", deviceCredential: "credential" } as Parameters<typeof saveScannerPreferences>[0]);
    expect(setItem).toHaveBeenCalledWith(SCANNER_PREFERENCES_KEY, '{"mutedAudio":true,"vibrationDisabled":false,"reducedMotion":true}');
  });
  it("handles blocked browser storage", () => {
    browser(null);
    Object.defineProperty(window, "localStorage", { get: () => { throw new Error("blocked"); } });
    expect(readScannerPreferences()).toEqual({ mutedAudio: false, vibrationDisabled: false, reducedMotion: false });
    expect(() => saveScannerPreferences({ mutedAudio: true, vibrationDisabled: true, reducedMotion: true })).not.toThrow();
  });
});
