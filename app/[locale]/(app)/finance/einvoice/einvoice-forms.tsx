"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Save, RefreshCw, AlertCircle, CheckCircle2, Shield, Lock } from "lucide-react";
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
  if (error.includes("EINVOICE_IDENTITY_CONFLICT")) {
    return isAr
      ? "الرقم الضريبي المُدخَل يخالف الرقم المسجّل للمؤسسة. الهوية الضريبية تُغيَّر على بيانات المؤسسة، لا هنا."
      : "This taxpayer ID does not match the organization's registered number. The legal identity is changed on the organization, not here.";
  }
  if (error.includes("EINVOICE_LEGAL_IDENTITY_MISSING")) {
    return isAr
      ? "سجّل الرقم الضريبي للمؤسسة أولًا قبل إعداد الفوترة الإلكترونية."
      : "Record the organization's tax registration number before configuring e-invoicing.";
  }
  if (error.includes("EINVOICE_JURISDICTION_INVALID")) {
    return isAr ? "ولاية ضريبية غير مدعومة." : "Unsupported tax jurisdiction.";
  }
  if (error.includes("FORBIDDEN")) {
    return isAr
      ? "لا تملك صلاحية إدارة إعدادات الفوترة الإلكترونية."
      : "You don't have permission to manage e-invoicing settings.";
  }
  if (error === "invalid_input") return isAr ? "تحقق من البيانات المدخلة." : "Check the values entered.";
  return error;
}

function Err({ state, isAr }: { state: ActionResult; isAr: boolean }) {
  if (state.ok !== false) return null;
  return (
    <div className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 p-2 text-xs font-semibold text-red-700 dark:border-red-900/50 dark:bg-red-950/50 dark:text-red-300">
      <AlertCircle className="size-3.5 shrink-0 text-red-600 dark:text-red-400" />
      <span>{message(state.error, isAr)}</span>
    </div>
  );
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
    <form action={formAction} className="space-y-3.5">
      <input type="hidden" name="organizationId" value={organizationId} />
      <input type="hidden" name="jurisdiction" value={jurisdiction} />

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <div className="space-y-1.5 text-start">
          <Label htmlFor={`env-${jurisdiction}`} className="text-xs font-bold text-slate-700 dark:text-slate-300">
            {isAr ? "بيئة التشغيل" : "Environment"}
          </Label>
          <select
            id={`env-${jurisdiction}`}
            name="environment"
            defaultValue={environment}
            className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-2 text-xs font-semibold text-slate-900 dark:text-white shadow-sm focus:border-blue-500 focus:outline-none"
          >
            <option value="SANDBOX">{isAr ? "بيئة تجريبية (Sandbox)" : "Sandbox (Testing)"}</option>
            <option value="PRODUCTION">{isAr ? "البيئة الإنتاجية الحية (Production)" : "Live Production"}</option>
          </select>
        </div>

        <div className="space-y-1.5 text-start">
          <Label htmlFor={`tax-${jurisdiction}`} className="text-xs font-bold text-slate-700 dark:text-slate-300">
            {isAr ? "الرقم الضريبي (Taxpayer ID)" : "Taxpayer ID"}
          </Label>
          <Input
            id={`tax-${jurisdiction}`}
            name="taxpayerId"
            defaultValue={taxpayerId ?? ""}
            placeholder={jurisdiction === "EG_ETA" ? "e.g. 100-234-567" : "e.g. 300000000000003"}
            dir="ltr"
            className="text-xs font-mono"
          />
        </div>

        <div className="space-y-1.5 text-start">
          <Label htmlFor={`branch-${jurisdiction}`} className="text-xs font-bold text-slate-700 dark:text-slate-300">
            {isAr ? "كود الفرع (Branch Code)" : "Branch Code"}
          </Label>
          <Input
            id={`branch-${jurisdiction}`}
            name="branchCode"
            defaultValue={branchCode ?? "0"}
            placeholder="0"
            dir="ltr"
            className="text-xs font-mono"
          />
        </div>

        <div className="space-y-1.5 text-start">
          <Label htmlFor={`activity-${jurisdiction}`} className="text-xs font-bold text-slate-700 dark:text-slate-300">
            {isAr ? "كود النشاط الضريبي" : "Activity Code"}
          </Label>
          <Input
            id={`activity-${jurisdiction}`}
            name="activityCode"
            defaultValue={activityCode ?? ""}
            placeholder="e.g. 6810"
            dir="ltr"
            className="text-xs font-mono"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <div className="flex items-center gap-2">
          <Button
            type="submit"
            size="sm"
            disabled={pending}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold gap-1.5 text-xs h-8"
          >
            {pending ? <RefreshCw className="size-3 animate-spin" /> : <Save className="size-3" />}
            <span>{pending ? (isAr ? "جارٍ الحفظ…" : "Saving…") : isAr ? "حفظ إعدادات الربط" : "Save Settings"}</span>
          </Button>
          <span className="text-[11px] text-slate-500">
            {isAr ? "بيانات تعريفية مشفرة ومؤمنة." : "Identifying metadata only."}
          </span>
        </div>

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
  canEnable: boolean;
  locale: string;
}) {
  const isAr = locale === "ar";
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    setEInvoiceFilingEnabled,
    { ok: true },
  );

  return (
    <form action={formAction} className="flex flex-wrap items-center justify-between gap-3 w-full">
      <input type="hidden" name="profileId" value={profileId} />
      <input type="hidden" name="enabled" value={String(!enabled)} />

      <div className="flex items-center gap-2">
        <Button
          type="submit"
          size="sm"
          variant={enabled ? "outline" : "default"}
          disabled={pending || (!enabled && !canEnable)}
          className={`text-xs font-bold h-8 ${
            enabled
              ? "border-rose-300 text-rose-700 hover:bg-rose-50 dark:border-rose-900 dark:text-rose-400"
              : "bg-emerald-600 hover:bg-emerald-700 text-white"
          }`}
        >
          {pending ? (
            <RefreshCw className="size-3 animate-spin" />
          ) : enabled ? (
            isAr ? "إيقاف الإرسال التلقائي للضرائب" : "Switch Filing Off"
          ) : (
            isAr ? "تفعيل الإرسال الآلي للفواتير" : "Activate Auto-Filing"
          )}
        </Button>

        {!enabled && !canEnable && (
          <span className="text-[11px] text-slate-500 font-medium">
            {isAr
              ? "💡 يُتاح التفعيل التلقائي بعد التحقق من شهادة التوقيع الإلكتروني وبيانات الاعتماد."
              : "Unlocks once credentials and digital signature are proven."}
          </span>
        )}
      </div>

      <Err state={state} isAr={isAr} />
    </form>
  );
}
