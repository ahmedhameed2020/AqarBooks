"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { deactivateOwnVehicleAction } from "@/lib/actions/unit-experience";

export function PortalVehicleDetailActions({
  vehicleId,
  isActive,
  locale,
}: {
  vehicleId: string;
  isActive: boolean;
  locale: "ar" | "en";
}) {
  const isAr = locale === "ar";
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!isActive) return null;

  return (
    <section className="rounded-2xl border border-border/70 bg-card p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-bold text-slate-950 dark:text-white">
            {isAr ? "إيقاف المركبة" : "Deactivate Vehicle"}
          </h2>
          <p className="text-xs text-slate-500">
            {isAr ? "استخدمها عندما لا تعود المركبة مرتبطة بوحدتك." : "Use this when the vehicle is no longer linked to your unit."}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={isPending}
          onClick={() => {
            setMessage(null);
            startTransition(async () => {
              const result = await deactivateOwnVehicleAction({ vehicleId });
              setMessage(result.ok ? (isAr ? "تم إيقاف المركبة" : "Vehicle deactivated") : result.error);
            });
          }}
          className="h-9 rounded-xl border-rose-200 text-xs font-semibold text-rose-700 hover:bg-rose-50"
        >
          {isAr ? "إيقاف" : "Deactivate"}
        </Button>
      </div>
      {message ? <p className="mt-3 text-xs font-semibold text-slate-500">{message}</p> : null}
    </section>
  );
}
