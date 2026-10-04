// Copy for the two ways an owner receives access. Nothing here sends anything:
// the WhatsApp text is only ever COPIED by staff (no WhatsApp API), and the
// email goes out through the Resend sender in ./email.ts.

export type Lang = "ar" | "en";

function formatExpiry(iso: string, lang: Lang): string {
  return new Date(iso).toLocaleString(lang === "ar" ? "ar-EG" : "en-GB", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Africa/Cairo",
  });
}

export function temporaryAccessWhatsApp(input: {
  lang: Lang;
  name: string;
  clientId: string;
  password: string;
  expiresAt: string;
  appUrl: string;
}): string {
  const { lang, name, clientId, password, expiresAt, appUrl } = input;
  const expiry = formatExpiry(expiresAt, lang);
  return lang === "ar"
    ? [
        `مرحبًا ${name}،`,
        "تم تجهيز حسابك في بوابة الملاك على AqarBooks.",
        "",
        `رقم العميل: ${clientId}`,
        `كلمة المرور المؤقتة: ${password}`,
        "",
        `سجّل الدخول من التطبيق أو من ${appUrl} وسيُطلب منك اختيار كلمة مرور جديدة عند أول دخول.`,
        `كلمة المرور المؤقتة تنتهي ${expiry}. لا تشاركها مع أي شخص.`,
      ].join("\n")
    : [
        `Hello ${name},`,
        "Your AqarBooks owner portal account is ready.",
        "",
        `Client ID: ${clientId}`,
        `Temporary password: ${password}`,
        "",
        `Sign in from the app or at ${appUrl}; you will be asked to choose a new password the first time.`,
        `The temporary password expires ${expiry}. Do not share it with anyone.`,
      ].join("\n");
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Branded activation email. Bilingual in one message; the owner reads their half. */
export function activationEmail(input: {
  name: string;
  organizationName: string | null;
  url: string;
  expiresAt: string;
}): { subject: string; html: string; text: string } {
  const name = escapeHtml(input.name);
  const org = input.organizationName ? escapeHtml(input.organizationName) : "AqarBooks";
  const url = escapeHtml(input.url);
  const expiryAr = formatExpiry(input.expiresAt, "ar");
  const expiryEn = formatExpiry(input.expiresAt, "en");
  const subject = "فعّل حسابك في بوابة الملاك · Activate your owner portal account";
  const html = `<!doctype html>
<html lang="ar" dir="rtl"><body style="margin:0;background:#f4f5f7;font-family:Segoe UI,Tahoma,Arial,sans-serif;color:#0f172a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0">
<tr><td style="background:#0b3b4a;padding:24px 32px;color:#fff;font-size:20px;font-weight:700">AqarBooks</td></tr>
<tr><td style="padding:32px">
<p style="margin:0 0 12px;font-size:16px;font-weight:700">مرحبًا ${name}،</p>
<p style="margin:0 0 20px;font-size:14px;line-height:1.8">أنشأت لك إدارة <b>${org}</b> حسابًا في بوابة الملاك. اضغط الزر لاختيار كلمة المرور وتفعيل حسابك.</p>
<p style="margin:0 0 24px"><a href="${url}" style="display:inline-block;background:#0b3b4a;color:#fff;text-decoration:none;padding:12px 28px;border-radius:10px;font-weight:700;font-size:14px">تفعيل الحساب</a></p>
<p style="margin:0 0 6px;font-size:12px;color:#64748b">الرابط يعمل مرة واحدة وينتهي ${expiryAr}. إن لم تطلب هذا الحساب فتجاهل الرسالة.</p>
<hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
<div dir="ltr" style="text-align:left">
<p style="margin:0 0 12px;font-size:14px;font-weight:700">Hello ${name},</p>
<p style="margin:0 0 20px;font-size:13px;line-height:1.7">${org} has created an owner portal account for you. Use the button to choose a password and activate it.</p>
<p style="margin:0 0 20px"><a href="${url}" style="display:inline-block;background:#0b3b4a;color:#fff;text-decoration:none;padding:10px 24px;border-radius:10px;font-weight:700;font-size:13px">Activate account</a></p>
<p style="margin:0;font-size:12px;color:#64748b">The link works once and expires ${expiryEn}. If you did not expect this, ignore this email.</p>
</div>
</td></tr></table>
<p style="font-size:11px;color:#94a3b8;margin-top:16px">AqarBooks · aqarbooks.com</p>
</td></tr></table></body></html>`;
  const text = `مرحبًا ${input.name}\nفعّل حسابك: ${input.url}\nينتهي ${expiryAr}\n\nHello ${input.name}\nActivate your account: ${input.url}\nExpires ${expiryEn}`;
  return { subject, html, text };
}
