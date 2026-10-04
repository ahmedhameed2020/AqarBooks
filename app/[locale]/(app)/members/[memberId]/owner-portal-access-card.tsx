"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import {
  AlertCircle,
  Check,
  Copy,
  KeyRound,
  Loader2,
  LogOut,
  Mail,
  MessageCircle,
  RefreshCw,
  ShieldCheck,
  ShieldOff,
  UserCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getPortalAccessAction,
  issueActivationAction,
  issueTemporaryAccessAction,
  reactivatePortalAction,
  revokeActivationLinkAction,
  signOutEverywhereAction,
  suspendPortalAction,
  type PortalAccessState,
} from "@/lib/actions/member-portal-access";
import type { ActivationIssued, TempAccessIssued } from "@/lib/portal-access/orchestrate";

type Props = { memberId: string; memberName: string; locale: string };

const ERRORS: Record<string, { ar: string; en: string }> = {
  FORBIDDEN_PORTAL_ACCESS: { ar: "لا تملك صلاحية إدارة وصول هذا المالك.", en: "You don't have permission to manage this owner's access." },
  NO_ACTIVE_OWNERSHIP: { ar: "لا توجد وحدة مملوكة حاليًا لهذا العضو — اربطه بوحدة أولًا.", en: "This member owns no unit right now — link a unit first." },
  MEMBER_EMAIL_REQUIRED: { ar: "سجّل بريدًا إلكترونيًا صالحًا للمالك أولًا، أو أصدر بيانات دخول مؤقتة.", en: "Record a valid email for this owner first, or issue temporary credentials." },
  ALREADY_ACTIVE: { ar: "المالك مُفعّل بالفعل.", en: "This owner is already active." },
  PORTAL_SUSPENDED: { ar: "الوصول موقوف — أعد التفعيل أولًا.", en: "Access is suspended — reactivate it first." },
  CLIENT_ID_ACCOUNT: { ar: "هذا الحساب يعمل برقم العميل — أصدر بيانات دخول مؤقتة جديدة.", en: "This account uses a client ID — issue new temporary credentials." },
  EMAIL_ACCOUNT: { ar: "هذا الحساب يعمل بالبريد الإلكتروني — لا تُصدر له بيانات مؤقتة.", en: "This account uses email — temporary credentials don't apply." },
  ORGANIZATION_INACTIVE: { ar: "المنظمة غير نشطة.", en: "The organization is not active." },
  NOT_SUSPENDED: { ar: "الوصول غير موقوف.", en: "Access is not suspended." },
  NOT_PROVISIONED: { ar: "لا يوجد حساب لهذا المالك بعد.", en: "This owner has no account yet." },
  AUTH_CREATE_FAILED: { ar: "تعذّر إنشاء الحساب. حاول مرة أخرى.", en: "Could not create the account. Try again." },
  AUTH_UPDATE_FAILED: { ar: "تعذّر تحديث كلمة المرور. حاول مرة أخرى.", en: "Could not update the password. Try again." },
  UNAUTHENTICATED: { ar: "انتهت جلستك — سجّل الدخول من جديد.", en: "Your session ended — sign in again." },
};

function message(code: string, isAr: boolean) {
  const known = ERRORS[code];
  if (known) return known[isAr ? "ar" : "en"];
  return isAr ? "تعذّر تنفيذ الطلب. تحقق من الاتصال وحاول مرة أخرى." : "The request failed. Check your connection and try again.";
}

const fmt = (iso: string | null, isAr: boolean) =>
  iso
    ? new Date(iso).toLocaleString(isAr ? "ar-EG" : "en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Cairo" })
    : "—";

function CopyButton({ value, label, isAr }: { value: string; label: string; isAr: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className="h-8 gap-1.5 text-xs"
      onClick={() => {
        navigator.clipboard.writeText(value).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        });
      }}
    >
      {copied ? <Check className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5" />}
      {copied ? (isAr ? "تم النسخ" : "Copied") : label}
    </Button>
  );
}

const STATUS_STYLE: Record<PortalAccessState["status"], string> = {
  not_activated: "bg-muted text-muted-foreground",
  pending: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  active: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  suspended: "bg-destructive/15 text-destructive",
};

export function OwnerPortalAccessCard({ memberId, memberName, locale }: Props) {
  const isAr = locale === "ar";
  const lang = isAr ? "ar" : "en";
  const [state, setState] = useState<PortalAccessState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [link, setLink] = useState<ActivationIssued | null>(null);
  const [temp, setTemp] = useState<TempAccessIssued | null>(null);
  const [confirming, setConfirming] = useState<"suspend" | "logout" | "temp" | null>(null);

  const refresh = useCallback(async () => {
    const res = await getPortalAccessAction(memberId);
    if (res.ok) {
      setState(res.state);
      setLoadError(null);
    } else setLoadError(message(res.error, isAr));
  }, [memberId, isAr]);

  useEffect(() => {
    let cancelled = false;
    getPortalAccessAction(memberId).then((res) => {
      if (cancelled) return;
      if (res.ok) setState(res.state);
      else setLoadError(message(res.error, isAr));
    });
    return () => {
      cancelled = true;
    };
  }, [memberId, isAr]);

  function act(run: () => Promise<void>) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      await run();
      await refresh();
    });
  }

  const issueLink = () =>
    act(async () => {
      setTemp(null);
      const res = await issueActivationAction(memberId, lang);
      if (!res.ok) return setError(message(res.error, isAr));
      setLink(res);
    });

  const issueTemp = () =>
    act(async () => {
      setConfirming(null);
      setLink(null);
      const res = await issueTemporaryAccessAction(memberId, lang);
      if (!res.ok) return setError(message(res.error, isAr));
      setTemp(res);
    });

  const lifecycle = (run: () => ReturnType<typeof suspendPortalAction>, doneAr: string, doneEn: string) =>
    act(async () => {
      setConfirming(null);
      const res = await run();
      if (!res.ok) return setError(message(res.error, isAr));
      setLink(null);
      setTemp(null);
      setNotice(
        res.warnings.length
          ? `${isAr ? doneAr : doneEn} ${isAr ? "(تنبيه: تعذّر جزء من الإجراء — تحقق من الحالة)" : "(warning: part of the action failed — check the status)"}`
          : isAr ? doneAr : doneEn,
      );
    });

  if (loadError) {
    return (
      <section className="rounded-2xl border border-destructive/40 bg-destructive/10 p-4 text-xs text-destructive" role="alert">
        <AlertCircle className="me-1.5 inline size-3.5" />
        {loadError}
      </section>
    );
  }
  if (!state) {
    return (
      <section className="flex items-center gap-2 rounded-2xl border border-border p-4 text-xs text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        {isAr ? "جارٍ قراءة حالة بوابة المالك…" : "Reading owner portal status…"}
      </section>
    );
  }

  const label = {
    not_activated: isAr ? "غير مفعلة" : "Not activated",
    pending: isAr ? "بانتظار التفعيل" : "Awaiting activation",
    active: isAr ? "مفعلة" : "Active",
    suspended: isAr ? "موقوفة" : "Suspended",
  }[state.status];
  const method =
    state.login_method === "client_id"
      ? isAr ? `رقم العميل ${state.client_id ?? ""}` : `Client ID ${state.client_id ?? ""}`
      : state.login_method === "email"
        ? isAr ? "البريد الإلكتروني" : "Email"
        : "—";
  const canIssue = state.eligible && state.status !== "suspended";
  const emailFlow = state.login_method !== "client_id";

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-4" aria-label={isAr ? "بوابة المالك" : "Owner portal"} data-testid="owner-portal-access">
      <header className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-bold">
          <ShieldCheck className="size-4 text-primary" />
          {isAr ? "بوابة المالك" : "Owner portal"}
        </h2>
        <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${STATUS_STYLE[state.status]}`} data-testid="portal-status">
          {label}
        </span>
      </header>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[11px]">
        <Row k={isAr ? "وسيلة الدخول" : "Sign-in"} v={method} />
        <Row k={isAr ? "الوحدات المرتبطة" : "Linked units"} v={String(state.units_count)} />
        <Row k={isAr ? "تاريخ التفعيل" : "Activated"} v={fmt(state.activated_at, isAr)} />
        <Row k={isAr ? "آخر دخول" : "Last sign-in"} v={fmt(state.last_sign_in_at, isAr)} />
        {state.must_change_password && (
          <Row
            k={isAr ? "كلمة مؤقتة" : "Temporary password"}
            v={state.temp_expired ? (isAr ? "منتهية" : "Expired") : `${isAr ? "حتى" : "until"} ${fmt(state.temp_password_expires_at, isAr)}`}
          />
        )}
        {state.email_verification && (
          <Row
            k={isAr ? "تأكيد البريد" : "Email verification"}
            v={
              state.email_verification === "verified"
                ? isAr ? "مؤكَّد" : "Verified"
                : isAr ? "بانتظار تأكيد البريد" : "Pending email verification"
            }
          />
        )}
        {state.pending_activation_expires_at && (
          <Row k={isAr ? "رابط التفعيل" : "Activation link"} v={`${isAr ? "حتى" : "until"} ${fmt(state.pending_activation_expires_at, isAr)}`} />
        )}
        {state.activation_link_expired && <Row k={isAr ? "رابط التفعيل" : "Activation link"} v={isAr ? "منتهٍ" : "Expired"} />}
        {state.status === "suspended" && <Row k={isAr ? "أُوقف في" : "Suspended"} v={fmt(state.suspended_at, isAr)} />}
      </dl>

      {!state.eligible && (
        <Notice tone="warning">
          {isAr ? "لا توجد وحدة مملوكة حاليًا لهذا العضو، لذا لا يمكن تفعيل البوابة. اربطه بوحدة أولًا." : "This member owns no unit right now, so the portal cannot be activated. Link a unit first."}
        </Notice>
      )}
      {state.shared_identity && (
        <Notice tone="info">
          {isAr ? "نفس هوية الدخول تُستخدم للعمل وللحساب كمالك. الإيقاف يغلق جانب المالك فقط ولا يمنع العمل." : "One sign-in identity serves both work and the owner account. Suspending closes only the owner side."}
        </Notice>
      )}
      {state.legacy_linked && (
        <Notice tone="info">
          {isAr ? "هذا المالك فُعّل عبر الدعوة القديمة. يمكنك إيقاف وصوله أو تسجيل خروجه من هنا." : "This owner was activated through the older invitation. You can suspend or sign them out here."}
        </Notice>
      )}

      {error && <Notice tone="danger">{error}</Notice>}
      {notice && <Notice tone="success">{notice}</Notice>}

      {link && <EmailResult result={link} isAr={isAr} onFallback={issueTemp} busy={pending} />}
      {temp && <TempResult temp={temp} isAr={isAr} />}

      <div className="flex flex-wrap gap-2">
        {state.status === "not_activated" && (
          <>
            <Button type="button" size="sm" className="gap-1.5" disabled={pending || !canIssue || !state.has_email} onClick={issueLink}>
              {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Mail className="size-3.5" />}
              {isAr ? "تفعيل بوابة المالك" : "Activate owner portal"}
            </Button>
            <Button type="button" size="sm" variant="outline" className="gap-1.5" disabled={pending || !canIssue} onClick={issueTemp}>
              <KeyRound className="size-3.5" />
              {isAr ? "إصدار بيانات دخول مؤقتة" : "Issue temporary credentials"}
            </Button>
          </>
        )}

        {state.status === "pending" && emailFlow && (
          <>
            <Button type="button" size="sm" className="gap-1.5" disabled={pending || !canIssue} onClick={issueLink}>
              <RefreshCw className="size-3.5" />
              {isAr ? "إعادة إرسال الدعوة" : "Resend invitation"}
            </Button>
            <Button type="button" size="sm" variant="outline" className="gap-1.5" disabled={pending || !canIssue} onClick={issueTemp}>
              <KeyRound className="size-3.5" />
              {isAr ? "بدلًا من ذلك: بيانات دخول مؤقتة" : "Instead: temporary credentials"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() =>
                act(async () => {
                  const res = await revokeActivationLinkAction(memberId);
                  if (!res.ok) return setError(message(res.error, isAr));
                  setLink(null);
                  setNotice(isAr ? "أُلغي رابط التفعيل." : "The activation link was cancelled.");
                })
              }
            >
              {isAr ? "إلغاء الرابط" : "Cancel link"}
            </Button>
          </>
        )}

        {state.login_method === "client_id" && state.status !== "suspended" && (
          <Button type="button" size="sm" variant="outline" className="gap-1.5" disabled={pending} onClick={() => setConfirming("temp")}>
            <KeyRound className="size-3.5" />
            {isAr ? "إصدار بيانات دخول مؤقتة جديدة" : "Issue new temporary credentials"}
          </Button>
        )}

        {state.status === "suspended" ? (
          <Button
            type="button"
            size="sm"
            className="gap-1.5"
            disabled={pending || !state.can_manage}
            onClick={() => lifecycle(() => reactivatePortalAction(memberId), "أُعيد تفعيل الوصول.", "Access was reactivated.")}
          >
            <UserCheck className="size-3.5" />
            {isAr ? "إعادة التفعيل" : "Reactivate"}
          </Button>
        ) : (
          (state.status === "active" || state.status === "pending") && (
            <Button type="button" size="sm" variant="outline" className="gap-1.5 text-destructive" disabled={pending || !state.can_manage} onClick={() => setConfirming("suspend")}>
              <ShieldOff className="size-3.5" />
              {isAr ? "إيقاف الوصول" : "Suspend access"}
            </Button>
          )
        )}

        {state.status !== "not_activated" && (
          <Button type="button" size="sm" variant="outline" className="gap-1.5" disabled={pending || !state.can_manage} onClick={() => setConfirming("logout")}>
            <LogOut className="size-3.5" />
            {isAr ? "تسجيل خروج من جميع الأجهزة" : "Sign out of all devices"}
          </Button>
        )}
      </div>

      {!state.can_manage && state.status !== "not_activated" && (
        <p className="text-[11px] text-muted-foreground">
          {isAr ? "الإيقاف وإعادة التفعيل وتسجيل الخروج تتطلب صلاحية «إدارة وصول الملاك»." : "Suspend, reactivate and sign-out need the “manage owner portal access” permission."}
        </p>
      )}

      {confirming && (
        <div className="space-y-3 rounded-xl border border-amber-500/40 bg-amber-500/[0.06] p-3" role="alertdialog">
          <p className="text-xs font-semibold">
            {confirming === "suspend" &&
              (isAr ? `إيقاف وصول ${memberName} إلى البوابة؟ لن يستطيع الدخول، وتُلغى جلساته وروابط تفعيله. بياناته لا تُحذف.` : `Suspend ${memberName}'s portal access? They will not be able to sign in, and their sessions and links are cancelled. Their data is kept.`)}
            {confirming === "logout" &&
              (isAr ? `تسجيل خروج ${memberName} من جميع الأجهزة؟ إن كان يستخدم نفس الهوية للعمل فسيُسجَّل خروجه من العمل أيضًا.` : `Sign ${memberName} out of every device? If the same identity is used for work, that is signed out too.`)}
            {confirming === "temp" &&
              (isAr ? "إصدار بيانات جديدة يُبطل كلمة المرور الحالية فورًا، وتُعرض الجديدة مرة واحدة فقط." : "New credentials invalidate the current password immediately, and the new one is shown only once.")}
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              disabled={pending}
              onClick={() => {
                if (confirming === "temp") return issueTemp();
                if (confirming === "suspend") return lifecycle(() => suspendPortalAction(memberId), "أُوقف الوصول.", "Access was suspended.");
                return lifecycle(() => signOutEverywhereAction(memberId), "سُجّل خروج المالك من جميع الأجهزة.", "The owner was signed out of every device.");
              }}
            >
              {isAr ? "تأكيد" : "Confirm"}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(null)}>
              {isAr ? "رجوع" : "Back"}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <>
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="font-semibold">{v}</dd>
    </>
  );
}

function Notice({ tone, children }: { tone: "info" | "warning" | "danger" | "success"; children: React.ReactNode }) {
  const cls = {
    info: "border-border bg-muted/40",
    warning: "border-amber-500/40 bg-amber-500/[0.06] text-amber-900 dark:text-amber-200",
    danger: "border-destructive/40 bg-destructive/10 text-destructive",
    success: "border-emerald-500/40 bg-emerald-500/[0.06] text-emerald-900 dark:text-emerald-200",
  }[tone];
  return (
    <p role={tone === "danger" ? "alert" : "status"} className={`rounded-xl border p-3 text-[11px] leading-relaxed ${cls}`}>
      {children}
    </p>
  );
}

function EmailResult({
  result,
  isAr,
  onFallback,
  busy,
}: {
  result: ActivationIssued;
  isAr: boolean;
  onFallback: () => void;
  busy: boolean;
}) {
  // Never claim an email went out unless the provider accepted it, and never
  // show a link: it exists only inside that email, so staff cannot activate on
  // the owner's behalf.
  const sent = result.emailStatus === "sent";
  return (
    <div className="space-y-2 rounded-xl border border-border bg-muted/30 p-3" data-testid="activation-result" data-email-status={result.emailStatus}>
      <Notice tone={sent ? "success" : "warning"}>
        {sent
          ? isAr
            ? `أُرسلت رسالة التفعيل إلى ${result.email}. يكتمل التفعيل عندما يؤكد المالك بريده بفتح الرابط الوارد فيها.`
            : `The activation email was sent to ${result.email}. Activation completes when the owner proves the address by opening the link in it.`
          : isAr
            ? "لم يتم إرسال البريد. الحالة: بانتظار تأكيد البريد (PENDING_EMAIL_VERIFICATION) — لا يوجد رابط تفعيل."
            : "The email was not sent. Status: PENDING_EMAIL_VERIFICATION — there is no activation link."}
      </Notice>
      {!sent && (
        <div className="space-y-2">
          <p className="text-[11px] text-muted-foreground">
            {isAr
              ? "لا يمكن لأحد تأكيد هذا البريد نيابة عن المالك. لتمكينه الآن استخدم رقم عميل وكلمة مرور مؤقتة، أو أعد المحاولة عند توفر الإرسال."
              : "Nobody can confirm this address on the owner's behalf. To give access now, use a client number and temporary password, or retry when email sending is available."}
          </p>
          <Button type="button" size="sm" className="gap-1.5" disabled={busy} onClick={onFallback}>
            <KeyRound className="size-3.5" />
            {isAr ? "إصدار بيانات دخول مؤقتة" : "Issue temporary credentials"}
          </Button>
        </div>
      )}
    </div>
  );
}

function TempResult({ temp, isAr }: { temp: TempAccessIssued; isAr: boolean }) {
  return (
    <div className="space-y-3 rounded-xl border border-indigo-500/30 bg-indigo-500/[0.06] p-3" data-testid="temp-result">
      <div className="grid grid-cols-2 gap-3 text-center">
        <div className="space-y-1">
          <p className="text-[11px] text-muted-foreground">{isAr ? "رقم العميل" : "Client ID"}</p>
          <p dir="ltr" className="font-mono text-xl font-bold" data-testid="temp-client-id">{temp.clientId}</p>
        </div>
        <div className="space-y-1">
          <p className="text-[11px] text-muted-foreground">{isAr ? "كلمة المرور المؤقتة" : "Temporary password"}</p>
          <p dir="ltr" className="font-mono text-xl font-bold" data-testid="temp-password">{temp.temporaryPassword}</p>
        </div>
      </div>
      <p className="text-center text-[11px] text-muted-foreground">
        {isAr ? "تنتهي في" : "Expires"}{" "}
        {new Date(temp.expiresAt).toLocaleString(isAr ? "ar-EG" : "en-GB", { dateStyle: "long", timeStyle: "short", timeZone: "Africa/Cairo" })}
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <CopyButton value={temp.clientId} label={isAr ? "نسخ رقم العميل" : "Copy client ID"} isAr={isAr} />
        <CopyButton value={temp.temporaryPassword} label={isAr ? "نسخ كلمة المرور" : "Copy password"} isAr={isAr} />
        <CopyButton value={temp.whatsappText} label={isAr ? "نسخ رسالة واتساب" : "Copy WhatsApp message"} isAr={isAr} />
      </div>
      <p className="flex items-start gap-1.5 text-[11px] font-medium text-amber-700 dark:text-amber-300">
        <MessageCircle className="mt-0.5 size-3.5 shrink-0" />
        {isAr
          ? "تظهر كلمة المرور هذه مرة واحدة فقط ولا تُخزَّن. انسخها الآن وأرسلها للمالك؛ سيُطلب منه تغييرها عند أول دخول. إن ضاعت أصدر بيانات جديدة."
          : "This password is shown once and is not stored. Copy it now and send it to the owner; they must change it at first sign-in. If lost, issue new credentials."}
      </p>
    </div>
  );
}
