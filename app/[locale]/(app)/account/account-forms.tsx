"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { updateProfileAction, changePasswordAction } from "@/lib/actions/profile";
import type { ActionResult } from "@/lib/actions/platform";

export function ProfileForm({
  email,
  fullName,
  locale,
}: {
  email: string;
  fullName: string;
  locale: string;
}) {
  const isAr = locale === "ar";
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    updateProfileAction,
    { ok: true },
  );

  return (
    <form action={formAction} className="max-w-md space-y-4 rounded-lg border p-6">
      <div className="space-y-2">
        <Label htmlFor="email">{isAr ? "البريد الإلكتروني" : "Email"}</Label>
        <Input id="email" value={email} disabled />
      </div>
      <div className="space-y-2">
        <Label htmlFor="fullName">{isAr ? "الاسم الكامل" : "Full name"}</Label>
        <Input id="fullName" name="fullName" defaultValue={fullName} required maxLength={200} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="locale">{isAr ? "اللغة المفضّلة" : "Preferred language"}</Label>
        <Select
          name="locale"
          defaultValue={locale}
          items={[
            { value: "ar", label: "العربية" },
            { value: "en", label: "English" },
          ]}
        >
          <SelectTrigger id="locale" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ar">العربية</SelectItem>
            <SelectItem value="en">English</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {!state.ok && <p className="text-sm text-destructive">{state.error}</p>}
      <Button type="submit" disabled={pending}>
        {isAr ? "حفظ التغييرات" : "Save changes"}
      </Button>
    </form>
  );
}

export function PasswordForm({ locale }: { locale: string }) {
  const isAr = locale === "ar";
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    changePasswordAction,
    { ok: true },
  );

  return (
    <form action={formAction} className="max-w-md space-y-4 rounded-lg border p-6">
      <div className="space-y-2">
        <Label htmlFor="password">{isAr ? "كلمة المرور الجديدة" : "New password"}</Label>
        <Input id="password" name="password" type="password" required minLength={8} maxLength={72} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirmPassword">{isAr ? "تأكيد كلمة المرور" : "Confirm password"}</Label>
        <Input id="confirmPassword" name="confirmPassword" type="password" required minLength={8} maxLength={72} />
      </div>
      {!state.ok && (
        <p className="text-sm text-destructive">
          {state.error === "passwords_do_not_match"
            ? isAr
              ? "كلمتا المرور غير متطابقتين"
              : "Passwords do not match"
            : state.error}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {isAr ? "تحديث كلمة المرور" : "Update password"}
      </Button>
    </form>
  );
}
