"use client";

import { useMemo, useState, useTransition } from "react";
import { CarFront, Plus, ShieldCheck, XCircle } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { deactivateOwnVehicleAction } from "@/lib/actions/unit-experience";
import { EmptyState, PortalPageHeader, SearchBox, Segmented, StatCard } from "../portal-ui";
import { formatPortalDate, formatVehicleLabel, VEHICLE_STATUS_LABELS } from "./vehicle-labels";

export interface PortalVehicleItem {
  id: string;
  unitCode: string;
  propertyName: string;
  plateNumber: string;
  plateCountry: string;
  plateRegion: string | null;
  make: string | null;
  model: string | null;
  color: string | null;
  year: number | null;
  isActive: boolean;
  createdAt: string;
}

type StatusFilter = "ALL" | "ACTIVE" | "INACTIVE";

export function PortalVehiclesClient({
  vehicles,
  locale,
}: {
  vehicles: PortalVehicleItem[];
  locale: "ar" | "en";
}) {
  const isAr = locale === "ar";
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("ALL");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return vehicles.filter((vehicle) => {
      if (status === "ACTIVE" && !vehicle.isActive) return false;
      if (status === "INACTIVE" && vehicle.isActive) return false;
      if (!q) return true;
      return [
        vehicle.plateNumber,
        vehicle.plateCountry,
        vehicle.plateRegion ?? "",
        vehicle.unitCode,
        vehicle.propertyName,
        vehicle.make ?? "",
        vehicle.model ?? "",
        vehicle.color ?? "",
      ].some((value) => value.toLowerCase().includes(q));
    });
  }, [vehicles, query, status]);

  function deactivate(vehicleId: string) {
    setPendingId(vehicleId);
    setMessage(null);
    startTransition(async () => {
      const result = await deactivateOwnVehicleAction({ vehicleId });
      setMessage(result.ok ? (isAr ? "تم إيقاف المركبة" : "Vehicle deactivated") : result.error);
      setPendingId(null);
    });
  }

  return (
    <div className="space-y-6 pb-12">
      <PortalPageHeader
        title={isAr ? "مركباتي" : "My Vehicles"}
        description={
          isAr
            ? "سجل المركبات المرتبطة بوحداتك الحالية لاستخدامه في التشغيل وتجربة الدخول المستقبلية."
            : "Vehicles linked to your current units for operations and future access experiences."
        }
      >
        <Link href="/portal/vehicles/new" locale={locale} className={buttonVariants({ size: "sm", className: "h-9 gap-2 rounded-xl text-xs font-semibold" })}>
          <Plus className="size-4" />
          {isAr ? "إضافة مركبة" : "Add Vehicle"}
        </Link>
      </PortalPageHeader>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label={isAr ? "كل المركبات" : "All vehicles"} value={vehicles.length} icon={<CarFront className="size-4" />} />
        <StatCard label={isAr ? "نشطة" : "Active"} value={vehicles.filter((v) => v.isActive).length} tone="positive" icon={<ShieldCheck className="size-4" />} />
        <StatCard label={isAr ? "متوقفة" : "Inactive"} value={vehicles.filter((v) => !v.isActive).length} icon={<XCircle className="size-4" />} />
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Segmented
          value={status}
          onChange={setStatus}
          ariaLabel={isAr ? "حالة المركبة" : "Vehicle status"}
          options={[
            { value: "ALL", label: isAr ? "الكل" : "All", count: vehicles.length },
            { value: "ACTIVE", label: isAr ? "نشطة" : "Active", count: vehicles.filter((v) => v.isActive).length, tone: "positive" },
            { value: "INACTIVE", label: isAr ? "متوقفة" : "Inactive", count: vehicles.filter((v) => !v.isActive).length },
          ]}
        />
        <SearchBox
          value={query}
          onChange={setQuery}
          locale={locale}
          placeholder={isAr ? "ابحث برقم اللوحة أو الوحدة" : "Search plate or unit"}
        />
      </div>

      {message ? <p className="text-xs font-semibold text-slate-500">{message}</p> : null}

      {visible.length === 0 ? (
        <EmptyState
          icon={<CarFront className="size-5" />}
          title={isAr ? "لا توجد مركبات مطابقة" : "No matching vehicles"}
          description={
            isAr
              ? "أضف مركبة مرتبطة بوحدة حالية، وسيظهر سجلها هنا."
              : "Add a vehicle for one of your current units, then track it here."
          }
          action={
            <Link href="/portal/vehicles/new" locale={locale} className={buttonVariants({ size: "sm", className: "rounded-xl text-xs font-semibold" })}>
              {isAr ? "إضافة مركبة" : "Add Vehicle"}
            </Link>
          }
        />
      ) : (
        <div className="grid gap-3 xl:grid-cols-2">
          {visible.map((vehicle) => {
            const statusLabel = VEHICLE_STATUS_LABELS[vehicle.isActive ? "ACTIVE" : "INACTIVE"];
            return (
              <article key={vehicle.id} className="rounded-2xl border border-border/70 bg-card p-4 shadow-2xs">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className={statusLabel.tone}>{isAr ? statusLabel.ar : statusLabel.en}</Badge>
                      <span className="font-mono text-[11px] font-bold text-slate-400">{vehicle.unitCode}</span>
                    </div>
                    <Link href={`/portal/vehicles/${vehicle.id}`} locale={locale} className="block font-mono text-lg font-black text-slate-950 hover:text-indigo-700 dark:text-white">
                      {formatVehicleLabel(vehicle)}
                    </Link>
                    <p className="text-xs text-slate-500">
                      {[vehicle.make, vehicle.model, vehicle.year, vehicle.color].filter(Boolean).join(" · ") || (isAr ? "لا توجد تفاصيل إضافية" : "No extra details")}
                    </p>
                    <p className="text-[11px] text-slate-400">
                      {vehicle.propertyName} · {isAr ? "أضيفت في" : "Added"} {formatPortalDate(vehicle.createdAt, locale)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Link href={`/portal/vehicles/${vehicle.id}`} locale={locale} className={buttonVariants({ variant: "outline", size: "sm", className: "h-8 rounded-xl text-xs" })}>
                      {isAr ? "التفاصيل" : "Details"}
                    </Link>
                    {vehicle.isActive ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={isPending && pendingId === vehicle.id}
                        onClick={() => deactivate(vehicle.id)}
                        className="h-8 rounded-xl border-rose-200 text-xs font-semibold text-rose-700 hover:bg-rose-50"
                      >
                        {isAr ? "إيقاف" : "Deactivate"}
                      </Button>
                    ) : null}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
