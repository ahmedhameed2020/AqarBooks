"use client";

import { useEffect, useEffectEvent, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Camera, CheckCircle2, Keyboard, ScanQrCode, ShieldAlert, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { redeemGateDeviceEnrollmentAction } from "@/lib/actions/gate-devices";
import { clearGateDevice, readGateDevice, readGateInstallationId, saveGateDevice } from "@/lib/gates/device-store";
import { useGateScanner } from "@/app/[locale]/(app)/operations/gate/use-gate-scanner";
import { readScannerPreferences, saveScannerPreferences, scannerCapabilities, type ScannerPreferences } from "@/lib/gates/scanner-preferences";
import { fingerprintQrPayload } from "@/lib/gates/scanner-feedback";

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

export interface GateScannerDevice {
  id: string;
  gate: GateScannerGate;
  allowedDirection: "ENTRY" | "EXIT" | "BOTH";
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
  requestedDeviceId,
  device,
  recentEvents,
  locale,
}: {
  requestedDeviceId: string | null;
  device: GateScannerDevice | null;
  recentEvents: GateScannerEvent[];
  locale: "ar" | "en";
}) {
  const isAr = locale === "ar";
  const pathname = usePathname();
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const detectorRef = useRef<InstanceType<NonNullable<typeof window.BarcodeDetector>> | null>(null);
  // Presence is independent of the request cooldown. A stationary code must
  // never submit again merely because time passed or a response arrived.
  const visiblePayloadRef = useRef<string | null>(null);
  const detectingRef = useRef(false);
  const [manualFallback, setManualFallback] = useState(false);
  const [replacingDevice, setReplacingDevice] = useState(false);
  const [deviceCredential, setDeviceCredential] = useState("");
  const [enrollmentId, setEnrollmentId] = useState("");
  const [enrollmentCode, setEnrollmentCode] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [enrollmentError, setEnrollmentError] = useState<string | null>(null);
  const [direction, setDirection] = useState<"ENTRY" | "EXIT">(
    device?.allowedDirection === "EXIT" ? "EXIT" : "ENTRY",
  );
  const [manualPayload, setManualPayload] = useState("");
  const [cameraState, setCameraState] = useState<"idle" | "starting" | "active" | "unsupported" | "denied">("idle");
  const [isEnrollmentPending, startTransition] = useTransition();
  const [preferences, setPreferences] = useState<ScannerPreferences>({ mutedAudio: true, vibrationDisabled: true, reducedMotion: true });
  const [capabilities, setCapabilities] = useState({ audio: false, vibration: false, reducedMotion: false });
  useEffect(() => {
    let cancelled = false;
    // Hydrate browser-only preferences after the server-compatible initial render.
    queueMicrotask(() => {
      if (cancelled) return;
      setPreferences(readScannerPreferences());
      setCapabilities(scannerCapabilities());
    });
    const query = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const updateMotion = () => setCapabilities(scannerCapabilities());
    query?.addEventListener?.("change", updateMotion);
    return () => {
      cancelled = true;
      query?.removeEventListener?.("change", updateMotion);
    };
  }, []);
  function updatePreference(key: keyof ScannerPreferences, checked: boolean) {
    const next = { ...preferences, [key]: checked };
    setPreferences(next);
    saveScannerPreferences(next);
  }
  const scanner = useGateScanner({
    ...preferences,
    reducedMotion: preferences.reducedMotion || capabilities.reducedMotion,
    deviceId: device?.id ?? null,
    deviceCredential,
    gateId: device?.gate.id ?? null,
    direction,
    onAuthorizationFailure: () => {
      void clearGateDevice().catch(() => undefined).then(() => {
        setDeviceCredential("");
        router.replace(pathname);
      });
    },
  });
  const { result } = scanner;
  const isPending = isEnrollmentPending || scanner.isPending;

  useEffect(() => {
    let cancelled = false;

    async function hydrateDevice() {
      const storedDevice = await readGateDevice();
      if (cancelled || !storedDevice) return;

      if (!requestedDeviceId) {
        router.replace(`${pathname}?deviceId=${encodeURIComponent(storedDevice.deviceId)}`);
        return;
      }

      const bindingMatches = device
        && requestedDeviceId === storedDevice.deviceId
        && device.id === storedDevice.deviceId
        && device.gate.id === storedDevice.gateId
        && device.allowedDirection === storedDevice.allowedDirection;

      if (!bindingMatches) {
        await clearGateDevice().catch(() => undefined);
        if (!cancelled) {
          setDeviceCredential("");
          router.replace(pathname);
        }
        return;
      }

      setDeviceCredential(storedDevice.deviceCredential);
    }

    void hydrateDevice();
    return () => {
      cancelled = true;
    };
  }, [device, pathname, requestedDeviceId, router]);

  const pollForQrCode = useEffectEvent(async () => {
    if (!deviceCredential || !device || !detectorRef.current || !videoRef.current || videoRef.current.readyState < 2 || scanner.isPending || detectingRef.current) return;
    detectingRef.current = true;
    try {
      const detected = await detectorRef.current.detect(videoRef.current);
      const first = detected[0]?.rawValue;
      if (!first) visiblePayloadRef.current = null;
      else {
        const fingerprint = await fingerprintQrPayload(first);
        if (fingerprint !== visiblePayloadRef.current) {
          visiblePayloadRef.current = fingerprint;
          await scanner.submitScan(first);
        }
      }
    } catch {
      setCameraState("unsupported");
    } finally {
      detectingRef.current = false;
    }
  });

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
        if (stopped) { stream.getTracks().forEach((track) => track.stop()); return; }
        if (!videoRef.current) return;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setCameraState("active");
      } catch {
        setCameraState("denied");
      }
    }

    startCamera();

    const timer = window.setInterval(() => {
      if (!stopped) void pollForQrCode();
    }, 1200);

    return () => {
      stopped = true;
      window.clearInterval(timer);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  async function submitManualScan() {
    const payload = manualPayload;
    setManualPayload("");
    await scanner.submitScan(payload);
  }

  function enrollDevice() {
    if (!enrollmentId || !enrollmentCode || !displayName.trim() || isPending) return;

    setEnrollmentError(null);
    startTransition(async () => {
      const previous = await readGateDevice();
      const enrollment = await redeemGateDeviceEnrollmentAction({
        installationId: previous?.installationId ?? await readGateInstallationId(),
        enrollmentId,
        code: enrollmentCode,
        displayName,
      });
      if (!enrollment.ok) {
        setEnrollmentError(enrollment.error);
        return;
      }

      try {
        await saveGateDevice({
          deviceId: enrollment.deviceId,
          gateId: enrollment.gateId,
          allowedDirection: enrollment.allowedDirection,
          installationId: enrollment.installationId,
          deviceCredential: enrollment.deviceCredential,
        });
      } catch {
        setEnrollmentError("storage_unavailable");
        return;
      }

      setEnrollmentCode("");
      setReplacingDevice(false);
      setDeviceCredential("");
      router.replace(`${pathname}?deviceId=${encodeURIComponent(enrollment.deviceId)}`);
      if (previous?.deviceId === enrollment.deviceId) router.refresh();
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
              {device?.gate.propertyName ?? (isAr ? "الجهاز غير مسجل" : "Device not enrolled")}
            </Badge>
          </div>

          <div className="grid gap-4 p-4 lg:grid-cols-[.9fr_1.1fr]">
            <div className="space-y-3">
              <div className="rounded-xl border border-white/15 bg-white/10 px-3 py-2">
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{isAr ? "البوابة المرتبطة" : "Bound gate"}</p>
                <p className="text-sm font-black text-white">
                  {device ? `${device.gate.name} · ${device.gate.code}` : (isAr ? "افتح رابط الجهاز المسجل" : "Open this scanner from its enrolled device link")}
                </p>
              </div>

              {deviceCredential ? <Button type="button" variant="outline" onClick={() => setReplacingDevice(!replacingDevice)}>{isAr ? "إعادة تسجيل الجهاز" : "Re-enroll device"}</Button> : null}
              {!deviceCredential || replacingDevice ? (
                <div className="space-y-2 rounded-xl border border-amber-300/30 bg-amber-300/10 p-3">
                  <p className="text-xs font-black text-amber-100">
                    {isAr ? "تسجيل هذا الجهاز" : "Enroll this device"}
                  </p>
                  <Input
                    name="enrollmentId"
                    aria-label={isAr ? "معرّف التسجيل" : "Enrollment ID"}
                    autoComplete="off"
                    value={enrollmentId}
                    onChange={(event) => setEnrollmentId(event.target.value)}
                    placeholder={isAr ? "معرّف التسجيل" : "Enrollment ID"}
                    className="h-10 rounded-xl border-white/15 bg-white/10 text-white placeholder:text-slate-400"
                  />
                  <Input
                    name="enrollmentCode"
                    aria-label={isAr ? "رمز التسجيل" : "Enrollment code"}
                    type="password"
                    autoComplete="off"
                    value={enrollmentCode}
                    onChange={(event) => setEnrollmentCode(event.target.value)}
                    placeholder={isAr ? "رمز التسجيل" : "Enrollment code"}
                    className="h-10 rounded-xl border-white/15 bg-white/10 text-white placeholder:text-slate-400"
                  />
                  <Input
                    name="displayName"
                    aria-label={isAr ? "اسم الجهاز" : "Device name"}
                    autoComplete="off"
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                    placeholder={isAr ? "اسم الجهاز" : "Device name"}
                    className="h-10 rounded-xl border-white/15 bg-white/10 text-white placeholder:text-slate-400"
                  />
                  {enrollmentError ? (
                    <p className="text-xs font-bold text-rose-200">
                      {isAr ? "تعذر تسجيل الجهاز. اطلب رمزاً جديداً." : "Device enrollment failed. Request a new code."}
                    </p>
                  ) : null}
                  <Button
                    type="button"
                    disabled={!enrollmentId || !enrollmentCode || !displayName.trim() || isPending}
                    onClick={enrollDevice}
                    className="h-10 w-full rounded-xl"
                  >
                    {isAr ? "تسجيل الجهاز" : "Enroll device"}
                  </Button>
                </div>
              ) : null}

              <fieldset className="rounded-xl border border-white/15 p-3">
                <legend className="px-1 text-xs font-bold">{isAr ? "تفضيلات التنبيه" : "Feedback preferences"}</legend>
                {([
                  ["mutedAudio", isAr ? "كتم الصوت" : "Mute audio", !capabilities.audio],
                  ["vibrationDisabled", isAr ? "إيقاف الاهتزاز" : "Disable vibration", !capabilities.vibration],
                  ["reducedMotion", isAr ? "تقليل الحركة" : "Reduce motion", capabilities.reducedMotion],
                ] as const).map(([key, label, disabled]) => (
                  <label key={key} className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
                    <input type="checkbox" name={key} checked={key === "reducedMotion" ? preferences[key] || capabilities.reducedMotion : preferences[key]} disabled={disabled} onChange={(event) => updatePreference(key, event.target.checked)} className="size-5 accent-emerald-400 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white" />
                    <span>{label}{disabled ? <span className="ms-2 text-xs text-slate-300">{key === "reducedMotion" ? (isAr ? "حسب إعداد النظام" : "System setting") : (isAr ? "غير متاح" : "Unavailable")}</span> : null}</span>
                  </label>
                ))}
              </fieldset>

              <div className="grid grid-cols-2 gap-2">
                {(["ENTRY", "EXIT"] as const).map((item) => (
                  <Button
                    key={item}
                    type="button"
                    variant={direction === item ? "secondary" : "outline"}
                    onClick={() => setDirection(item)}
                    disabled={!device || (device.allowedDirection !== "BOTH" && device.allowedDirection !== item)}
                    className="h-12 rounded-xl"
                  >
                    {item === "ENTRY" ? (isAr ? "دخول" : "Entry") : isAr ? "خروج" : "Exit"}
                  </Button>
                ))}
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                <Button type="button" variant="outline" aria-expanded={manualFallback} onClick={() => setManualFallback(!manualFallback)}>{isAr ? "إدخال يدوي" : "Manual fallback"}</Button>
                {manualFallback ? <>
                <div className="mb-2 flex items-center gap-2 text-xs font-bold text-slate-200">
                  <Keyboard className="size-4" />
                  {isAr ? "إدخال يدوي" : "Manual fallback"}
                </div>
                <div className="flex gap-2">
                  <Input
                    value={manualPayload}
                    aria-label={isAr ? "رمز تصريح الزائر" : "Visitor pass QR payload"}
                    onChange={(event) => setManualPayload(event.target.value)}
                    placeholder="AQP1..."
                    className="h-11 rounded-xl border-white/15 bg-white/10 text-white placeholder:text-slate-400"
                  />
                  <Button type="button" disabled={!manualPayload || !device || !deviceCredential || isPending} onClick={() => void submitManualScan()} className="h-11 rounded-xl">
                    {isAr ? "تحقق" : "Scan"}
                  </Button>
                </div>
                </> : null}
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

              <div aria-live="assertive" className={`rounded-2xl border p-4 ${resultOk ? "border-emerald-300 bg-emerald-50 text-emerald-950" : result?.ok ? "border-rose-300 bg-rose-50 text-rose-950" : result?.error === "unverified_offline" ? "border-amber-300 bg-amber-50 text-amber-950" : "border-white/10 bg-white/5 text-white"}`}>
                <div className="flex items-center gap-3">
                  {resultOk ? <CheckCircle2 className="size-10" /> : result?.ok ? <XCircle className="size-10" /> : result?.error === "unverified_offline" ? <ShieldAlert className="size-10" /> : <ScanQrCode className="size-10" />}
                  <div>
                    <p className="text-2xl font-black">
                      {resultOk ? (isAr ? "مسموح" : "ALLOW") : result?.ok ? (isAr ? "مرفوض" : "DENY") : result?.error === "unverified_offline" ? (isAr ? "غير متحقق — غير متصل" : "UNVERIFIED — OFFLINE") : isAr ? "في انتظار المسح" : "Ready to scan"}
                    </p>
                    <p className="text-sm font-semibold">
                      {result?.ok ? (resultReason ? (isAr ? resultReason.ar : resultReason.en) : result.reasonCode) : result?.error === "unverified_offline" ? (isAr ? "لم يصدر قرار دخول. تحقق يدوياً مع المشرف." : "No access decision was issued. Verify manually with a supervisor.") : isAr ? "وجه الكود داخل الإطار أو استخدم الإدخال اليدوي." : "Place the QR in frame or use manual input."}
                    </p>
                    {result?.ok && result.guestName ? (
                      <p className="mt-1 text-xs">{result.guestName} · {result.invitationNo ?? ""}</p>
                    ) : null}
                    {resultOk ? <p className="mt-2 text-sm font-bold">{isAr ? "الدخول معتمد — فتح الحاجز غير مؤكد" : "Access approved — barrier not confirmed"}<span className="block text-xs">{result?.ok ? result.hardwareStatus : null}</span></p> : null}
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
