"use client";

import { useEffect, useState, useTransition } from "react";
import {
  UserPlus,
  Mail,
  MessageCircle,
  AlertCircle,
  RefreshCw,
  Copy,
  Check,
  KeyRound,
  Link2,
  ShieldAlert,
  ShieldCheck,
  Clock,
  Loader2,
  Lock,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  createMemberInvitationAction,
  getMemberPortalStatusAction,
  type MemberPortalStatus,
} from "@/lib/actions/member-portal";
import { buildWhatsAppUrl } from "@/lib/whatsapp";

// Two messages, never one. The link proves possession of the message; the code
// proves the holder was the intended recipient. Putting both in one WhatsApp
// message would collapse them back into a single factor, so the code is not
// interpolated into the invite text anywhere in this file.
function inviteMessage(isAr: boolean, memberName: string, link: string) {
  return isAr
    ? `مرحبًا ${memberName}، يمكنك الآن متابعة حسابك ودفع مستحقاتك أونلاين عبر بوابة الملاك:\n${link}\n\nسيُطلب منك رمز الدخول، وسأرسله لك في رسالة منفصلة.`
    : `Hello ${memberName}, you can now review your account and pay your dues online through the owner portal:\n${link}\n\nYou will be asked for an access code, which I will send in a separate message.`;
}

function codeMessage(isAr: boolean, code: string) {
  return isAr
    ? `رمز الدخول الخاص بك لبوابة الملاك هو: ${code}\n\nلا تشاركه مع أي شخص. صالح لمدة ٧٢ ساعة.`
    : `Your owner portal access code is: ${code}\n\nDo not share it with anyone. Valid for 72 hours.`;
}

// Only failures that can still occur once the dialog refuses to offer an
// impossible action. MEMBER_ALREADY_LINKED is deliberately absent: that state is
// now detected before any button is shown, so it is a screen, not an error.
const ERROR_MESSAGES: Record<string, { ar: string; en: string }> = {
  MEMBER_CONTACT_REQUIRED: {
    ar: "لا يمكن إنشاء دعوة قبل تسجيل بريد إلكتروني أو رقم هاتف لهذا المالك. أضف وسيلة تواصل في بياناته ثم أعد المحاولة.",
    en: "An invitation needs a registered email or phone number first. Add a contact method to this owner's record, then try again.",
  },
  FORBIDDEN_PORTAL_INVITE: {
    ar: "لا تملك صلاحية دعوة الملاك إلى البوابة. تواصل مع مدير الحساب لمنحك صلاحية «دعوة الملاك للبوابة».",
    en: "You don't have permission to invite owners to the portal. Ask an account administrator for the portal-invite permission.",
  },
  MEMBER_NOT_FOUND: {
    ar: "لم يعد هذا المالك موجودًا في السجلات. حدّث الصفحة.",
    en: "This owner no longer exists in the records. Refresh the page.",
  },
  MEMBER_ALREADY_LINKED: {
    ar: "حصل هذا المالك على وصول للبوابة أثناء فتحك لهذه النافذة. أغلقها وافتحها من جديد.",
    en: "This owner gained portal access while this dialog was open. Close it and open it again.",
  },
};

function mapError(message: string, isAr: boolean): string {
  const code = Object.keys(ERROR_MESSAGES).find((candidate) => message.startsWith(candidate));
  if (code) return ERROR_MESSAGES[code][isAr ? "ar" : "en"];
  return isAr
    ? "تعذر إنشاء الدعوة. تحقق من الاتصال ثم أعد المحاولة."
    : "Could not create the invitation. Check your connection and try again.";
}

function formatDate(iso: string, isAr: boolean) {
  return new Date(iso).toLocaleDateString(isAr ? "ar-EG" : "en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

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

function Notice({
  tone,
  icon,
  title,
  children,
}: {
  tone: "info" | "warning" | "danger" | "success";
  icon: React.ReactNode;
  title: string;
  children?: React.ReactNode;
}) {
  const toneClass = {
    info: "border-border bg-muted/40 text-foreground",
    warning: "border-amber-500/40 bg-amber-500/[0.06] text-amber-900 dark:text-amber-200",
    danger: "border-destructive/40 bg-destructive/10 text-destructive",
    success: "border-emerald-500/40 bg-emerald-500/[0.06] text-emerald-900 dark:text-emerald-200",
  }[tone];

  return (
    <div className={`flex items-start gap-2.5 rounded-2xl border p-3.5 ${toneClass}`}>
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div className="space-y-1">
        <p className="text-xs font-bold">{title}</p>
        {children ? <div className="text-[11px] leading-relaxed opacity-90">{children}</div> : null}
      </div>
    </div>
  );
}

export function InviteToPortalDialog({
  memberId,
  memberName,
  locale,
}: {
  memberId: string;
  memberName: string;
  locale: string;
}) {
  const isAr = locale === "ar";
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [status, setStatus] = useState<MemberPortalStatus | null>(null);
  const [issued, setIssued] = useState<{
    shortLink: string;
    accessCode: string;
    memberEmail: string | null;
    memberPhone: string | null;
    isSyntheticEmail: boolean;
  } | null>(null);

  // Read the owner's real portal state before offering anything. Every failure
  // in the screenshot that prompted this rewrite came from offering "invite" to
  // an owner who already had an account.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setStatus(null);
    setErrorMsg(null);
    getMemberPortalStatusAction(memberId).then((res) => {
      if (!cancelled) setStatus(res);
    });
    return () => {
      cancelled = true;
    };
  }, [open, memberId]);

  function handleGenerate() {
    setErrorMsg(null);
    startTransition(async () => {
      const res = await createMemberInvitationAction(memberId, locale);
      if (!res.ok) {
        setErrorMsg(mapError(res.error, isAr));
        return;
      }
      setIssued({
        shortLink: res.shortLink,
        accessCode: res.accessCode,
        memberEmail: res.memberEmail,
        memberPhone: res.memberPhone,
        isSyntheticEmail: res.isSyntheticEmail,
      });
    });
  }

  const whatsappLinkUrl = issued?.memberPhone
    ? buildWhatsAppUrl(issued.memberPhone, inviteMessage(isAr, memberName, issued.shortLink))
    : null;
  const whatsappCodeUrl = issued?.memberPhone
    ? buildWhatsAppUrl(issued.memberPhone, codeMessage(isAr, issued.accessCode))
    : null;
  // A synthetic placeholder address can't receive anything -- only offer the
  // mailto button for a real, deliverable address.
  const mailtoUrl =
    issued && issued.memberEmail && !issued.isSyntheticEmail
      ? `mailto:${issued.memberEmail}?subject=${encodeURIComponent(
          isAr ? "دعوة لبوابة الملاك" : "Owner Portal Invitation",
        )}&body=${encodeURIComponent(inviteMessage(isAr, memberName, issued.shortLink))}`
      : null;

  const loaded = status?.ok === true ? status : null;
  const statusError = status && status.ok === false ? status.error : null;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setIssued(null);
          setErrorMsg(null);
          setStatus(null);
        }
      }}
    >
      <DialogTrigger
        render={
          <Button type="button" variant="outline" size="sm" className="gap-2 text-xs">
            <UserPlus className="size-3.5" />
            {isAr ? "دعوة للبوابة" : "Invite to portal"}
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <div>
            <DialogTitle>{isAr ? "الوصول إلى بوابة الملاك" : "Owner portal access"}</DialogTitle>
            <DialogDescription>{memberName}</DialogDescription>
          </div>
        </DialogHeader>

        <DialogBody className="space-y-4">
          {/* --- loading ------------------------------------------------- */}
          {!status && (
            <div className="flex items-center justify-center gap-2.5 py-8 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              {isAr ? "جارٍ قراءة حالة الوصول…" : "Checking access status…"}
            </div>
          )}

          {/* --- status could not be read -------------------------------- */}
          {statusError && (
            <Notice
              tone="danger"
              icon={<AlertCircle className="size-4" />}
              title={
                statusError === "forbidden"
                  ? isAr
                    ? "لا تملك صلاحية إدارة وصول الملاك"
                    : "You can't manage owner access"
                  : isAr
                    ? "تعذّر قراءة حالة الوصول"
                    : "Could not read access status"
              }
            >
              {statusError === "forbidden"
                ? isAr
                  ? "تحتاج صلاحية «دعوة الملاك للبوابة». تواصل مع مدير الحساب."
                  : "You need the portal-invite permission. Contact an account administrator."
                : isAr
                  ? "أغلق النافذة وأعد فتحها. إن تكرر الأمر تحقق من الاتصال."
                  : "Close the dialog and open it again. If it persists, check your connection."}
            </Notice>
          )}

          {/* --- already has access: a state, not an error --------------- */}
          {loaded?.linked && !issued && (
            <>
              <Notice
                tone="success"
                icon={<ShieldCheck className="size-4" />}
                title={isAr ? "هذا المالك لديه وصول للبوابة" : "This owner already has portal access"}
              >
                {loaded.linkedSince
                  ? isAr
                    ? `مُفعّل منذ ${formatDate(loaded.linkedSince, true)}. لا حاجة لدعوة جديدة.`
                    : `Active since ${formatDate(loaded.linkedSince, false)}. No new invitation is needed.`
                  : isAr
                    ? "حسابه مرتبط بالفعل، ولا حاجة لدعوة جديدة."
                    : "Their account is already linked; no new invitation is needed."}
              </Notice>

              {loaded.hasDeliverableEmail ? (
                <Notice
                  tone="info"
                  icon={<Mail className="size-4 text-indigo-500" />}
                  title={isAr ? "إذا فقد وصوله" : "If they lose access"}
                >
                  {isAr ? (
                    <>
                      يفتح صفحة دخول البوابة ويطلب رابط دخول يصل إلى{" "}
                      <span className="font-mono font-semibold">{loaded.memberEmail}</span> — بدون
                      تدخّل منك وبدون كلمة مرور.
                    </>
                  ) : (
                    <>
                      They open the portal sign-in page and request a link sent to{" "}
                      <span className="font-mono font-semibold">{loaded.memberEmail}</span> — no
                      action from you, and no password.
                    </>
                  )}
                </Notice>
              ) : (
                <Notice
                  tone="warning"
                  icon={<ShieldAlert className="size-4" />}
                  title={
                    isAr ? "لا يمكنه استعادة الوصول بنفسه" : "They cannot recover access themselves"
                  }
                >
                  {isAr
                    ? "دخوله مربوط بهوية داخلية مؤقتة لأنه لم يكن له بريد وقت الدعوة، وصفحة الدخول تعتمد على البريد. أضف بريده في لوحة البيانات على اليسار — سيُرحَّل حساب دخوله إليه تلقائيًا، وعندها يستطيع طلب رمز الدخول بنفسه."
                    : "Their sign-in is bound to a temporary internal identity, because they had no email when invited, and the sign-in page works by email. Add their address in the details panel — their sign-in identity migrates to it automatically, and they can then request a code themselves."}
                </Notice>
              )}
            </>
          )}

          {/* --- not linked, nothing issued yet -------------------------- */}
          {loaded && !loaded.linked && !issued && (
            <>
              {loaded.pendingInvitationExpiresAt && (
                <Notice
                  tone="warning"
                  icon={<Clock className="size-4" />}
                  title={isAr ? "توجد دعوة سارية لم تُستخدم بعد" : "An unused invitation is still valid"}
                >
                  {isAr
                    ? `صالحة حتى ${formatDate(loaded.pendingInvitationExpiresAt, true)}. إنشاء دعوة جديدة سيُلغي الرابط والرمز السابقين فورًا.`
                    : `Valid until ${formatDate(loaded.pendingInvitationExpiresAt, false)}. Issuing a new one immediately invalidates the previous link and code.`}
                </Notice>
              )}

              <div className="space-y-3 rounded-2xl border border-border bg-muted/30 p-4">
                <p className="text-xs font-bold text-foreground">
                  {isAr ? "كيف يدخل المالك؟" : "How the owner signs in"}
                </p>
                <ol className="space-y-2.5">
                  <li className="flex gap-2.5">
                    <span className="flex size-5 shrink-0 items-center justify-center rounded-md bg-primary text-[10px] font-bold text-primary-foreground">
                      1
                    </span>
                    <span className="text-[11px] leading-relaxed text-muted-foreground">
                      {isAr
                        ? "ترسل له رابط الدعوة عبر واتساب أو البريد."
                        : "You send him the invitation link by WhatsApp or email."}
                    </span>
                  </li>
                  <li className="flex gap-2.5">
                    <span className="flex size-5 shrink-0 items-center justify-center rounded-md bg-primary text-[10px] font-bold text-primary-foreground">
                      2
                    </span>
                    <span className="text-[11px] leading-relaxed text-muted-foreground">
                      {isAr
                        ? "ترسل رمز الدخول في رسالة منفصلة — حتى لا يكفي تحويل الرسالة لدخول حسابه."
                        : "You send the access code in a separate message — so forwarding the link alone is not enough."}
                    </span>
                  </li>
                  <li className="flex gap-2.5">
                    <span className="flex size-5 shrink-0 items-center justify-center rounded-md bg-primary text-[10px] font-bold text-primary-foreground">
                      3
                    </span>
                    <span className="text-[11px] leading-relaxed text-muted-foreground">
                      {isAr
                        ? "يفتح الرابط ويكتب الرمز. بدون كلمة مرور إطلاقًا."
                        : "He opens the link and types the code. No password at all."}
                    </span>
                  </li>
                </ol>
                <p className="border-t border-border pt-2.5 text-[11px] text-muted-foreground">
                  {isAr
                    ? "الرابط والرمز صالحان ٧٢ ساعة."
                    : "Both the link and the code are valid for 72 hours."}
                </p>
              </div>

              {!loaded.hasDeliverableEmail && !loaded.memberPhone && (
                <Notice
                  tone="warning"
                  icon={<ShieldAlert className="size-4" />}
                  title={isAr ? "لا توجد وسيلة تواصل مسجلة" : "No contact method on record"}
                >
                  {isAr
                    ? "أضف بريدًا إلكترونيًا أو رقم هاتف في بيانات المالك قبل إنشاء الدعوة."
                    : "Add an email address or phone number to this owner's record before creating an invitation."}
                </Notice>
              )}
            </>
          )}

          {/* --- issued: the code, then the link, then how to send ------- */}
          {issued && (
            <>
              <div className="space-y-2 rounded-2xl border border-indigo-500/30 bg-indigo-500/[0.06] p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-xs font-bold text-indigo-700 dark:text-indigo-300">
                    <KeyRound className="size-3.5" />
                    {isAr ? "رمز الدخول" : "Access code"}
                  </span>
                  <CopyButton
                    value={issued.accessCode}
                    label={isAr ? "نسخ الرمز" : "Copy code"}
                    isAr={isAr}
                  />
                </div>
                <p
                  dir="ltr"
                  className="text-center font-mono text-3xl font-bold tracking-[0.35em] text-foreground"
                >
                  {issued.accessCode}
                </p>
                <p className="flex items-start gap-1.5 text-[11px] font-medium text-amber-700 dark:text-amber-300">
                  <ShieldAlert className="mt-0.5 size-3.5 shrink-0" />
                  {isAr
                    ? "يظهر هذا الرمز مرة واحدة فقط ولا يمكن استرجاعه لاحقًا — انسخه الآن. إن فُقد، أنشئ دعوة جديدة."
                    : "This code is shown once and cannot be retrieved later — copy it now. If lost, issue a new invitation."}
                </p>
              </div>

              <div className="space-y-2 rounded-2xl border border-border bg-muted/40 p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                    <Link2 className="size-3.5" />
                    {isAr ? "رابط الدعوة" : "Invitation link"}
                  </span>
                  <CopyButton
                    value={issued.shortLink}
                    label={isAr ? "نسخ الرابط" : "Copy link"}
                    isAr={isAr}
                  />
                </div>
                <p dir="ltr" className="break-all font-mono text-[11px] text-muted-foreground">
                  {issued.shortLink}
                </p>
              </div>

              <div className="space-y-2">
                <p className="text-[11px] font-bold text-muted-foreground">
                  {isAr ? "الخطوة ١ — أرسل الرابط" : "Step 1 — send the link"}
                </p>
                <div className="flex flex-wrap gap-2">
                  {/* An anchor when there is somewhere to go, a real disabled
                      button when there is not. Passing an <a> to Button's
                      `render` stripped the native button semantics and Base UI
                      warns about it; a "disabled link" is not a thing the
                      platform has. */}
                  {mailtoUrl ? (
                    <a
                      href={mailtoUrl}
                      className={buttonVariants({ variant: "outline", size: "sm" })}
                    >
                      <Mail className="size-3.5" />
                      {isAr ? "عبر البريد" : "By email"}
                    </a>
                  ) : (
                    <Button type="button" size="sm" variant="outline" disabled>
                      <Mail className="size-3.5" />
                      {isAr ? "عبر البريد" : "By email"}
                    </Button>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={!whatsappLinkUrl}
                    onClick={() => whatsappLinkUrl && window.open(whatsappLinkUrl, "_blank", "noopener")}
                  >
                    <MessageCircle className="size-3.5" />
                    {isAr ? "عبر واتساب" : "By WhatsApp"}
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-[11px] font-bold text-muted-foreground">
                  {isAr ? "الخطوة ٢ — أرسل الرمز في رسالة منفصلة" : "Step 2 — send the code separately"}
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={!whatsappCodeUrl}
                  onClick={() => whatsappCodeUrl && window.open(whatsappCodeUrl, "_blank", "noopener")}
                >
                  <KeyRound className="size-3.5" />
                  {isAr ? "إرسال الرمز عبر واتساب" : "Send code via WhatsApp"}
                </Button>
              </div>

              {!whatsappLinkUrl && (
                <Notice
                  tone="info"
                  icon={<Lock className="size-4" />}
                  title={isAr ? "لا يوجد رقم هاتف مسجل" : "No phone number on record"}
                >
                  {isAr
                    ? "انسخ الرابط والرمز وأرسلهما بنفسك في رسالتين منفصلتين."
                    : "Copy the link and the code and send them yourself as two separate messages."}
                </Notice>
              )}
            </>
          )}

          {/* --- generation failure -------------------------------------- */}
          {errorMsg && (
            <Notice tone="danger" icon={<AlertCircle className="size-4" />} title={errorMsg} />
          )}
        </DialogBody>

        <DialogFooter>
          {loaded && !loaded.linked && !issued && (
            <Button
              type="button"
              disabled={isPending || (!loaded.hasDeliverableEmail && !loaded.memberPhone)}
              onClick={handleGenerate}
              className="gap-2"
            >
              {isPending ? <RefreshCw className="size-3.5 animate-spin" /> : <UserPlus className="size-3.5" />}
              {loaded.pendingInvitationExpiresAt
                ? isAr
                  ? "إصدار دعوة جديدة"
                  : "Issue a new invitation"
                : isAr
                  ? "إنشاء الدعوة والرمز"
                  : "Create invitation & code"}
            </Button>
          )}
          {issued && (
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {isAr ? "تم" : "Done"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
