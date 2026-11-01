import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { financeErrorMessage } from "@/lib/actions/error-messages";

const GENERIC_AR = "حدث خطأ ما، يرجى المحاولة مرة أخرى.";
const GENERIC_EN = "Something went wrong. Please try again.";

describe("financeErrorMessage: known codes", () => {
  const cases: Array<[string, string, string]> = [
    ["invalid_input", "تحقق من البيانات المدخلة وحاول مرة أخرى.", "Check the values you entered and try again."],
    ["INVALID_INPUT", "تحقق من البيانات المدخلة وحاول مرة أخرى.", "Check the values you entered and try again."],
    ["RECEIVABLE_ACCOUNT_REQUIRED", "اختر حساب الذمم المدينة أولًا.", "Choose a receivable account first."],
    [
      "DEPOSIT_ACCOUNT_INVALID",
      "حساب الإيداع المختار غير صالح أو غير مفعّل. اختر حسابًا آخر.",
      "The selected deposit account is invalid or inactive. Choose another account.",
    ],
    ["reason_required", "اكتب سببًا للإلغاء قبل المتابعة.", "Enter a reason before continuing."],
    ["ALREADY_REVERSED", "تم إلغاء هذا السند مسبقًا.", "This receipt has already been voided."],
    [
      "state_unchanged",
      "لم تتغير حالة العنصر. حدّث الصفحة وحاول مرة أخرى.",
      "The item's status did not change. Refresh the page and try again.",
    ],
    [
      "STALE_VERIFICATION",
      "تغيّرت البيانات منذ آخر تحميل. حدّث الصفحة وحاول مرة أخرى.",
      "The data changed since it was loaded. Refresh the page and try again.",
    ],
    [
      "rate_limited",
      "محاولات كثيرة في وقت قصير. انتظر قليلًا ثم حاول مرة أخرى.",
      "Too many attempts in a short time. Wait a moment and try again.",
    ],
    ["self_approval", "لا يمكنك اعتماد عملية قمت بإعدادها بنفسك.", "You cannot approve an action you prepared yourself."],
    ["ORGANIZATION_INACTIVE", "المنظمة غير مفعّلة حاليًا.", "This organization is currently inactive."],
    ["unauthenticated", "يجب تسجيل الدخول لإتمام هذا الإجراء.", "You need to sign in to do this."],
    ["not_authenticated", "يجب تسجيل الدخول لإتمام هذا الإجراء.", "You need to sign in to do this."],
    ["NOT_AUTHENTICATED", "يجب تسجيل الدخول لإتمام هذا الإجراء.", "You need to sign in to do this."],
    ["forbidden", "ليست لديك صلاحية لتنفيذ هذا الإجراء.", "You do not have permission to do this."],
    ["unauthorized", "ليست لديك صلاحية لتنفيذ هذا الإجراء.", "You do not have permission to do this."],
    ["NOT_AUTHORIZED", "ليست لديك صلاحية لتنفيذ هذا الإجراء.", "You do not have permission to do this."],
    ["not_found", "تعذر العثور على العنصر المطلوب.", "The requested item could not be found."],
    ["NOT_FOUND", "تعذر العثور على العنصر المطلوب.", "The requested item could not be found."],
    ["query_failed", "تعذر تحميل البيانات، يرجى المحاولة مرة أخرى.", "The data could not be loaded. Please try again."],
  ];

  it.each(cases)("maps %s to the exact Arabic and English messages", (code, ar, en) => {
    expect(financeErrorMessage(code, true)).toBe(ar);
    expect(financeErrorMessage(code, false)).toBe(en);
  });
});

describe("financeErrorMessage: unsafe or unknown input", () => {
  it("returns the generic message for an unknown code and does not echo the input", () => {
    expect(financeErrorMessage("SOME_UNKNOWN_CODE", true)).toBe(GENERIC_AR);
    expect(financeErrorMessage("SOME_UNKNOWN_CODE", false)).toBe(GENERIC_EN);
    expect(financeErrorMessage("SOME_UNKNOWN_CODE", false)).not.toContain("SOME_UNKNOWN_CODE");
  });

  it.each([null, undefined, ""])("returns the generic message for %p", (code) => {
    expect(financeErrorMessage(code, true)).toBe(GENERIC_AR);
    expect(financeErrorMessage(code, false)).toBe(GENERIC_EN);
  });

  it.each(["constructor", "__proto__", "toString", "hasOwnProperty"])(
    "returns the generic message for prototype key %s without crashing",
    (code) => {
      expect(() => financeErrorMessage(code, true)).not.toThrow();
      expect(financeErrorMessage(code, true)).toBe(GENERIC_AR);
      expect(financeErrorMessage(code, false)).toBe(GENERIC_EN);
    },
  );

  it("never returns raw SQL or database text", () => {
    const raw = "ERROR: duplicate key value violates unique constraint \"journal_entries_pkey\"";
    for (const isAr of [true, false]) {
      const msg = financeErrorMessage(raw, isAr);
      expect(msg).toBe(isAr ? GENERIC_AR : GENERIC_EN);
      expect(msg).not.toContain("ERROR");
      expect(msg).not.toContain("constraint");
    }
  });
});

describe("receivables.ts never returns raw database error text", () => {
  const source = readFileSync(path.resolve(__dirname, "../lib/actions/receivables.ts"), "utf8");

  it("has no `error: error.message` return", () => {
    expect(source).not.toContain("error: error.message");
  });

  it("has no `detail: ...error.message` return", () => {
    expect(source).not.toMatch(/detail:\s*\w+\.error\.message/);
  });
});
