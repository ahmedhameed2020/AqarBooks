"use client";
import { useState, useTransition } from "react";
import { saveGateCompletionPolicy } from "@/lib/actions/gate-completion-policy";
import { Button } from "@/components/ui/button";

export function CompletionPolicyForm({ enabled, isAr }: { enabled: boolean; isAr: boolean }) {
  const [checked, setChecked] = useState(enabled);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  return <form className="max-w-xl space-y-5 rounded-2xl border bg-card p-6" onSubmit={(event) => {
    event.preventDefault(); setMessage("");
    startTransition(async () => {
      const result = await saveGateCompletionPolicy(checked);
      setMessage(result.ok ? (isAr ? "تم حفظ الإعداد" : "Setting saved") : (isAr ? "تعذر الحفظ" : "Could not save setting"));
    });
  }}>
    <h1 className="text-lg font-bold">{isAr ? "تفعيل تشغيل البوابات المتقدم" : "Gate completion rollout"}</h1>
    <p className="text-sm text-muted-foreground">{isAr ? "التعطيل يوقف التسجيل والمسح بالأجهزة والإجراءات الإشرافية الجديدة والتحكم بالبوابات. تبقى الأجهزة والسجلات محفوظة وإدارة الزوار متاحة." : "Disabling stops new device enrollment, trusted scans, supervision changes and hardware dispatch. Devices and evidence remain available, and visitor management continues."}</p>
    <label className="flex gap-2"><input type="checkbox" checked={checked} onChange={(event) => setChecked(event.target.checked)} disabled={pending} />{isAr ? "تفعيل لهذه المنشأة" : "Enable for this organization"}</label>
    <Button type="submit" disabled={pending}>{isAr ? "حفظ" : "Save setting"}</Button>
    <p role="status">{message}</p>
  </form>;
}
