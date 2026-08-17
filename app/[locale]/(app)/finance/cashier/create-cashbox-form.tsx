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
import { createCashboxAction } from "@/lib/actions/treasury";
import type { ActionResult } from "@/lib/actions/platform";

export function CreateCashboxForm({
  organizationId,
  resortId,
  assetAccounts,
  locale,
}: {
  organizationId: string;
  resortId: string;
  assetAccounts: { id: string; label: string }[];
  locale: string;
}) {
  const isAr = locale === "ar";
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    createCashboxAction,
    { ok: true },
  );

  return (
    <form action={formAction} className="grid gap-4 rounded-lg border border-dashed p-4 sm:grid-cols-3">
      <input type="hidden" name="organizationId" value={organizationId} />
      <input type="hidden" name="resortId" value={resortId} />
      <div className="space-y-2">
        <Label htmlFor="name">{isAr ? "اسم الصندوق" : "Cashbox name"}</Label>
        <Input id="name" name="name" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="glAccountId">{isAr ? "حساب الأستاذ" : "GL account"}</Label>
        <Select name="glAccountId" items={assetAccounts.map((a) => ({ value: a.id, label: a.label }))}>
          <SelectTrigger id="glAccountId" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {assetAccounts.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {!state.ok && <p className="text-sm text-destructive sm:col-span-3">{state.error}</p>}
      <div className="sm:col-span-3">
        <Button type="submit" variant="outline" disabled={pending}>
          {isAr ? "إضافة صندوق" : "Add cashbox"}
        </Button>
      </div>
    </form>
  );
}
