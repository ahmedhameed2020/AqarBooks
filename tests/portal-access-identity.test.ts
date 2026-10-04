import { describe, expect, it } from "vitest";
import {
  ACTIVATION_TOKEN_RE,
  buildActivationUrl,
  clientIdToAlias,
  generateTempPassword,
  isAcceptablePassword,
  isClientAlias,
  normalizeDigits,
  parseClientId,
  passwordProblems,
} from "@/lib/portal-access/identity";
import { activationEmail, temporaryAccessWhatsApp } from "@/lib/portal-access/messages";

describe("client id parsing", () => {
  it.each([
    ["MB-10482", "MB-10482"],
    ["mb-10482", "MB-10482"],
    ["mb10482", "MB-10482"],
    ["  MB 10482 ", "MB-10482"],
    ["MB-١٠٤٨٢", "MB-10482"],
    ["mb۱۰۴۸۲", "MB-10482"],
  ])("accepts %s", (input, expected) => {
    expect(parseClientId(input)).toBe(expected);
  });

  it.each(["", "owner@example.com", "MB-12", "MB-1234567890", "XB-10482", "MB-10A82", "مب-10482"])(
    "rejects %s",
    (input) => {
      expect(parseClientId(input)).toBeNull();
    },
  );

  it("maps a client id to its hidden alias and recognises aliases", () => {
    expect(clientIdToAlias("MB-10482")).toBe("mb-10482@client.aqarbooks.local");
    expect(clientIdToAlias("mb 10482")).toBe("mb-10482@client.aqarbooks.local");
    expect(() => clientIdToAlias("nope")).toThrow("INVALID_CLIENT_ID");
    expect(isClientAlias("MB-10482@CLIENT.AQARBOOKS.LOCAL")).toBe(true);
    expect(isClientAlias("owner@example.com")).toBe(false);
  });

  it("normalises Arabic-Indic and Persian digits", () => {
    expect(normalizeDigits("٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹")).toBe("01234567890123456789");
  });
});

describe("temporary password", () => {
  it("is 12 unambiguous characters in three groups", () => {
    for (let i = 0; i < 200; i++) {
      const pw = generateTempPassword();
      expect(pw).toMatch(/^[A-HJ-NP-Za-km-z2-9]{4}-[A-HJ-NP-Za-km-z2-9]{4}-[A-HJ-NP-Za-km-z2-9]{4}$/);
      expect(pw).not.toMatch(/[0O1lI]/);
    }
  });

  it("is unique across many draws and uses every part of the alphabet", () => {
    const seen = new Set<string>();
    const chars = new Set<string>();
    for (let i = 0; i < 2000; i++) {
      const pw = generateTempPassword();
      seen.add(pw);
      for (const c of pw.replace(/-/g, "")) chars.add(c);
    }
    expect(seen.size).toBe(2000);
    expect(chars.size).toBeGreaterThan(50);
  });

  it("rejects out-of-range bytes instead of biasing the alphabet", () => {
    // 54 symbols; bytes >= 216 would wrap unevenly under a plain modulo.
    const calls: number[] = [];
    const random = (n: number) => {
      calls.push(n);
      return calls.length === 1 ? new Uint8Array(n).fill(255) : new Uint8Array(n).fill(0);
    };
    expect(generateTempPassword(random)).toBe("AAAA-AAAA-AAAA");
    expect(calls.length).toBeGreaterThan(1);
  });

  it("satisfies the password policy it is checked against after the first change", () => {
    expect(isAcceptablePassword(generateTempPassword())).toBe(true);
  });
});

describe("password policy", () => {
  it("requires length, a letter and a digit", () => {
    expect(passwordProblems("short1")).toContain("too_short");
    expect(passwordProblems("0123456789")).toContain("needs_letter");
    expect(passwordProblems("abcdefghijkl")).toContain("needs_digit");
    expect(passwordProblems("correct-horse-9")).toEqual([]);
    expect(isAcceptablePassword("كلمةمرور١٢٣٤٥")).toBe(true);
  });
});

describe("activation token and url", () => {
  it("accepts url-safe tokens only", () => {
    expect(ACTIVATION_TOKEN_RE.test("A".repeat(43))).toBe(true);
    expect(ACTIVATION_TOKEN_RE.test("short")).toBe(false);
    expect(ACTIVATION_TOKEN_RE.test("has space " + "A".repeat(30))).toBe(false);
    expect(ACTIVATION_TOKEN_RE.test("../../etc/passwd" + "A".repeat(10))).toBe(false);
  });

  it("builds https://aqarbooks.com/activate/<token>", () => {
    expect(buildActivationUrl("https://aqarbooks.com", "TOKEN")).toBe("https://aqarbooks.com/activate/TOKEN");
    expect(buildActivationUrl("https://aqarbooks.com/", "TOKEN")).toBe("https://aqarbooks.com/activate/TOKEN");
  });
});

describe("messages", () => {
  const base = {
    name: "محمد",
    clientId: "MB-10482",
    password: "Ab3k-Xy7m-Qp9z",
    expiresAt: "2026-10-07T10:00:00.000Z",
    appUrl: "https://aqarbooks.com",
  };

  it("WhatsApp text carries client id, password and expiry in both languages", () => {
    for (const lang of ["ar", "en"] as const) {
      const text = temporaryAccessWhatsApp({ lang, ...base });
      expect(text).toContain("MB-10482");
      expect(text).toContain("Ab3k-Xy7m-Qp9z");
      expect(text).toContain("https://aqarbooks.com");
    }
  });

  it("never exposes the hidden alias to the owner", () => {
    const text = temporaryAccessWhatsApp({ lang: "en", ...base });
    expect(text).not.toContain("client.aqarbooks.local");
  });

  it("email escapes the name and carries the link in html and text", () => {
    const mail = activationEmail({
      name: "<script>alert(1)</script>",
      organizationName: 'A & "B"',
      url: "https://aqarbooks.com/activate/TOKEN",
      expiresAt: "2026-10-07T10:00:00.000Z",
    });
    expect(mail.html).not.toContain("<script>");
    expect(mail.html).toContain("&lt;script&gt;");
    expect(mail.html).toContain("A &amp; &quot;B&quot;");
    expect(mail.html).toContain('href="https://aqarbooks.com/activate/TOKEN"');
    expect(mail.text).toContain("https://aqarbooks.com/activate/TOKEN");
  });
});
