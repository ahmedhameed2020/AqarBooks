"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Building2, Loader2, MessageCircle, Phone, Plus, Star, Trash2, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { createMemberAction } from "@/lib/actions/property";
import type { ActionResult } from "@/lib/actions/platform";

// Loose but real check: digits/spaces/+/- only, 7-20 chars. Rejects
// obviously-wrong input (letters, too short) without being a strict E.164
// validator -- phone formats vary too much across the region for that.
const PHONE_PATTERN = /^[0-9+\-\s]{7,20}$/;

// Matches member_phones' own CHECK constraint exactly (label = ANY (...))
// -- see supabase migration for member_phones. Keep in sync if that
// constraint ever changes.
const PHONE_LABELS = ["PERSONAL", "WORK", "WHATSAPP", "HOME", "OTHER"] as const;
type PhoneLabel = (typeof PHONE_LABELS)[number];

const PHONE_LABEL_TEXT: Record<PhoneLabel, { ar: string; en: string }> = {
  PERSONAL: { ar: "شخصي", en: "Personal" },
  WORK: { ar: "عمل", en: "Work" },
  WHATSAPP: { ar: "واتساب", en: "WhatsApp" },
  HOME: { ar: "منزل", en: "Home" },
  OTHER: { ar: "أخرى", en: "Other" },
};

type PhoneRow = {
  key: number;
  number: string;
  label: PhoneLabel;
  whatsapp: boolean;
};

let keySeq = 0;

export function CreateMemberForm({
  organizationId,
  locale,
  onSuccess,
}: {
  organizationId: string;
  locale: string;
  onSuccess?: () => void;
}) {
  const isAr = locale === "ar";
  const toast = useToast();
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    createMemberAction,
    { ok: true },
  );
  const wasPending = useRef(false);
  const [isCompany, setIsCompany] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phones, setPhones] = useState<PhoneRow[]>([
    { key: keySeq++, number: "", label: "PERSONAL", whatsapp: false },
  ]);
  const [primaryKey, setPrimaryKey] = useState<number>(phones[0].key);
  const [touched, setTouched] = useState<{ fullName?: boolean; phones?: Set<number> }>({});

  const nameError =
    touched.fullName && !fullName.trim()
      ? isAr
        ? isCompany
          ? "اسم الجهة مطلوب"
          : "الاسم مطلوب"
        : isCompany
          ? "Company name is required"
          : "Name is required"
      : undefined;

  function phoneError(row: PhoneRow) {
    if (!touched.phones?.has(row.key)) return undefined;
    if (!row.number.trim()) return undefined; // empty rows are dropped on submit, not required
    if (!PHONE_PATTERN.test(row.number.trim())) return isAr ? "رقم غير صحيح" : "Invalid number";
    return undefined;
  }

  const filledPhones = phones.filter((p) => p.number.trim());
  const hasInvalidPhone = phones.some((p) => p.number.trim() && !PHONE_PATTERN.test(p.number.trim()));

  useEffect(() => {
    if (wasPending.current && !pending && state.ok) {
      toast.add({
        title: isAr ? "تمت إضافة العضو بنجاح" : "Member added successfully",
        type: "success",
      });
      onSuccess?.();
    }
    wasPending.current = pending;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, state]);

  function addPhone() {
    const key = keySeq++;
    setPhones((prev) => [...prev, { key, number: "", label: "PERSONAL", whatsapp: false }]);
  }

  function removePhone(key: number) {
    setPhones((prev) => {
      const next = prev.filter((p) => p.key !== key);
      if (next.length === 0) {
        const freshKey = keySeq++;
        setPrimaryKey(freshKey);
        return [{ key: freshKey, number: "", label: "PERSONAL", whatsapp: false }];
      }
      if (primaryKey === key) setPrimaryKey(next[0].key);
      return next;
    });
  }

  function updatePhone(key: number, patch: Partial<PhoneRow>) {
    setPhones((prev) => prev.map((p) => (p.key === key ? { ...p, ...patch } : p)));
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    setTouched({ fullName: true, phones: new Set(phones.map((p) => p.key)) });
    if (!fullName.trim() || hasInvalidPhone) {
      e.preventDefault();
    }
  }

  // Serialized once at submit time via a hidden field -- mirrors the
  // allocations-as-JSON pattern already used elsewhere in this codebase
  // (see lib/actions/purchasing.ts's recordSupplierPaymentAction) for
  // sending a variable-length list through a single FormData entry.
  const phonesPayload = JSON.stringify(
    filledPhones.map((p) => ({
      number: p.number.trim(),
      label: p.label,
      whatsapp: p.whatsapp,
      primary: p.key === primaryKey,
    })),
  );

  return (
    <form action={formAction} onSubmit={handleSubmit} className="space-y-5">
      <input type="hidden" name="organizationId" value={organizationId} />
      <input type="hidden" name="isCompany" value={isCompany ? "true" : "false"} />
      <input type="hidden" name="phones" value={phonesPayload} />

      {/* Member type switch */}
      <div className="grid grid-cols-2 gap-1.5 rounded-xl border border-border bg-muted/40 p-1">
        <button
          type="button"
          onClick={() => setIsCompany(false)}
          className={cn(
            "flex items-center justify-center gap-2 rounded-lg py-2 text-xs font-bold transition-all cursor-pointer press-feedback motion-control",
            !isCompany
              ? "bg-background text-foreground shadow-xs ring-1 ring-border"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <User className="size-4 text-primary" />
          <span>{isAr ? "فرد / شخص طبيعي" : "Individual Person"}</span>
        </button>
        <button
          type="button"
          onClick={() => setIsCompany(true)}
          className={cn(
            "flex items-center justify-center gap-2 rounded-lg py-2 text-xs font-bold transition-all cursor-pointer press-feedback motion-control",
            isCompany
              ? "bg-background text-foreground shadow-xs ring-1 ring-border"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Building2 className="size-4 text-primary" />
          <span>{isAr ? "جهة / شركة اعتبارية" : "Company / Corporate"}</span>
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="fullName" className="text-xs font-bold text-foreground">
            {isAr ? (isCompany ? "اسم الجهة / الشركة" : "الاسم الكامل") : isCompany ? "Company Name" : "Full Name"}{" "}
            <span className="text-rose-500">*</span>
          </Label>
          <Input
            id="fullName"
            name="fullName"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            onBlur={() => setTouched((t) => ({ ...t, fullName: true }))}
            aria-invalid={Boolean(nameError)}
            placeholder={isAr ? (isCompany ? "مثال: شركة التطوير العقاري" : "مثال: أحمد محمد عبد الله") : isCompany ? "Riyadh Real Estate Co." : "Ahmed Mohamed"}
            required
            className="h-10 text-xs font-bold bg-background border-border"
          />
          {nameError && <p className="text-xs font-bold text-rose-600">{nameError}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email" className="text-xs font-bold text-foreground">
            {isAr ? "البريد الإلكتروني" : "Email Address"}
          </Label>
          <Input
            id="email"
            name="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            dir="ltr"
            placeholder="name@example.com"
            className="h-10 text-xs bg-background border-border"
          />
        </div>
      </div>

      {/* Phone numbers section */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-bold text-foreground">
            {isAr ? "أرقام الهاتف والتواصل" : "Phone Numbers"}
          </Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addPhone}
            className="h-7.5 gap-1.5 px-2.5 text-xs font-bold rounded-lg border-border hover:bg-muted text-foreground press-feedback motion-control"
          >
            <Plus className="size-3.5 text-primary" />
            <span>{isAr ? "إضافة رقم آخر" : "Add Number"}</span>
          </Button>
        </div>

        <div className="space-y-2.5">
          {phones.map((row, idx) => {
            const err = phoneError(row);
            const isPrimary = row.key === primaryKey;
            return (
              <div
                key={row.key}
                className={cn(
                  "rounded-xl border p-3 transition-all",
                  isPrimary
                    ? "border-primary/30 bg-primary/5 ring-1 ring-primary/10 shadow-2xs"
                    : "border-border bg-card hover:bg-muted/30",
                )}
              >
                <div className="flex items-start gap-3">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                    <Phone className="size-4" />
                  </div>
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex gap-2">
                      <Input
                        value={row.number}
                        onChange={(e) => updatePhone(row.key, { number: e.target.value })}
                        onBlur={() =>
                          setTouched((t) => ({ ...t, phones: new Set([...(t.phones ?? []), row.key]) }))
                        }
                        aria-invalid={Boolean(err)}
                        dir="ltr"
                        placeholder="+20 100 123 4567"
                        className="h-9.5 text-xs font-mono font-bold flex-1 bg-background border-border"
                      />
                      <Select value={row.label} onValueChange={(v) => updatePhone(row.key, { label: v as PhoneLabel })}>
                        <SelectTrigger className="h-9.5 w-32 shrink-0 text-xs font-bold bg-background border-border">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {PHONE_LABELS.map((l) => (
                            <SelectItem key={l} value={l} className="text-xs font-bold">
                              {isAr ? PHONE_LABEL_TEXT[l].ar : PHONE_LABEL_TEXT[l].en}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {err && <p className="text-xs font-bold text-rose-600">{err}</p>}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 pt-0.5">
                      <label className="flex items-center gap-1.5 text-xs font-medium text-foreground cursor-pointer">
                        <Checkbox
                          checked={row.whatsapp}
                          onCheckedChange={(checked) => updatePhone(row.key, { whatsapp: checked === true })}
                        />
                        <MessageCircle className="size-3.5 text-emerald-600" />
                        <span>{isAr ? "يستقبل رسائل واتساب" : "Receives WhatsApp"}</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => setPrimaryKey(row.key)}
                        className={cn(
                          "flex items-center gap-1 text-xs font-bold transition-colors cursor-pointer",
                          isPrimary ? "text-primary" : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        <Star className={cn("size-3.5", isPrimary && "fill-primary text-primary")} />
                        <span>{isPrimary ? (isAr ? "الرقم الأساسي" : "Primary number") : isAr ? "تعيين كأساسي" : "Make primary"}</span>
                      </button>
                    </div>
                  </div>
                  {phones.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removePhone(row.key)}
                      aria-label={isAr ? "حذف الرقم" : "Remove number"}
                      className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-rose-50 hover:text-rose-600 cursor-pointer"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  )}
                </div>
                {idx === 0 && phones.length === 1 && (
                  <p className="mt-1.5 ps-12 text-[11px] text-muted-foreground">
                    {isAr ? "اختياري — يمكن تعيين وإضافة أرقام الهاتف لاحقاً" : "Optional — phone numbers can be added later"}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {!state.ok && (
        <p role="alert" className="text-xs font-bold text-rose-700 bg-rose-50 p-3 rounded-xl border border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800">
          {state.error}
        </p>
      )}
      <div className="pt-2">
        <Button
          type="submit"
          disabled={pending}
          className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-bold h-10 rounded-xl shadow-xs gap-2 press-feedback motion-control cursor-pointer"
        >
          {pending && <Loader2 className="size-4 animate-spin" />}
          <span>{pending ? (isAr ? "جارٍ إضافة العضو..." : "Adding...") : isAr ? "حفظ وتأكيد إضافة العضو" : "Add Member"}</span>
        </Button>
      </div>
    </form>
  );
}
