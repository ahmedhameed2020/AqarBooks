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
import type { ENTITY_TYPES, UNIT_RANGES } from "@/lib/actions/leads-schema";
import type { ActionResult } from "@/lib/actions/platform";
import { CheckCircle2, ArrowUpRight } from "lucide-react";

/* Commercial qualification. The values are stable slugs shared with
   `submitDemoLeadAction`; only the labels are localised. Unit counts are
   collected as ranges rather than an exact figure -- it is the band that
   drives the commercial conversation, and a range is far likelier to be
   answered honestly than a precise number a prospect has to look up. */

// Typed against the server allow-lists: if a slug here ever drifts from
// `leads-schema.ts`, this stops compiling rather than silently posting a value
// the action will reject.
const ENTITY_TYPE_OPTIONS: readonly {
  value: (typeof ENTITY_TYPES)[number];
  ar: string;
  en: string;
}[] = [
  { value: "resort", ar: "قرية / منتجع", en: "Resort / Village" },
  { value: "tower", ar: "برج سكني", en: "Residential Tower" },
  { value: "compound", ar: "مجمع سكني", en: "Residential Compound" },
  { value: "hoa", ar: "اتحاد ملاك", en: "Owners Association" },
  { value: "property_management", ar: "شركة إدارة عقارية", en: "Property Management Company" },
  { value: "development", ar: "مشروع عقاري", en: "Real Estate Development" },
  { value: "other", ar: "أخرى", en: "Other" },
] as const;

const UNIT_RANGE_OPTIONS: readonly {
  value: (typeof UNIT_RANGES)[number];
  ar: string;
  en: string;
}[] = [
  { value: "lt_100", ar: "أقل من 100", en: "Under 100" },
  { value: "100_300", ar: "100–300", en: "100–300" },
  { value: "301_500", ar: "301–500", en: "301–500" },
  { value: "501_1500", ar: "501–1,500", en: "501–1,500" },
  { value: "gt_1500", ar: "أكثر من 1,500", en: "More than 1,500" },
] as const;

export function DemoForm({ locale }: { locale: string }) {
  const isAr = locale === "ar";
  const [state, formAction, pending] = useActionState<
    ActionResult<{ submitted: true }>,
    FormData
  >(submitDemoLeadAction, { ok: true });

  const entityTypeItems = ENTITY_TYPE_OPTIONS.map((o) => ({
    value: o.value,
    label: isAr ? o.ar : o.en,
  }));
  const unitRangeItems = UNIT_RANGE_OPTIONS.map((o) => ({
    value: o.value,
    label: isAr ? o.ar : o.en,
  }));

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
          <Label htmlFor="phone" className="text-xs font-bold text-slate-800">
            {isAr ? "رقم الهاتف / واتساب" : "Phone / WhatsApp"} *
          </Label>
          {/* Phone numbers are an LTR sequence; without `dir` the RTL paragraph
              direction reorders the placeholder into "0000 000 100 20+". */}
          <Input id="phone" name="phone" required dir="ltr" maxLength={40} className="bg-white border-slate-300 rounded-xl font-mono text-start" placeholder="+20 100 000 0000" />
        </div>

        <div className="space-y-2">
          <Label htmlFor="entityType" className="text-xs font-bold text-slate-800">
            {isAr ? "نوع الكيان العقاري" : "Type of Real Estate Entity"} *
          </Label>
          <Select name="entityType" required items={entityTypeItems}>
            <SelectTrigger id="entityType" className="w-full bg-white border-slate-300 rounded-xl">
              <SelectValue placeholder={isAr ? "اختر نوع الكيان" : "Select entity type"} />
            </SelectTrigger>
            <SelectContent>
              {entityTypeItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="unitRange" className="text-xs font-bold text-slate-800">
            {isAr ? "عدد الوحدات" : "Number of Units"} *
          </Label>
          <Select name="unitRange" required items={unitRangeItems}>
            <SelectTrigger id="unitRange" className="w-full bg-white border-slate-300 rounded-xl">
              <SelectValue placeholder={isAr ? "اختر نطاق عدد الوحدات" : "Select a unit range"} />
            </SelectTrigger>
            <SelectContent>
              {unitRangeItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="roleTitle" className="text-xs font-bold text-slate-800">
            {isAr ? "المسمى الوظيفي" : "Job Title / Role"}
          </Label>
          <Input id="roleTitle" name="roleTitle" maxLength={120} className="bg-white border-slate-300 rounded-xl" placeholder={isAr ? "مدير مالي / محاسب عام / رئيس مجلس إدارة" : "CFO / Chief Accountant / HOA Board"} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="preferredContactMethod" className="text-xs font-bold text-slate-800">
            {isAr ? "طريقة التواصل المفضّلة" : "Preferred Contact Channel"}
          </Label>
          {/* Only `phone` and `email` are offered: `demo_leads` constrains this
              column to those two values, so a third option would be rejected at
              insert time. WhatsApp is folded into the phone option's label. */}
          <Select
            name="preferredContactMethod"
            defaultValue="phone"
            items={[
              { value: "phone", label: isAr ? "اتصال هاتفي أو واتساب" : "Phone call or WhatsApp" },
              { value: "email", label: isAr ? "البريد الإلكتروني" : "Email" },
            ]}
          >
            <SelectTrigger id="preferredContactMethod" className="w-full bg-white border-slate-300 rounded-xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="phone">
                {isAr ? "اتصال هاتفي أو واتساب" : "Phone call or WhatsApp"}
              </SelectItem>
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

      {!state.ok && (
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

      {state.ok && state.data?.submitted && (
        <div role="status" className="rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-xs font-bold text-emerald-900 flex items-center gap-2">
          <CheckCircle2 className="size-4 text-emerald-600 shrink-0" />
          <span>
            {isAr
              ? "تم استلام طلبك. سنتواصل معك للتعرف على طبيعة الكيان وترتيب عرض مناسب لـ AqarBooks."
              : "Request received. We will get in touch to understand your entity and arrange a suitable AqarBooks walkthrough."}
          </span>
        </div>
      )}

      <Button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl bg-[#07425d] py-3 text-sm font-bold text-white hover:bg-[#053247] transition-all shadow-md shadow-[#07425d]/20"
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
