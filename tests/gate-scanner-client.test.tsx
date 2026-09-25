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

const { processVisitorGateScanAction } = vi.hoisted(() => ({
  processVisitorGateScanAction: vi.fn(),
}));
vi.mock("@/lib/actions/gates", () => ({
  processVisitorGateScanAction,
}));

import { GateScannerClient, type GateScannerDevice } from "@/app/[locale]/(app)/operations/gate/gate-scanner-client";

const qrPayload = `AQP1.37ef8d07-f5d1-40c7-aa60-82c5cd6526e8.${"q".repeat(43)}`;
const deviceCredential = "d".repeat(43);
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
  const firstDecision = deferred<{ ok: false; error: string }>();
  const video = { readyState: 2, play, srcObject: null as MediaStream | null };

  beforeAll(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  });

  beforeEach(() => {
    vi.useFakeTimers();
    detect.mockReset().mockResolvedValue([{ rawValue: qrPayload }]);
    play.mockReset().mockResolvedValue(undefined);
    stop.mockReset();
    getUserMedia.mockReset().mockResolvedValue({ getTracks: () => [{ stop }] });
    processVisitorGateScanAction.mockReset()
      .mockImplementationOnce(() => firstDecision.promise)
      .mockResolvedValue({ ok: false, error: "test_complete" });

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
        <GateScannerClient device={device} recentEvents={[]} locale="en" />,
        { createNodeMock: (element) => element.type === "video" ? video : null },
      );
      await Promise.resolve();
    });

    const credentialInput = renderer.root.findByProps({ type: "password" });
    await act(async () => {
      credentialInput.props.onChange({ target: { value: deviceCredential } });
      button(renderer, "Exit").props.onClick();
    });

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
});
