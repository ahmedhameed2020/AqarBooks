"use client";

import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Clock, Loader2, LockKeyhole, ShieldOff, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { passwordProblems } from "@/lib/portal-access/identity";
import type { InspectResult } from "@/lib/portal-access/orchestrate";

type Lang = "ar" | "en";

const T = {
  ar: {
    title: "تفعيل حسابك في بوابة الملاك",
    hello: (n: string) => `مرحبًا ${n}`,
    from: (o: string) => `أنشأت لك إدارة ${o} حسابًا في بوابة الملاك.`,
    email: "البريد الإلكتروني",
    newPassword: "كلمة المرور الجديدة",
    confirm: "تأكيد كلمة المرور",
    existingPassword: "كلمة مرور حسابك الحالي",
    activate: "تفعيل الحساب",
    link: "ربط الحساب",
    existingNote: "هذا البريد لديه حساب في AqarBooks بالفعل. سجّل الدخول بكلمة مرورك الحالية لربط حساب المالك به، ولن نُنشئ حسابًا ثانيًا.",
    rules: "١٠ أحرف على الأقل، وتحتوي على حرف ورقم.",
    short: "كلمة المرور يجب ألا تقل عن ١٠ أحرف.",
    letter: "أضف حرفًا واحدًا على الأقل.",
    digit: "أضف رقمًا واحدًا على الأقل.",
    mismatch: "كلمتا المرور غير متطابقتين.",
    doneTitle: "تم تفعيل حسابك",
    doneBody: "يمكنك الآن تسجيل الدخول من التطبيق أو متابعة بوابة الويب.",
    openPortal: "فتح البوابة",
    expires: (d: string) => `الرابط يعمل مرة واحدة وينتهي ${d}.`,
    wrongPassword: "كلمة المرور غير صحيحة.",
    serverError: "تعذّر إكمال التفعيل. حاول مرة أخرى بعد قليل.",
    emailMismatch: "هذا الحساب لا يطابق البريد المسجل للمالك.",
    states: {
      expired: ["انتهت صلاحية الرابط", "اطلب من إدارة المشروع إرسال رابط تفعيل جديد."],
      used: ["تم استخدام هذا الرابط", "حسابك مفعّل بالفعل. سجّل الدخول من التطبيق أو من بوابة الويب."],
      revoked: ["هذا الرابط لم يعد صالحًا", "ألغته إدارة المشروع. تواصل معهم للحصول على رابط جديد."],
      not_found: ["الرابط غير صحيح", "تأكد من نسخ الرابط كاملًا، أو اطلب رابطًا جديدًا من إدارة المشروع."],
    },
    switchLang: "English",
    contact: "للمساعدة تواصل مع إدارة المشروع.",
  },
  en: {
    title: "Activate your owner portal account",
    hello: (n: string) => `Hello ${n}`,
    from: (o: string) => `${o} has created an owner portal account for you.`,
    email: "Email",
    newPassword: "New password",
    confirm: "Confirm password",
    existingPassword: "Your current account password",
    activate: "Activate account",
    link: "Link account",
    existingNote:
      "This email already has an AqarBooks account. Sign in with your current password to link the owner account to it — we will not create a second one.",
    rules: "At least 10 characters, with a letter and a digit.",
    short: "Password must be at least 10 characters.",
    letter: "Add at least one letter.",
    digit: "Add at least one digit.",
    mismatch: "The passwords do not match.",
    doneTitle: "Your account is active",
    doneBody: "You can now sign in from the app, or continue on the web portal.",
    openPortal: "Open the portal",
    expires: (d: string) => `This link works once and expires ${d}.`,
    wrongPassword: "Incorrect password.",
    serverError: "We could not complete the activation. Please try again shortly.",
    emailMismatch: "That account does not match the owner's registered email.",
    states: {
      expired: ["This link has expired", "Ask your property management to send a new activation link."],
      used: ["This link was already used", "Your account is active. Sign in from the app or the web portal."],
      revoked: ["This link is no longer valid", "Your property management cancelled it. Contact them for a new one."],
      not_found: ["This link is not valid", "Make sure you copied the whole link, or ask for a new one."],
    },
    switchLang: "العربية",
    contact: "For help, contact your property management.",
  },
} as const;

type Valid = Extract<InspectResult, { state: "valid" }>;

export function ActivationClient({ token, info }: { token: string; info: InspectResult }) {
  const [lang, setLang] = useState<Lang>("ar");
  const t = T[lang];

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
  }, [lang]);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-4 p-6">
      <div className="flex items-center justify-between">
        <span className="text-lg font-bold text-primary">AqarBooks</span>
        <button
          type="button"
          className="text-xs font-semibold text-muted-foreground underline-offset-4 hover:underline"
          onClick={() => setLang(lang === "ar" ? "en" : "ar")}
        >
          {t.switchLang}
        </button>
      </div>
      <div className="rounded-3xl border border-border bg-background p-6 shadow-sm">
        {info.state === "valid" ? <ValidForm token={token} info={info} lang={lang} /> : <Terminal state={info.state} lang={lang} />}
      </div>
      <p className="text-center text-[11px] text-muted-foreground">{t.contact}</p>
    </main>
  );
}

function Terminal({ state, lang }: { state: "expired" | "used" | "revoked" | "not_found"; lang: Lang }) {
  const [title, body] = T[lang].states[state];
  const Icon = state === "expired" ? Clock : state === "used" ? CheckCircle2 : ShieldOff;
  return (
    <div className="space-y-3 text-center" role="status" data-state={state}>
      <Icon className="mx-auto size-10 text-muted-foreground" aria-hidden />
      <h1 className="text-lg font-bold">{title}</h1>
      <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
    </div>
  );
}

function ValidForm({ token, info, lang }: { token: string; info: Valid; lang: Lang }) {
  const t = T[lang];
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const problems = passwordProblems(password);
  const expires = new Date(info.expiresAt).toLocaleString(lang === "ar" ? "ar-EG" : "en-GB", {
    dateStyle: "long",
    timeStyle: "short",
  });

  async function post(body: Record<string, unknown>, jwt?: string) {
    const res = await fetch("/api/portal-activation/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}) },
      body: JSON.stringify({ token, ...body }),
    });
    return (await res.json().catch(() => ({ ok: false, reason: "server_error" }))) as
      | { ok: true; email: string }
      | { ok: false; reason: string };
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (!info.existingAccount) {
      if (problems.length > 0) return setError(problems[0] === "too_short" ? t.short : problems[0] === "needs_letter" ? t.letter : t.digit);
      if (password !== confirm) return setError(t.mismatch);
    }
    setBusy(true);
    try {
      const supabase = createClient();
      if (info.existingAccount) {
        // Prove the caller IS the existing identity, then link; no password is set.
        const signed = await supabase.auth.signInWithPassword({ email: info.email, password });
        if (signed.error || !signed.data.session) return setError(t.wrongPassword);
        const res = await post({}, signed.data.session.access_token);
        if (!res.ok) return setError(res.reason === "email_mismatch" ? t.emailMismatch : t.serverError);
        setDone(true);
        return;
      }
      const res = await post({ password });
      if (!res.ok) {
        if (res.reason === "needs_signin") {
          // The identity appeared between page load and submit; reload into the sign-in variant.
          window.location.reload();
          return;
        }
        return setError(t.serverError);
      }
      // Sign the owner straight in so the portal opens without a second step.
      await supabase.auth.signInWithPassword({ email: info.email, password });
      setDone(true);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="space-y-4 text-center" role="status" data-state="done">
        <CheckCircle2 className="mx-auto size-10 text-emerald-600" aria-hidden />
        <h1 className="text-lg font-bold">{t.doneTitle}</h1>
        <p className="text-sm text-muted-foreground">{t.doneBody}</p>
        <a
          href={`/${lang}/portal`}
          className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground"
        >
          <Smartphone className="size-4" aria-hidden />
          {t.openPortal}
        </a>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div className="space-y-1">
        <h1 className="text-lg font-bold">{t.title}</h1>
        <p className="text-sm font-semibold">{t.hello(info.memberName)}</p>
        {info.organizationName && <p className="text-xs text-muted-foreground">{t.from(info.organizationName)}</p>}
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-semibold" htmlFor="activation-email">{t.email}</label>
        <Input id="activation-email" dir="ltr" value={info.email} readOnly autoComplete="username" />
      </div>

      {info.existingAccount ? (
        <>
          <p className="rounded-xl border border-border bg-muted/40 p-3 text-xs leading-relaxed">{t.existingNote}</p>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold" htmlFor="activation-current">{t.existingPassword}</label>
            <Input id="activation-current" type="password" dir="ltr" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
        </>
      ) : (
        <>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold" htmlFor="activation-password">{t.newPassword}</label>
            <Input id="activation-password" type="password" dir="ltr" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            <p className="text-[11px] text-muted-foreground">{t.rules}</p>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold" htmlFor="activation-confirm">{t.confirm}</label>
            <Input id="activation-confirm" type="password" dir="ltr" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </div>
        </>
      )}

      {error && (
        <p role="alert" className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          {error}
        </p>
      )}

      <Button type="submit" className="h-10 w-full gap-2" disabled={busy || password.length === 0}>
        {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <LockKeyhole className="size-4" aria-hidden />}
        {info.existingAccount ? t.link : t.activate}
      </Button>
      <p className="text-center text-[11px] text-muted-foreground">{t.expires(expires)}</p>
    </form>
  );
}
