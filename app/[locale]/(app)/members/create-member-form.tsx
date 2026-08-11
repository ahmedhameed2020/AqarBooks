"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { createMemberAction } from "@/lib/actions/property";
import type { ActionResult } from "@/lib/actions/platform";

// Loose but real check: digits/spaces/+/- only, 7-20 chars. Rejects
// obviously-wrong input (letters, too short) without being a strict E.164
// validator -- phone formats vary too much across the region for that.
const PHONE_PATTERN = /^[0-9+\-\s]{7,20}$/;

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
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [touched, setTouched] = useState<{ fullName?: boolean; phone?: boolean }>({});

  const nameError = touched.fullName && !fullName.trim() ? (isAr ? "الاسم مطلوب" : "Name is required") : undefined;
  const phoneError =
    touched.phone && phone.trim() && !PHONE_PATTERN.test(phone.trim())
      ? isAr
        ? "رقم الهاتف غير صحيح"
        : "Invalid phone number"
      : undefined;

  useEffect(() => {
    if (wasPending.current && !pending && state.ok) {
      toast.add({ title: isAr ? "تمت إضافة العضو بنجاح" : "Member added successfully", type: "success" });
      onSuccess?.();
    }
    wasPending.current = pending;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, state]);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    setTouched({ fullName: true, phone: true });
    if (!fullName.trim() || (phone.trim() && !PHONE_PATTERN.test(phone.trim()))) {
      e.preventDefault();
    }
  }

  return (
    <form action={formAction} onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
      <input type="hidden" name="organizationId" value={organizationId} />
      <div className="space-y-1.5">
        <Label htmlFor="fullName">{isAr ? "الاسم" : "Full name"}</Label>
        <Input
          id="fullName"
          name="fullName"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          onBlur={() => setTouched((t) => ({ ...t, fullName: true }))}
          aria-invalid={Boolean(nameError)}
          required
        />
        {nameError && <p className="text-xs text-destructive">{nameError}</p>}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="email">{isAr ? "البريد" : "Email"}</Label>
        <Input id="email" name="email" type="email" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="phone">{isAr ? "الهاتف" : "Phone"}</Label>
        <Input
          id="phone"
          name="phone"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          onBlur={() => setTouched((t) => ({ ...t, phone: true }))}
          aria-invalid={Boolean(phoneError)}
        />
        {phoneError && <p className="text-xs text-destructive">{phoneError}</p>}
      </div>
      {!state.ok && (
        <p role="alert" className="text-sm text-destructive sm:col-span-2">
          {state.error}
        </p>
      )}
      <div className="sm:col-span-2">
        <Button type="submit" disabled={pending} className="w-full">
          {pending && <Loader2 className="size-3.5 animate-spin" />}
          {pending ? (isAr ? "جارٍ الإضافة…" : "Adding…") : isAr ? "إضافة عضو" : "Add member"}
        </Button>
      </div>
    </form>
  );
}
