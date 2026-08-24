"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { submitContactRequestAction } from "@/lib/actions/leads";
import type { ActionResult } from "@/lib/actions/platform";
import { CheckCircle2, Send } from "lucide-react";

export function ContactForm({ locale }: { locale: string }) {
  const isAr = locale === "ar";
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    submitContactRequestAction,
    { ok: true },
  );

  return (
    <form action={formAction} className="space-y-4.5">
      <div className="absolute h-px w-px overflow-hidden opacity-0" aria-hidden="true">
        <label htmlFor="website">Website</label>
        <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <div className="space-y-2">
        <Label htmlFor="fullName" className="text-xs font-bold text-slate-800">
          {isAr ? "الاسم الكريم" : "Your Name"} *
        </Label>
        <Input id="fullName" name="fullName" required maxLength={200} className="bg-white border-slate-300 rounded-xl" placeholder={isAr ? "أحمد محمد" : "Ahmed Mohamed"} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="email" className="text-xs font-bold text-slate-800">
          {isAr ? "البريد الإلكتروني" : "Email Address"} *
        </Label>
        <Input id="email" name="email" type="email" required maxLength={200} className="bg-white border-slate-300 rounded-xl" placeholder="name@company.com" />
      </div>

      <div className="space-y-2">
        <Label htmlFor="phone" className="text-xs font-bold text-slate-800">
          {isAr ? "رقم الهاتف / واتساب (اختياري)" : "Phone / WhatsApp (Optional)"}
        </Label>
        <Input id="phone" name="phone" maxLength={40} className="bg-white border-slate-300 rounded-xl font-mono" placeholder="+20 100 000 0000" />
      </div>

      <div className="space-y-2">
        <Label htmlFor="message" className="text-xs font-bold text-slate-800">
          {isAr ? "نص الرسالة أو الاستفسار" : "Message or Inquiry"} *
        </Label>
        <Textarea id="message" name="message" required maxLength={2000} rows={4} className="bg-white border-slate-300 rounded-xl" placeholder={isAr ? "اكتب تفاصيل استفسارك هنا..." : "Write the details of your inquiry here..."} />
      </div>

      {!state.ok && (
        <p role="alert" className="text-xs font-bold text-red-600 bg-red-50 p-3 rounded-xl border border-red-200">
          {state.error === "rate_limited"
            ? isAr
              ? "تم إرسال رسالة من هذا البريد مؤخرًا. حاول لاحقًا."
              : "A message from this email was already sent recently. Please try again later."
            : isAr
              ? "تأكد من صحة البيانات وحاول مرة أخرى."
              : "Please check the fields and try again."}
        </p>
      )}

      {state.ok && "leadId" in state && (
        <div role="status" className="rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-xs font-bold text-emerald-900 flex items-center gap-2">
          <CheckCircle2 className="size-4 text-emerald-600 shrink-0" />
          <span>
            {isAr
              ? "تم إرسال رسالتك بنجاح! سيتواصل معك فريقنا في أقرب وقت."
              : "Your message has been sent successfully! Our team will get back to you shortly."}
          </span>
        </div>
      )}

      <Button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl bg-[#07425d] py-3 text-sm font-bold text-white hover:bg-[#053247] transition-all shadow-md shadow-[#07425d]/20"
      >
        {pending ? (isAr ? "جاري الإرسال..." : "Sending...") : (
          <span className="flex items-center justify-center gap-2">
            <span>{isAr ? "إرسال الرسالة" : "Send Message"}</span>
            <Send className="size-4" />
          </span>
        )}
      </Button>
    </form>
  );
}
