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
import { inviteMemberAction } from "@/lib/actions/tenant";
import type { ActionResult } from "@/lib/actions/platform";

export function InviteMemberForm({
  organizationId,
  roles,
  locale,
}: {
  organizationId: string;
  roles: { key: string; name_ar: string; name_en: string }[];
  locale: string;
}) {
  const isAr = locale === "ar";
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    inviteMemberAction,
    { ok: true },
  );

  return (
    <form action={formAction} className="grid gap-4 rounded-lg border p-4 sm:grid-cols-3">
      <input type="hidden" name="organizationId" value={organizationId} />
      <div className="space-y-2">
        <Label htmlFor="email">{isAr ? "البريد الإلكتروني" : "Email"}</Label>
        <Input id="email" name="email" type="email" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="roleKey">{isAr ? "الدور" : "Role"}</Label>
        <Select
          name="roleKey"
          defaultValue={roles[0]?.key}
          items={roles.map((role) => ({ value: role.key, label: isAr ? role.name_ar : role.name_en }))}
        >
          <SelectTrigger id="roleKey" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {roles.map((role) => (
              <SelectItem key={role.key} value={role.key}>
                {isAr ? role.name_ar : role.name_en}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {!state.ok && (
        <p role="alert" className="text-sm text-destructive sm:col-span-3">
          {state.error}
        </p>
      )}
      <div className="sm:col-span-3">
        <Button type="submit" disabled={pending}>
          {pending ? (isAr ? "جارٍ الدعوة..." : "Inviting...") : isAr ? "دعوة مستخدم" : "Invite user"}
        </Button>
      </div>
    </form>
  );
}
