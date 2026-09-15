"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Camera, CheckCircle2, Keyboard, ScanQrCode, ShieldAlert, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { processVisitorGateScanAction, type GateScanResult } from "@/lib/actions/gates";

declare global {
  interface Window {
    BarcodeDetector?: new (options?: { formats?: string[] }) => {
      detect(source: CanvasImageSource): Promise<Array<{ rawValue: string }>>;
    };
  }
}

export interface GateScannerGate {
  id: string;
  code: string;
  name: string;
  directionMode: "ENTRY" | "EXIT" | "BOTH";
  propertyName: string;
}

export interface GateScannerEvent {
  id: string;
  decision: "ALLOW" | "DENY";
  reasonCode: string;
  direction: "ENTRY" | "EXIT";
  guestName: string | null;
  invitationNo: string | null;
  gateName: string;
  occurredAt: string;
}

const REASON_LABELS: Record<string, { ar: string; en: string }> = {
  VALID_ENTRY: { ar: "دخول مسموح", en: "Entry allowed" },
  VALID_EXIT: { ar: "خروج مسموح", en: "Exit allowed" },
  PASS_ALREADY_USED: { ar: "التصريح مستخدم من قبل", en: "Pass already used" },
  ALREADY_INSIDE: { ar: "الزائر بالداخل بالفعل", en: "Already inside" },
  NOT_INSIDE: { ar: "لا يوجد دخول مسجل", en: "Not inside" },
  EXPIRED: { ar: "التصريح منتهي", en: "Pass expired" },
  NOT_YET_VALID: { ar: "التصريح لم يبدأ بعد", en: "Not yet valid" },
  REVOKED: { ar: "التصريح ملغي", en: "Pass revoked" },
  INVALID_PASS: { ar: "تصريح غير صالح", en: "Invalid pass" },
  PROPERTY_MISMATCH: { ar: "التصريح لعقار آخر", en: "Wrong property" },
  GATE_INACTIVE: { ar: "البوابة غير مفعلة", en: "Gate inactive" },
  DIRECTION_NOT_ALLOWED: { ar: "اتجاه غير مسموح", en: "Direction not allowed" },
  FEATURE_DISABLED: { ar: "ميزة الزوار غير مفعلة", en: "Feature disabled" },
};

export function GateScannerClient({
  gates,
  recentEvents,
  locale,
}: {
  gates: GateScannerGate[];
  recentEvents: GateScannerEvent[];
  locale: "ar" | "en";
}) {
  const isAr = locale === "ar";
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const detectorRef = useRef<InstanceType<NonNullable<typeof window.BarcodeDetector>> | null>(null);
  const [selectedGateId, setSelectedGateId] = useState(gates[0]?.id ?? "");
  const [direction, setDirection] = useState<"ENTRY" | "EXIT">("ENTRY");
  const [manualPayload, setManualPayload] = useState("");
  const [cameraState, setCameraState] = useState<"idle" | "starting" | "active" | "unsupported" | "denied">("idle");
  const [result, setResult] = useState<GateScanResult | null>(null);
  const [isPending, startTransition] = useTransition();

  const selectedGate = useMemo(
    () => gates.find((gate) => gate.id === selectedGateId),
    [gates, selectedGateId],
  );

  useEffect(() => {
    let stream: MediaStream | null = null;
    let stopped = false;

    async function startCamera() {
      if (!window.BarcodeDetector || !navigator.mediaDevices?.getUserMedia) {
        setCameraState("unsupported");
        return;
      }

      setCameraState("starting");
      try {
        detectorRef.current = new window.BarcodeDetector({ formats: ["qr_code"] });
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (!videoRef.current) return;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setCameraState("active");
      } catch {
        setCameraState("denied");
      }
    }

    startCamera();

    const timer = window.setInterval(async () => {
      if (stopped || !detectorRef.current || !videoRef.current || videoRef.current.readyState < 2 || isPending) return;
      try {
        const detected = await detectorRef.current.detect(videoRef.current);
        const first = detected[0]?.rawValue;
        if (first) submitScan(first);
      } catch {
        setCameraState("unsupported");
      }
    }, 1200);

    return () => {
      stopped = true;
      window.clearInterval(timer);
      stream?.getTracks().forEach((track) => track.stop());
    };
    // Scanner polling intentionally reads the latest selected gate/direction through submitScan.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function submitScan(qrPayload: string) {
    if (!selectedGateId || isPending) return;
    startTransition(async () => {
      const scanResult = await processVisitorGateScanAction({
        gateId: selectedGateId,
        qrPayload,
        direction,
        clientScanId: crypto.randomUUID(),
      });
      setResult(scanResult);
      if (scanResult.ok) setManualPayload("");
    });
  }

  const resultOk = result?.ok ? result.decision === "ALLOW" : false;
  const resultReason = result?.ok ? REASON_LABELS[result.reasonCode] : null;

  return (
    <div className="space-y-5 pb-12">
      <div className="grid gap-4 xl:grid-cols-[1.2fr_.8fr]">
        <section className="overflow-hidden rounded-2xl border border-border/70 bg-slate-950 text-white shadow-lg">
          <div className="flex flex-col gap-3 border-b border-white/10 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-black tracking-tight">{isAr ? "ماسح البوابة" : "Gate Scanner"}</h1>
              <p className="text-xs font-medium text-slate-300">
                {isAr ? "تحقق آمن من تصاريح الزوار مع تسجيل كل قرار." : "Secure visitor pass validation with an immutable decision log."}
              </p>
            </div>
            <Badge variant="outline" className="w-fit border-emerald-400/50 bg-emerald-400/10 text-emerald-100">
              {selectedGate?.propertyName ?? (isAr ? "لا توجد بوابة" : "No gate")}
            </Badge>
          </div>

          <div className="grid gap-4 p-4 lg:grid-cols-[.9fr_1.1fr]">
            <div className="space-y-3">
              <label className="space-y-1 text-xs font-bold text-slate-200">
                <span>{isAr ? "البوابة" : "Gate"}</span>
                <select
                  value={selectedGateId}
                  onChange={(event) => setSelectedGateId(event.target.value)}
                  className="h-11 w-full rounded-xl border border-white/15 bg-white/10 px-3 text-sm text-white"
                >
                  {gates.map((gate) => (
                    <option key={gate.id} value={gate.id} className="text-slate-950">
                      {gate.name} · {gate.code}
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid grid-cols-2 gap-2">
                {(["ENTRY", "EXIT"] as const).map((item) => (
                  <Button
                    key={item}
                    type="button"
                    variant={direction === item ? "secondary" : "outline"}
                    onClick={() => setDirection(item)}
                    className="h-12 rounded-xl"
                  >
                    {item === "ENTRY" ? (isAr ? "دخول" : "Entry") : isAr ? "خروج" : "Exit"}
                  </Button>
                ))}
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                <div className="mb-2 flex items-center gap-2 text-xs font-bold text-slate-200">
                  <Keyboard className="size-4" />
                  {isAr ? "إدخال يدوي" : "Manual fallback"}
                </div>
                <div className="flex gap-2">
                  <Input
                    value={manualPayload}
                    onChange={(event) => setManualPayload(event.target.value)}
                    placeholder="AQP1..."
                    className="h-11 rounded-xl border-white/15 bg-white/10 text-white placeholder:text-slate-400"
                  />
                  <Button type="button" disabled={!manualPayload || !selectedGateId || isPending} onClick={() => submitScan(manualPayload)} className="h-11 rounded-xl">
                    {isAr ? "تحقق" : "Scan"}
                  </Button>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-white/10 bg-black">
                <video ref={videoRef} muted playsInline className="size-full object-cover" />
                <div className="pointer-events-none absolute inset-8 rounded-2xl border-2 border-white/70 shadow-[0_0_0_999px_rgba(0,0,0,.35)]" />
                <div className="absolute start-3 top-3 flex items-center gap-2 rounded-full bg-black/60 px-3 py-1 text-[11px] font-bold">
                  <Camera className="size-3.5" />
                  {cameraState === "active"
                    ? isAr ? "الكاميرا تعمل" : "Camera active"
                    : cameraState === "denied"
                    ? isAr ? "الكاميرا غير متاحة" : "Camera unavailable"
                    : cameraState === "unsupported"
                    ? isAr ? "استخدم الإدخال اليدوي" : "Use manual input"
                    : isAr ? "جار التجهيز" : "Preparing"}
                </div>
              </div>

              <div className={`rounded-2xl border p-4 ${resultOk ? "border-emerald-300 bg-emerald-50 text-emerald-950" : result?.ok ? "border-rose-300 bg-rose-50 text-rose-950" : "border-white/10 bg-white/5 text-white"}`}>
                <div className="flex items-center gap-3">
                  {resultOk ? <CheckCircle2 className="size-10" /> : result?.ok ? <XCircle className="size-10" /> : <ScanQrCode className="size-10" />}
                  <div>
                    <p className="text-2xl font-black">
                      {resultOk ? (isAr ? "مسموح" : "ALLOW") : result?.ok ? (isAr ? "مرفوض" : "DENY") : isAr ? "في انتظار المسح" : "Ready to scan"}
                    </p>
                    <p className="text-sm font-semibold">
                      {result?.ok ? (resultReason ? (isAr ? resultReason.ar : resultReason.en) : result.reasonCode) : isAr ? "وجه الكود داخل الإطار أو استخدم الإدخال اليدوي." : "Place the QR in frame or use manual input."}
                    </p>
                    {result?.ok && result.guestName ? (
                      <p className="mt-1 text-xs">{result.guestName} · {result.invitationNo ?? ""}</p>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-border/70 bg-card p-4">
          <div className="mb-3 flex items-center gap-2">
            <ShieldAlert className="size-4 text-slate-500" />
            <h2 className="text-sm font-black text-slate-950 dark:text-white">{isAr ? "آخر قرارات البوابة" : "Recent decisions"}</h2>
          </div>
          <div className="space-y-2">
            {recentEvents.length === 0 ? (
              <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500 dark:bg-slate-900">{isAr ? "لا توجد قرارات بعد" : "No gate decisions yet"}</p>
            ) : recentEvents.map((event) => {
              const reason = REASON_LABELS[event.reasonCode];
              return (
                <div key={event.id} className="rounded-xl border border-border/70 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-bold text-slate-950 dark:text-white">{event.guestName ?? event.invitationNo ?? (isAr ? "تصريح غير معروف" : "Unknown pass")}</p>
                    <Badge variant="outline" className={event.decision === "ALLOW" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-rose-50 text-rose-700"}>
                      {event.decision}
                    </Badge>
                  </div>
                  <p className="text-xs text-slate-500">{event.gateName} · {event.direction} · {reason ? (isAr ? reason.ar : reason.en) : event.reasonCode}</p>
                  <p className="text-[11px] text-slate-400">{new Date(event.occurredAt).toLocaleString(isAr ? "ar-EG" : "en-US")}</p>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
