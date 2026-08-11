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
  const nameEnError = touched && !nameEn.trim() ? (isAr ? "الاسم بالإنجليزي مطلوب" : "English name is required") : undefined;

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
    if (!nameAr.trim() || !nameEn.trim()) e.preventDefault();
  }

  return (
    <form action={formAction} onSubmit={handleSubmit} className="space-y-4">
      <input type="hidden" name="organizationId" value={organizationId} />
      <input type="hidden" name="resortId" value={resortId} />

      <div className="rounded-2xl border border-border/60 bg-muted/20 p-4 space-y-3">
        <h4 className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
          <MapPin className="size-3.5 text-primary" />
          {isAr ? "بيانات المنطقة الجديدة" : "New Zone Details"}
        </h4>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="zoneNameAr" className="text-xs">{isAr ? "الاسم بالعربي *" : "Arabic Name *"}</Label>
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
            {nameArError && <p className="text-[11px] text-destructive">{nameArError}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="zoneNameEn" className="text-xs">{isAr ? "الاسم بالإنجليزي *" : "English Name *"}</Label>
            <Input
              id="zoneNameEn"
              name="nameEn"
              value={nameEn}
              onChange={(e) => setNameEn(e.target.value)}
              onBlur={() => setTouched(true)}
              placeholder={isAr ? "مثال: East Zone / Villas Area" : "e.g. East Zone / Villas Area"}
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
        {pending ? (isAr ? "جارٍ إضافة المنطقة…" : "Adding Zone…") : isAr ? "إضافة المنطقة" : "Add Zone"}
      </Button>
    </form>
  );
}
