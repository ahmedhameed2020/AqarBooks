"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  updateOrganizationProfile,
} from "@/lib/actions/tenant";
import type { ActionResult } from "@/lib/actions/platform";

export function ProfileForm({
  organizationId,
  name,
  defaultCurrency,
  locale,
  readOnly,
}: {
  organizationId: string;
  name: string;
  defaultCurrency: string;
  locale: string;
  readOnly: boolean;
}) {
  const isAr = locale === "ar";
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    updateOrganizationProfile,
    { ok: true },
  );

  return (
    <form action={formAction} className="grid max-w-md gap-4">
      <input type="hidden" name="organizationId" value={organizationId} />
      <div className="space-y-2">
        <Label htmlFor="name">{isAr ? "اسم المنظمة" : "Organization name"}</Label>
        <Input id="name" name="name" defaultValue={name} disabled={readOnly} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="defaultCurrency">{isAr ? "العملة الافتراضية" : "Default currency"}</Label>
        <Input
          id="defaultCurrency"
          name="defaultCurrency"
          defaultValue={defaultCurrency}
          disabled={readOnly}
          maxLength={3}
          required
        />
      </div>
      {!state.ok && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      {!readOnly && (
        <Button type="submit" disabled={pending} className="w-fit">
          {isAr ? "حفظ" : "Save"}
        </Button>
      )}
    </form>
  );
}
