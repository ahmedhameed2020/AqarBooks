"use client";

import { useState, useTransition } from "react";
import { AlertCircle, Send, TicketCheck } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createVisitorInvitationAction } from "@/lib/actions/visitors";
import { VisitorPassQr } from "../visitor-pass-qr";
import type { VisitorUsagePolicy } from "../visitor-labels";

export interface VisitorUnitOption {
  id: string;
  label: string;
  propertyName: string;
}

function toLocalInputValue(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fromLocalInputValue(value: string) {
  return new Date(value).toISOString();
}

export function NewVisitorInvitationForm({
  units,
  locale,
}: {
  units: VisitorUnitOption[];
  locale: "ar" | "en";
}) {
  const isAr = locale === "ar";
  const [unitId, setUnitId] = useState(units[0]?.id ?? "");
  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [guestNote, setGuestNote] = useState("");
  const [validFrom, setValidFrom] = useState(() => toLocalInputValue(new Date()));
  const [validUntil, setValidUntil] = useState(() => toLocalInputValue(new Date(Date.now() + 8 * 60 * 60 * 1000)));
  const [usagePolicy, setUsagePolicy] = useState<VisitorUsagePolicy>("SINGLE_USE");
  const [created, setCreated] = useState<{ invitationId: string; qrPayload: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    setError(null);
    setCreated(null);
    startTransition(async () => {
      const result = await createVisitorInvitationAction({
        unitId,
        guestName,
        guestPhone: guestPhone || undefined,
        guestNote: guestNote || undefined,
        validFrom: fromLocalInputValue(validFrom),
        validUntil: fromLocalInputValue(validUntil),
        usagePolicy,
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      setCreated({ invitationId: result.invitationId, qrPayload: result.qrPayload });
    });
  }

  return (
    <div className="space-y-5 rounded-2xl border border-border/70 bg-card p-4 shadow-2xs sm:p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
          <span>{isAr ? "الوحدة" : "Unit"}</span>
          <select
            value={unitId}
            onChange={(event) => setUnitId(event.target.value)}
            className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm"
          >
            {units.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.propertyName} · {unit.label}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
          <span>{isAr ? "سياسة الاستخدام" : "Usage"}</span>
          <select
            value={usagePolicy}
            onChange={(event) => setUsagePolicy(event.target.value as VisitorUsagePolicy)}
            className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm"
          >
            <option value="SINGLE_USE">{isAr ? "دخول واحد" : "Single use"}</option>
            <option value="MULTI_USE">{isAr ? "متعدد الاستخدام" : "Multi-use"}</option>
          </select>
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
          <span>{isAr ? "اسم الزائر" : "Guest name"}</span>
          <Input
            value={guestName}
            onChange={(event) => setGuestName(event.target.value)}
            maxLength={120}
            className="h-10 rounded-xl"
            placeholder={isAr ? "مثال: أحمد محمد" : "Example: Alex Morgan"}
          />
        </label>
        <label className="space-y-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
          <span>{isAr ? "هاتف الزائر (اختياري)" : "Guest phone (optional)"}</span>
          <Input
            value={guestPhone}
            onChange={(event) => setGuestPhone(event.target.value)}
            maxLength={40}
            className="h-10 rounded-xl"
            placeholder={isAr ? "اختياري" : "Optional"}
          />
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
          <span>{isAr ? "صالح من" : "Valid from"}</span>
          <Input type="datetime-local" value={validFrom} onChange={(event) => setValidFrom(event.target.value)} className="h-10 rounded-xl" />
        </label>
        <label className="space-y-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
          <span>{isAr ? "صالح حتى" : "Valid until"}</span>
          <Input type="datetime-local" value={validUntil} onChange={(event) => setValidUntil(event.target.value)} className="h-10 rounded-xl" />
        </label>
      </div>

      <label className="space-y-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
        <span>{isAr ? "ملاحظة للبوابة (اختياري)" : "Gate note (optional)"}</span>
        <textarea
          value={guestNote}
          onChange={(event) => setGuestNote(event.target.value)}
          maxLength={500}
          rows={3}
          className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm leading-relaxed outline-none transition-colors focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          placeholder={isAr ? "مثال: زيارة عائلية قصيرة" : "Example: Short family visit"}
        />
      </label>

      {error ? (
        <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-700">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <span>{isAr ? "تعذر إنشاء التصريح. راجع الوحدة ونافذة الصلاحية وحاول مرة أخرى." : "Could not create the pass. Check the unit and validity window, then try again."}</span>
        </div>
      ) : null}

      <div className="flex justify-end">
        <Button
          type="button"
          disabled={isPending || !unitId || guestName.trim().length === 0 || !validFrom || !validUntil}
          onClick={submit}
          className="h-10 gap-2 rounded-xl text-xs font-semibold"
        >
          <Send className="size-4" />
          {isAr ? "إنشاء التصريح" : "Create Pass"}
        </Button>
      </div>

      {created ? (
        <div className="space-y-3">
          <VisitorPassQr payload={created.qrPayload} locale={locale} />
          <Link
            href={`/portal/visitors/${created.invitationId}`}
            locale={locale}
            className={buttonVariants({ variant: "outline", size: "sm", className: "h-9 gap-2 rounded-xl text-xs font-semibold" })}
          >
            <TicketCheck className="size-4" />
            {isAr ? "فتح تفاصيل التصريح" : "Open Pass Details"}
          </Link>
        </div>
      ) : null}
    </div>
  );
}
