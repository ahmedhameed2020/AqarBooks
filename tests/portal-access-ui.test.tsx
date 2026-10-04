import type { ReactNode } from "react";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: { children?: ReactNode } & Record<string, unknown>) => <button {...props}>{children}</button>,
}));
vi.mock("@/components/ui/input", () => ({
  Input: (props: Record<string, unknown>) => <input {...props} />,
}));

const signIn = vi.fn();
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ auth: { signInWithPassword: signIn } }),
}));

const actions = vi.hoisted(() => ({
  getPortalAccessAction: vi.fn(),
  issueActivationAction: vi.fn(),
  issueTemporaryAccessAction: vi.fn(),
  reactivatePortalAction: vi.fn(),
  revokeActivationLinkAction: vi.fn(),
  signOutEverywhereAction: vi.fn(),
  suspendPortalAction: vi.fn(),
}));
vi.mock("@/lib/actions/member-portal-access", () => actions);

import { ActivationClient } from "@/app/activate/[token]/activation-client";
import { OwnerPortalAccessCard } from "@/app/[locale]/(app)/members/[memberId]/owner-portal-access-card";
import type { PortalAccessState } from "@/lib/actions/member-portal-access";

beforeAll(() => {
  vi.stubGlobal("document", { documentElement: {} });
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

const textOf = (node: ReactTestInstance | string): string =>
  typeof node === "string" ? node : node.children.map((c) => textOf(c as ReactTestInstance | string)).join("");
const all = (r: ReactTestRenderer) => textOf(r.root);
const flush = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};
function restoreGlobals() {
  vi.unstubAllGlobals();
  vi.stubGlobal("document", { documentElement: {} });
}
async function mount(element: ReactNode) {
  let r!: ReactTestRenderer;
  await act(async () => {
    r = create(element as never);
  });
  return r;
}
const buttonByText = (r: ReactTestRenderer, text: string) =>
  r.root.findAll((n) => n.type === "button" && textOf(n).includes(text));

// ----------------------------------------------------------------- activation page

describe("activation page", () => {
  const token = "T".repeat(43);
  const valid = {
    state: "valid" as const,
    memberName: "محمد أحمد",
    organizationName: "نخيل",
    email: "owner@example.com",
    existingAccount: false,
    expiresAt: "2026-10-07T10:00:00.000Z",
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    signIn.mockReset();
    signIn.mockResolvedValue({ data: { session: { access_token: "jwt" } }, error: null });
  });

  it.each([
    ["expired", "انتهت صلاحية الرابط"],
    ["used", "تم استخدام هذا الرابط"],
    ["revoked", "هذا الرابط لم يعد صالحًا"],
    ["not_found", "الرابط غير صحيح"],
  ] as const)("renders the %s state without a form", async (state, title) => {
    const r = await mount(<ActivationClient token={token} info={{ state }} />);
    expect(all(r)).toContain(title);
    expect(r.root.findAllByType("form")).toHaveLength(0);
    expect(r.root.findAll((n) => n.props["data-state"] === state)).not.toHaveLength(0);
  });

  it("shows who the account is for, the email read-only, and no way to change it", async () => {
    const r = await mount(<ActivationClient token={token} info={valid} />);
    expect(all(r)).toContain("مرحبًا محمد أحمد");
    const email = r.root.findByProps({ id: "activation-email" });
    expect(email.props.value).toBe("owner@example.com");
    expect(email.props.readOnly).toBe(true);
  });

  it("refuses a weak password and a mismatch without calling the server", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const r = await mount(<ActivationClient token={token} info={valid} />);
    const form = r.root.findByType("form");
    await act(async () => r.root.findByProps({ id: "activation-password" }).props.onChange({ target: { value: "short" } }));
    await act(async () => form.props.onSubmit({ preventDefault() {} }));
    expect(all(r)).toContain("١٠ أحرف");
    await act(async () => r.root.findByProps({ id: "activation-password" }).props.onChange({ target: { value: "correct-horse-9" } }));
    await act(async () => r.root.findByProps({ id: "activation-confirm" }).props.onChange({ target: { value: "different-horse-9" } }));
    await act(async () => form.props.onSubmit({ preventDefault() {} }));
    expect(all(r)).toContain("غير متطابقتين");
    expect(fetchMock).not.toHaveBeenCalled();
    restoreGlobals();
  });

  it("activates, signs the owner in and offers the portal", async () => {
    const fetchMock = vi.fn(async () => ({ json: async () => ({ ok: true, email: "owner@example.com" }) }));
    vi.stubGlobal("fetch", fetchMock);
    const r = await mount(<ActivationClient token={token} info={valid} />);
    await act(async () => r.root.findByProps({ id: "activation-password" }).props.onChange({ target: { value: "correct-horse-9" } }));
    await act(async () => r.root.findByProps({ id: "activation-confirm" }).props.onChange({ target: { value: "correct-horse-9" } }));
    await act(async () => r.root.findByType("form").props.onSubmit({ preventDefault() {} }));
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/portal-activation/complete");
    expect(JSON.parse(String(init.body))).toEqual({ token, password: "correct-horse-9" });
    expect(signIn).toHaveBeenCalledWith({ email: "owner@example.com", password: "correct-horse-9" });
    expect(all(r)).toContain("تم تفعيل حسابك");
    restoreGlobals();
  });

  it("an existing identity signs in with its own password and links; no second password is created", async () => {
    const fetchMock = vi.fn(async () => ({ json: async () => ({ ok: true, email: "owner@example.com" }) }));
    vi.stubGlobal("fetch", fetchMock);
    const r = await mount(<ActivationClient token={token} info={{ ...valid, existingAccount: true }} />);
    expect(all(r)).toContain("لن نُنشئ حسابًا ثانيًا");
    expect(r.root.findAllByProps({ id: "activation-confirm" })).toHaveLength(0);
    await act(async () => r.root.findByProps({ id: "activation-current" }).props.onChange({ target: { value: "my-existing-pass1" } }));
    await act(async () => r.root.findByType("form").props.onSubmit({ preventDefault() {} }));
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit & { headers: Record<string, string> }];
    expect(init.headers.Authorization).toBe("Bearer jwt");
    expect(JSON.parse(String(init.body))).toEqual({ token });
    expect(all(r)).toContain("تم تفعيل حسابك");
    restoreGlobals();
  });

  it("a wrong existing password is reported and nothing is linked", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    signIn.mockResolvedValue({ data: { session: null }, error: { message: "Invalid login credentials" } });
    const r = await mount(<ActivationClient token={token} info={{ ...valid, existingAccount: true }} />);
    await act(async () => r.root.findByProps({ id: "activation-current" }).props.onChange({ target: { value: "wrong" } }));
    await act(async () => r.root.findByType("form").props.onSubmit({ preventDefault() {} }));
    expect(all(r)).toContain("كلمة المرور غير صحيحة");
    expect(fetchMock).not.toHaveBeenCalled();
    restoreGlobals();
  });

  it("can be read in English", async () => {
    const r = await mount(<ActivationClient token={token} info={{ state: "expired" }} />);
    await act(async () => r.root.findAllByType("button")[0].props.onClick());
    expect(all(r)).toContain("This link has expired");
  });
});

// ----------------------------------------------------------------- admin card

const base: PortalAccessState = {
  status: "not_activated",
  login_method: null,
  client_id: null,
  activated_at: null,
  last_sign_in_at: null,
  units_count: 2,
  eligible: true,
  has_email: true,
  member_email: "owner@example.com",
  member_phone: "01001234567",
  must_change_password: false,
  temp_password_expires_at: null,
  temp_expired: false,
  suspended_at: null,
  pending_activation_expires_at: null,
  activation_link_expired: false,
  last_delivery_status: null,
  shared_identity: false,
  legacy_linked: false,
  can_manage: true,
};

async function renderCard(state: Partial<PortalAccessState>, locale = "ar") {
  actions.getPortalAccessAction.mockResolvedValue({ ok: true, state: { ...base, ...state } });
  const r = await mount(<OwnerPortalAccessCard memberId="m1" memberName="محمد" locale={locale} />);
  await flush();
  return r;
}

describe("owner portal access card", () => {
  beforeEach(() => {
    Object.values(actions).forEach((fn) => fn.mockReset());
  });

  it.each([
    ["not_activated", "غير مفعلة"],
    ["pending", "بانتظار التفعيل"],
    ["active", "مفعلة"],
    ["suspended", "موقوفة"],
  ] as const)("shows the %s status", async (status, label) => {
    const r = await renderCard({ status, login_method: status === "not_activated" ? null : "email" });
    expect(textOf(r.root.findByProps({ "data-testid": "portal-status" }))).toBe(label);
  });

  it("shows sign-in method, linked units, activation date and last sign-in", async () => {
    const r = await renderCard({
      status: "active",
      login_method: "client_id",
      client_id: "MB-10482",
      units_count: 3,
      activated_at: "2026-09-01T10:00:00Z",
      last_sign_in_at: "2026-10-01T10:00:00Z",
    });
    const t = all(r);
    expect(t).toContain("رقم العميل MB-10482");
    expect(t).toContain("الوحدات المرتبطة3");
    expect(t).toContain("تاريخ التفعيل");
    expect(t).toContain("آخر دخول");
  });

  it("offers activation and temporary credentials when not activated, but not for an ineligible member", async () => {
    const r = await renderCard({});
    expect(buttonByText(r, "تفعيل بوابة المالك")[0].props.disabled).toBe(false);
    expect(buttonByText(r, "إصدار بيانات دخول مؤقتة")[0].props.disabled).toBe(false);
    const no = await renderCard({ eligible: false, units_count: 0 });
    expect(buttonByText(no, "تفعيل بوابة المالك")[0].props.disabled).toBe(true);
    expect(all(no)).toContain("لا توجد وحدة مملوكة");
    const noEmail = await renderCard({ has_email: false });
    expect(buttonByText(noEmail, "تفعيل بوابة المالك")[0].props.disabled).toBe(true);
    expect(buttonByText(noEmail, "إصدار بيانات دخول مؤقتة")[0].props.disabled).toBe(false);
  });

  it("says the email was NOT sent when it was not, and still offers the link to copy", async () => {
    actions.issueActivationAction.mockResolvedValue({
      ok: true,
      activationUrl: "https://aqarbooks.com/activate/TOKEN",
      expiresAt: "2026-10-07T10:00:00Z",
      email: "owner@example.com",
      emailStatus: "not_sent",
      whatsappText: "msg",
    });
    const r = await renderCard({});
    await act(async () => buttonByText(r, "تفعيل بوابة المالك")[0].props.onClick());
    await flush();
    const result = r.root.findByProps({ "data-testid": "activation-result" });
    expect(result.props["data-email-status"]).toBe("not_sent");
    expect(textOf(result)).toContain("تم إنشاء رابط التفعيل — لم يتم إرسال البريد");
    expect(textOf(result)).toContain("https://aqarbooks.com/activate/TOKEN");
    expect(textOf(result)).not.toContain("وإرساله إلى");
    expect(buttonByText(r, "نسخ الرابط").length).toBeGreaterThan(0);
  });

  it("says it was emailed only when the provider accepted it; a provider failure is not success", async () => {
    const issued = {
      ok: true,
      activationUrl: "https://aqarbooks.com/activate/TOKEN",
      expiresAt: "2026-10-07T10:00:00Z",
      email: "owner@example.com",
      whatsappText: "msg",
    };
    actions.issueActivationAction.mockResolvedValue({ ...issued, emailStatus: "sent" });
    let r = await renderCard({});
    await act(async () => buttonByText(r, "تفعيل بوابة المالك")[0].props.onClick());
    await flush();
    expect(textOf(r.root.findByProps({ "data-testid": "activation-result" }))).toContain("وإرساله إلى owner@example.com");

    actions.issueActivationAction.mockResolvedValue({ ...issued, emailStatus: "failed" });
    r = await renderCard({});
    await act(async () => buttonByText(r, "تفعيل بوابة المالك")[0].props.onClick());
    await flush();
    const text = textOf(r.root.findByProps({ "data-testid": "activation-result" }));
    expect(text).toContain("لم يتم إرسال البريد");
    expect(text).not.toContain("وإرساله إلى");
  });

  it("shows the client id and temporary password once, with copy actions and expiry", async () => {
    actions.issueTemporaryAccessAction.mockResolvedValue({
      ok: true,
      clientId: "MB-10482",
      temporaryPassword: "Ab3k-Xy7m-Qp9z",
      expiresAt: "2026-10-07T10:00:00Z",
      regenerated: false,
      whatsappText: "wa",
    });
    const r = await renderCard({});
    await act(async () => buttonByText(r, "إصدار بيانات دخول مؤقتة")[0].props.onClick());
    await flush();
    const card = r.root.findByProps({ "data-testid": "temp-result" });
    expect(textOf(r.root.findByProps({ "data-testid": "temp-client-id" }))).toBe("MB-10482");
    expect(textOf(r.root.findByProps({ "data-testid": "temp-password" }))).toBe("Ab3k-Xy7m-Qp9z");
    const t = textOf(card);
    for (const label of ["نسخ رقم العميل", "نسخ كلمة المرور", "نسخ رسالة واتساب", "مرة واحدة فقط", "تنتهي في"]) {
      expect(t).toContain(label);
    }
    expect(t).not.toContain("client.aqarbooks.local");
  });

  it("regenerating temporary credentials asks for confirmation first", async () => {
    const r = await renderCard({ status: "pending", login_method: "client_id", client_id: "MB-10482", must_change_password: true });
    await act(async () => buttonByText(r, "إصدار بيانات دخول مؤقتة جديدة")[0].props.onClick());
    expect(all(r)).toContain("يُبطل كلمة المرور الحالية");
    expect(actions.issueTemporaryAccessAction).not.toHaveBeenCalled();
  });

  it("suspend needs confirmation; the server error is shown, not swallowed", async () => {
    actions.suspendPortalAction.mockResolvedValue({ ok: false, error: "FORBIDDEN_PORTAL_ACCESS" });
    const r = await renderCard({ status: "active", login_method: "email" });
    await act(async () => buttonByText(r, "إيقاف الوصول")[0].props.onClick());
    expect(actions.suspendPortalAction).not.toHaveBeenCalled();
    await act(async () => buttonByText(r, "تأكيد")[0].props.onClick());
    await flush();
    expect(actions.suspendPortalAction).toHaveBeenCalledWith("m1");
    expect(all(r)).toContain("لا تملك صلاحية إدارة وصول هذا المالك");
  });

  it("a suspended owner can be reactivated; sign-out-everywhere is available", async () => {
    actions.reactivatePortalAction.mockResolvedValue({ ok: true, warnings: [] });
    const r = await renderCard({ status: "suspended", login_method: "email", suspended_at: "2026-10-01T10:00:00Z" });
    expect(buttonByText(r, "تسجيل خروج من جميع الأجهزة")).toHaveLength(1);
    await act(async () => buttonByText(r, "إعادة التفعيل")[0].props.onClick());
    await flush();
    expect(actions.reactivatePortalAction).toHaveBeenCalledWith("m1");
    expect(all(r)).toContain("أُعيد تفعيل الوصول");
  });

  it("without the manage permission, suspend / reactivate / sign-out are disabled and explained", async () => {
    const active = await renderCard({ status: "active", login_method: "email", can_manage: false });
    expect(buttonByText(active, "إيقاف الوصول")[0].props.disabled).toBe(true);
    expect(buttonByText(active, "تسجيل خروج من جميع الأجهزة")[0].props.disabled).toBe(true);
    expect(all(active)).toContain("إدارة وصول الملاك");
    const suspended = await renderCard({ status: "suspended", login_method: "email", can_manage: false });
    expect(buttonByText(suspended, "إعادة التفعيل")[0].props.disabled).toBe(true);
  });

  it("a staff member who is also an owner is told suspension only closes the owner side", async () => {
    const r = await renderCard({ status: "active", login_method: "email", shared_identity: true });
    expect(all(r)).toContain("الإيقاف يغلق جانب المالك فقط");
  });

  it("an unreadable status is an error, not an empty card", async () => {
    actions.getPortalAccessAction.mockResolvedValue({ ok: false, error: "FORBIDDEN_PORTAL_ACCESS" });
    const r = await mount(<OwnerPortalAccessCard memberId="m1" memberName="محمد" locale="ar" />);
    await flush();
    expect(all(r)).toContain("لا تملك صلاحية");
    expect(r.root.findAllByProps({ "data-testid": "portal-status" })).toHaveLength(0);
  });

  it("renders in English", async () => {
    const r = await renderCard({ status: "pending", login_method: "email", pending_activation_expires_at: "2026-10-07T10:00:00Z" }, "en");
    expect(textOf(r.root.findByProps({ "data-testid": "portal-status" }))).toBe("Awaiting activation");
    expect(buttonByText(r, "Resend invitation")).toHaveLength(1);
    expect(buttonByText(r, "Copy activation link")).toHaveLength(1);
  });
});
