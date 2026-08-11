"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createResortAction } from "@/lib/actions/tenant";
import type { ActionResult } from "@/lib/actions/platform";

export function CreateResortForm({
  organizationId,
  locale,
}: {
  organizationId: string;
  locale: string;
}) {
  const isAr = locale === "ar";
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    createResortAction,
    { ok: true },
  );

  return (
    <form action={formAction} className="grid gap-4 rounded-lg border p-4 sm:grid-cols-3">
      <input type="hidden" name="organizationId" value={organizationId} />
      <div className="space-y-2">
        <Label htmlFor="name">{isAr ? "اسم المنتجع" : "Resort name"}</Label>
        <Input id="name" name="name" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="code">{isAr ? "الرمز" : "Code"}</Label>
        <Input id="code" name="code" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="timezone">{isAr ? "المنطقة الزمنية" : "Timezone"}</Label>
        <Input id="timezone" name="timezone" defaultValue="Africa/Cairo" />
      </div>
      {!state.ok && (
        <p role="alert" className="text-sm text-destructive sm:col-span-3">
          {state.error}
        </p>
      )}
      <div className="sm:col-span-3">
        <Button type="submit" disabled={pending}>
          {isAr ? "إضافة منتجع" : "Add resort"}
        </Button>
      </div>
    </form>
  );
}
