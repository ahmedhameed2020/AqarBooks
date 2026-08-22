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
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="organizationId" value={organizationId} />
      <input type="hidden" name="jurisdiction" value={jurisdiction} />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        {/* Environment */}
        <div className="space-y-1 text-start">
          <Label htmlFor={`env-${jurisdiction}`} className="text-[11px] font-bold text-slate-600 dark:text-slate-300">
            {isAr ? "بيئة التشغيل" : "Environment"}
          </Label>
          <select
            id={`env-${jurisdiction}`}
            name="environment"
            defaultValue={environment}
            className="w-full h-8 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 text-[11px] font-bold text-slate-900 dark:text-white shadow-2xs focus:border-purple-500 focus:ring-1 focus:ring-purple-500/20 focus:outline-none transition-all cursor-pointer"
          >
            <option value="SANDBOX">{isAr ? "تجريبية (Sandbox)" : "Sandbox"}</option>
            <option value="PRODUCTION">{isAr ? "إنتاجية (Production)" : "Production"}</option>
          </select>
        </div>

        {/* Taxpayer ID */}
        <div className="space-y-1 text-start">
          <Label htmlFor={`tax-${jurisdiction}`} className="text-[11px] font-bold text-slate-600 dark:text-slate-300">
            {isAr ? "الرقم الضريبي" : "Taxpayer ID"}
          </Label>
          <Input
            id={`tax-${jurisdiction}`}
            name="taxpayerId"
            defaultValue={taxpayerId ?? ""}
            placeholder={jurisdiction === "EG_ETA" ? "100-234-567" : "300000000000003"}
            dir="ltr"
            className="h-8 text-[11px] font-mono font-bold bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 px-2.5 focus-visible:ring-purple-500/20 focus-visible:border-purple-500"
          />
        </div>

        {/* Branch Code */}
        <div className="space-y-1 text-start">
          <Label htmlFor={`branch-${jurisdiction}`} className="text-[11px] font-bold text-slate-600 dark:text-slate-300">
            {isAr ? "كود الفرع" : "Branch Code"}
          </Label>
          <Input
            id={`branch-${jurisdiction}`}
            name="branchCode"
            defaultValue={branchCode ?? "0"}
            placeholder="0"
            dir="ltr"
            className="h-8 text-[11px] font-mono font-bold bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 px-2.5 focus-visible:ring-purple-500/20 focus-visible:border-purple-500"
          />
        </div>

        {/* Activity Code */}
        <div className="space-y-1 text-start">
          <Label htmlFor={`activity-${jurisdiction}`} className="text-[11px] font-bold text-slate-600 dark:text-slate-300">
            {isAr ? "كود النشاط" : "Activity Code"}
          </Label>
          <Input
            id={`activity-${jurisdiction}`}
            name="activityCode"
            defaultValue={activityCode ?? ""}
            placeholder="6810"
            dir="ltr"
            className="h-8 text-[11px] font-mono font-bold bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 px-2.5 focus-visible:ring-purple-500/20 focus-visible:border-purple-500"
          />
        </div>
      </div>

      <Err state={state} isAr={isAr} />

      <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-200/50 dark:border-slate-800">
        <div className="flex items-center gap-1 text-[10px] text-slate-400 dark:text-slate-500">
          <Lock className="size-2.5" />
          <span>{isAr ? "تشفير آمن 256-bit" : "256-bit Encrypted Vault"}</span>
        </div>

        <Button
          type="submit"
          size="sm"
          disabled={pending}
          className="h-7 px-3 text-[11px] font-bold bg-slate-900 hover:bg-slate-800 text-white dark:bg-slate-100 dark:hover:bg-white dark:text-slate-900 rounded-lg shadow-2xs gap-1 cursor-pointer transition-all"
        >
          {pending ? (
            <>
              <RefreshCw className="size-3 animate-spin" />
              <span>{isAr ? "جاري الحفظ..." : "Saving..."}</span>
            </>
          ) : (
            <>
              <Save className="size-3" />
              <span>{isAr ? "حفظ إعدادات الربط" : "Save Settings"}</span>
            </>
          )}
        </Button>
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
    <form action={formAction} className="pt-1.5 border-t border-slate-200/50 dark:border-slate-800">
      <input type="hidden" name="profileId" value={profileId} />
      <input type="hidden" name="enabled" value={enabled ? "false" : "true"} />

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
          <div className={`size-1.5 rounded-full ${enabled ? "bg-emerald-500 animate-pulse" : "bg-slate-300 dark:bg-slate-600"}`} />
          <span>{isAr ? "الإرسال التلقائي:" : "Auto-filing:"}</span>
          <span className="font-bold text-slate-800 dark:text-slate-200">
            {enabled ? (isAr ? "مفعّل" : "On") : (isAr ? "متوقف" : "Off")}
          </span>
        </div>

        <Button
          type="submit"
          size="sm"
          disabled={pending || (!enabled && !canEnable)}
          variant={enabled ? "outline" : "default"}
          className={`h-7 px-3 text-[11px] font-bold rounded-lg cursor-pointer transition-all ${
            enabled
              ? "border-rose-200 text-rose-700 hover:bg-rose-50 dark:border-rose-900/60 dark:text-rose-300 dark:hover:bg-rose-950/40"
              : "bg-emerald-600 hover:bg-emerald-700 text-white"
          }`}
        >
          {pending ? (
            <RefreshCw className="size-3 animate-spin" />
          ) : enabled ? (
            <span>{isAr ? "إيقاف الإرسال" : "Switch Filing Off"}</span>
          ) : (
            <span>{isAr ? "تفعيل الإرسال الآلي" : "Activate Auto-Filing"}</span>
          )}
        </Button>
      </div>

      {!canEnable && !enabled && (
        <p className="mt-1 text-[10px] text-slate-400 dark:text-slate-500 font-medium">
          {isAr
            ? "💡 يُتاح التفعيل التلقائي بعد التحقق من شهادة التوقيع وبيانات الاعتماد."
            : "Unlocks once credentials and digital signature are verified."}
        </p>
      )}

      <Err state={state} isAr={isAr} />
    </form>
  );
}
