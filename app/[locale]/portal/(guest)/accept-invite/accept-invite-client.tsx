"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Locale } from "@/i18n/routing";

type Step = "establishing_session" | "set_password" | "linking" | "done" | "error";

// Friendly bilingual copy for the error codes raised by the
// accept_member_invitation RPC (see
// supabase/migrations/20260814000004_member_invitation_rpcs.sql). Postgres
// exceptions come back as "<CODE>: <db message>", so we match on the code
// prefix rather than trying to translate the raw db message.
const RPC_ERROR_MESSAGES: Record<string, { ar: string; en: string }> = {
  INVITATION_NOT_FOUND: {
    ar: "رابط الدعوة غير صالح.",
    en: "This invitation link is not valid.",
  },
  INVITATION_NOT_PENDING: {
    ar: "رابط الدعوة لم يعد صالحًا (تم استخدامه أو إلغاؤه).",
    en: "This invitation is no longer valid (it was already used or cancelled).",
  },
  INVITATION_EXPIRED: {
    ar: "انتهت صلاحية رابط الدعوة، يرجى طلب دعوة جديدة.",
    en: "This invitation link has expired, please request a new invite.",
  },
  INVITATION_TOKEN_INVALID: {
    ar: "رابط الدعوة غير صحيح.",
    en: "This invitation link is invalid.",
  },
  INVITATION_EMAIL_MISMATCH: {
    ar: "البريد الإلكتروني لهذا الحساب لا يطابق بريد الدعوة.",
    en: "This account's email does not match the invited email.",
  },
  MEMBER_NOT_FOUND: {
    ar: "العضو غير موجود.",
    en: "The member could not be found.",
  },
  MEMBER_ALREADY_LINKED: {
    ar: "تم ربط هذا العضو بحساب آخر بالفعل.",
    en: "This member is already linked to an account.",
  },
};

const GENERIC_ERROR = {
  ar: "حدث خطأ غير متوقع، يرجى طلب دعوة جديدة.",
  en: "Something went wrong, please request a new invite.",
};

function mapLinkError(message: string, isAr: boolean, accountAlreadyCreated: boolean): string {
  const code = Object.keys(RPC_ERROR_MESSAGES).find((candidate) => message.startsWith(candidate));
  const lang = isAr ? "ar" : "en";
  const base = code ? RPC_ERROR_MESSAGES[code][lang] : GENERIC_ERROR[lang];

  if (!accountAlreadyCreated) {
    return base;
  }

  // The user's Supabase login/password was already created successfully
  // before this failure -- make that explicit so they (or staff helping
  // them) don't mistake this for a link that never worked at all.
  return isAr
    ? `تم إنشاء بيانات الدخول الخاصة بك، لكن حدث خطأ أثناء إكمال الربط: ${base} يرجى إعادة فتح رابط الدعوة أو التواصل معنا للمساعدة.`
    : `Your login was created, but something went wrong finishing setup: ${base} Please try the invite link again, or contact us for help.`;
}

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
  const [password, setPassword] = useState("");

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
      setError(isAr ? "تعذر تأكيد الجلسة. افتح الرابط من البريد أو رسالة واتساب مباشرة." : "Could not establish a session. Open the link directly from the email or WhatsApp message.");
      setStep("error");
      return;
    }

    const supabase = createClient();
    supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken }).then(({ error: sessionError }) => {
      if (sessionError) {
        setError(isAr ? "انتهت صلاحية الجلسة، يرجى طلب دعوة جديدة." : "Session expired, please request a new invite.");
        setStep("error");
        return;
      }
      setStep("set_password");
    });
  }, [invitationId, token, isAr]);

  async function handleSetPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!invitationId || !token) {
      setError(isAr ? "رابط الدعوة غير صالح." : "Invalid invitation link.");
      setStep("error");
      return;
    }
    if (password.length < 8) {
      setError(isAr ? "كلمة المرور يجب أن تكون 8 أحرف على الأقل." : "Password must be at least 8 characters.");
      return;
    }
    setError(null);
    setStep("linking");

    const supabase = createClient();
    const { error: pwError } = await supabase.auth.updateUser({ password });
    if (pwError) {
      // Supabase's own password-policy wording isn't ours to control/translate;
      // fall back to the generic bilingual message.
      setError(isAr ? GENERIC_ERROR.ar : GENERIC_ERROR.en);
      setStep("set_password");
      return;
    }

    const { error: linkError } = await supabase.rpc("accept_member_invitation", {
      p_invitation_id: invitationId,
      p_token: token,
    });
    if (linkError) {
      // Password was already set successfully above, so this failure leaves
      // the user with a live login but no member link -- say so.
      setError(mapLinkError(linkError.message, isAr, true));
      setStep("error");
      return;
    }

    setStep("done");
    router.push(`/${locale}/portal`);
  }

  if (step === "establishing_session") {
    return <p className="text-center text-sm text-muted-foreground">{isAr ? "جارٍ تأكيد الدعوة..." : "Confirming invitation..."}</p>;
  }

  if (step === "error") {
    return (
      <div className="space-y-4 text-center">
        <p className="text-sm font-bold text-destructive">{error}</p>
        <Link href="/portal/login" className="block text-xs text-muted-foreground hover:text-foreground font-medium">
          {isAr ? "العودة لتسجيل الدخول" : "Back to Sign In"}
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSetPassword} className="space-y-4 rounded-3xl border border-border bg-background p-8 shadow-sm">
      <h1 className="text-lg font-bold text-foreground">{isAr ? "تعيين كلمة مرور" : "Set your password"}</h1>
      <div className="space-y-1.5">
        <Label>{isAr ? "كلمة المرور" : "Password"}</Label>
        <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} autoComplete="new-password" />
      </div>
      {error && <p className="text-xs font-bold text-destructive">{error}</p>}
      <Button type="submit" disabled={step === "linking" || step === "done"} className="w-full">
        {isAr ? "تفعيل الحساب" : "Activate account"}
      </Button>
    </form>
  );
}
