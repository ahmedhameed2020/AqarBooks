import { setRequestLocale } from "next-intl/server";
import { notFound, redirect } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { getPortalMemberContext } from "@/lib/auth/portal-member";
import type { Locale } from "@/i18n/routing";
import { PortalPageHeader } from "../../portal-ui";
import { formatPortalDate, formatVehicleLabel, VEHICLE_STATUS_LABELS } from "../vehicle-labels";
import { PortalVehicleDetailActions } from "./vehicle-detail-actions";

export default async function PortalVehicleDetailPage({
  params,
}: {
  params: Promise<{ locale: string; vehicleId: string }>;
}) {
  const { locale, vehicleId } = await params;
  setRequestLocale(locale as Locale);
  const isAr = locale === "ar";

  const ctx = await getPortalMemberContext();
  if (ctx.status !== "ok") redirect("/portal/login");

  const supabase = await createClient();
  const { data: vehicle } = await supabase
    .from("vehicles")
    .select("id, property_id, unit_id, plate_number, plate_country, plate_region, make, model, color, year, notes, is_active, created_at, deactivated_at")
    .eq("id", vehicleId)
    .maybeSingle();

  if (!vehicle) notFound();

  const [{ data: unit }, { data: property }] = await Promise.all([
    supabase.from("units").select("code").eq("id", vehicle.unit_id).maybeSingle(),
    supabase.from("properties").select("name").eq("id", vehicle.property_id).maybeSingle(),
  ]);

  const statusLabel = VEHICLE_STATUS_LABELS[vehicle.is_active ? "ACTIVE" : "INACTIVE"];

  return (
    <div className="space-y-6 pb-12">
      <PortalPageHeader
        title={formatVehicleLabel({
          plateNumber: vehicle.plate_number,
          plateCountry: vehicle.plate_country,
          plateRegion: vehicle.plate_region,
        })}
        description={`${unit?.code ?? "—"} · ${property?.name ?? "—"}`}
      >
        <Link href="/portal/vehicles" locale={locale as Locale} className={buttonVariants({ variant: "outline", size: "sm", className: "h-9 rounded-xl text-xs font-semibold" })}>
          {isAr ? "كل المركبات" : "All Vehicles"}
        </Link>
      </PortalPageHeader>

      <section className="rounded-2xl border border-border/70 bg-card p-4 shadow-2xs">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className={statusLabel.tone}>{isAr ? statusLabel.ar : statusLabel.en}</Badge>
          <Badge variant="outline">{vehicle.plate_country}</Badge>
        </div>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          {[
            [isAr ? "الوحدة" : "Unit", unit?.code ?? "—"],
            [isAr ? "العقار" : "Property", property?.name ?? "—"],
            [isAr ? "الشركة" : "Make", vehicle.make ?? "—"],
            [isAr ? "الموديل" : "Model", vehicle.model ?? "—"],
            [isAr ? "اللون" : "Color", vehicle.color ?? "—"],
            [isAr ? "السنة" : "Year", vehicle.year?.toString() ?? "—"],
            [isAr ? "أضيفت في" : "Added", formatPortalDate(vehicle.created_at, locale as "ar" | "en")],
            [isAr ? "أُوقفت في" : "Deactivated", vehicle.deactivated_at ? formatPortalDate(vehicle.deactivated_at, locale as "ar" | "en") : "—"],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl border border-border/50 bg-slate-50 p-3 dark:bg-slate-900/40">
              <dt className="text-[11px] font-semibold text-slate-400">{label}</dt>
              <dd className="mt-1 font-semibold text-slate-800 dark:text-slate-200">{value}</dd>
            </div>
          ))}
        </dl>
        {vehicle.notes ? (
          <p className="mt-4 whitespace-pre-wrap rounded-xl bg-slate-50 p-3 text-sm leading-relaxed text-slate-700 dark:bg-slate-900 dark:text-slate-200">
            {vehicle.notes}
          </p>
        ) : null}
      </section>

      <PortalVehicleDetailActions vehicleId={vehicle.id} isActive={vehicle.is_active} locale={locale as "ar" | "en"} />
    </div>
  );
}
