"use client";

import { useState } from "react";
import { MessageCircle, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
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
import { logReminderSentAction } from "@/lib/actions/member-crm";
import { toWhatsAppNumber } from "@/lib/whatsapp";

function defaultMessage(isAr: boolean, memberName: string, balance: number, currency: string) {
  if (balance <= 0) {
    return isAr
      ? `مرحبًا ${memberName}، نود تذكيرك بمراجعة حسابك معنا.`
      : `Hello ${memberName}, just a friendly note to review your account with us.`;
  }
  return isAr
    ? `مرحبًا ${memberName}، نود تذكيرك بوجود مستحقات بقيمة ${balance} ${currency}. برجاء السداد في أقرب وقت ممكن، ولك جزيل الشكر.`
    : `Hello ${memberName}, this is a reminder of an outstanding balance of ${balance} ${currency}. Please settle it at your earliest convenience, thank you.`;
}

export function SendReminderDialog({
  memberId,
  organizationId,
  memberName,
  phone,
  email,
  balance,
  currency,
  locale,
  trigger,
}: {
  memberId: string;
  organizationId: string;
  memberName: string;
  phone: string | null;
  email: string | null;
  balance: number;
  currency: string;
  locale: string;
  trigger: React.ReactElement;
}) {
  const isAr = locale === "ar";
  const whatsappNumber = phone ? toWhatsAppNumber(phone) : null;
  const [open, setOpen] = useState(false);
  const [channel, setChannel] = useState<"whatsapp" | "email">(whatsappNumber ? "whatsapp" : "email");
  const [message, setMessage] = useState(() => defaultMessage(isAr, memberName, balance, currency));

  async function send() {
    if (channel === "whatsapp" && whatsappNumber) {
      window.open(`https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`, "_blank", "noopener");
      await logReminderSentAction({ memberId, organizationId, channel: "whatsapp_reminder", body: message });
    } else if (channel === "email" && email) {
      const subject = isAr ? `تذكير من ${memberName}` : `Reminder`;
      window.location.href = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`;
      await logReminderSentAction({ memberId, organizationId, channel: "email_reminder", body: message });
    }
    setOpen(false);
  }

  const canSend = (channel === "whatsapp" && whatsappNumber) || (channel === "email" && email);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setMessage(defaultMessage(isAr, memberName, balance, currency));
      }}
    >
      <DialogTrigger render={trigger} />
      <DialogContent>
        <DialogHeader>
          <div>
            <DialogTitle>{isAr ? "إرسال تذكير" : "Send reminder"}</DialogTitle>
            <DialogDescription>{memberName}</DialogDescription>
          </div>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant={channel === "whatsapp" ? "default" : "outline"}
              disabled={!whatsappNumber}
              onClick={() => setChannel("whatsapp")}
            >
              <MessageCircle className="size-3.5" />
              {isAr ? "واتساب" : "WhatsApp"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant={channel === "email" ? "default" : "outline"}
              disabled={!email}
              onClick={() => setChannel("email")}
            >
              <Mail className="size-3.5" />
              {isAr ? "بريد إلكتروني" : "Email"}
            </Button>
          </div>
          {!whatsappNumber && !email && (
            <p className="text-sm text-destructive">
              {isAr ? "لا يوجد رقم هاتف أو بريد إلكتروني مسجل لهذا العضو." : "This member has no phone or email on file."}
            </p>
          )}
          <Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={5} maxLength={1000} />
        </DialogBody>
        <DialogFooter>
          <Button type="button" disabled={!canSend} onClick={send}>
            {isAr ? "فتح وإرسال" : "Open & send"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
