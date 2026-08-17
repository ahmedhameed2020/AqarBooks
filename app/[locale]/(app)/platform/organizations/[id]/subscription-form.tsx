"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { assignSubscription, type ActionResult } from "@/lib/actions/platform";

export function SubscriptionForm({
  organizationId,
  currentPlanKey,
  locale,
}: {
  organizationId: string;
  currentPlanKey?: string;
  locale: string;
}) {
  const isAr = locale === "ar";
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    assignSubscription,
    { ok: true },
  );

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3 rounded-lg border p-4">
      <input type="hidden" name="organizationId" value={organizationId} />
      <div className="space-y-2">
        <Select
          name="planKey"
          defaultValue={currentPlanKey ?? "STARTER"}
          items={[
            { value: "STARTER", label: "Starter" },
            { value: "PROFESSIONAL", label: "Professional" },
            { value: "ENTERPRISE", label: "Enterprise" },
          ]}
        >
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="STARTER">Starter</SelectItem>
            <SelectItem value="PROFESSIONAL">Professional</SelectItem>
            <SelectItem value="ENTERPRISE">Enterprise</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Button type="submit" disabled={pending}>
        {isAr ? "تحديث الباقة" : "Update plan"}
      </Button>
      {!state.ok && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
    </form>
  );
}
