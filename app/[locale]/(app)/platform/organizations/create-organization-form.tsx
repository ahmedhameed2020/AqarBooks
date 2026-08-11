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
import { createOrganization, type ActionResult } from "@/lib/actions/platform";

export function CreateOrganizationForm({ locale }: { locale: string }) {
  const isAr = locale === "ar";
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    createOrganization,
    { ok: true },
  );

  return (
    <form action={formAction} className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2">
      <div className="space-y-2">
        <Label htmlFor="name">{isAr ? "اسم المنظمة" : "Organization name"}</Label>
        <Input id="name" name="name" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="slug">{isAr ? "المعرّف (slug)" : "Slug"}</Label>
        <Input id="slug" name="slug" placeholder={isAr ? "اختياري" : "optional"} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="defaultCurrency">{isAr ? "العملة" : "Currency"}</Label>
        <Input id="defaultCurrency" name="defaultCurrency" defaultValue="EGP" maxLength={3} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="planKey">{isAr ? "الباقة" : "Plan"}</Label>
        <Select name="planKey" defaultValue="STARTER">
          <SelectTrigger id="planKey" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="STARTER">Starter</SelectItem>
            <SelectItem value="PROFESSIONAL">Professional</SelectItem>
            <SelectItem value="ENTERPRISE">Enterprise</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {!state.ok && (
        <p role="alert" className="text-sm text-destructive sm:col-span-2">
          {isAr ? "حدث خطأ: " : "Error: "}
          {state.error}
        </p>
      )}
      <div className="sm:col-span-2">
        <Button type="submit" disabled={pending}>
          {pending ? (isAr ? "جارٍ الإنشاء..." : "Creating...") : isAr ? "إنشاء منظمة" : "Create organization"}
        </Button>
      </div>
    </form>
  );
}
