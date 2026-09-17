"use client";

import { useState, useTransition } from "react";
import { CalendarCheck2, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createAmenityAction, decideAmenityBookingAction, setAmenityActiveAction } from "@/lib/actions/amenities";

export interface StaffAmenity { id: string; propertyId: string; propertyName: string; name: string; capacity: number; slotMinutes: number; opensAt: string; closesAt: string; requiresApproval: boolean; isActive: boolean }
export interface StaffAmenityBooking { id: string; amenityName: string; unitCode: string; memberName: string; startsAt: string; endsAt: string; status: "REQUESTED" | "CONFIRMED" | "REJECTED" | "CANCELLED"; memberNote: string | null; staffNote: string | null }
type PropertyOption = { id: string; name: string; timezone: string };

export function StaffAmenitiesClient({ properties, amenities, bookings, canManage, locale }: { properties: PropertyOption[]; amenities: StaffAmenity[]; bookings: StaffAmenityBooking[]; canManage: boolean; locale: "ar" | "en" }) {
  const isAr = locale === "ar";
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [form, setForm] = useState({ propertyId: properties[0]?.id ?? "", nameAr: "", nameEn: "", capacity: "1", slotMinutes: "60", opensAt: "08:00", closesAt: "22:00", maxAdvanceDays: "30", requiresApproval: false });

  function create() {
    startTransition(async () => {
      const result = await createAmenityAction({ propertyId: form.propertyId, nameAr: form.nameAr, nameEn: form.nameEn, capacity: Number(form.capacity), slotMinutes: Number(form.slotMinutes), opensAt: form.opensAt, closesAt: form.closesAt, maxAdvanceDays: Number(form.maxAdvanceDays), requiresApproval: form.requiresApproval });
      setMessage(result.ok ? (isAr ? "تم إنشاء المرفق" : "Amenity created") : result.error);
      if (result.ok) setForm((value) => ({ ...value, nameAr: "", nameEn: "" }));
    });
  }
  function decide(bookingId: string, decision: "CONFIRMED" | "REJECTED") {
    startTransition(async () => { const result = await decideAmenityBookingAction({ bookingId, decision }); setMessage(result.ok ? (isAr ? "تم تحديث الطلب" : "Request updated") : result.error); });
  }
  function toggleAmenity(amenityId: string, isActive: boolean) {
    startTransition(async () => { const result = await setAmenityActiveAction({ amenityId, isActive }); setMessage(result.ok ? (isAr ? "تم تحديث حالة المرفق" : "Amenity status updated") : result.error); });
  }

  return <div className="space-y-5 pb-10">
    <header><h1 className="text-2xl font-black">{isAr ? "المرافق والحجوزات" : "Amenities & Bookings"}</h1><p className="text-sm text-slate-500">{isAr ? "إدارة التوفر والطلبات دون قوائم يدوية." : "Manage availability and booking requests without spreadsheets."}</p></header>
    <div className="grid gap-4 xl:grid-cols-[.75fr_1.25fr]">
      <section className="space-y-3 rounded-2xl border bg-card p-4"><h2 className="flex items-center gap-2 font-black"><Plus className="size-4" />{isAr ? "إضافة مرفق" : "Add amenity"}</h2>{canManage ? <>
        <select value={form.propertyId} onChange={(e) => setForm({ ...form, propertyId: e.target.value })} className="h-10 w-full rounded-xl border bg-background px-3 text-sm">{properties.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.timezone}</option>)}</select>
        <div className="grid gap-2 sm:grid-cols-2"><Input value={form.nameAr} onChange={(e) => setForm({ ...form, nameAr: e.target.value })} placeholder="الاسم بالعربية" /><Input value={form.nameEn} onChange={(e) => setForm({ ...form, nameEn: e.target.value })} placeholder="English name" /></div>
        <div className="grid grid-cols-2 gap-2"><Input type="number" min={1} value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} placeholder={isAr ? "السعة" : "Capacity"} /><Input type="number" min={15} step={15} value={form.slotMinutes} onChange={(e) => setForm({ ...form, slotMinutes: e.target.value })} placeholder={isAr ? "مدة الحجز" : "Slot minutes"} /><Input type="time" value={form.opensAt} onChange={(e) => setForm({ ...form, opensAt: e.target.value })} /><Input type="time" value={form.closesAt} onChange={(e) => setForm({ ...form, closesAt: e.target.value })} /></div>
        <Input type="number" min={1} max={365} value={form.maxAdvanceDays} onChange={(e) => setForm({ ...form, maxAdvanceDays: e.target.value })} placeholder={isAr ? "أقصى حجز مسبق بالأيام" : "Max advance days"} />
        <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={form.requiresApproval} onChange={(e) => setForm({ ...form, requiresApproval: e.target.checked })} />{isAr ? "يتطلب موافقة الإدارة" : "Requires staff approval"}</label>
        <Button onClick={create} disabled={isPending || !form.propertyId || !form.nameAr || !form.nameEn} className="w-full">{isAr ? "إنشاء المرفق" : "Create amenity"}</Button>
      </> : <p className="text-sm text-slate-500">{isAr ? "صلاحية عرض فقط." : "View-only access."}</p>}
      {message ? <p className="text-xs font-semibold text-slate-500">{message}</p> : null}
      <div className="space-y-2 border-t pt-3">{amenities.map((a) => <div key={a.id} className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 p-3 text-xs dark:bg-slate-900"><div><p className="font-bold">{a.name}</p><p className="text-slate-500">{a.propertyName} · {a.opensAt}–{a.closesAt} · {a.slotMinutes}m</p></div>{canManage ? <Button size="sm" variant="outline" onClick={() => toggleAmenity(a.id, !a.isActive)} disabled={isPending}>{a.isActive ? (isAr ? "إيقاف" : "Disable") : (isAr ? "تفعيل" : "Enable")}</Button> : null}</div>)}</div></section>
      <section className="rounded-2xl border bg-card"><div className="flex items-center gap-2 border-b p-4 font-black"><CalendarCheck2 className="size-4" />{isAr ? "طلبات الحجز" : "Booking requests"}</div><div className="divide-y">{bookings.length === 0 ? <p className="p-8 text-center text-sm text-slate-500">{isAr ? "لا توجد حجوزات." : "No bookings."}</p> : bookings.map((b) => <article key={b.id} className="grid gap-3 p-4 md:grid-cols-[1fr_auto] md:items-center"><div><p className="font-bold">{b.amenityName}</p><p className="text-xs text-slate-500">{b.memberName} · {b.unitCode} · {new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(b.startsAt))}</p>{b.memberNote ? <p className="mt-1 text-xs">{b.memberNote}</p> : null}</div><div className="flex items-center gap-2"><Badge variant="outline">{b.status}</Badge>{canManage && b.status === "REQUESTED" ? <><Button size="sm" onClick={() => decide(b.id, "CONFIRMED")} disabled={isPending}>{isAr ? "قبول" : "Approve"}</Button><Button size="sm" variant="outline" onClick={() => decide(b.id, "REJECTED")} disabled={isPending}>{isAr ? "رفض" : "Decline"}</Button></> : null}</div></article>)}</div></section>
    </div>
  </div>;
}
