"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import type { Locale } from "@/i18n/routing";

type Step = "establishing_session" | "set_password" | "linking" | "done" | "error";

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
      setError(pwError.message);
      setStep("set_password");
      return;
    }

    const { error: linkError } = await supabase.rpc("accept_member_invitation", {
      p_invitation_id: invitationId,
      p_token: token,
    });
    if (linkError) {
      setError(linkError.message);
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
    return <p className="text-center text-sm font-bold text-destructive">{error}</p>;
  }

  return (
    <form onSubmit={handleSetPassword} className="space-y-4 rounded-3xl border border-border bg-background p-8 shadow-sm">
      <h1 className="text-lg font-bold text-foreground">{isAr ? "تعيين كلمة مرور" : "Set your password"}</h1>
      <div className="space-y-1.5">
        <Label>{isAr ? "كلمة المرور" : "Password"}</Label>
        <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} autoComplete="new-password" />
      </div>
      {error && <p className="text-xs font-bold text-destructive">{error}</p>}
      <Button type="submit" disabled={step === "linking"} className="w-full">
        {isAr ? "تفعيل الحساب" : "Activate account"}
      </Button>
    </form>
  );
}
