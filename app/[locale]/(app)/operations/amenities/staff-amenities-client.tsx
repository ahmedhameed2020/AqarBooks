"use client";

import { useState, useTransition } from "react";
import { CalendarCheck2, Pencil, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createAmenityAction, decideAmenityBookingAction, setAmenityActiveAction, updateAmenityAction } from "@/lib/actions/amenities";

export interface StaffAmenity {
  id: string; propertyId: string; propertyName: string; propertyTimezone: string;
  name: string; nameAr: string; nameEn: string; descriptionAr: string | null; descriptionEn: string | null;
  capacity: number; slotMinutes: number; opensAt: string; closesAt: string; maxAdvanceDays: number;
  requiresApproval: boolean; isActive: boolean;
}

export interface StaffAmenityBooking {
  id: string; amenityName: string; propertyTimezone: string; unitCode: string; memberName: string;
  startsAt: string; endsAt: string; status: "REQUESTED" | "CONFIRMED" | "REJECTED" | "CANCELLED";
  memberNote: string | null; staffNote: string | null;
}

type PropertyOption = { id: string; name: string; timezone: string };
type FormState = {
  propertyId: string; nameAr: string; nameEn: string; descriptionAr: string; descriptionEn: string;
  capacity: string; slotMinutes: string; opensAt: string; closesAt: string; maxAdvanceDays: string;
  requiresApproval: boolean; isActive: boolean;
};

function emptyForm(propertyId: string): FormState {
  return { propertyId, nameAr: "", nameEn: "", descriptionAr: "", descriptionEn: "", capacity: "1", slotMinutes: "60", opensAt: "08:00", closesAt: "22:00", maxAdvanceDays: "30", requiresApproval: false, isActive: true };
}

export function StaffAmenitiesClient({ properties, amenities, bookings, canManage, locale }: { properties: PropertyOption[]; amenities: StaffAmenity[]; bookings: StaffAmenityBooking[]; canManage: boolean; locale: "ar" | "en" }) {
  const isAr = locale === "ar";
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(() => emptyForm(properties[0]?.id ?? ""));

  const errorText = (error: string) => ({
    invalid_input: isAr ? "راجع الحقول والأوقات المدخلة." : "Check the entered fields and times.",
    duplicate_name: isAr ? "يوجد مرفق بالاسم نفسه في هذا العقار." : "An amenity with this name already exists at the property.",
    forbidden: isAr ? "ليست لديك صلاحية لتنفيذ هذا الإجراء." : "You are not allowed to perform this action.",
    not_found: isAr ? "تعذر العثور على المرفق." : "The amenity could not be found.",
    not_entitled: isAr ? "الخدمة غير متاحة في الباقة الحالية." : "This service is not included in the current plan.",
  })[error] ?? (isAr ? "تعذر تنفيذ الإجراء. حاول مجددًا." : "The action failed. Please try again.");

  const actionInput = {
    nameAr: form.nameAr, nameEn: form.nameEn,
    descriptionAr: form.descriptionAr || null, descriptionEn: form.descriptionEn || null,
    capacity: Number(form.capacity), slotMinutes: Number(form.slotMinutes), opensAt: form.opensAt,
    closesAt: form.closesAt, maxAdvanceDays: Number(form.maxAdvanceDays), requiresApproval: form.requiresApproval,
  };

  function resetForm() {
    setEditingId(null);
    setForm(emptyForm(properties[0]?.id ?? ""));
  }

  function save() {
    startTransition(async () => {
      const result = editingId
        ? await updateAmenityAction({ amenityId: editingId, ...actionInput, isActive: form.isActive })
        : await createAmenityAction({ propertyId: form.propertyId, ...actionInput });
      setMessage(result.ok
        ? { ok: true, text: editingId ? (isAr ? "تم حفظ تعديلات المرفق" : "Amenity changes saved") : (isAr ? "تم إنشاء المرفق" : "Amenity created") }
        : { ok: false, text: errorText(result.error) });
      if (result.ok) resetForm();
    });
  }

  function beginEdit(amenity: StaffAmenity) {
    setEditingId(amenity.id);
    setMessage(null);
    setForm({ propertyId: amenity.propertyId, nameAr: amenity.nameAr, nameEn: amenity.nameEn, descriptionAr: amenity.descriptionAr ?? "", descriptionEn: amenity.descriptionEn ?? "", capacity: String(amenity.capacity), slotMinutes: String(amenity.slotMinutes), opensAt: amenity.opensAt, closesAt: amenity.closesAt, maxAdvanceDays: String(amenity.maxAdvanceDays), requiresApproval: amenity.requiresApproval, isActive: amenity.isActive });
  }

  function decide(bookingId: string, decision: "CONFIRMED" | "REJECTED") {
    startTransition(async () => {
      const result = await decideAmenityBookingAction({ bookingId, decision });
      setMessage(result.ok ? { ok: true, text: isAr ? "تم تحديث الطلب" : "Request updated" } : { ok: false, text: errorText(result.error) });
    });
  }

  function toggleAmenity(amenityId: string, isActive: boolean) {
    startTransition(async () => {
      const result = await setAmenityActiveAction({ amenityId, isActive });
      setMessage(result.ok ? { ok: true, text: isAr ? "تم تحديث حالة المرفق" : "Amenity status updated" } : { ok: false, text: errorText(result.error) });
    });
  }

  const statusLabel = (status: StaffAmenityBooking["status"]) => ({ REQUESTED: isAr ? "بانتظار الموافقة" : "Awaiting approval", CONFIRMED: isAr ? "مؤكد" : "Confirmed", REJECTED: isAr ? "مرفوض" : "Declined", CANCELLED: isAr ? "ملغي" : "Cancelled" })[status];

  return <div className="space-y-5 pb-10">
    <header><h1 className="text-2xl font-black">{isAr ? "المرافق والحجوزات" : "Amenities & Bookings"}</h1><p className="text-sm text-slate-500">{isAr ? "إدارة التوفر والطلبات دون قوائم يدوية." : "Manage availability and booking requests without spreadsheets."}</p></header>
    <div className="grid gap-4 xl:grid-cols-[.75fr_1.25fr]">
      <section className="space-y-3 rounded-2xl border bg-card p-4">
        <h2 className="flex items-center gap-2 font-black">{editingId ? <Pencil className="size-4" /> : <Plus className="size-4" />}{editingId ? (isAr ? "تعديل المرفق" : "Edit amenity") : (isAr ? "إضافة مرفق" : "Add amenity")}</h2>
        {canManage ? <>
          <div className="space-y-1.5"><Label htmlFor="amenity-property">{isAr ? "العقار والمنطقة الزمنية" : "Property and timezone"}</Label><select id="amenity-property" value={form.propertyId} disabled={Boolean(editingId)} onChange={(e) => setForm({ ...form, propertyId: e.target.value })} className="h-10 w-full rounded-xl border bg-background px-3 text-sm disabled:opacity-60">{properties.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.timezone}</option>)}</select></div>
          <div className="grid gap-2 sm:grid-cols-2"><div className="space-y-1.5"><Label htmlFor="amenity-name-ar">{isAr ? "الاسم بالعربية" : "Arabic name"}</Label><Input id="amenity-name-ar" value={form.nameAr} onChange={(e) => setForm({ ...form, nameAr: e.target.value })} /></div><div className="space-y-1.5"><Label htmlFor="amenity-name-en">{isAr ? "الاسم بالإنجليزية" : "English name"}</Label><Input id="amenity-name-en" value={form.nameEn} onChange={(e) => setForm({ ...form, nameEn: e.target.value })} /></div></div>
          <div className="grid gap-2 sm:grid-cols-2"><div className="space-y-1.5"><Label htmlFor="amenity-description-ar">{isAr ? "الوصف بالعربية" : "Arabic description"}</Label><textarea id="amenity-description-ar" value={form.descriptionAr} onChange={(e) => setForm({ ...form, descriptionAr: e.target.value })} maxLength={1000} rows={2} className="w-full rounded-xl border bg-background px-3 py-2 text-sm" /></div><div className="space-y-1.5"><Label htmlFor="amenity-description-en">{isAr ? "الوصف بالإنجليزية" : "English description"}</Label><textarea id="amenity-description-en" value={form.descriptionEn} onChange={(e) => setForm({ ...form, descriptionEn: e.target.value })} maxLength={1000} rows={2} className="w-full rounded-xl border bg-background px-3 py-2 text-sm" /></div></div>
          <div className="grid grid-cols-2 gap-2"><div className="space-y-1.5"><Label htmlFor="amenity-capacity">{isAr ? "السعة" : "Capacity"}</Label><Input id="amenity-capacity" type="number" min={1} max={10000} value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} /></div><div className="space-y-1.5"><Label htmlFor="amenity-slot">{isAr ? "مدة الحجز بالدقائق" : "Slot minutes"}</Label><Input id="amenity-slot" type="number" min={15} max={480} step={15} value={form.slotMinutes} onChange={(e) => setForm({ ...form, slotMinutes: e.target.value })} /></div><div className="space-y-1.5"><Label htmlFor="amenity-opens">{isAr ? "وقت الفتح" : "Opening time"}</Label><Input id="amenity-opens" type="time" value={form.opensAt} onChange={(e) => setForm({ ...form, opensAt: e.target.value })} /></div><div className="space-y-1.5"><Label htmlFor="amenity-closes">{isAr ? "وقت الإغلاق" : "Closing time"}</Label><Input id="amenity-closes" type="time" value={form.closesAt} onChange={(e) => setForm({ ...form, closesAt: e.target.value })} /></div></div>
          <div className="space-y-1.5"><Label htmlFor="amenity-advance-days">{isAr ? "أقصى حجز مسبق بالأيام" : "Maximum advance days"}</Label><Input id="amenity-advance-days" type="number" min={1} max={365} value={form.maxAdvanceDays} onChange={(e) => setForm({ ...form, maxAdvanceDays: e.target.value })} /></div>
          <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={form.requiresApproval} onChange={(e) => setForm({ ...form, requiresApproval: e.target.checked })} />{isAr ? "يتطلب موافقة الإدارة" : "Requires staff approval"}</label>
          <div className="flex gap-2"><Button onClick={save} disabled={isPending || !form.propertyId || !form.nameAr || !form.nameEn} className="flex-1">{editingId ? (isAr ? "حفظ التعديلات" : "Save changes") : (isAr ? "إنشاء المرفق" : "Create amenity")}</Button>{editingId ? <Button type="button" variant="outline" onClick={resetForm} disabled={isPending}>{isAr ? "إلغاء" : "Cancel"}</Button> : null}</div>
        </> : <p className="text-sm text-slate-500">{isAr ? "صلاحية عرض فقط." : "View-only access."}</p>}
        {message ? <p role="status" aria-live="polite" className={`text-xs font-semibold ${message.ok ? "text-emerald-700" : "text-rose-700"}`}>{message.text}</p> : null}
        <div className="space-y-2 border-t pt-3">{amenities.length === 0 ? <p className="py-4 text-center text-sm text-slate-500">{isAr ? "لا توجد مرافق بعد." : "No amenities yet."}</p> : amenities.map((a) => <div key={a.id} className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 p-3 text-xs dark:bg-slate-900"><div><p className="font-bold">{a.name}</p><p className="text-slate-500">{a.propertyName} · {a.opensAt}–{a.closesAt} · {a.slotMinutes}m</p></div>{canManage ? <div className="flex gap-1"><Button size="sm" variant="ghost" onClick={() => beginEdit(a)} disabled={isPending}><Pencil className="me-1 size-3" />{isAr ? "تعديل" : "Edit"}</Button><Button size="sm" variant="outline" onClick={() => toggleAmenity(a.id, !a.isActive)} disabled={isPending}>{a.isActive ? (isAr ? "إيقاف" : "Disable") : (isAr ? "تفعيل" : "Enable")}</Button></div> : null}</div>)}</div>
      </section>
      <section className="rounded-2xl border bg-card"><div className="flex items-center gap-2 border-b p-4 font-black"><CalendarCheck2 className="size-4" />{isAr ? "طلبات الحجز" : "Booking requests"}</div><div className="divide-y">{bookings.length === 0 ? <p className="p-8 text-center text-sm text-slate-500">{isAr ? "لا توجد حجوزات." : "No bookings."}</p> : bookings.map((b) => <article key={b.id} className="grid gap-3 p-4 md:grid-cols-[1fr_auto] md:items-center"><div><p className="font-bold">{b.amenityName}</p><p className="text-xs text-slate-500">{b.memberName} · {b.unitCode} · {new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: b.propertyTimezone }).format(new Date(b.startsAt))} · {b.propertyTimezone}</p>{b.memberNote ? <p className="mt-1 text-xs">{b.memberNote}</p> : null}</div><div className="flex items-center gap-2"><Badge variant="outline">{statusLabel(b.status)}</Badge>{canManage && b.status === "REQUESTED" ? <><Button size="sm" onClick={() => decide(b.id, "CONFIRMED")} disabled={isPending}>{isAr ? "قبول" : "Approve"}</Button><Button size="sm" variant="outline" onClick={() => decide(b.id, "REJECTED")} disabled={isPending}>{isAr ? "رفض" : "Decline"}</Button></> : null}</div></article>)}</div></section>
    </div>
  </div>;
}
