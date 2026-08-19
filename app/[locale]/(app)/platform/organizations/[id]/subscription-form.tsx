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
import { Sparkles, Check, RefreshCw } from "lucide-react";

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
    <form action={formAction} className="flex flex-wrap items-center gap-3 rounded-2xl border bg-card p-5 shadow-xs">
      <input type="hidden" name="organizationId" value={organizationId} />
      
      <div className="space-y-1 text-start">
        <label className="text-xs font-bold text-foreground block">
          {isAr ? "اختيار باقة الاشتراك:" : "Select Plan Tier:"}
        </label>
        <Select
          name="planKey"
          defaultValue={currentPlanKey ?? "STARTER"}
          items={[
            { value: "STARTER", label: isAr ? "الأساسية (100 وحدة)" : "Starter (100 units)" },
            { value: "PROFESSIONAL", label: isAr ? "الاحترافية (1,000 وحدة)" : "Professional (1,000 units)" },
            { value: "ENTERPRISE", label: isAr ? "المجموعات (غير محدود)" : "Enterprise (Unlimited)" },
          ]}
        >
          <SelectTrigger className="w-56 h-10 rounded-xl text-xs font-bold">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="STARTER">{isAr ? "الأساسية (100 وحدة)" : "Starter (100 units)"}</SelectItem>
            <SelectItem value="PROFESSIONAL">{isAr ? "الاحترافية (1,000 وحدة)" : "Professional (1,000 units)"}</SelectItem>
            <SelectItem value="ENTERPRISE">{isAr ? "المجموعات (غير محدود)" : "Enterprise (Unlimited)"}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="pt-5">
        <Button
          type="submit"
          disabled={pending}
          className="h-10 font-bold rounded-xl gap-2 shadow-xs"
        >
          {pending ? (
            <>
              <RefreshCw className="size-4 animate-spin" />
              <span>{isAr ? "جارٍ التحديث..." : "Updating..."}</span>
            </>
          ) : (
            <>
              <Check className="size-4" />
              <span>{isAr ? "حفظ وترقية الباقة" : "Update Subscription"}</span>
            </>
          )}
        </Button>
      </div>

      {!state.ok && (
        <p role="alert" className="w-full text-xs font-semibold text-destructive mt-1">
          {state.error}
        </p>
      )}
    </form>
  );
}
