"use client";

import { useState, useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createFiscalYearAction } from "@/lib/actions/accounting";
import type { ActionResult } from "@/lib/actions/platform";
import { Plus, Calendar, RefreshCw, AlertCircle, Sparkles } from "lucide-react";

export function CreateFiscalYearForm({
  organizationId,
  locale,
}: {
  organizationId: string;
  locale: string;
}) {
  const isAr = locale === "ar";
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    createFiscalYearAction,
    { ok: true },
  );

  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-blue-600/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400">
            <Calendar className="size-5" />
          </div>
          <div>
            <h2 className="text-sm font-black text-slate-900 dark:text-white">
              {isAr ? "إنشاء سنة مالية جديدة وفترات دورية" : "Create New Fiscal Year"}
            </h2>
            <p className="text-xs text-slate-500">
              {isAr
                ? "سيتم توليد 12 فترة محاسبية شهرية تلقائياً للسنة المالية الجديدة."
                : "Automatically generates 12 monthly fiscal periods for accounting entries."}
            </p>
          </div>
        </div>

        <Button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          variant={isOpen ? "outline" : "default"}
          className="text-xs font-bold gap-1.5 h-9"
        >
          <Plus className="size-3.5" />
          <span>{isOpen ? (isAr ? "إغلاق النموذج" : "Close Form") : isAr ? "إضافة سنة مالية" : "New Fiscal Year"}</span>
        </Button>
      </div>

      {isOpen && (
        <form action={formAction} className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 space-y-4">
          <input type="hidden" name="organizationId" value={organizationId} />

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5 text-start">
              <Label htmlFor="name" className="text-xs font-bold text-slate-700 dark:text-slate-300">
                {isAr ? "مسمى / رقم السنة المالية *" : "Fiscal Year Name *"}
              </Label>
              <Input
                id="name"
                name="name"
                defaultValue={new Date().getFullYear().toString()}
                placeholder="2026"
                required
                className="text-xs font-mono font-bold"
              />
            </div>

            <div className="space-y-1.5 text-start">
              <Label htmlFor="startDate" className="text-xs font-bold text-slate-700 dark:text-slate-300">
                {isAr ? "تاريخ بداية السنة المالية *" : "Start Date *"}
              </Label>
              <Input
                id="startDate"
                name="startDate"
                type="date"
                defaultValue={`${new Date().getFullYear()}-01-01`}
                required
                className="text-xs font-mono"
              />
            </div>

            <div className="space-y-1.5 text-start">
              <Label htmlFor="endDate" className="text-xs font-bold text-slate-700 dark:text-slate-300">
                {isAr ? "تاريخ نهاية السنة المالية *" : "End Date *"}
              </Label>
              <Input
                id="endDate"
                name="endDate"
                type="date"
                defaultValue={`${new Date().getFullYear()}-12-31`}
                required
                className="text-xs font-mono"
              />
            </div>
          </div>

          {!state.ok && (
            <div role="alert" className="p-3 rounded-xl border border-red-200 bg-red-50 text-red-700 text-xs font-semibold flex items-center gap-2">
              <AlertCircle className="size-4 text-red-600 shrink-0" />
              <span>{state.error}</span>
            </div>
          )}

          <div className="flex justify-end">
            <Button
              type="submit"
              disabled={pending}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs gap-1.5 h-9"
            >
              {pending ? <RefreshCw className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
              <span>{isAr ? "تأكيد وإنشاء السنة وفتراتها الشهرية" : "Create Fiscal Year & 12 Periods"}</span>
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
