"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Loader2, ShieldCheck, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Locale } from "@/i18n/routing";

type Step = "establishing_session" | "enter_code" | "linking" | "done" | "error";

// accept_member_invitation returns a jsonb outcome rather than raising, because
// a raised exception would roll back the failed-attempt counter along with the
// transaction and leave the lockout unenforceable. Every outcome below is a
// value read off that object.
type AcceptOutcome = {
  ok: boolean;
  reason?: string;
  member_id?: string;
  attempts_left?: number;
  locked_until?: string;
};

const REASON_MESSAGES: Record<string, { ar: string; en: string }> = {
  NOT_AUTHENTICATED: {
    ar: "انتهت صلاحية الجلسة. افتح رابط الدعوة من جديد.",
    en: "Your session expired. Open the invitation link again.",
  },
  INVITATION_NOT_FOUND: {
    ar: "رابط الدعوة غير صالح.",
    en: "This invitation link is not valid.",
  },
  INVITATION_NOT_PENDING: {
    ar: "رابط الدعوة لم يعد صالحًا (تم استخدامه أو إلغاؤه).",
    en: "This invitation is no longer valid (it was already used or cancelled).",
  },
  INVITATION_EXPIRED: {
    ar: "انتهت صلاحية رابط الدعوة، يرجى طلب دعوة جديدة من إدارة الكيان.",
    en: "This invitation link has expired. Please ask management for a new one.",
  },
  INVITATION_TOKEN_INVALID: {
    ar: "رابط الدعوة غير صحيح.",
    en: "This invitation link is invalid.",
  },
  INVITATION_EMAIL_MISMATCH: {
    ar: "هذا الرابط لا يخص الحساب المفتوح حاليًا على هذا الجهاز.",
    en: "This link does not belong to the account currently open on this device.",
  },
  MEMBER_NOT_FOUND: {
    ar: "العضو غير موجود.",
    en: "The member could not be found.",
  },
  MEMBER_ALREADY_LINKED: {
    ar: "تم ربط هذا الحساب بمستخدم آخر بالفعل.",
    en: "This member is already linked to another account.",
  },
  CODE_NOT_SET: {
    ar: "هذه الدعوة صدرت قبل تفعيل رمز الدخول ولم تعد صالحة. يرجى طلب دعوة جديدة.",
    en: "This invitation predates access codes and is no longer usable. Please request a new one.",
  },
};

const GENERIC_ERROR = {
  ar: "حدث خطأ غير متوقع، يرجى طلب دعوة جديدة.",
  en: "Something went wrong, please request a new invite.",
};

export function AcceptInviteClient({
  locale,
  invitationId,
  token,
}: {
  locale: Locale;
  invitationId: string | null;
  token: string | null;
}) {
  const isAr = locale === "ar";
  const router = useRouter();
  const [step, setStep] = useState<Step>("establishing_session");
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!invitationId || !token) {
      setError(isAr ? "رابط الدعوة غير صالح." : "Invalid invitation link.");
      setStep("error");
      return;
    }

    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const accessToken = hash.get("access_token");
    const refreshToken = hash.get("refresh_token");

    if (!accessToken || !refreshToken) {
      setError(
        isAr
          ? "تعذر تأكيد الجلسة. افتح الرابط من رسالة واتساب أو البريد مباشرة."
          : "Could not establish a session. Open the link directly from the WhatsApp or email message.",
      );
      setStep("error");
      return;
    }

    const supabase = createClient();
    supabase.auth
      .setSession({ access_token: accessToken, refresh_token: refreshToken })
      .then(({ error: sessionError }) => {
        if (sessionError) {
          setError(
            isAr ? "انتهت صلاحية الجلسة، يرجى طلب دعوة جديدة." : "Session expired, please request a new invite.",
          );
          setStep("error");
          return;
        }
        setStep("enter_code");
      });
  }, [invitationId, token, isAr]);

  useEffect(() => {
    if (step === "enter_code") inputRef.current?.focus();
  }, [step]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!invitationId || !token) return;

    const digits = code.replace(/\D/g, "");
    if (digits.length !== 6) {
      setError(isAr ? "أدخل رمزًا مكوّنًا من ٦ أرقام." : "Enter the six-digit code.");
      return;
    }

    setError(null);
    setStep("linking");

    const supabase = createClient();
    const { data, error: rpcError } = await supabase.rpc("accept_member_invitation", {
      p_invitation_id: invitationId,
      p_token: token,
      p_code: digits,
    });

    if (rpcError) {
      setError(isAr ? GENERIC_ERROR.ar : GENERIC_ERROR.en);
      setStep("enter_code");
      return;
    }

    const outcome = data as unknown as AcceptOutcome | null;

    if (outcome?.ok) {
      setStep("done");
      router.push(`/${locale}/portal`);
      return;
    }

    // A wrong code keeps the owner on the form -- it is the one failure they
    // can actually fix. Everything else is terminal and needs staff.
    if (outcome?.reason === "INVALID_CODE") {
      const left = outcome.attempts_left ?? 0;
      setError(
        isAr
          ? `الرمز غير صحيح. ${left > 0 ? `تبقّى ${left} محاولة.` : "لم تتبق محاولات."}`
          : `Incorrect code. ${left > 0 ? `${left} attempt(s) remaining.` : "No attempts remaining."}`,
      );
      setCode("");
      setStep("enter_code");
      inputRef.current?.focus();
      return;
    }

    if (outcome?.reason === "CODE_LOCKED") {
      const until = outcome.locked_until ? new Date(outcome.locked_until) : null;
      const time = until
        ? until.toLocaleTimeString(isAr ? "ar-EG" : "en-US", { hour: "2-digit", minute: "2-digit" })
        : null;
      setError(
        isAr
          ? `تم إيقاف المحاولات مؤقتًا بعد عدة إدخالات خاطئة.${time ? ` أعد المحاولة بعد ${time}.` : ""}`
          : `Attempts are temporarily locked after several incorrect entries.${time ? ` Try again after ${time}.` : ""}`,
      );
      setStep("enter_code");
      return;
    }

    const reason = outcome?.reason ?? "";
    setError(
      REASON_MESSAGES[reason]?.[isAr ? "ar" : "en"] ?? (isAr ? GENERIC_ERROR.ar : GENERIC_ERROR.en),
    );
    setStep("error");
  }

  if (step === "establishing_session") {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <Loader2 className="size-6 animate-spin text-indigo-500" />
        <p className="text-sm text-muted-foreground">
          {isAr ? "جارٍ تأكيد الدعوة…" : "Confirming your invitation…"}
        </p>
      </div>
    );
  }

  if (step === "error") {
    return (
      <div className="space-y-4 text-center">
        <div className="mx-auto flex size-11 items-center justify-center rounded-xl border border-destructive/30 bg-destructive/10 text-destructive">
          <AlertCircle className="size-5" />
        </div>
        <p className="text-sm font-bold text-destructive">{error}</p>
        <Link
          href="/portal/login"
          className="block text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          {isAr ? "العودة لصفحة الدخول" : "Back to sign in"}
        </Link>
      </div>
    );
  }

  const busy = step === "linking" || step === "done";

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-5 rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8"
    >
      <div className="space-y-2 text-center">
        <div className="mx-auto flex size-11 items-center justify-center rounded-xl bg-indigo-600 text-white">
          <KeyRound className="size-5" />
        </div>
        <h1 className="text-lg font-bold text-foreground">
          {isAr ? "أدخل رمز الدخول" : "Enter your access code"}
        </h1>
        <p className="mx-auto max-w-xs text-xs leading-relaxed text-muted-foreground">
          {isAr
            ? "أرسلت لك إدارة الكيان رمزًا من ٦ أرقام في رسالة منفصلة عن هذا الرابط. لا حاجة لكلمة مرور."
            : "Management sent you a six-digit code in a message separate from this link. No password is needed."}
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="access-code" className="sr-only">
          {isAr ? "رمز الدخول" : "Access code"}
        </Label>
        <Input
          id="access-code"
          ref={inputRef}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          placeholder="······"
          dir="ltr"
          aria-describedby={error ? "access-code-error" : undefined}
          className="h-14 rounded-xl text-center font-mono text-2xl font-bold tracking-[0.5em]"
        />
      </div>

      {error && (
        <p
          id="access-code-error"
          role="alert"
          className="rounded-xl border border-destructive/30 bg-destructive/10 p-2.5 text-center text-xs font-bold text-destructive"
        >
          {error}
        </p>
      )}

      <Button
        type="submit"
        disabled={busy || code.replace(/\D/g, "").length !== 6}
        className="h-11 w-full gap-2 rounded-xl bg-indigo-600 text-sm font-bold text-white hover:bg-indigo-700"
      >
        {busy ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            {isAr ? "جارٍ الدخول…" : "Signing you in…"}
          </>
        ) : (
          <>
            <ShieldCheck className="size-4" />
            {isAr ? "الدخول إلى البوابة" : "Enter the portal"}
          </>
        )}
      </Button>

      <p className="text-center text-[11px] leading-relaxed text-muted-foreground">
        {isAr
          ? "لم يصلك الرمز؟ تواصل مع إدارة الكيان لإرساله مرة أخرى."
          : "Didn't receive the code? Contact management to have it resent."}
      </p>
    </form>
  );
}
