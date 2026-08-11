"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { useToast } from "@/components/ui/toast";
import { linkOwnershipAction } from "@/lib/actions/property";
import type { ActionResult } from "@/lib/actions/platform";

export function LinkOwnershipForm({
  organizationId,
  members,
  units,
  locale,
  onSuccess,
}: {
  organizationId: string;
  members: { id: string; full_name: string }[];
  units: { id: string; code: string; building_name_ar: string | null; building_name_en: string | null }[];
  locale: string;
  onSuccess?: () => void;
}) {
  const isAr = locale === "ar";
  const toast = useToast();
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    linkOwnershipAction,
    { ok: true },
  );
  const wasPending = useRef(false);
  const [memberId, setMemberId] = useState("");
  const [unitId, setUnitId] = useState("");
  const [touched, setTouched] = useState(false);

  const memberError = touched && !memberId ? (isAr ? "اختر عضوًا" : "Select a member") : undefined;
  const unitError = touched && !unitId ? (isAr ? "اختر وحدة" : "Select a unit") : undefined;

  useEffect(() => {
    if (wasPending.current && !pending && state.ok) {
      toast.add({ title: isAr ? "تم ربط الملكية بنجاح" : "Ownership linked successfully", type: "success" });
      onSuccess?.();
    }
    wasPending.current = pending;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, state]);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    setTouched(true);
    if (!memberId || !unitId) e.preventDefault();
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <form action={formAction} onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
      <input type="hidden" name="organizationId" value={organizationId} />
      <div className="space-y-1.5">
        <Label htmlFor="memberId">{isAr ? "العضو" : "Member"}</Label>
        <SearchableSelect
          name="memberId"
          value={memberId}
          onValueChange={setMemberId}
          items={members.map((m) => ({ value: m.id, label: m.full_name }))}
          placeholder={isAr ? "ابحث عن عضو…" : "Search for a member…"}
          emptyLabel={isAr ? "لا يوجد أعضاء مطابقون" : "No matching members"}
          error={memberError}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="unitId">{isAr ? "الوحدة" : "Unit"}</Label>
        <SearchableSelect
          name="unitId"
          value={unitId}
          onValueChange={setUnitId}
          items={units.map((u) => ({
            value: u.id,
            label: u.code,
            sublabel: (isAr ? u.building_name_ar : u.building_name_en) ?? undefined,
          }))}
          placeholder={isAr ? "ابحث برقم الوحدة أو المبنى…" : "Search by unit or building…"}
          emptyLabel={isAr ? "لا توجد وحدات مطابقة" : "No matching units"}
          error={unitError}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="sharePercentage">{isAr ? "نسبة الملكية %" : "Ownership share %"}</Label>
        <Input id="sharePercentage" name="sharePercentage" type="number" defaultValue={100} min={1} max={100} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="startDate">{isAr ? "تاريخ البداية" : "Start date"}</Label>
        <Input id="startDate" name="startDate" type="date" defaultValue={today} />
      </div>
      {!state.ok && (
        <p role="alert" className="text-sm text-destructive sm:col-span-2">
          {state.error}
        </p>
      )}
      <div className="sm:col-span-2">
        <Button type="submit" disabled={pending} className="w-full">
          {pending && <Loader2 className="size-3.5 animate-spin" />}
          {pending ? (isAr ? "جارٍ الربط…" : "Linking…") : isAr ? "ربط الملكية" : "Link ownership"}
        </Button>
      </div>
    </form>
  );
}
