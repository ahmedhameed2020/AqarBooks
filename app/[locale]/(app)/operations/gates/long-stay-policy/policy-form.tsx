"use client";
import { useState, useTransition } from "react";
import { saveGateLongStayPolicy } from "@/lib/actions/gate-long-stay-policy";
import { Button } from "@/components/ui/button";

export function LongStayPolicyForm({ thresholdHours, notificationsEnabled, isAr }: {
  thresholdHours: number; notificationsEnabled: boolean; isAr: boolean;
}) {
  const [hours, setHours] = useState(String(thresholdHours));
  const [enabled, setEnabled] = useState(notificationsEnabled);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  return <form className="max-w-xl space-y-5 rounded-2xl border bg-card p-6" onSubmit={(event) => {
    event.preventDefault(); setMessage("");
    startTransition(async () => {
      const result = await saveGateLongStayPolicy(Number(hours), enabled);
      setMessage(result.ok ? (isAr ? "تم حفظ السياسة" : "Policy saved") : (isAr ? "تعذر الحفظ" : "Could not save policy"));
    });
  }}>
    <h1 className="text-lg font-bold">{isAr ? "سياسة بقاء الزائر" : "Visitor long-stay policy"}</h1>
    <p className="text-sm text-muted-foreground">{isAr ? "تطبق السياسة على هذه المنشأة فقط. التنبيهات اختيارية وتتطلب تشغيل جدولة الإشعارات." : "This policy applies to this organization. Alerts are opt-in and require the notification schedule to be running."}</p>
    <label className="block space-y-2">{isAr ? "الحد بالساعات (1–168)" : "Threshold in hours (1–168)"}
      <input className="block rounded border p-2" type="number" min={1} max={168} step={1} required value={hours} onChange={(e) => setHours(e.target.value)} disabled={pending} />
    </label>
    <label className="flex gap-2"><input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} disabled={pending} />{isAr ? "تفعيل تنبيهات تجاوز مدة البقاء" : "Enable long-stay security alerts"}</label>
    <Button type="submit" disabled={pending}>{isAr ? "حفظ" : "Save policy"}</Button>
    <p role="status">{message}</p>
  </form>;
}
