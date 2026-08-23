"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { submitDemoLeadAction } from "@/lib/actions/leads";
import type { ActionResult } from "@/lib/actions/platform";
import { CheckCircle2, ArrowUpRight } from "lucide-react";

export function DemoForm({ locale }: { locale: string }) {
  const isAr = locale === "ar";
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    submitDemoLeadAction,
    { ok: true },
  );

  return (
    <form action={formAction} className="space-y-5">
      {/* Honeypot */}
      <div className="absolute h-px w-px overflow-hidden opacity-0" aria-hidden="true">
        <label htmlFor="website">Website</label>
        <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="fullName" className="text-xs font-bold text-slate-800">
            {isAr ? "الاسم الكريم" : "Full Name"} *
          </Label>
          <Input id="fullName" name="fullName" required maxLength={200} className="bg-white border-slate-300 rounded-xl" placeholder={isAr ? "أحمد محمد" : "Ahmed Mohamed"} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="email" className="text-xs font-bold text-slate-800">
            {isAr ? "البريد الإلكتروني للعمل" : "Business Email"} *
          </Label>
          <Input id="email" name="email" type="email" required maxLength={200} className="bg-white border-slate-300 rounded-xl" placeholder="name@company.com" />
        </div>

        <div className="space-y-2">
          <Label htmlFor="organizationName" className="text-xs font-bold text-slate-800">
            {isAr ? "اسم الكيان / الشركة العقارية" : "Real Estate Entity / Company"} *
          </Label>
          <Input id="organizationName" name="organizationName" required maxLength={200} className="bg-white border-slate-300 rounded-xl" placeholder={isAr ? "شركة التطوير أو اسم المشروع" : "Development Co / Compound Name"} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="roleTitle" className="text-xs font-bold text-slate-800">
            {isAr ? "المسمى الوظيفي" : "Job Title / Role"}
          </Label>
          <Input id="roleTitle" name="roleTitle" maxLength={120} className="bg-white border-slate-300 rounded-xl" placeholder={isAr ? "مدير مالي / محاسب عام / رئيس مجلس إدارة" : "CFO / Chief Accountant / HOA Board"} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="unitsCount" className="text-xs font-bold text-slate-800">
            {isAr ? "عدد الوحدات التقديري" : "Estimated Units Count"}
          </Label>
          <Input id="unitsCount" name="unitsCount" type="number" min={0} className="bg-white border-slate-300 rounded-xl font-mono" placeholder="50 - 500" />
        </div>

        <div className="space-y-2">
          <Label htmlFor="phone" className="text-xs font-bold text-slate-800">
            {isAr ? "رقم الهاتف / واتساب" : "Phone / WhatsApp"} *
          </Label>
          <Input id="phone" name="phone" required maxLength={40} className="bg-white border-slate-300 rounded-xl font-mono" placeholder="+20 100 000 0000" />
        </div>

        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="preferredContactMethod" className="text-xs font-bold text-slate-800">
            {isAr ? "طريقة التواصل المفضّلة" : "Preferred Contact Channel"}
          </Label>
          <Select
            name="preferredContactMethod"
            defaultValue="phone"
            items={[
              { value: "phone", label: isAr ? "اتصال هاتفي مباشر" : "Direct Phone Call" },
              { value: "whatsapp", label: isAr ? "محادثة واتساب سريعة" : "WhatsApp Chat" },
              { value: "email", label: isAr ? "البريد الإلكتروني" : "Email" },
            ]}
          >
            <SelectTrigger id="preferredContactMethod" className="w-full bg-white border-slate-300 rounded-xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="phone">{isAr ? "اتصال هاتفي مباشر" : "Direct Phone Call"}</SelectItem>
              <SelectItem value="whatsapp">{isAr ? "محادثة واتساب سريعة" : "WhatsApp Chat"}</SelectItem>
              <SelectItem value="email">{isAr ? "البريد الإلكتروني" : "Email"}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="message" className="text-xs font-bold text-slate-800">
          {isAr ? "ملاحظات أو متطلبات خاصة (اختياري)" : "Specific Accounting Requirements (Optional)"}
        </Label>
        <Textarea id="message" name="message" maxLength={2000} rows={3} className="bg-white border-slate-300 rounded-xl" placeholder={isAr ? "مثال: نحتاج فصل حسابات 3 مراحل ومطابقة ضريبة القيمة المضافة..." : "e.g., We need multi-phase cost center tracking and VAT compliance..."} />
      </div>

      {!state.ok && state.error !== "invalid_input" && (
        <p role="alert" className="text-xs font-bold text-red-600 bg-red-50 p-3 rounded-xl border border-red-200">
          {state.error === "rate_limited"
            ? isAr
              ? "تم إرسال طلب مؤخراً من هذا الجهاز. يرجى الانتظار قليلاً."
              : "A demo request was recently submitted. Please wait a moment."
            : isAr
              ? "تأكد من صحة البيانات المدخلة وحاول مرة أخرى."
              : "Please verify all fields and try again."}
        </p>
      )}

      {state.ok && "leadId" in state && (
        <div role="status" className="rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-xs font-bold text-emerald-900 flex items-center gap-2">
          <CheckCircle2 className="size-4 text-emerald-600 shrink-0" />
          <span>
            {isAr
              ? "تم استلام طلبك بنجاح! سيتواصل معك أحد مستشارينا الماليين خلال ساعات العمل لتنسيق العرض التوضيحي."
              : "Request received! Our financial specialist will contact you shortly to schedule your demo."}
          </span>
        </div>
      )}

      <Button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl bg-[#1A3C2E] py-3 text-sm font-bold text-white hover:bg-[#132d22] transition-all shadow-md shadow-[#1A3C2E]/20"
      >
        {pending ? (isAr ? "جاري الإرسال..." : "Sending Request...") : (
          <span className="flex items-center justify-center gap-2">
            <span>{isAr ? "تأكيد طلب العرض التوضيحي" : "Confirm Demo Request"}</span>
            <ArrowUpRight className="size-4" />
          </span>
        )}
      </Button>
    </form>
  );
}
