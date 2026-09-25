import { type ReactNode } from "react";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/ui/badge", () => ({
  Badge: ({ children, ...props }: { children?: ReactNode } & Record<string, unknown>) => (
    <span {...props}>{children}</span>
  ),
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: { children?: ReactNode } & Record<string, unknown>) => (
    <button {...props}>{children}</button>
  ),
}));

vi.mock("@/components/ui/input", () => ({
  Input: (props: Record<string, unknown>) => <input {...props} />,
}));

vi.mock("lucide-react", () => ({
  Camera: () => <span />,
  CheckCircle2: () => <span />,
  Keyboard: () => <span />,
  ScanQrCode: () => <span />,
  ShieldAlert: () => <span />,
  XCircle: () => <span />,
}));

const {
  clearGateDevice,
  processVisitorGateScanAction,
  readGateDevice,
  redeemGateDeviceEnrollmentAction,
  router,
  routerReplace,
  saveGateDevice,
} = vi.hoisted(() => {
  const replace = vi.fn();
  return {
    clearGateDevice: vi.fn(),
    processVisitorGateScanAction: vi.fn(),
    readGateDevice: vi.fn(),
    redeemGateDeviceEnrollmentAction: vi.fn(),
    router: { replace },
    routerReplace: replace,
    saveGateDevice: vi.fn(),
  };
});
vi.mock("@/lib/actions/gates", () => ({
  processVisitorGateScanAction,
}));
vi.mock("@/lib/actions/gate-devices", () => ({
  redeemGateDeviceEnrollmentAction,
}));
vi.mock("@/lib/gates/device-store", () => ({
  clearGateDevice,
  readGateDevice,
  saveGateDevice,
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/en/operations/gate",
  useRouter: () => router,
}));

import { GateScannerClient, type GateScannerDevice } from "@/app/[locale]/(app)/operations/gate/gate-scanner-client";

const qrPayload = `AQP1.37ef8d07-f5d1-40c7-aa60-82c5cd6526e8.${"q".repeat(43)}`;
const deviceCredential = "d".repeat(43);
const installationId = "i".repeat(43);
const device: GateScannerDevice = {
  id: "e19ad3aa-0985-44cc-bb84-4d5e27535daf",
  allowedDirection: "BOTH",
  gate: {
    id: "c50bd1c2-c5e7-4f20-9273-18f738f47f7a",
    code: "NORTH",
    name: "North gate",
    directionMode: "BOTH",
    propertyName: "Tower A",
  },
};
const storedDevice = {
  deviceId: device.id,
  gateId: device.gate.id,
  allowedDirection: device.allowedDirection,
  installationId,
  deviceCredential,
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((accept) => {
    resolve = accept;
  });
  return { promise, resolve };
}

function button(renderer: ReactTestRenderer, label: string): ReactTestInstance {
  return renderer.root.findAllByType("button").find((item) => item.children.includes(label))!;
}

describe("GateScannerClient camera polling", () => {
  const detect = vi.fn();
  const play = vi.fn();
  const stop = vi.fn();
  const getUserMedia = vi.fn();
  let firstDecision = deferred<{ ok: false; error: string }>();
  const video = { readyState: 2, play, srcObject: null as MediaStream | null };

  beforeAll(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  });

  beforeEach(() => {
    vi.useFakeTimers();
    firstDecision = deferred();
    detect.mockReset().mockResolvedValue([{ rawValue: qrPayload }]);
    play.mockReset().mockResolvedValue(undefined);
    stop.mockReset();
    getUserMedia.mockReset().mockResolvedValue({ getTracks: () => [{ stop }] });
    processVisitorGateScanAction.mockReset()
      .mockImplementationOnce(() => firstDecision.promise)
      .mockResolvedValue({ ok: false, error: "test_complete" });
    readGateDevice.mockReset().mockResolvedValue(storedDevice);
    saveGateDevice.mockReset().mockResolvedValue(undefined);
    clearGateDevice.mockReset().mockResolvedValue(undefined);
    redeemGateDeviceEnrollmentAction.mockReset();
    routerReplace.mockReset();

    vi.stubGlobal("window", {
      BarcodeDetector: class {
        detect = detect;
      },
      setInterval,
      clearInterval,
    });
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("submits detected codes with current credentials and direction, and pauses while pending", async () => {
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        <GateScannerClient requestedDeviceId={device.id} device={device} recentEvents={[]} locale="en" />,
        { createNodeMock: (element) => element.type === "video" ? video : null },
      );
      await Promise.resolve();
    });

    await act(async () => {
      button(renderer, "Exit").props.onClick();
    });
    expect(renderer.root.findAllByProps({ name: "deviceCredential" })).toHaveLength(0);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1200);
    });
    expect(processVisitorGateScanAction).toHaveBeenCalledTimes(1);
    expect(processVisitorGateScanAction).toHaveBeenLastCalledWith(expect.objectContaining({
      deviceCredential,
      direction: "EXIT",
      qrPayload,
    }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1200);
    });
    expect(detect).toHaveBeenCalledTimes(1);
    expect(processVisitorGateScanAction).toHaveBeenCalledTimes(1);

    await act(async () => {
      firstDecision.resolve({ ok: false, error: "first_complete" });
      await firstDecision.promise;
      button(renderer, "Entry").props.onClick();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1200);
    });
    expect(processVisitorGateScanAction).toHaveBeenCalledTimes(2);
    expect(processVisitorGateScanAction).toHaveBeenLastCalledWith(expect.objectContaining({
      deviceCredential,
      direction: "ENTRY",
      qrPayload,
    }));

    await act(async () => renderer.unmount());
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it("redeems an enrollment into IndexedDB and navigates with only the device id", async () => {
    readGateDevice.mockResolvedValue(null);
    redeemGateDeviceEnrollmentAction.mockResolvedValue({
      ok: true,
      deviceId: device.id,
      installationId,
      deviceCredential,
      gateId: device.gate.id,
      allowedDirection: "BOTH",
      displayName: "North kiosk",
    });

    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        <GateScannerClient requestedDeviceId={null} device={null} recentEvents={[]} locale="en" />,
        { createNodeMock: (element) => element.type === "video" ? video : null },
      );
      await Promise.resolve();
    });

    await act(async () => {
      renderer.root.findByProps({ name: "enrollmentId" }).props.onChange({ target: { value: "37ef8d07-f5d1-40c7-aa60-82c5cd6526e8" } });
      renderer.root.findByProps({ name: "enrollmentCode" }).props.onChange({ target: { value: "c".repeat(43) } });
      renderer.root.findByProps({ name: "displayName" }).props.onChange({ target: { value: "North kiosk" } });
    });
    await act(async () => {
      button(renderer, "Enroll device").props.onClick();
      await Promise.resolve();
    });

    expect(saveGateDevice).toHaveBeenCalledWith(storedDevice);
    expect(routerReplace).toHaveBeenCalledWith(`/en/operations/gate?deviceId=${device.id}`);
    expect(JSON.stringify(routerReplace.mock.calls)).not.toContain(deviceCredential);
    await act(async () => renderer.unmount());
  });

  it("restores the device id into the URL before trusting the local credential", async () => {
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        <GateScannerClient requestedDeviceId={null} device={null} recentEvents={[]} locale="en" />,
        { createNodeMock: (element) => element.type === "video" ? video : null },
      );
      await Promise.resolve();
    });

    expect(routerReplace).toHaveBeenCalledWith(`/en/operations/gate?deviceId=${device.id}`);
    expect(processVisitorGateScanAction).not.toHaveBeenCalled();
    await act(async () => renderer.unmount());
  });

  it("clears local credentials when the server rejects or changes the stored binding", async () => {
    readGateDevice.mockResolvedValue({ ...storedDevice, gateId: "a13c596c-ff51-4ccb-aa11-10fbe1073a17" });

    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        <GateScannerClient requestedDeviceId={device.id} device={device} recentEvents={[]} locale="en" />,
        { createNodeMock: (element) => element.type === "video" ? video : null },
      );
      await Promise.resolve();
    });

    expect(clearGateDevice).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1200);
    });
    expect(processVisitorGateScanAction).not.toHaveBeenCalled();
    await act(async () => renderer.unmount());
  });

  it("clears local credentials when the requested device is not active in the current organization", async () => {
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        <GateScannerClient requestedDeviceId={device.id} device={null} recentEvents={[]} locale="en" />,
        { createNodeMock: (element) => element.type === "video" ? video : null },
      );
      await Promise.resolve();
    });

    expect(clearGateDevice).toHaveBeenCalledTimes(1);
    expect(routerReplace).toHaveBeenCalledWith("/en/operations/gate");
    expect(processVisitorGateScanAction).not.toHaveBeenCalled();
    await act(async () => renderer.unmount());
  });

  it("clears a revoked credential returned by the server while the scanner is open", async () => {
    processVisitorGateScanAction.mockReset().mockResolvedValue({
      ok: false,
      error: "device_not_authorized",
    });

    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        <GateScannerClient requestedDeviceId={device.id} device={device} recentEvents={[]} locale="en" />,
        { createNodeMock: (element) => element.type === "video" ? video : null },
      );
      await Promise.resolve();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1200);
    });

    expect(clearGateDevice).toHaveBeenCalledTimes(1);
    expect(routerReplace).toHaveBeenCalledWith("/en/operations/gate");
    await act(async () => renderer.unmount());
  });
});
