"use client";

import { useMemo, useState, useTransition } from "react";
import { Check, Copy, KeyRound, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { createGateDeviceEnrollmentAction } from "@/lib/actions/gate-devices";

export type EnrollmentGateOption = {
  id: string;
  label: string;
  directionMode: "ENTRY" | "EXIT" | "BOTH";
  isActive: boolean;
};

type EnrollmentResult = {
  enrollmentId: string;
  code: string;
  expiresAt: string;
};

function actionError(error: string, isAr: boolean) {
  const messages: Record<string, [string, string]> = {
    forbidden: ["ليس لديك صلاحية تسجيل الأجهزة.", "You do not have permission to enroll devices."],
    not_found: ["تعذر العثور على البوابة.", "The gate could not be found."],
    invalid_direction: ["الاتجاه غير متوافق مع البوابة.", "The direction is not compatible with this gate."],
    invalid_input: ["تحقق من البوابة والاتجاه.", "Check the gate and direction."],
  };
  const message = messages[error] ?? ["تعذر إنشاء رمز التسجيل.", "Could not create the enrollment code."];
  return isAr ? message[0] : message[1];
}

export function DeviceEnrollmentDialog({
  gates,
  locale,
  disabled = false,
}: {
  gates: EnrollmentGateOption[];
  locale: "ar" | "en";
  disabled?: boolean;
}) {
  const isAr = locale === "ar";
  const activeGates = useMemo(() => gates.filter((gate) => gate.isActive), [gates]);
  const [open, setOpen] = useState(false);
  const [gateId, setGateId] = useState(activeGates[0]?.id ?? "");
  const [direction, setDirection] = useState<"ENTRY" | "EXIT" | "BOTH">(
    activeGates[0]?.directionMode ?? "BOTH",
  );
  const [result, setResult] = useState<EnrollmentResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<"code" | "id" | null>(null);
  const [isPending, startTransition] = useTransition();
  const activeGateSignature = activeGates
    .map((gate) => `${gate.id}:${gate.directionMode}`)
    .join("|");
  const [previousActiveGateSignature, setPreviousActiveGateSignature] = useState(activeGateSignature);

  if (previousActiveGateSignature !== activeGateSignature) {
    const nextGate = activeGates.find((gate) => gate.id === gateId) ?? activeGates[0];
    const nextGateId = nextGate?.id ?? "";
    const nextDirection = nextGate?.directionMode ?? "BOTH";

    setPreviousActiveGateSignature(activeGateSignature);
    setGateId(nextGateId);
    setDirection(nextDirection);
  }

  const selectedGate = activeGates.find((gate) => gate.id === gateId);
  const directions = selectedGate?.directionMode === "BOTH"
    ? (["BOTH", "ENTRY", "EXIT"] as const)
    : selectedGate
      ? ([selectedGate.directionMode] as const)
      : ([] as const);

  function changeOpen(next: boolean) {
    setOpen(next);
    if (!next) {
      setResult(null);
      setError(null);
      setCopied(null);
    }
  }

  function changeGate(nextGateId: string) {
    const gate = activeGates.find((item) => item.id === nextGateId);
    setGateId(nextGateId);
    setDirection(gate?.directionMode ?? "BOTH");
    setError(null);
  }

  function createEnrollment() {
    setError(null);
    startTransition(async () => {
      const response = await createGateDeviceEnrollmentAction({ gateId, direction });
      if (!response.ok) {
        setError(actionError(response.error, isAr));
        return;
      }
      setResult({
        enrollmentId: response.enrollmentId,
        code: response.code,
        expiresAt: response.expiresAt,
      });
    });
  }

  async function copy(value: string, field: "code" | "id") {
    await navigator.clipboard?.writeText(value);
    setCopied(field);
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger
        disabled={disabled || activeGates.length === 0}
        render={
          <Button type="button" size="sm" className="h-9 gap-2 rounded-xl">
            <Plus className="size-4" />
            {isAr ? "تسجيل جهاز" : "Enroll device"}
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <div>
            <DialogTitle>{isAr ? "تسجيل ماسح بوابة" : "Enroll gate scanner"}</DialogTitle>
            <DialogDescription>
              {isAr
                ? "أنشئ رمزًا صالحًا لمرة واحدة ولمدة 15 دقيقة."
                : "Create a single-use code that expires in 15 minutes."}
            </DialogDescription>
          </div>
        </DialogHeader>
        <DialogBody className="space-y-4">
          {result ? (
            <div className="space-y-4">
              <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
                <div className="flex items-center gap-2 text-sm font-black">
                  <KeyRound className="size-4" />
                  {isAr ? "احفظ الرمز الآن" : "Save this code now"}
                </div>
                <p className="mt-2 text-xs leading-relaxed">
                  {isAr
                    ? "لن يظهر الرمز الخام مرة أخرى بعد إغلاق هذه النافذة. لا يخزن AqarBooks سوى بصمته المشفرة."
                    : "The raw code will not be shown again after this dialog closes. AqarBooks stores only its digest."}
                </p>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-bold text-slate-500">{isAr ? "رمز التسجيل" : "Enrollment code"}</p>
                <div className="flex gap-2">
                  <code className="min-w-0 flex-1 overflow-x-auto rounded-xl bg-slate-950 p-3 text-xs text-white">
                    {result.code}
                  </code>
                  <Button type="button" variant="outline" size="icon" onClick={() => copy(result.code, "code")} aria-label={isAr ? "نسخ رمز التسجيل" : "Copy enrollment code"}>
                    {copied === "code" ? <Check className="size-4 text-emerald-600" /> : <Copy className="size-4" />}
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-bold text-slate-500">{isAr ? "معرف التسجيل" : "Enrollment ID"}</p>
                <div className="flex gap-2">
                  <code className="min-w-0 flex-1 overflow-x-auto rounded-xl bg-muted p-3 text-xs">{result.enrollmentId}</code>
                  <Button type="button" variant="outline" size="icon" onClick={() => copy(result.enrollmentId, "id")} aria-label={isAr ? "نسخ معرف التسجيل" : "Copy enrollment ID"}>
                    {copied === "id" ? <Check className="size-4 text-emerald-600" /> : <Copy className="size-4" />}
                  </Button>
                </div>
              </div>

              <p className="text-xs text-slate-500">
                {isAr ? "ينتهي في" : "Expires"}: {new Intl.DateTimeFormat(isAr ? "ar-QA" : "en-QA", { dateStyle: "medium", timeStyle: "short" }).format(new Date(result.expiresAt))}
              </p>
            </div>
          ) : (
            <>
              <label className="block space-y-1.5 text-xs font-bold text-slate-600 dark:text-slate-300">
                <span>{isAr ? "البوابة" : "Gate"}</span>
                <select value={gateId} onChange={(event) => changeGate(event.target.value)} className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm">
                  {activeGates.map((gate) => <option key={gate.id} value={gate.id}>{gate.label}</option>)}
                </select>
              </label>
              <label className="block space-y-1.5 text-xs font-bold text-slate-600 dark:text-slate-300">
                <span>{isAr ? "الاتجاه المسموح" : "Allowed direction"}</span>
                <select value={direction} onChange={(event) => setDirection(event.target.value as typeof direction)} className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm">
                  {directions.map((value) => (
                    <option key={value} value={value}>
                      {value === "BOTH" ? (isAr ? "دخول وخروج" : "Entry and exit") : value === "ENTRY" ? (isAr ? "دخول" : "Entry") : (isAr ? "خروج" : "Exit")}
                    </option>
                  ))}
                </select>
              </label>
              {error ? <p role="alert" className="text-sm font-semibold text-destructive">{error}</p> : null}
            </>
          )}
        </DialogBody>
        <DialogFooter>
          {result ? (
            <Button type="button" onClick={() => changeOpen(false)}>{isAr ? "تم الحفظ" : "I saved it"}</Button>
          ) : (
            <Button type="button" onClick={createEnrollment} disabled={isPending || !gateId}>
              {isPending ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}
              {isPending ? (isAr ? "جارٍ الإنشاء" : "Creating") : (isAr ? "إنشاء الرمز" : "Create code")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
