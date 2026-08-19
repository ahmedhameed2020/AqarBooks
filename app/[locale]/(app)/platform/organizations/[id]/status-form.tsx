"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  setOrganizationStatus,
  type ActionResult,
} from "@/lib/actions/platform";
import { ShieldAlert, CheckCircle2, AlertTriangle, Archive, RefreshCw } from "lucide-react";

const STATUS_OPTIONS = [
  { key: "ACTIVE", labelAr: "نشطة (Active)", labelEn: "Active", icon: CheckCircle2, class: "bg-emerald-600 hover:bg-emerald-500 text-white" },
  { key: "TRIAL", labelAr: "تجريبية (Trial)", labelEn: "Trial", icon: RefreshCw, class: "bg-blue-600 hover:bg-blue-500 text-white" },
  { key: "SUSPENDED", labelAr: "تعليق الخدمة (Suspended)", labelEn: "Suspend", icon: ShieldAlert, class: "bg-rose-600 hover:bg-rose-500 text-white" },
  { key: "ARCHIVED", labelAr: "أرشفة (Archived)", labelEn: "Archive", icon: Archive, class: "bg-slate-700 hover:bg-slate-600 text-white" },
] as const;

export function StatusForm({
  organizationId,
  currentStatus,
  locale,
}: {
  organizationId: string;
  currentStatus: string;
  locale: string;
}) {
  const isAr = locale === "ar";
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    setOrganizationStatus,
    { ok: true },
  );

  return (
    <form action={formAction} className="space-y-4 rounded-2xl border bg-card p-5 shadow-xs text-start">
      <input type="hidden" name="organizationId" value={organizationId} />
      
      <div className="space-y-2">
        <Label className="text-xs font-bold text-foreground block">
          {isAr ? "تغيير الحالة التشغيلية للمنظمة:" : "Change Lifecycle State:"}
        </Label>
        
        <div className="flex flex-wrap gap-2">
          {STATUS_OPTIONS.filter((s) => s.key !== currentStatus).map((opt) => {
            const Icon = opt.icon;
            return (
              <Button
                key={opt.key}
                type="submit"
                name="status"
                value={opt.key}
                disabled={pending}
                className={`text-xs font-bold gap-1.5 rounded-xl shadow-xs transition-all cursor-pointer ${opt.class}`}
                size="sm"
              >
                <Icon className="size-3.5" />
                <span>{isAr ? opt.labelAr : opt.labelEn}</span>
              </Button>
            );
          })}
        </div>
      </div>

      <div className="space-y-1.5 pt-1">
        <Label htmlFor="reason" className="text-xs font-semibold text-muted-foreground block">
          {isAr ? "سبب التعديل أو الملاحظات الإدارية (اختياري)" : "Reason / Administrative Note (Optional)"}
        </Label>
        <Input
          id="reason"
          name="reason"
          placeholder={isAr ? "مثال: ترقية الحساب بعد سداد الاشتراك السنوي" : "e.g. Activated after annual invoice payment"}
          className="text-xs rounded-xl h-9"
        />
      </div>

      {!state.ok && (
        <p role="alert" className="text-xs font-semibold text-destructive">
          {state.error}
        </p>
      )}
    </form>
  );
}
