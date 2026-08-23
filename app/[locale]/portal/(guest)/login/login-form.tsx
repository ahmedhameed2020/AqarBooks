"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Mail,
  AlertCircle,
  Loader2,
  ShieldCheck,
  Info,
  Send,
  KeyRound,
  ArrowRight,
  UserX,
  LogOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import type { Locale } from "@/i18n/routing";
import { LogoMark } from "@/components/marketing/logo-mark";

// The owner portal has no password. First access is a staff-issued link plus an
// access code; this screen covers a returning owner whose session lapsed.
//
// The emailed CODE is the primary path, not the link. A magic link carries a
// PKCE verifier bound to the browser that requested it, so an owner who opens
// their mail on a phone after requesting the link on a laptop lands on a dead
// redirect -- and the redirect target additionally has to sit on Supabase's
// allow-list. Typing six digits has none of those failure modes and works on
// any device. The link still works (it now points at /auth/callback, which
// actually exchanges the code) but it is offered as the fallback, not the
// headline.
//
// Note this code is Supabase's own email OTP, and is a different thing from the
// invitation access code staff sends over WhatsApp. Each flow has exactly one
// code, and the wording below says which one it is.
export function LoginForm({
  locale,
  orgSuspended,
  notAMember,
  authFailed,
}: {
  locale: Locale;
  orgSuspended?: boolean;
  /** Signed in successfully, but the account owns nothing in any organization. */
  notAMember?: boolean;
  authFailed?: boolean;
}) {
  const isAr = locale === "ar";
  const router = useRouter();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [signingOut, setSigningOut] = useState(false);
  const codeRef = useRef<HTMLInputElement>(null);

  // Someone in this state holds a valid session that the portal will keep
  // refusing, so every retry loops them straight back here. Clearing the
  // session is the only way out, and it has to be offered on screen.
  function handleSignOut() {
    setSigningOut(true);
    const supabase = createClient();
    supabase.auth.signOut().then(() => {
      window.location.href = `/${locale}/portal/login`;
    });
  }

  function handleRequest(e: React.FormEvent) {
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
          // /auth/callback performs the PKCE exchange and honours ?next.
          // Pointing this straight at /portal was a real defect: nothing there
          // exchanges the code, so the link could never establish a session.
          emailRedirectTo: `${window.location.origin}/auth/callback?next=/${locale}/portal`,
        },
      });

      if (otpError && /rate|limit|too many/i.test(otpError.message)) {
        setError(
          isAr
            ? "تم طلب عدد كبير من الرموز خلال فترة قصيرة. انتظر بضع دقائق ثم أعد المحاولة."
            : "Too many codes requested in a short time. Wait a few minutes and try again.",
        );
        return;
      }

      // Advance regardless of whether the address exists. Revealing that would
      // turn this box into an account-enumeration oracle.
      setStep("code");
      setTimeout(() => codeRef.current?.focus(), 50);
    });
  }

  function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    const digits = code.replace(/\D/g, "");
    if (digits.length !== 6) {
      setError(isAr ? "أدخل الرمز المكوّن من ٦ أرقام." : "Enter the six-digit code.");
      return;
    }

    setError(null);
    startTransition(async () => {
      const supabase = createClient();
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email: email.trim().toLowerCase(),
        token: digits,
        type: "email",
      });

      if (verifyError) {
        setError(
          isAr
            ? "الرمز غير صحيح أو انتهت صلاحيته. تحقق من آخر رسالة وصلتك، أو اطلب رمزًا جديدًا."
            : "That code is incorrect or has expired. Check the most recent message, or request a new code.",
        );
        setCode("");
        codeRef.current?.focus();
        return;
      }

      router.push(`/${locale}/portal`);
      router.refresh();
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
            ? "لا حاجة لكلمة مرور. نرسل رمزًا من ٦ أرقام إلى بريدك المسجل."
            : "No password needed. We email a six-digit code to your registered address."}
        </p>
      </div>

      {notAMember && (
        <div className="space-y-3 rounded-2xl border border-amber-500/40 bg-amber-500/[0.06] p-4">
          <div className="flex items-start gap-2.5">
            <UserX className="mt-0.5 size-4 shrink-0 text-amber-600" />
            <div className="space-y-1">
              <p className="text-xs font-bold text-amber-900 dark:text-amber-200">
                {isAr
                  ? "تم تسجيل دخولك، لكن هذا البريد غير مسجّل كمالك"
                  : "You are signed in, but this address is not registered as an owner"}
              </p>
              <p className="text-[11px] leading-relaxed text-amber-800/90 dark:text-amber-200/80">
                {isAr
                  ? "الرمز صحيح والحساب سليم — لكن لا توجد وحدات مرتبطة بهذا البريد في أي كيان، فلا شيء تعرضه البوابة. إن كنت مالكًا فتواصل مع إدارة الكيان لربط بريدك بسجلك، أو جرّب البريد الذي وصلتك عليه دعوة البوابة."
                  : "The code was correct and the account is fine — but no units are linked to this address in any organization, so the portal has nothing to show. If you are an owner, ask management to link this address to your record, or try the address your portal invitation was sent to."}
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={signingOut}
            onClick={handleSignOut}
            className="h-9 w-full gap-2 rounded-xl text-xs font-semibold"
          >
            {signingOut ? <Loader2 className="size-3.5 animate-spin" /> : <LogOut className="size-3.5" />}
            {isAr ? "تسجيل الخروج وتجربة بريد آخر" : "Sign out and try another address"}
          </Button>
        </div>
      )}

      {authFailed && !notAMember && (
        <div className="flex items-start gap-2.5 rounded-2xl border border-rose-200 bg-rose-50 p-4 dark:border-rose-900/50 dark:bg-rose-950/40">
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-rose-600" />
          <div className="space-y-1">
            <p className="text-xs font-bold text-rose-700 dark:text-rose-300">
              {isAr ? "تعذّر إتمام الدخول عبر الرابط" : "That sign-in link could not be completed"}
            </p>
            <p className="text-[11px] leading-relaxed text-rose-700/90 dark:text-rose-300/80">
              {isAr
                ? "يحدث هذا غالبًا عند فتح الرابط على جهاز أو متصفح غير الذي طلبته منه. أدخل بريدك أدناه واستخدم الرمز المكوّن من ٦ أرقام بدل الرابط — الرمز يعمل على أي جهاز."
                : "This usually happens when the link is opened on a different device or browser than the one that requested it. Enter your email below and use the six-digit code instead — the code works on any device."}
            </p>
          </div>
        </div>
      )}

      {step === "email" ? (
        <form
          onSubmit={handleRequest}
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
            className="h-11 w-full gap-2 rounded-xl bg-[#1A3C2E] text-sm font-bold text-white hover:bg-[#132d22] shadow-md shadow-[#1A3C2E]/20"
          >
            {isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                {isAr ? "جارٍ الإرسال…" : "Sending…"}
              </>
            ) : (
              <>
                <Send className="size-4" />
                {isAr ? "أرسل لي رمز الدخول" : "Email me a code"}
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
                ? "ترسل لك إدارة الكيان رابط دعوة عبر واتساب أو البريد، ورمزًا خاصًا في رسالة منفصلة. هذه الصفحة للعودة بعد انتهاء الجلسة فقط."
                : "Management sends you an invitation link and a separate access code. This page is only for returning after your session ends."}
            </p>
          </div>
        </form>
      ) : (
        <form
          onSubmit={handleVerify}
          className="space-y-5 rounded-2xl border border-border/80 bg-card p-6 shadow-sm sm:p-8"
        >
          <div className="space-y-2 text-center">
            <div className="mx-auto flex size-11 items-center justify-center rounded-xl bg-[#1A3C2E] text-white shadow-sm">
              <KeyRound className="size-5" />
            </div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              {isAr ? "أدخل الرمز المرسل إلى بريدك" : "Enter the code from your email"}
            </h2>
            <p className="mx-auto max-w-xs text-[11px] leading-relaxed text-slate-500">
              {isAr ? (
                <>
                  إن كان <span className="font-mono font-semibold">{email}</span> مسجلاً لدينا، فقد
                  أرسلنا إليه رمزًا من ٦ أرقام. الرسالة تحتوي أيضًا على رابط يمكنك الضغط عليه بدلًا
                  من ذلك.
                </>
              ) : (
                <>
                  If <span className="font-mono font-semibold">{email}</span> is registered with us,
                  a six-digit code is on its way. The message also contains a link you can click
                  instead.
                </>
              )}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="portal-otp" className="sr-only">
              {isAr ? "رمز الدخول" : "Access code"}
            </Label>
            <Input
              id="portal-otp"
              ref={codeRef}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="······"
              dir="ltr"
              aria-describedby={error ? "portal-otp-error" : undefined}
              className="h-14 rounded-xl text-center font-mono text-2xl font-bold tracking-[0.5em]"
            />
          </div>

          {error && (
            <p
              id="portal-otp-error"
              role="alert"
              className="rounded-xl border border-rose-200 bg-rose-50 p-2.5 text-center text-xs font-bold text-rose-600 dark:border-rose-900/50 dark:bg-rose-950/40"
            >
              {error}
            </p>
          )}

          <Button
            type="submit"
            disabled={isPending || code.replace(/\D/g, "").length !== 6}
            className="h-11 w-full gap-2 rounded-xl bg-[#1A3C2E] text-sm font-bold text-white hover:bg-[#132d22] shadow-md shadow-[#1A3C2E]/20"
          >
            {isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                {isAr ? "جارٍ التحقق…" : "Verifying…"}
              </>
            ) : (
              <>
                <ShieldCheck className="size-4" />
                {isAr ? "الدخول إلى البوابة" : "Enter the portal"}
              </>
            )}
          </Button>

          <div className="flex items-center justify-between gap-2 text-[11px]">
            <button
              type="button"
              onClick={() => {
                setStep("email");
                setCode("");
                setError(null);
              }}
              className="inline-flex items-center gap-1 font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
            >
              <ArrowRight className="size-3 rtl:-scale-x-100" />
              {isAr ? "تغيير البريد" : "Change email"}
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={() => handleRequest({ preventDefault() {} } as React.FormEvent)}
              className="font-semibold text-indigo-600 hover:underline disabled:opacity-50 dark:text-indigo-400"
            >
              {isAr ? "إرسال رمز جديد" : "Send a new code"}
            </button>
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
