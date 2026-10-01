"use client";
import { useRef, useState, useTransition } from "react";
import { processLegacyVisitorGateScanAction, type GateScanResult } from "@/lib/actions/gates";
import { Button } from "@/components/ui/button";

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
  return <form className="max-w-xl space-y-4 rounded-2xl border bg-card p-6" onSubmit={(event) => {
    event.preventDefault(); if (inFlight.current || !gateId || !payload.trim()) return;
    inFlight.current = true;
    const qrPayload = payload.trim(); setPayload(""); setResult(null);
    startTransition(async () => {
      try { setResult(await processLegacyVisitorGateScanAction({ gateId, direction, qrPayload, clientScanId: crypto.randomUUID() })); }
      catch { setResult({ ok: false, error: "failed" }); }
      finally { inFlight.current = false; }
    });
  }}>
    <h1 className="text-lg font-bold">{isAr ? "ماسح الزوار" : "Visitor scanner"}</h1>
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
