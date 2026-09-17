"use client";

import { useMemo, useState, useTransition } from "react";
import { CalendarDays, Clock3, UsersRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cancelAmenityBookingAction, createAmenityBookingAction } from "@/lib/actions/amenities";

export interface PortalAmenity {
  id: string;
  propertyId: string;
  name: string;
  description: string | null;
  capacity: number;
  slotMinutes: number;
  opensAt: string;
  closesAt: string;
  maxAdvanceDays: number;
  requiresApproval: boolean;
}

export interface PortalAmenityBooking {
  id: string;
  amenityId: string;
  amenityName: string;
  unitCode: string;
  startsAt: string;
  endsAt: string;
  status: "REQUESTED" | "CONFIRMED" | "REJECTED" | "CANCELLED";
  memberNote: string | null;
  staffNote: string | null;
}

type UnitOption = { id: string; property_id: string; code: string };

export function PortalAmenitiesClient({ amenities, units, bookings, locale }: { amenities: PortalAmenity[]; units: UnitOption[]; bookings: PortalAmenityBooking[]; locale: "ar" | "en" }) {
  const isAr = locale === "ar";
  const [amenityId, setAmenityId] = useState(amenities[0]?.id ?? "");
  const selected = amenities.find((item) => item.id === amenityId) ?? null;
  const eligibleUnits = useMemo(() => units.filter((unit) => unit.property_id === selected?.propertyId), [selected, units]);
  const [unitId, setUnitId] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function reserve() {
    if (!selected || !unitId || !startsAt) return;
    startTransition(async () => {
      const result = await createAmenityBookingAction({ amenityId: selected.id, unitId, startsAt, memberNote: note || null });
      setMessage(result.ok ? (isAr ? "تم إرسال الحجز" : "Booking submitted") : result.error);
      if (result.ok) { setStartsAt(""); setNote(""); }
    });
  }

  function cancel(bookingId: string) {
    startTransition(async () => {
      const result = await cancelAmenityBookingAction({ bookingId });
      setMessage(result.ok ? (isAr ? "تم إلغاء الحجز" : "Booking cancelled") : result.error);
    });
  }

  const statusLabel = (status: PortalAmenityBooking["status"]) => ({
    REQUESTED: isAr ? "بانتظار الموافقة" : "Awaiting approval",
    CONFIRMED: isAr ? "مؤكد" : "Confirmed",
    REJECTED: isAr ? "مرفوض" : "Declined",
    CANCELLED: isAr ? "ملغي" : "Cancelled",
  })[status];

  return (
    <div className="space-y-5 pb-10">
      <header><h1 className="text-2xl font-black">{isAr ? "حجز المرافق" : "Amenity Booking"}</h1><p className="text-sm text-slate-500">{isAr ? "شاهد التوفر واحجز مرافق منشأتك من مكان واحد." : "Reserve shared facilities tied to your units."}</p></header>
      <div className="grid gap-4 lg:grid-cols-[.9fr_1.1fr]">
        <section className="space-y-4 rounded-2xl border border-border/70 bg-card p-4">
          <h2 className="flex items-center gap-2 font-black"><CalendarDays className="size-4" />{isAr ? "حجز جديد" : "New booking"}</h2>
          {amenities.length === 0 ? <p className="text-sm text-slate-500">{isAr ? "لا توجد مرافق متاحة حاليًا." : "No amenities are currently available."}</p> : <>
            <select value={amenityId} onChange={(event) => { setAmenityId(event.target.value); setUnitId(""); }} className="h-11 w-full rounded-xl border bg-background px-3 text-sm">
              {amenities.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
            {selected ? <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600 dark:bg-slate-900">
              <p className="font-bold text-slate-900 dark:text-white">{selected.description || selected.name}</p>
              <div className="mt-2 flex flex-wrap gap-3"><span className="flex items-center gap-1"><Clock3 className="size-3" />{selected.opensAt}–{selected.closesAt} · {selected.slotMinutes}m</span><span className="flex items-center gap-1"><UsersRound className="size-3" />{selected.capacity}</span></div>
            </div> : null}
            <select value={unitId} onChange={(event) => setUnitId(event.target.value)} className="h-11 w-full rounded-xl border bg-background px-3 text-sm"><option value="">{isAr ? "اختر الوحدة" : "Choose unit"}</option>{eligibleUnits.map((unit) => <option key={unit.id} value={unit.id}>{unit.code}</option>)}</select>
            <Input type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} className="h-11 rounded-xl" />
            <textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} rows={3} placeholder={isAr ? "ملاحظة اختيارية" : "Optional note"} className="w-full rounded-xl border bg-background px-3 py-2 text-sm" />
            <Button onClick={reserve} disabled={isPending || !unitId || !startsAt} className="w-full rounded-xl">{selected?.requiresApproval ? (isAr ? "إرسال طلب الحجز" : "Request booking") : (isAr ? "تأكيد الحجز" : "Confirm booking")}</Button>
          </>}
          {message ? <p className="text-xs font-semibold text-slate-500">{message}</p> : null}
        </section>
        <section className="rounded-2xl border border-border/70 bg-card"><div className="border-b p-4 font-black">{isAr ? "حجوزاتي" : "My bookings"}</div><div className="divide-y">
          {bookings.length === 0 ? <p className="p-8 text-center text-sm text-slate-500">{isAr ? "لا توجد حجوزات بعد." : "No bookings yet."}</p> : bookings.map((booking) => <article key={booking.id} className="flex flex-wrap items-center justify-between gap-3 p-4"><div><p className="font-bold">{booking.amenityName}</p><p className="text-xs text-slate-500">{booking.unitCode} · {new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(booking.startsAt))}</p>{booking.staffNote ? <p className="mt-1 text-xs text-rose-600">{booking.staffNote}</p> : null}</div><div className="flex items-center gap-2"><Badge variant="outline">{statusLabel(booking.status)}</Badge>{["REQUESTED", "CONFIRMED"].includes(booking.status) && new Date(booking.startsAt) > new Date() ? <Button variant="outline" size="sm" onClick={() => cancel(booking.id)} disabled={isPending}>{isAr ? "إلغاء" : "Cancel"}</Button> : null}</div></article>)}
        </div></section>
      </div>
    </div>
  );
}
