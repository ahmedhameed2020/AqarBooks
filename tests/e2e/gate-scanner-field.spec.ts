import { test, expect as baseExpect, type Page } from "@playwright/test";
import { createGateFixture, hash, sql } from "../helpers/gate-release";
import { enrolledScanner, manualScan, resultPanel } from "./gate-release-helpers";
const expect = baseExpect.configure({ timeout: 30_000 });
test.setTimeout(180_000);

type ProbeWindow = Window & { gateTones: number[]; gateVibrations: number[][]; gateCameraPayload: string | null };
async function capabilities(page: Page, mode: "camera" | "missing" | "denied" | "feedback-throws") {
  await page.addInitScript((mode) => {
    const probe = window as unknown as ProbeWindow;
    probe.gateTones = []; probe.gateVibrations = []; probe.gateCameraPayload = null;
    Object.defineProperty(navigator, "vibrate", { configurable: true, value: mode === "missing" ? undefined : (pattern: number[]) => {
      if (mode === "feedback-throws") throw new Error("Vibration unavailable");
      probe.gateVibrations.push(pattern); return true;
    } });
    Object.defineProperty(window, "AudioContext", { configurable: true, value: mode === "missing" ? undefined : class {
      currentTime = 0; destination = {};
      constructor() { if (mode === "feedback-throws") throw new Error("Audio unavailable"); }
      createGain() { return { gain: { setValueAtTime() {} }, connect() {} }; }
      createOscillator() {
        const frequency = { value: 0 };
        return { frequency, connect() {}, start() { probe.gateTones.push(frequency.value); }, stop() {}, addEventListener() {} };
      }
      close() { return Promise.resolve(); }
    } });
    Object.defineProperty(window, "BarcodeDetector", { configurable: true, value: mode === "missing" || mode === "feedback-throws" ? undefined : class {
      async detect() { return probe.gateCameraPayload ? [{ rawValue: probe.gateCameraPayload }] : []; }
    } });
    if (mode === "camera" || mode === "denied") {
      Object.defineProperty(navigator.mediaDevices, "getUserMedia", { configurable: true, value: async () => {
        if (mode === "denied") throw new DOMException("Denied", "NotAllowedError");
        const canvas = document.createElement("canvas"); canvas.width = 320; canvas.height = 240;
        const paint = () => { const c = canvas.getContext("2d")!; c.fillStyle = "black"; c.fillRect(0, 0, 320, 240); };
        paint(); setInterval(paint, 100);
        return canvas.captureStream(10);
      } });
    }
  }, mode);
}

test("camera and manual scans announce decisions, distinguish feedback and suppress cooldown duplicates", async ({ page }) => {
  const fixture = await createGateFixture(), visitor = fixture.invitation();
  await capabilities(page, "camera");
  await enrolledScanner(page, fixture);
  await expect(page.getByText("Camera active", { exact: true })).toBeVisible();
  await page.evaluate((payload) => { (window as unknown as ProbeWindow).gateCameraPayload = payload; }, visitor.payload);
  await expect(resultPanel(page)).toContainText("ALLOW");
  await expect(resultPanel(page)).toHaveClass(/bg-emerald-50/);
  await page.evaluate(() => { (window as unknown as ProbeWindow).gateCameraPayload = null; });
  await manualScan(page, visitor.payload);
  expect(sql(`select count(*) from public.access_events where visitor_invitation_id='${visitor.id}'`)).toBe("1");
  await expect.poll(() => page.evaluate(() => (window as unknown as ProbeWindow).gateTones)).toEqual([880]);
  expect(await page.evaluate(() => (window as unknown as ProbeWindow).gateVibrations)).toEqual([[80]]);
  // Advance only the cooldown clock; no server decision is mocked.
  await page.clock.install();
  await page.clock.fastForward(3_000);
  await manualScan(page, visitor.payload);
  await expect(resultPanel(page)).toContainText("DENY");
  await expect(resultPanel(page)).toHaveClass(/bg-rose-50/);
  expect(sql(`select string_agg(reason_code,',' order by occurred_at) from public.access_events where visitor_invitation_id='${visitor.id}'`)).toBe("VALID_ENTRY,ALREADY_INSIDE");
  expect(await page.evaluate(() => (window as unknown as ProbeWindow).gateTones)).toEqual([880, 220]);
  expect(await page.evaluate(() => (window as unknown as ProbeWindow).gateVibrations)).toEqual([[80], [300]]);
});

for (const mode of ["missing", "denied", "feedback-throws"] as const) {
  test(`manual input remains usable with ${mode} browser capabilities`, async ({ page }) => {
    const fixture = await createGateFixture(), visitor = fixture.invitation();
    await capabilities(page, mode);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await enrolledScanner(page, fixture);
    await expect(page.getByText(mode === "denied" ? "Camera unavailable" : "Use manual input", { exact: true })).toBeVisible();
    const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
    await manualScan(page, visitor.payload);
    await expect(resultPanel(page)).toContainText("ALLOW");
    expect(sql(`select decision from public.access_events where visitor_invitation_id='${visitor.id}'`)).toBe("ALLOW");
    expect(errors).toEqual([]);
  });
}

test("a stationary camera QR remains one decision after multiple cooldown periods", async ({ page }) => {
  const fixture = await createGateFixture(), visitor = fixture.invitation();
  await capabilities(page, "camera"); await enrolledScanner(page, fixture);
  await page.evaluate((payload) => { (window as unknown as ProbeWindow).gateCameraPayload = payload; }, visitor.payload);
  await expect(resultPanel(page)).toContainText("ALLOW");
  await expect(resultPanel(page)).toContainText("barrier not confirmed");
  await page.clock.install(); await page.clock.fastForward(12_000);
  expect(sql(`select count(*) from public.access_events where visitor_invitation_id='${visitor.id}'`)).toBe("1");
});

test("offline after load never allows or records access; reconnect persists one safe incident", async ({ page, context }) => {
  const fixture = await createGateFixture(), visitor = fixture.invitation();
  await capabilities(page, "denied");
  const device = await enrolledScanner(page, fixture);
  await context.setOffline(true);
  await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(false);
  await manualScan(page, visitor.payload);
  await expect(resultPanel(page)).toContainText("UNVERIFIED — OFFLINE");
  await expect(resultPanel(page)).not.toContainText("ALLOW");
  await expect(resultPanel(page)).toHaveClass(/bg-amber-50/);
  await expect(resultPanel(page)).not.toHaveClass(/bg-emerald/);
  expect(await page.evaluate(() => (window as unknown as ProbeWindow).gateTones)).toEqual([440]);
  expect(await page.evaluate(() => (window as unknown as ProbeWindow).gateVibrations)).toEqual([[80, 80, 80]]);
  await manualScan(page, visitor.payload);
  expect(sql(`select count(*) from public.access_events where organization_id='${fixture.org}'`)).toBe("0");
  expect(sql(`select count(*) from public.gate_connectivity_incidents where device_id='${device}'`)).toBe("0");
  await context.setOffline(false);
  await expect.poll(() => sql(`select count(*) from public.gate_connectivity_incidents where device_id='${device}'`)).toBe("1");
  const incident = sql(`select row_to_json(i) from public.gate_connectivity_incidents i where device_id='${device}'`);
  expect(incident).toContain(hash(visitor.payload));
  expect(incident).toContain("OFFLINE");
  expect(incident).not.toContain(visitor.payload);
  expect(incident).not.toContain(visitor.secret);
  expect(incident).not.toContain(visitor.guest);
  await context.setOffline(true); await context.setOffline(false);
  await expect(resultPanel(page)).not.toContainText("ALLOW");
  expect(sql(`select count(*) from public.gate_connectivity_incidents where device_id='${device}'`)).toBe("1");
  expect(sql(`select count(*) from public.access_events where organization_id='${fixture.org}'`)).toBe("0");
  expect(sql(`select count(*) from public.gate_hardware_commands where organization_id='${fixture.org}'`)).toBe("0");
});
