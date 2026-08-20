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

export function DemoForm({ locale }: { locale: string }) {
  const isAr = locale === "ar";
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    submitDemoLeadAction,
    { ok: true },
  );

  return (
    <form action={formAction} className="marketing space-y-5 rounded-xl border border-[var(--mk-border)] bg-[var(--mk-bg-elevated)] p-6 sm:p-8">
      {/* Honeypot -- hidden from real users via CSS, bots tend to fill every field. */}
      <div className="absolute h-px w-px overflow-hidden opacity-0" aria-hidden="true">
        <label htmlFor="website">Website</label>
        <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
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
          <Label htmlFor="organizationName" className="text-[var(--mk-text)]">
            {isAr ? "اسم المنظمة/المنتجع" : "Organization / Resort"}
          </Label>
          <Input id="organizationName" name="organizationName" maxLength={200} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="roleTitle" className="text-[var(--mk-text)]">
            {isAr ? "المسمى الوظيفي" : "Role"}
          </Label>
          <Input id="roleTitle" name="roleTitle" maxLength={120} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="unitsCount" className="text-[var(--mk-text)]">
            {isAr ? "عدد الوحدات" : "Number of units"}
          </Label>
          <Input id="unitsCount" name="unitsCount" type="number" min={0} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="phone" className="text-[var(--mk-text)]">
            {isAr ? "الهاتف" : "Phone"}
          </Label>
          <Input id="phone" name="phone" maxLength={40} />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="preferredContactMethod" className="text-[var(--mk-text)]">
            {isAr ? "طريقة التواصل المفضّلة" : "Preferred contact method"}
          </Label>
          <Select
            name="preferredContactMethod"
            defaultValue="email"
            items={[
              { value: "email", label: isAr ? "البريد الإلكتروني" : "Email" },
              { value: "phone", label: isAr ? "الهاتف" : "Phone" },
            ]}
          >
            <SelectTrigger id="preferredContactMethod" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="email">{isAr ? "البريد الإلكتروني" : "Email"}</SelectItem>
              <SelectItem value="phone">{isAr ? "الهاتف" : "Phone"}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="message" className="text-[var(--mk-text)]">
          {isAr ? "رسالة (اختياري)" : "Message (optional)"}
        </Label>
        <Textarea id="message" name="message" maxLength={2000} rows={4} />
      </div>

      {!state.ok && state.error !== "invalid_input" && (
        <p role="alert" className="text-sm text-red-400">
          {state.error === "rate_limited"
            ? isAr
              ? "تم إرسال طلب من هذا البريد مؤخرًا. حاول لاحقًا."
              : "A request from this email was already submitted recently. Please try again later."
            : isAr
              ? "حدث خطأ، حاول مرة أخرى."
              : "Something went wrong. Please try again."}
        </p>
      )}
      {!state.ok && state.error === "invalid_input" && (
        <p role="alert" className="text-sm text-red-400">
          {isAr ? "تأكد من صحة البيانات المدخلة." : "Please check the fields and try again."}
        </p>
      )}
      {state.ok && (
        <p role="status" className="text-sm text-[var(--mk-cyan)]">
          {isAr ? "تم استلام طلبك، وسنتواصل معك قريبًا." : "Request received, we'll be in touch soon."}
        </p>
      )}

      <Button
        type="submit"
        disabled={pending}
        className="w-full bg-[var(--mk-accent)] text-white hover:opacity-90"
      >
        {pending ? (isAr ? "جارٍ الإرسال..." : "Submitting...") : isAr ? "طلب عرض توضيحي" : "Request a Demo"}
      </Button>
      <p className="text-center text-xs text-[var(--mk-text-muted)]">
        {isAr
          ? "لن نستخدم بياناتك إلا للتواصل بشأن طلبك."
          : "We'll only use your details to follow up on this request."}
      </p>
    </form>
  );
}
