"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  saveEInvoiceProfile,
  setEInvoiceFilingEnabled,
} from "@/lib/actions/einvoice-settings";
import type { ActionResult } from "@/lib/actions/platform";
import type { Jurisdiction } from "@/lib/einvoice/types";

function message(error: string, isAr: boolean) {
  if (error.includes("EINVOICE_NOT_VERIFIED")) {
    return isAr
      ? "لا يمكن تفعيل الإرسال قبل التحقق الفعلي من بيانات الاعتماد مقابل مصلحة الضرائب."
      : "Filing cannot be switched on before credentials are actually proven against the tax authority.";
  }
  if (error.includes("EINVOICE_JURISDICTION_INVALID")) {
    return isAr ? "ولاية ضريبية غير مدعومة." : "Unsupported tax jurisdiction.";
  }
  if (error.includes("FORBIDDEN")) {
    return isAr
      ? "لا تملك صلاحية إدارة إعدادات الفوترة الإلكترونية."
      : "You don't have permission to manage e-invoicing settings.";
  }
  if (error === "invalid_input") return isAr ? "تحقق من البيانات." : "Check the values entered.";
  return error;
}

function Err({ state, isAr }: { state: ActionResult; isAr: boolean }) {
  if (state.ok !== false) return null;
  return <p className="text-sm text-destructive">{message(state.error, isAr)}</p>;
}

export function ProfileForm({
  organizationId,
  jurisdiction,
  environment,
  taxpayerId,
  branchCode,
  activityCode,
  locale,
}: {
  organizationId: string;
  jurisdiction: Jurisdiction;
  environment: "SANDBOX" | "PRODUCTION";
  taxpayerId: string | null;
  branchCode: string | null;
  activityCode: string | null;
  locale: string;
}) {
  const isAr = locale === "ar";
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    saveEInvoiceProfile,
    { ok: true },
  );

  return (
    <form action={formAction} className="grid gap-4 sm:grid-cols-3">
      <input type="hidden" name="organizationId" value={organizationId} />
      <input type="hidden" name="jurisdiction" value={jurisdiction} />

      <div className="space-y-2">
        <Label htmlFor={`env-${jurisdiction}`}>{isAr ? "البيئة" : "Environment"}</Label>
        <select
          id={`env-${jurisdiction}`}
          name="environment"
          defaultValue={environment}
          className="w-full rounded-md border border-input bg-transparent p-2 text-sm"
        >
          <option value="SANDBOX">{isAr ? "تجريبية" : "Sandbox"}</option>
          <option value="PRODUCTION">{isAr ? "إنتاج" : "Production"}</option>
        </select>
      </div>

      <div className="space-y-2">
        <Label htmlFor={`tax-${jurisdiction}`}>{isAr ? "الرقم الضريبي" : "Taxpayer ID"}</Label>
        <Input
          id={`tax-${jurisdiction}`}
          name="taxpayerId"
          defaultValue={taxpayerId ?? ""}
          dir="ltr"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor={`branch-${jurisdiction}`}>{isAr ? "كود الفرع" : "Branch code"}</Label>
        <Input
          id={`branch-${jurisdiction}`}
          name="branchCode"
          defaultValue={branchCode ?? ""}
          dir="ltr"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor={`activity-${jurisdiction}`}>
          {isAr ? "كود النشاط" : "Activity code"}
        </Label>
        <Input
          id={`activity-${jurisdiction}`}
          name="activityCode"
          defaultValue={activityCode ?? ""}
          dir="ltr"
        />
      </div>

      <div className="flex items-center gap-3 sm:col-span-3">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? (isAr ? "جارٍ الحفظ…" : "Saving…") : isAr ? "حفظ البيانات" : "Save details"}
        </Button>
        <p className="text-xs text-muted-foreground">
          {isAr
            ? "بيانات تعريفية فقط. لا تُدخل هنا أي مفاتيح أو شهادات."
            : "Identifying details only. No keys or certificates are entered here."}
        </p>
        <Err state={state} isAr={isAr} />
      </div>
    </form>
  );
}

export function FilingToggle({
  profileId,
  enabled,
  canEnable,
  locale,
}: {
  profileId: string;
  enabled: boolean;
  /** False until a real verification has happened; the server enforces it too. */
  canEnable: boolean;
  locale: string;
}) {
  const isAr = locale === "ar";
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    setEInvoiceFilingEnabled,
    { ok: true },
  );

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="profileId" value={profileId} />
      <input type="hidden" name="enabled" value={String(!enabled)} />
      <Button
        type="submit"
        size="sm"
        variant={enabled ? "outline" : "default"}
        disabled={pending || (!enabled && !canEnable)}
      >
        {enabled
          ? isAr
            ? "إيقاف الإرسال"
            : "Switch filing off"
          : isAr
            ? "تفعيل الإرسال"
            : "Switch filing on"}
      </Button>
      {!enabled && !canEnable && (
        <span className="text-xs text-muted-foreground">
          {isAr
            ? "التفعيل متاح بعد التحقق الفعلي من بيانات الاعتماد."
            : "Switching on unlocks once credentials are actually verified."}
        </span>
      )}
      <Err state={state} isAr={isAr} />
    </form>
  );
}
