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
import { toWhatsAppNumber } from "@/lib/whatsapp";

// TODO: `logReminderSentAction` from `@/lib/actions/member-crm` was
// referenced here but that module was never implemented -- confirmed via
// `git log --all` that no commit on any branch ever added
// `lib/actions/member-crm.ts`. This is member-CRM scope (activity-log
// auditing of reminders), out of scope for the current baseline cleanup.
// The dialog's core WhatsApp/email send flow is otherwise fully functional
// and unaffected; only the audit-log call below was removed pending that
// feature.

type ReminderTemplateId = "friendly" | "formal" | "final_notice" | "thank_you";

const REMINDER_TEMPLATES: {
  id: ReminderTemplateId;
  labelAr: string;
  labelEn: string;
  build: (isAr: boolean, memberName: string, balance: number, currency: string) => string;
}[] = [
  {
    id: "friendly",
    labelAr: "ودّي",
    labelEn: "Friendly",
    build: (isAr, memberName, balance, currency) => {
      if (balance <= 0) {
        return isAr
          ? `مرحبًا ${memberName}، نود تذكيرك بمراجعة حسابك معنا.`
          : `Hello ${memberName}, just a friendly note to review your account with us.`;
      }
      return isAr
        ? `مرحبًا ${memberName} 👋\nنود تذكيرك بوجود مستحقات بقيمة ${balance} ${currency}.\nبرجاء السداد في أقرب وقت ممكن، ولكم جزيل الشكر على تعاونكم دائمًا. 🌟`
        : `Hi ${memberName},\nJust a friendly reminder that you have an outstanding balance of ${balance} ${currency}. Please settle it at your earliest convenience — thank you for your continued cooperation!`;
    },
  },
  {
    id: "formal",
    labelAr: "رسمي",
    labelEn: "Formal",
    build: (isAr, memberName, balance, currency) => {
      if (balance <= 0) {
        return isAr
          ? `السادة/${memberName} المحترم،\nنفيدكم بأن حسابكم لدينا مسدد بالكامل حتى تاريخه. نشكر لكم التزامكم المستمر.`
          : `Dear ${memberName},\nThis is to confirm that your account with us is fully settled as of today. We thank you for your continued commitment.`;
      }
      return isAr
        ? `السادة/${memberName} المحترم،\nنحيطكم علمًا بوجود مبلغ مستحق بذمتكم قدره ${balance} ${currency}. برجاء التكرم بسداده خلال أقرب فرصة ممكنة.\nوتفضلوا بقبول فائق الاحترام والتقدير.`
        : `Dear ${memberName},\nPlease be informed that you have an outstanding balance of ${balance} ${currency}. Kindly arrange settlement at your earliest convenience.\nThank you for your cooperation.`;
    },
  },
  {
    id: "final_notice",
    labelAr: "تذكير أخير",
    labelEn: "Final notice",
    build: (isAr, memberName, balance, currency) =>
      isAr
        ? `السادة/${memberName} المحترم،\nهذا تذكير أخير بوجود مستحقات متأخرة بقيمة ${balance} ${currency} على حسابكم.\nبرجاء المبادرة بالسداد فورًا لتجنّب أي إجراءات إضافية. لأي استفسار يرجى التواصل معنا في أقرب وقت.`
        : `Dear ${memberName},\nThis is a final reminder that your account has an overdue balance of ${balance} ${currency}. Please settle it immediately to avoid further action.\nContact us if you have any questions.`,
  },
  {
    id: "thank_you",
    labelAr: "شكر ومتابعة",
    labelEn: "Thank-you check-in",
    build: (isAr, memberName) =>
      isAr
        ? `مرحبًا ${memberName}، شكرًا جزيلًا لالتزامكم المستمر بسداد مستحقاتكم في مواعيدها. 🙏\nنتمنى لكم دوام التوفيق، ونحن دائمًا في خدمتكم لأي استفسار.`
        : `Hello ${memberName}, thank you for consistently keeping your account up to date. 🙏\nWe appreciate your continued trust and are always here to help with any questions.`,
  },
];

function defaultMessage(isAr: boolean, memberName: string, balance: number, currency: string) {
  return REMINDER_TEMPLATES[0].build(isAr, memberName, balance, currency);
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
  const [templateId, setTemplateId] = useState<ReminderTemplateId>("friendly");
  const [message, setMessage] = useState(() => defaultMessage(isAr, memberName, balance, currency));

  function applyTemplate(id: ReminderTemplateId) {
    setTemplateId(id);
    const template = REMINDER_TEMPLATES.find((t) => t.id === id) ?? REMINDER_TEMPLATES[0];
    setMessage(template.build(isAr, memberName, balance, currency));
  }

  async function send() {
    if (channel === "whatsapp" && whatsappNumber) {
      window.open(`https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`, "_blank", "noopener");
      // TODO: was logged via logReminderSentAction, see top-of-file TODO.
    } else if (channel === "email" && email) {
      const subject = isAr ? `تذكير من ${memberName}` : `Reminder`;
      window.location.href = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`;
      // TODO: was logged via logReminderSentAction, see top-of-file TODO.
    }
    setOpen(false);
  }

  const canSend = (channel === "whatsapp" && whatsappNumber) || (channel === "email" && email);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setTemplateId("friendly");
          setMessage(defaultMessage(isAr, memberName, balance, currency));
        }
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
          <div className="space-y-1.5">
            <p className="text-xs font-bold text-muted-foreground">{isAr ? "قالب جاهز" : "Ready-made template"}</p>
            <div className="flex flex-wrap gap-1.5">
              {REMINDER_TEMPLATES.map((t) => (
                <Button
                  key={t.id}
                  type="button"
                  size="sm"
                  variant={templateId === t.id ? "default" : "outline"}
                  className="text-xs"
                  onClick={() => applyTemplate(t.id)}
                >
                  {isAr ? t.labelAr : t.labelEn}
                </Button>
              ))}
            </div>
          </div>
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
