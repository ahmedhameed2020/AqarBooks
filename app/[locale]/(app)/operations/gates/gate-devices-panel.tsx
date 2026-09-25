"use client";

import { useState, useTransition } from "react";
import { Loader2, MonitorSmartphone, ShieldOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { revokeGateDeviceAction } from "@/lib/actions/gate-devices";
import { DeviceEnrollmentDialog, type EnrollmentGateOption } from "./device-enrollment-dialog";

export type GateDeviceItem = {
  id: string;
  displayName: string;
  notes: string | null;
  gateName: string;
  propertyName: string;
  allowedDirection: "ENTRY" | "EXIT" | "BOTH";
  status: "ACTIVE" | "SUSPENDED" | "REVOKED";
  enrolledAt: string;
  lastSeenAt: string | null;
  revokedAt: string | null;
  revocationReason: string | null;
};

function statusClass(status: GateDeviceItem["status"]) {
  if (status === "ACTIVE") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "SUSPENDED") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-rose-200 bg-rose-50 text-rose-700";
}

function statusLabel(status: GateDeviceItem["status"], isAr: boolean) {
  if (!isAr) return status === "ACTIVE" ? "Active" : status === "SUSPENDED" ? "Suspended" : "Revoked";
  return status === "ACTIVE" ? "نشط" : status === "SUSPENDED" ? "موقوف" : "ملغى";
}

export function GateDevicesPanel({
  devices,
  gates,
  canManage,
  locale,
}: {
  devices: GateDeviceItem[];
  gates: EnrollmentGateOption[];
  canManage: boolean;
  locale: "ar" | "en";
}) {
  const isAr = locale === "ar";
  const formatter = new Intl.DateTimeFormat(isAr ? "ar-QA" : "en-QA", { dateStyle: "medium", timeStyle: "short" });
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<Record<string, string>>({});
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function revoke(deviceId: string) {
    const reason = reasons[deviceId]?.trim() ?? "";
    if (!reason) return;
    setPendingId(deviceId);
    setMessage((current) => ({ ...current, [deviceId]: "" }));
    startTransition(async () => {
      const result = await revokeGateDeviceAction({ deviceId, reason });
      setMessage((current) => ({
        ...current,
        [deviceId]: result.ok
          ? (isAr ? "تم إلغاء الجهاز" : "Device revoked")
          : (isAr ? "تعذر إلغاء الجهاز" : "Could not revoke device"),
      }));
      setPendingId(null);
    });
  }

  return (
    <section className="rounded-2xl border border-border/70 bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 p-4">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-black text-slate-950 dark:text-white">
            <MonitorSmartphone className="size-4 text-slate-500" />
            {isAr ? "أجهزة مسح البوابات" : "Gate scanner devices"}
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            {isAr ? "الأجهزة الموثوقة وربطها بالبوابات والاتجاهات." : "Trusted devices and their gate and direction bindings."}
          </p>
        </div>
        {canManage ? <DeviceEnrollmentDialog gates={gates} locale={locale} /> : null}
      </div>

      {devices.length === 0 ? (
        <div className="p-10 text-center">
          <MonitorSmartphone className="mx-auto mb-3 size-8 text-slate-400" />
          <p className="text-sm font-bold text-slate-900 dark:text-white">{isAr ? "لا توجد أجهزة مسجلة" : "No enrolled devices"}</p>
        </div>
      ) : (
        <div className="divide-y divide-border/70">
          {devices.map((device) => (
            <div key={device.id} className="space-y-3 p-4">
              <div className="grid gap-3 lg:grid-cols-[1fr_1fr_auto] lg:items-start">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-black text-slate-950 dark:text-white">{device.displayName}</p>
                    <Badge variant="outline" className={statusClass(device.status)}>{statusLabel(device.status, isAr)}</Badge>
                  </div>
                  {device.notes ? <p className="mt-1 text-xs text-slate-500">{device.notes}</p> : null}
                </div>
                <div className="text-xs text-slate-600 dark:text-slate-300">
                  <p className="font-bold text-slate-900 dark:text-white">{device.gateName} · {device.allowedDirection}</p>
                  <p>{device.propertyName}</p>
                </div>
                <div className="text-xs text-slate-500 lg:text-end">
                  <p>{isAr ? "آخر اتصال" : "Last seen"}: {device.lastSeenAt ? formatter.format(new Date(device.lastSeenAt)) : (isAr ? "لم يتصل بعد" : "Never")}</p>
                  <p>{isAr ? "سُجل" : "Enrolled"}: {formatter.format(new Date(device.enrolledAt))}</p>
                </div>
              </div>

              {device.status === "REVOKED" ? (
                <div className="rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:bg-rose-950/30 dark:text-rose-300">
                  {device.revocationReason ?? (isAr ? "تم إلغاء الجهاز" : "Device revoked")}
                  {device.revokedAt ? ` · ${formatter.format(new Date(device.revokedAt))}` : ""}
                </div>
              ) : canManage ? (
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    value={reasons[device.id] ?? ""}
                    onChange={(event) => setReasons((current) => ({ ...current, [device.id]: event.target.value }))}
                    maxLength={500}
                    placeholder={isAr ? "سبب إلغاء الجهاز" : "Revocation reason"}
                    className="h-9 rounded-xl text-xs sm:max-w-md"
                  />
                  <Button type="button" variant="outline" size="sm" onClick={() => revoke(device.id)} disabled={isPending || !(reasons[device.id]?.trim())} className="h-9 gap-2 rounded-xl border-rose-200 text-rose-700 hover:bg-rose-50">
                    {isPending && pendingId === device.id ? <Loader2 className="size-4 animate-spin" /> : <ShieldOff className="size-4" />}
                    {isAr ? "إلغاء الجهاز" : "Revoke device"}
                  </Button>
                  {message[device.id] ? <p role="status" className="self-center text-xs font-semibold text-slate-500">{message[device.id]}</p> : null}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
