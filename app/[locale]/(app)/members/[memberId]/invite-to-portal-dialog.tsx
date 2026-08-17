"use client";

import { useState, useTransition } from "react";
import { UserPlus, Mail, MessageCircle, AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { createMemberInvitationAction } from "@/lib/actions/member-portal";
import { buildWhatsAppUrl } from "@/lib/whatsapp";

function inviteMessage(isAr: boolean, memberName: string, link: string) {
  return isAr
    ? `مرحبًا ${memberName}، يمكنك الآن متابعة حسابك ودفع مستحقاتك أونلاين عبر بوابة الملاك:\n${link}`
    : `Hello ${memberName}, you can now review your account and pay your dues online through the owner portal:\n${link}`;
}

// The raw RPC error message comes back as "<CODE>: <db message>" (see
// supabase/migrations/20260814000004_member_invitation_rpcs.sql and
// .../20260901000003_member_invitation_phone_only.sql) -- match on the
// code prefix so staff see a specific, actionable reason instead of one
// generic message for every failure.
const ERROR_MESSAGES: Record<string, { ar: string; en: string }> = {
  MEMBER_CONTACT_REQUIRED: {
    ar: "يجب أن يكون للعضو بريد إلكتروني أو رقم هاتف مسجل قبل إنشاء دعوة.",
    en: "The member needs a registered email or phone number before an invite can be created.",
  },
  MEMBER_ALREADY_LINKED: {
    ar: "هذا العضو لديه حساب بوابة بالفعل.",
    en: "This member already has a portal account.",
  },
  FORBIDDEN_PORTAL_INVITE: {
    ar: "لا تملك صلاحية دعوة الأعضاء للبوابة.",
    en: "You don't have permission to invite members to the portal.",
  },
  MEMBER_NOT_FOUND: {
    ar: "العضو غير موجود.",
    en: "The member could not be found.",
  },
};

function mapError(message: string, isAr: boolean): string {
  const code = Object.keys(ERROR_MESSAGES).find((candidate) => message.startsWith(candidate));
  if (code) return ERROR_MESSAGES[code][isAr ? "ar" : "en"];
  return isAr ? "تعذر إنشاء رابط الدعوة، برجاء المحاولة مرة أخرى." : "Could not create the invite link, please try again.";
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
  const [link, setLink] = useState<{
    shortLink: string;
    memberEmail: string | null;
    memberPhone: string | null;
    isSyntheticEmail: boolean;
  } | null>(null);

  function handleGenerate() {
    setErrorMsg(null);
    startTransition(async () => {
      const res = await createMemberInvitationAction(memberId, locale);
      if (!res.ok) {
        setErrorMsg(mapError(res.error, isAr));
        return;
      }
      setLink({
        shortLink: res.shortLink,
        memberEmail: res.memberEmail,
        memberPhone: res.memberPhone,
        isSyntheticEmail: res.isSyntheticEmail,
      });
    });
  }

  const whatsappUrl = link?.memberPhone ? buildWhatsAppUrl(link.memberPhone, inviteMessage(isAr, memberName, link.shortLink)) : null;
  // A synthetic placeholder email (no real email on file) can't receive
  // anything -- only offer the mailto button for a real, deliverable address.
  const mailtoUrl = link && link.memberEmail && !link.isSyntheticEmail
    ? `mailto:${link.memberEmail}?subject=${encodeURIComponent(isAr ? "دعوة لبوابة الملاك" : "Owner Portal Invitation")}&body=${encodeURIComponent(inviteMessage(isAr, memberName, link.shortLink))}`
    : null;

  return (
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) { setLink(null); setErrorMsg(null); } }}>
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
            <DialogTitle>{isAr ? "دعوة إلى بوابة الملاك" : "Invite to owner portal"}</DialogTitle>
            <DialogDescription>{memberName}</DialogDescription>
          </div>
        </DialogHeader>
        <DialogBody className="space-y-4">
          {errorMsg && (
            <div className="rounded-2xl border border-destructive/40 bg-destructive/10 p-3 text-xs font-bold text-destructive flex items-center gap-2">
              <AlertCircle className="size-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}
          {!link && (
            <p className="text-sm text-muted-foreground">
              {isAr
                ? "سيتم إنشاء رابط دعوة صالح لمدة 72 ساعة. يمكنك بعدها اختيار إرساله عبر البريد أو واتساب. الأعضاء بدون بريد إلكتروني مسجل يمكنهم استلام الدعوة عبر واتساب فقط."
                : "A 72-hour invite link will be generated. You can then choose to send it by email or WhatsApp. Members with no registered email can still receive the invite via WhatsApp only."}
            </p>
          )}
          {link && link.isSyntheticEmail && (
            <p className="rounded-2xl border border-border bg-muted/40 p-3 text-xs font-medium text-muted-foreground">
              {isAr
                ? "لا يوجد بريد إلكتروني مسجل لهذا العضو — الرابط جاهز للإرسال عبر واتساب فقط."
                : "This member has no registered email — the link is ready to send via WhatsApp only."}
            </p>
          )}
          {link && (
            <div className="flex gap-2">
              <Button type="button" size="sm" variant="outline" disabled={!mailtoUrl} render={<a href={mailtoUrl ?? undefined} />}>
                <Mail className="size-3.5" />
                {isAr ? "فتح البريد وإرسال" : "Open email & send"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!whatsappUrl}
                onClick={() => whatsappUrl && window.open(whatsappUrl, "_blank", "noopener")}
              >
                <MessageCircle className="size-3.5" />
                {isAr ? "فتح واتساب وإرسال" : "Open WhatsApp & send"}
              </Button>
            </div>
          )}
          {link && !whatsappUrl && (
            <p className="text-xs text-muted-foreground">
              {isAr ? "لا يوجد رقم هاتف مسجل لهذا العضو — خيار واتساب غير متاح." : "No phone number on file — WhatsApp option unavailable."}
            </p>
          )}
        </DialogBody>
        <DialogFooter>
          {!link && (
            <Button type="button" disabled={isPending} onClick={handleGenerate} className="gap-2">
              {isPending ? <RefreshCw className="size-3.5 animate-spin" /> : <UserPlus className="size-3.5" />}
              {isAr ? "إنشاء رابط الدعوة" : "Generate invite link"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
