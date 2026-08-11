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
import { createSupplierAction } from "@/lib/actions/purchasing";
import type { ActionResult } from "@/lib/actions/platform";

type Option = { id: string; label: string };

export function CreateSupplierForm({
  organizationId,
  payableAccounts,
  locale,
}: {
  organizationId: string;
  payableAccounts: Option[];
  locale: string;
}) {
  const isAr = locale === "ar";
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    createSupplierAction,
    { ok: true },
  );

  return (
    <form action={formAction} className="grid gap-4 rounded-lg border border-dashed p-4 sm:grid-cols-4">
      <input type="hidden" name="organizationId" value={organizationId} />
      <div className="space-y-2">
        <Label>{isAr ? "اسم المورد" : "Supplier name"}</Label>
        <Input name="name" required />
      </div>
      <div className="space-y-2">
        <Label>{isAr ? "البريد" : "Email"}</Label>
        <Input name="contactEmail" type="email" />
      </div>
      <div className="space-y-2">
        <Label>{isAr ? "الهاتف" : "Phone"}</Label>
        <Input name="contactPhone" />
      </div>
      <div className="space-y-2">
        <Label>{isAr ? "حساب الدائنين" : "Payable account"}</Label>
        <Select name="payableAccountId">
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {payableAccounts.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {!state.ok && <p className="text-sm text-destructive sm:col-span-4">{state.error}</p>}
      <div className="sm:col-span-4">
        <Button type="submit" variant="outline" disabled={pending}>
          {isAr ? "إضافة مورد" : "Add supplier"}
        </Button>
      </div>
    </form>
  );
}
