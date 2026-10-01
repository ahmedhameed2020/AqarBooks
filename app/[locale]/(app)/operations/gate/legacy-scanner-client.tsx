"use client";
import { useEffect, useEffectEvent, useRef, useState, useTransition } from "react";
import { processLegacyVisitorGateScanAction, type GateScanResult } from "@/lib/actions/gates";
import { Button } from "@/components/ui/button";
import { fingerprintQrPayload } from "@/lib/gates/scanner-feedback";

export function LegacyGateScannerClient({ gates, isAr }: {
  gates: { id: string; label: string; directionMode: "ENTRY" | "EXIT" | "BOTH" }[]; isAr: boolean;
}) {
  const [gateId, setGateId] = useState(gates[0]?.id ?? "");
  const [direction, setDirection] = useState<"ENTRY" | "EXIT">(gates[0]?.directionMode === "EXIT" ? "EXIT" : "ENTRY");
  const [payload, setPayload] = useState("");
  const [result, setResult] = useState<GateScanResult | null>(null);
  const [pending, startTransition] = useTransition();
  const inFlight = useRef(false);
  const gate = gates.find((item) => item.id === gateId);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [cameraStatus, setCameraStatus] = useState("");
  function submit(qrPayload: string) {
    if (inFlight.current || !gateId || !qrPayload.trim()) return;
    inFlight.current = true;
    setPayload(""); setResult(null);
    startTransition(async () => {
      try { setResult(await processLegacyVisitorGateScanAction({ gateId, direction, qrPayload, clientScanId: crypto.randomUUID() })); }
      catch { setResult({ ok: false, error: "failed" }); }
      finally { inFlight.current = false; }
    });
  }
  const submitCamera = useEffectEvent((value: string) => submit(value));
  useEffect(() => {
    let stopped = false, detecting = false;
    let stream: MediaStream | null = null;
    let visible: string | null = null;
    let detector: InstanceType<NonNullable<typeof window.BarcodeDetector>> | null = null;
    async function start() {
      try {
        if (!window.BarcodeDetector || !navigator.mediaDevices?.getUserMedia) throw Error("unsupported");
        detector = new window.BarcodeDetector({ formats: ["qr_code"] });
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (stopped) { stream.getTracks().forEach((track) => track.stop()); return; }
        if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
      } catch { if (!stopped) setCameraStatus(isAr ? "استخدم الإدخال اليدوي" : "Use manual fallback"); }
    }
    void start();
    const timer = window.setInterval(async () => {
      if (stopped || detecting || inFlight.current || !detector || !videoRef.current || videoRef.current.readyState < 2) return;
      detecting = true;
      try {
        const first = (await detector.detect(videoRef.current))[0]?.rawValue;
        if (!first) visible = null;
        else {
          const fingerprint = await fingerprintQrPayload(first);
          if (!stopped && fingerprint !== visible) { visible = fingerprint; submitCamera(first); }
        }
      } catch { if (!stopped) setCameraStatus(isAr ? "استخدم الإدخال اليدوي" : "Use manual fallback"); }
      finally { detecting = false; }
    }, 1200);
    return () => { stopped = true; window.clearInterval(timer); stream?.getTracks().forEach((track) => track.stop()); };
  }, [isAr]);
  return <form className="max-w-xl space-y-4 rounded-2xl border bg-card p-6" onSubmit={(event) => {
    event.preventDefault(); submit(payload.trim());
  }}>
    <h1 className="text-lg font-bold">{isAr ? "ماسح الزوار" : "Visitor scanner"}</h1>
    <video ref={videoRef} muted playsInline className="aspect-video w-full rounded-xl bg-black" />
    <p role="status">{cameraStatus}</p>
    <p className="text-sm text-muted-foreground">{isAr ? "المسح التقليدي متاح أثناء توقف تشغيل الأجهزة المتقدم. استخدم قارئ QR أو ألصق محتوى تصريح الزائر." : "Legacy scanning is available while completion is disabled. Use a QR reader or paste the visitor pass payload."}</p>
    <label className="block">{isAr ? "البوابة" : "Gate"}<select className="block w-full rounded border p-2" value={gateId} disabled={pending} onChange={(event) => {
      setGateId(event.target.value); setResult(null);
      setDirection(gates.find((item) => item.id === event.target.value)?.directionMode === "EXIT" ? "EXIT" : "ENTRY");
    }}>{gates.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
    <label className="block">{isAr ? "الاتجاه" : "Direction"}<select className="block w-full rounded border p-2" value={direction} disabled={pending} onChange={(event) => { setDirection(event.target.value as "ENTRY" | "EXIT"); setResult(null); }}>
      {gate?.directionMode !== "EXIT" && <option value="ENTRY">{isAr ? "دخول" : "Entry"}</option>}
      {gate?.directionMode !== "ENTRY" && <option value="EXIT">{isAr ? "خروج" : "Exit"}</option>}
    </select></label>
    <label className="block">{isAr ? "رمز تصريح الزائر" : "Visitor pass QR payload"}<input className="block w-full rounded border p-2" value={payload} onChange={(event) => { setPayload(event.target.value); setResult(null); }} disabled={pending} autoComplete="off" maxLength={4096} required /></label>
    <Button disabled={pending || !gateId || !payload.trim()} type="submit">{isAr ? "تحقق من التصريح" : "Scan visitor pass"}</Button>
    {result && <div role="status" className={result.ok && result.decision === "ALLOW" ? "rounded bg-emerald-50 p-3 text-emerald-800" : "rounded bg-rose-50 p-3 text-rose-800"}>
      {result.ok ? `${result.decision === "ALLOW" ? (isAr ? "مسموح" : "Allowed") : (isAr ? "مرفوض" : "Denied")} · ${result.guestName ?? ""} · ${result.reasonCode}` : result.error === "trusted_device_required" ? (isAr ? "تم تفعيل الأجهزة المتقدمة. أعد تحميل الصفحة." : "Trusted scanning was enabled. Reload this page.") : (isAr ? "تعذر التحقق. لم يتم السماح بالدخول." : "Could not verify. Entry has not been allowed.")}
    </div>}
  </form>;
}
