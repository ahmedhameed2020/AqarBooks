"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Loader2, Building2, MapPin } from "lucide-react";
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
  const nameEnError = touched && !nameEn.trim() ? (isAr ? "الاسم بالإنجليزي مطلوب" : "English name is required") : undefined;

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
    if (!code.trim() || !nameAr.trim() || !nameEn.trim()) e.preventDefault();
  }

  return (
    <form action={formAction} onSubmit={handleSubmit} className="space-y-4">
      <input type="hidden" name="organizationId" value={organizationId} />
      <input type="hidden" name="resortId" value={resortId} />
      {zoneId !== NONE && <input type="hidden" name="zoneId" value={zoneId} />}

      <div className="rounded-2xl border border-border/60 bg-muted/20 p-4 space-y-3">
        <h4 className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
          <Building2 className="size-3.5 text-primary" />
          {isAr ? "بيانات المبنى الجديد" : "New Building Details"}
        </h4>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="buildingCode" className="text-xs">{isAr ? "رمز المبنى *" : "Building Code *"}</Label>
            <Input
              id="buildingCode"
              name="code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onBlur={() => setTouched(true)}
              placeholder={isAr ? "مثال: BLD-01" : "e.g. BLD-01"}
              aria-invalid={Boolean(codeError)}
              required
            />
            {codeError && <p className="text-[11px] text-destructive">{codeError}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="buildingZoneId" className="text-xs">{isAr ? "المنطقة التابعة" : "Associated Zone"}</Label>
            <Select value={zoneId} onValueChange={(v) => setZoneId(v ?? NONE)}>
              <SelectTrigger id="buildingZoneId" className="w-full">
                <SelectValue placeholder={isAr ? "اختر المنطقة (اختياري)" : "Select Zone (optional)"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>{isAr ? "بدون منطقة (عام)" : "No zone (general)"}</SelectItem>
                {zones.map((z) => (
                  <SelectItem key={z.id} value={z.id}>
                    {isAr ? z.name_ar : z.name_en}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="buildingNameAr" className="text-xs">{isAr ? "الاسم بالعربي *" : "Arabic Name *"}</Label>
            <Input
              id="buildingNameAr"
              name="nameAr"
              value={nameAr}
              onChange={(e) => setNameAr(e.target.value)}
              onBlur={() => setTouched(true)}
              placeholder={isAr ? "مثال: مبنى الياسمين" : "e.g. Jasmine Building"}
              aria-invalid={Boolean(nameArError)}
              required
            />
            {nameArError && <p className="text-[11px] text-destructive">{nameArError}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="buildingNameEn" className="text-xs">{isAr ? "الاسم بالإنجليزي *" : "English Name *"}</Label>
            <Input
              id="buildingNameEn"
              name="nameEn"
              value={nameEn}
              onChange={(e) => setNameEn(e.target.value)}
              onBlur={() => setTouched(true)}
              placeholder={isAr ? "مثال: Jasmine Building" : "e.g. Jasmine Building"}
              aria-invalid={Boolean(nameEnError)}
              required
            />
            {nameEnError && <p className="text-[11px] text-destructive">{nameEnError}</p>}
          </div>
        </div>
      </div>

      {!state.ok && (
        <p role="alert" className="text-xs font-semibold text-destructive">
          {state.error}
        </p>
      )}

      <Button type="submit" disabled={pending} className="w-full font-semibold shadow-xs">
        {pending && <Loader2 className="size-3.5 animate-spin" />}
        {pending ? (isAr ? "جارٍ إضافة المبنى…" : "Adding Building…") : isAr ? "إضافة المبنى" : "Add Building"}
      </Button>
    </form>
  );
}
