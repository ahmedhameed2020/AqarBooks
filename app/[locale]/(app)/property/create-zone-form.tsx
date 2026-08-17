"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Loader2, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { createZoneAction } from "@/lib/actions/property";
import type { ActionResult } from "@/lib/actions/platform";

export function CreateZoneForm({
  organizationId,
  resortId,
  locale,
  onSuccess,
}: {
  organizationId: string;
  resortId: string;
  locale: string;
  onSuccess?: () => void;
}) {
  const isAr = locale === "ar";
  const toast = useToast();
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(createZoneAction, { ok: true });
  const wasPending = useRef(false);
  const [nameAr, setNameAr] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [touched, setTouched] = useState(false);

  const nameArError = touched && !nameAr.trim() ? (isAr ? "الاسم بالعربي مطلوب" : "Arabic name is required") : undefined;

  useEffect(() => {
    if (wasPending.current && !pending && state.ok) {
      toast.add({ title: isAr ? "تمت إضافة المنطقة بنجاح" : "Zone added successfully", type: "success" });
      onSuccess?.();
    }
    wasPending.current = pending;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, state]);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    setTouched(true);
    if (!nameAr.trim()) e.preventDefault();
  }

  return (
    <form action={formAction} onSubmit={handleSubmit} className="space-y-4">
      <input type="hidden" name="organizationId" value={organizationId} />
      <input type="hidden" name="resortId" value={resortId} />

      <div className="rounded-2xl border border-slate-200/90 bg-slate-50/50 p-4 space-y-3 dark:border-slate-800 dark:bg-slate-900/50">
        <h4 className="flex items-center gap-1.5 text-xs font-bold text-slate-900 dark:text-white">
          <MapPin className="size-4 text-purple-600" />
          <span>{isAr ? "بيانات المنطقة العقارية أو القطاع" : "Zone / Sector Details"}</span>
        </h4>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="zoneNameAr" className="text-xs font-bold text-slate-800 dark:text-slate-200">
              {isAr ? "الاسم بالعربي *" : "Arabic Name *"}
            </Label>
            <Input
              id="zoneNameAr"
              name="nameAr"
              value={nameAr}
              onChange={(e) => setNameAr(e.target.value)}
              onBlur={() => setTouched(true)}
              placeholder={isAr ? "مثال: المنطقة الشرقية / الفلل" : "e.g. East Zone / Villas"}
              aria-invalid={Boolean(nameArError)}
              required
            />
            {nameArError && <p className="text-[11px] font-bold text-rose-600">{nameArError}</p>}
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="zoneNameEn" className="text-xs font-bold text-slate-800 dark:text-slate-200">
                {isAr ? "الاسم بالإنجليزي" : "English Name"}
              </Label>
              <span className="text-[10px] font-semibold text-slate-400">
                {isAr ? "(اختياري)" : "(Optional)"}
              </span>
            </div>
            <Input
              id="zoneNameEn"
              name="nameEn"
              value={nameEn}
              onChange={(e) => setNameEn(e.target.value)}
              placeholder={isAr ? "اختياري — مثال: East Zone" : "Optional — e.g. East Zone"}
            />
          </div>
        </div>
      </div>

      {!state.ok && (
        <p role="alert" className="text-xs font-bold text-rose-600">
          {state.error}
        </p>
      )}

      <Button
        type="submit"
        disabled={pending}
        className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-black shadow-md shadow-purple-600/20 py-2.5 rounded-xl cursor-pointer"
      >
        {pending && <Loader2 className="size-4 animate-spin" />}
        {pending ? (isAr ? "جارٍ إضافة المنطقة…" : "Adding Zone…") : isAr ? "حفظ وإضافة المنطقة" : "Save & Add Zone"}
      </Button>
    </form>
  );
}
