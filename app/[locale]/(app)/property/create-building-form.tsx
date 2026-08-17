"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Loader2, Building2, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { createBuildingAction } from "@/lib/actions/property";
import type { ActionResult } from "@/lib/actions/platform";

const NONE = "__none__";

export function CreateBuildingForm({
  organizationId,
  resortId,
  zones,
  locale,
  onSuccess,
}: {
  organizationId: string;
  resortId: string;
  zones: { id: string; name_ar: string; name_en: string }[];
  locale: string;
  onSuccess?: () => void;
}) {
  const isAr = locale === "ar";
  const toast = useToast();
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(createBuildingAction, { ok: true });
  const wasPending = useRef(false);
  const [code, setCode] = useState("");
  const [nameAr, setNameAr] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [zoneId, setZoneId] = useState(NONE);
  const [touched, setTouched] = useState(false);

  const codeError = touched && !code.trim() ? (isAr ? "رمز المبنى مطلوب" : "Building code is required") : undefined;
  const nameArError = touched && !nameAr.trim() ? (isAr ? "الاسم بالعربي مطلوب" : "Arabic name is required") : undefined;

  useEffect(() => {
    if (wasPending.current && !pending && state.ok) {
      toast.add({ title: isAr ? "تمت إضافة المبنى بنجاح" : "Building added successfully", type: "success" });
      onSuccess?.();
    }
    wasPending.current = pending;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, state]);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    setTouched(true);
    if (!code.trim() || !nameAr.trim()) e.preventDefault();
  }

  return (
    <form action={formAction} onSubmit={handleSubmit} className="space-y-4">
      <input type="hidden" name="organizationId" value={organizationId} />
      <input type="hidden" name="resortId" value={resortId} />
      {zoneId !== NONE && <input type="hidden" name="zoneId" value={zoneId} />}

      <div className="rounded-2xl border border-slate-200/90 bg-slate-50/50 p-4 space-y-3 dark:border-slate-800 dark:bg-slate-900/50">
        <h4 className="flex items-center gap-1.5 text-xs font-bold text-slate-900 dark:text-white">
          <Building2 className="size-4 text-purple-600" />
          <span>{isAr ? "بيانات المبنى أو البرج" : "Building or Tower Details"}</span>
        </h4>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="buildingCode" className="text-xs font-bold text-slate-800 dark:text-slate-200">
              {isAr ? "رمز المبنى *" : "Building Code *"}
            </Label>
            <Input
              id="buildingCode"
              name="code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onBlur={() => setTouched(true)}
              placeholder={isAr ? "مثال: BLD-01" : "e.g. BLD-01"}
              aria-invalid={Boolean(codeError)}
              className="font-mono"
              required
            />
            {codeError && <p className="text-[11px] font-bold text-rose-600">{codeError}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="buildingZoneId" className="text-xs font-bold text-slate-800 dark:text-slate-200">
              {isAr ? "المنطقة التابعة" : "Associated Zone"}
            </Label>
            <select
              id="buildingZoneId"
              value={zoneId}
              onChange={(e) => setZoneId(e.target.value)}
              className="flex h-9 w-full rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 shadow-2xs focus:border-purple-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            >
              <option value={NONE}>{isAr ? "بدون منطقة (عام)" : "No zone (general)"}</option>
              {zones.map((z) => (
                <option key={z.id} value={z.id}>
                  {isAr ? z.name_ar : (z.name_en || z.name_ar)}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="buildingNameAr" className="text-xs font-bold text-slate-800 dark:text-slate-200">
              {isAr ? "الاسم بالعربي *" : "Arabic Name *"}
            </Label>
            <Input
              id="buildingNameAr"
              name="nameAr"
              value={nameAr}
              onChange={(e) => setNameAr(e.target.value)}
              onBlur={() => setTouched(true)}
              placeholder={isAr ? "مثال: مبنى الياسمين / برج أ" : "e.g. Jasmine Tower"}
              aria-invalid={Boolean(nameArError)}
              required
            />
            {nameArError && <p className="text-[11px] font-bold text-rose-600">{nameArError}</p>}
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="buildingNameEn" className="text-xs font-bold text-slate-800 dark:text-slate-200">
                {isAr ? "الاسم بالإنجليزي" : "English Name"}
              </Label>
              <span className="text-[10px] font-semibold text-slate-400">
                {isAr ? "(اختياري)" : "(Optional)"}
              </span>
            </div>
            <Input
              id="buildingNameEn"
              name="nameEn"
              value={nameEn}
              onChange={(e) => setNameEn(e.target.value)}
              placeholder={isAr ? "اختياري — مثال: Jasmine Building" : "Optional — e.g. Jasmine Building"}
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
        {pending ? (isAr ? "جارٍ إضافة المبنى…" : "Adding Building…") : isAr ? "حفظ وإضافة المبنى" : "Save & Add Building"}
      </Button>
    </form>
  );
}
