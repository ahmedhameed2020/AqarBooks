"use client";

import { useState, useTransition } from "react";
import { Mail, AlertCircle, Loader2, ShieldCheck, Info, Send, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import type { Locale } from "@/i18n/routing";
import { LogoMark } from "@/components/marketing/logo-mark";

// The owner portal has no password. First access comes from a staff-issued link
// plus a six-digit code; this screen covers the other case -- a returning owner
// whose session lapsed. They ask for a fresh sign-in link to the address already
// on their record, so the inbox itself is the factor.
//
// The result message is deliberately identical whether or not the address is
// registered: telling an anonymous visitor which emails exist would turn this
// box into an account-enumeration oracle.
export function LoginForm({ locale, orgSuspended }: { locale: Locale; orgSuspended?: boolean }) {
  const isAr = locale === "ar";
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      const supabase = createClient();
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email: email.trim().toLowerCase(),
        options: {
          // Never provision an account from this box -- only an owner already
          // invited by staff has a portal identity.
          shouldCreateUser: false,
          emailRedirectTo: `${window.location.origin}/${locale}/portal`,
        },
      });

      // A rate-limit is the one failure worth surfacing: it is actionable and
      // reveals nothing about whether the address exists.
      if (otpError && /rate|limit|too many/i.test(otpError.message)) {
        setError(
          isAr
            ? "تم طلب عدد كبير من الروابط خلال فترة قصيرة. انتظر بضع دقائق ثم أعد المحاولة."
            : "Too many links requested in a short time. Wait a few minutes and try again.",
        );
        return;
      }

      setSent(true);
    });
  }

  return (
    <div className="mx-auto w-full max-w-md space-y-6">
      <div className="space-y-2 text-center">
        <div className="mb-1 inline-flex justify-center">
          <LogoMark className="size-12" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          {isAr ? "بوابة الملاك والمستثمرين" : "Owner & Investor Portal"}
        </h1>
        <p className="mx-auto max-w-xs text-xs text-slate-500">
          {isAr
            ? "لا حاجة لكلمة مرور. ندخلك عبر رابط آمن يصل إلى بريدك المسجل."
            : "No password needed. We sign you in with a secure link sent to your registered email."}
        </p>
      </div>

      {sent ? (
        <div className="space-y-4 rounded-2xl border border-border/80 bg-card p-6 text-center shadow-sm sm:p-8">
          <div className="mx-auto flex size-12 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-600">
            <CheckCircle2 className="size-6" />
          </div>
          <h2 className="text-base font-bold text-slate-900 dark:text-white">
            {isAr ? "تحقّق من بريدك" : "Check your email"}
          </h2>
          <p className="text-xs leading-relaxed text-slate-500">
            {isAr
              ? "إذا كان هذا البريد مسجلاً لدينا كمالك، فقد أرسلنا إليه رابط دخول صالحًا لفترة قصيرة. افتحه من نفس الجهاز."
              : "If that address is registered as an owner, we've sent it a sign-in link valid for a short time. Open it on this device."}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setSent(false);
              setEmail("");
            }}
            className="h-9 rounded-xl text-xs font-semibold"
          >
            {isAr ? "استخدام بريد آخر" : "Use a different address"}
          </Button>
        </div>
      ) : (
        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-2xl border border-border/80 bg-card p-6 shadow-sm sm:p-8"
        >
          {orgSuspended && (
            <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-bold text-rose-600 dark:border-rose-900/50 dark:bg-rose-950/40">
              <AlertCircle className="size-4 shrink-0" />
              <span>
                {isAr
                  ? "تم تعليق حساب المنشأة حاليًا، يرجى التواصل مع الإدارة"
                  : "Your organization account is currently suspended, please contact support"}
              </span>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="portal-login-email" className="text-xs font-semibold">
              {isAr ? "البريد الإلكتروني المسجل" : "Registered email"}
            </Label>
            <div className="relative">
              <Input
                id="portal-login-email"
                type="email"
                name="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                placeholder="name@example.com"
                className="h-11 rounded-xl ps-9 text-xs font-medium"
              />
              <Mail className="absolute start-3 top-3.5 size-4 text-slate-400" />
            </div>
          </div>

          {error && (
            <div
              role="alert"
              className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-bold text-rose-600 dark:border-rose-900/50 dark:bg-rose-950/40"
            >
              <AlertCircle className="size-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <Button
            type="submit"
            disabled={isPending || !email.trim()}
            className="h-11 w-full gap-2 rounded-xl bg-indigo-600 text-sm font-bold text-white hover:bg-indigo-700"
          >
            {isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                {isAr ? "جارٍ الإرسال…" : "Sending…"}
              </>
            ) : (
              <>
                <Send className="size-4" />
                {isAr ? "أرسل لي رابط الدخول" : "Send me a sign-in link"}
              </>
            )}
          </Button>

          <div className="space-y-1.5 rounded-xl border border-border/60 bg-slate-50/70 p-3.5 text-start dark:bg-slate-900/70">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300">
              <Info className="size-3.5 shrink-0 text-indigo-500" />
              <span>{isAr ? "أول مرة تدخل؟" : "First time here?"}</span>
            </div>
            <p className="text-[11px] leading-relaxed text-slate-500">
              {isAr
                ? "ترسل لك إدارة الكيان رابط دعوة عبر واتساب أو البريد، ورمزًا من ٦ أرقام في رسالة منفصلة. افتح الرابط وأدخل الرمز — بدون كلمة مرور."
                : "Management sends you an invitation link by WhatsApp or email, and a six-digit code in a separate message. Open the link and enter the code — no password."}
            </p>
          </div>
        </form>
      )}

      <div className="flex items-center justify-center gap-1.5 text-[11px] font-medium text-slate-400">
        <ShieldCheck className="size-3.5 text-emerald-500" />
        <span>{isAr ? "اتصال مؤمَّن ومشفّر عبر عقار بوكس" : "Secured & encrypted by AqarBooks"}</span>
      </div>
    </div>
  );
}
