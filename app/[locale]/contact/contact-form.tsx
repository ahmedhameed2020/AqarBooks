"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { submitContactRequestAction } from "@/lib/actions/leads";
import type { ActionResult } from "@/lib/actions/platform";

export function ContactForm({ locale }: { locale: string }) {
  const isAr = locale === "ar";
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    submitContactRequestAction,
    { ok: true },
  );

  return (
    <form action={formAction} className="marketing space-y-5 rounded-xl border border-[var(--mk-border)] bg-[var(--mk-bg-elevated)] p-6 sm:p-8">
      <div className="absolute h-px w-px overflow-hidden opacity-0" aria-hidden="true">
        <label htmlFor="website">Website</label>
        <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <div className="space-y-2">
        <Label htmlFor="fullName" className="text-[var(--mk-text)]">
          {isAr ? "الاسم" : "Name"}
        </Label>
        <Input id="fullName" name="fullName" required maxLength={200} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="email" className="text-[var(--mk-text)]">
          {isAr ? "البريد الإلكتروني" : "Email"}
        </Label>
        <Input id="email" name="email" type="email" required maxLength={200} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="phone" className="text-[var(--mk-text)]">
          {isAr ? "الهاتف (اختياري)" : "Phone (optional)"}
        </Label>
        <Input id="phone" name="phone" maxLength={40} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="message" className="text-[var(--mk-text)]">
          {isAr ? "الرسالة" : "Message"}
        </Label>
        <Textarea id="message" name="message" required maxLength={2000} rows={5} />
      </div>

      {!state.ok && (
        <p role="alert" className="text-sm text-red-400">
          {state.error === "rate_limited"
            ? isAr
              ? "تم إرسال رسالة من هذا البريد مؤخرًا. حاول لاحقًا."
              : "A message from this email was already sent recently. Please try again later."
            : isAr
              ? "تأكد من صحة البيانات وحاول مرة أخرى."
              : "Please check the fields and try again."}
        </p>
      )}
      {state.ok && (
        <p role="status" className="text-sm text-[var(--mk-cyan)]">
          {isAr ? "تم إرسال رسالتك، وسنرد عليك قريبًا." : "Message sent, we'll reply soon."}
        </p>
      )}

      <Button
        type="submit"
        disabled={pending}
        className="w-full bg-[var(--mk-accent)] text-white hover:opacity-90"
      >
        {pending ? (isAr ? "جارٍ الإرسال..." : "Sending...") : isAr ? "إرسال" : "Send Message"}
      </Button>
    </form>
  );
}
