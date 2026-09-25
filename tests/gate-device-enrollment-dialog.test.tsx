import { cloneElement, type ReactElement, type ReactNode } from "react";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: { children?: ReactNode } & Record<string, unknown>) => (
    <button {...props}>{children}</button>
  ),
}));

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children }: { children?: ReactNode }) => <>{children}</>,
  DialogBody: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DialogContent: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children?: ReactNode }) => <p>{children}</p>,
  DialogFooter: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children?: ReactNode }) => <h2>{children}</h2>,
  DialogTrigger: ({ render, disabled }: { render: ReactElement<{ disabled?: boolean }>; disabled?: boolean }) =>
    cloneElement(render, { disabled, "data-enrollment-trigger": true } as { disabled?: boolean }),
}));

vi.mock("@/lib/actions/gate-devices", () => ({
  createGateDeviceEnrollmentAction: vi.fn(),
}));

import {
  DeviceEnrollmentDialog,
  type EnrollmentGateOption,
} from "@/app/[locale]/(app)/operations/gates/device-enrollment-dialog";

const gateA: EnrollmentGateOption = {
  id: "gate-a",
  label: "Gate A",
  directionMode: "BOTH",
  isActive: true,
};

const gateB: EnrollmentGateOption = {
  id: "gate-b",
  label: "Gate B",
  directionMode: "ENTRY",
  isActive: true,
};

function selects(renderer: ReactTestRenderer) {
  return renderer.root.findAllByType("select");
}

function createButton(renderer: ReactTestRenderer): ReactTestInstance {
  return renderer.root.findAllByType("button").find((button) =>
    button.findAll((node) => node.type === "button" && node.children.includes("Create code")).length > 0
  )!;
}

describe("DeviceEnrollmentDialog gate reconciliation", () => {
  beforeAll(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  });

  it("selects the first active gate when props change from zero gates to one gate", async () => {
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(<DeviceEnrollmentDialog gates={[]} locale="en" />);
    });

    expect(renderer.root.findByProps({ "data-enrollment-trigger": true }).props.disabled).toBe(true);
    expect(createButton(renderer).props.disabled).toBe(true);

    await act(async () => {
      renderer.update(<DeviceEnrollmentDialog gates={[gateA]} locale="en" />);
    });

    const [gateSelect, directionSelect] = selects(renderer);
    expect(renderer.root.findByProps({ "data-enrollment-trigger": true }).props.disabled).toBe(false);
    expect(gateSelect.props.value).toBe("gate-a");
    expect(directionSelect.props.value).toBe("BOTH");
    expect(createButton(renderer).props.disabled).toBe(false);
  });

  it("normalizes direction changes and falls back when the selected gate is removed", async () => {
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(<DeviceEnrollmentDialog gates={[gateA, gateB]} locale="en" />);
    });

    let [gateSelect, directionSelect] = selects(renderer);
    expect(gateSelect.props.value).toBe("gate-a");
    expect(directionSelect.props.value).toBe("BOTH");

    await act(async () => {
      directionSelect.props.onChange({ target: { value: "ENTRY" } });
    });
    await act(async () => {
      renderer.update(
        <DeviceEnrollmentDialog
          gates={[{ ...gateA, directionMode: "EXIT" }, gateB]}
          locale="en"
        />,
      );
    });

    [gateSelect, directionSelect] = selects(renderer);
    expect(gateSelect.props.value).toBe("gate-a");
    expect(directionSelect.props.value).toBe("EXIT");

    await act(async () => {
      renderer.update(<DeviceEnrollmentDialog gates={[gateA, gateB]} locale="en" />);
    });

    [gateSelect, directionSelect] = selects(renderer);
    expect(gateSelect.props.value).toBe("gate-a");
    expect(directionSelect.props.value).toBe("BOTH");

    await act(async () => {
      renderer.update(<DeviceEnrollmentDialog gates={[gateB]} locale="en" />);
    });

    [gateSelect, directionSelect] = selects(renderer);
    expect(gateSelect.props.value).toBe("gate-b");
    expect(directionSelect.props.value).toBe("ENTRY");
    expect(createButton(renderer).props.disabled).toBe(false);
  });
});
