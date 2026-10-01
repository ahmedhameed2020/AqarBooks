import { type ReactNode } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, locale: _locale, ...props }: { children?: ReactNode; locale?: string } & Record<string, unknown>) => (
    <a {...props} data-locale={_locale}>{children}</a>
  ),
  usePathname: () => "/en/operations/gate",
}));
vi.mock("@/lib/utils", () => ({
  cn: (...values: unknown[]) => values.filter(Boolean).join(" "),
}));
vi.mock("@/components/marketing/logo-mark", () => ({
  LogoMark: () => <span />,
}));
vi.mock("lucide-react", () => {
  const Icon = () => <span />;
  return {
    Building2: Icon,
    ChevronDown: Icon,
    LogOut: Icon,
    PanelLeftClose: Icon,
    PanelLeftOpen: Icon,
    Search: Icon,
    Settings: Icon,
    ShieldCheck: Icon,
    Star: Icon,
    User: Icon,
    X: Icon,
  };
});

const { clearGateDeviceBeforeSignOut } = vi.hoisted(() => ({
  clearGateDeviceBeforeSignOut: vi.fn(),
}));
vi.mock("@/lib/gates/device-store", () => ({
  clearGateDeviceBeforeSignOut,
}));

import { AppSidebar } from "@/components/app-sidebar";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((accept) => {
    resolve = accept;
  });
  return { promise, resolve };
}

describe("AppSidebar gate-device sign-out ordering", () => {
  beforeAll(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  });

  beforeEach(() => {
    clearGateDeviceBeforeSignOut.mockReset();
    vi.stubGlobal("localStorage", {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
    });
    vi.stubGlobal("window", {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    vi.stubGlobal("document", { activeElement: null });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("blocks repeated user submits until clear completes, then permits one programmatic submit", async () => {
    const clearGate = deferred();
    const order: string[] = [];
    const serverSubmit = vi.fn(() => {
      order.push("server-submit");
    });
    clearGateDeviceBeforeSignOut.mockImplementation(async (continueSignOut: () => void) => {
      await clearGate.promise;
      order.push("device-cleared");
      continueSignOut();
    });

    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        <AppSidebar
          workspaces={[{ key: "operations", labelAr: "العمليات", labelEn: "Operations", groups: [] }]}
          locale="en"
          signOutAction={async () => undefined}
        />,
      );
      await Promise.resolve();
    });

    const form = renderer.root.findByType("form");
    const formElement = { requestSubmit: vi.fn() };
    const dispatchSubmit = () => {
      const preventDefault = vi.fn();
      const completion = Promise.resolve(form.props.onSubmit({
        currentTarget: formElement,
        preventDefault,
      }));
      if (preventDefault.mock.calls.length === 0) serverSubmit();
      return { completion, preventDefault };
    };
    formElement.requestSubmit.mockImplementation(() => {
      dispatchSubmit();
    });

    const first = dispatchSubmit();
    const repeated = dispatchSubmit();

    expect(first.preventDefault).toHaveBeenCalledTimes(1);
    expect(repeated.preventDefault).toHaveBeenCalledTimes(1);
    expect(clearGateDeviceBeforeSignOut).toHaveBeenCalledTimes(1);
    expect(serverSubmit).not.toHaveBeenCalled();

    await act(async () => {
      clearGate.resolve();
      await first.completion;
      await repeated.completion;
    });

    expect(order).toEqual(["device-cleared", "server-submit"]);
    expect(serverSubmit).toHaveBeenCalledTimes(1);
    expect(formElement.requestSubmit).toHaveBeenCalledTimes(1);

    const afterSubmission = dispatchSubmit();
    await afterSubmission.completion;
    expect(afterSubmission.preventDefault).toHaveBeenCalledTimes(1);
    expect(serverSubmit).toHaveBeenCalledTimes(1);

    await act(async () => renderer.unmount());
  });
});
