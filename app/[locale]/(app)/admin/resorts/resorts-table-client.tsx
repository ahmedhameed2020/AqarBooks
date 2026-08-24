"use client";

import { useState, useActionState } from "react";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { updateResortAction, deleteResortAction } from "@/lib/actions/tenant";
import type { ActionResult } from "@/lib/actions/platform";
import {
  Building,
  Building2,
  Home,
  Store,
  MapPinned,
  Scale,
  Pencil,
  Trash2,
  X,
  Check,
  CheckCircle2,
  AlertTriangle,
  MapPin,
  Phone,
} from "lucide-react";

export type ResortItem = {
  id: string;
  name: string;
  code: string;
  timezone: string;
  property_type: string | null;
  address: string | null;
  phone: string | null;
};

const TYPE_CONFIG = {
  resort: {
    labelAr: "منتجع / قرية سياحية",
    labelEn: "Resort Complex",
    icon: Building2,
    badgeColor: "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/60 dark:text-purple-300 dark:border-purple-800/60",
  },
  building: {
    labelAr: "عمارة / برج سكني",
    labelEn: "Residential Tower",
    icon: Building,
    badgeColor: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800/60",
  },
  residential_unit: {
    labelAr: "فيلا / وحدة سكنية",
    labelEn: "Villa / Private Unit",
    icon: Home,
    badgeColor: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800/60",
  },
  commercial_unit: {
    labelAr: "محل / مركز تجاري",
    labelEn: "Commercial Retail",
    icon: Store,
    badgeColor: "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800/60",
  },
} as const;

const TIMEZONES = [
  { value: "Africa/Cairo", flag: "🇪🇬", labelAr: "مصر — القاهرة والإسكندرية", labelEn: "Egypt (Africa/Cairo)" },
  { value: "Asia/Riyadh", flag: "🇸🇦", labelAr: "السعودية — الرياض وجدة ومكة", labelEn: "Saudi Arabia (Asia/Riyadh)" },
  { value: "Asia/Dubai", flag: "🇦🇪", labelAr: "الإمارات — دبي وأبوظبي", labelEn: "UAE (Asia/Dubai)" },
  { value: "Asia/Kuwait", flag: "🇰🇼", labelAr: "الكويت — مدينة الكويت", labelEn: "Kuwait (Asia/Kuwait)" },
  { value: "Asia/Qatar", flag: "🇶🇦", labelAr: "قطر — الدوحة", labelEn: "Qatar (Asia/Qatar)" },
  { value: "Asia/Bahrain", flag: "🇧🇭", labelAr: "البحرين — المنامة", labelEn: "Bahrain (Asia/Bahrain)" },
  { value: "Asia/Muscat", flag: "🇴🇲", labelAr: "عمان — مسقط", labelEn: "Oman (Asia/Muscat)" },
] as const;

function getTimezoneFlag(tz?: string | null) {
  if (!tz) return "🌐";
  if (tz.includes("Cairo")) return "🇪🇬 مصر";
  if (tz.includes("Riyadh")) return "🇸🇦 السعودية";
  if (tz.includes("Dubai")) return "🇦🇪 الإمارات";
  if (tz.includes("Kuwait")) return "🇰🇼 الكويت";
  if (tz.includes("Qatar")) return "🇶🇦 قطر";
  if (tz.includes("Bahrain")) return "🇧🇭 البحرين";
  if (tz.includes("Muscat")) return "🇴🇲 عمان";
  return "🌐 " + tz;
}

export function ResortsTableClient({
  resorts,
  locale,
}: {
  resorts: ResortItem[];
  locale: string;
}) {
  const isAr = locale === "ar";
  const [editingResort, setEditingResort] = useState<ResortItem | null>(null);
  const [deletingResort, setDeletingResort] = useState<ResortItem | null>(null);
  const [editPropertyType, setEditPropertyType] = useState<string>("resort");

  const [editState, editAction, editPending] = useActionState<ActionResult, FormData>(
    async (prev, formData) => {
      const res = await updateResortAction(prev, formData);
      if (res.ok) {
        setEditingResort(null);
      }
      return res;
    },
    { ok: true },
  );

  const [deleteState, deleteFormAction, deletePending] = useActionState<ActionResult, FormData>(
    async (prev, formData) => {
      const res = await deleteResortAction(prev, formData);
      if (res.ok) {
        setDeletingResort(null);
      }
      return res;
    },
    { ok: true },
  );

  function startEdit(resort: ResortItem) {
    setEditingResort(resort);
    setEditPropertyType(resort.property_type || "resort");
  }

  return (
    <>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent border-b border-slate-200 dark:border-slate-800">
              <TableHead className="text-xs font-extrabold text-slate-800 dark:text-slate-200">{isAr ? "الكيان العقاري" : "Entity Name"}</TableHead>
              <TableHead className="text-xs font-extrabold text-slate-800 dark:text-slate-200">{isAr ? "النوع" : "Type"}</TableHead>
              <TableHead className="text-xs font-extrabold text-slate-800 dark:text-slate-200">{isAr ? "الرمز" : "Code"}</TableHead>
              <TableHead className="text-xs font-extrabold text-slate-800 dark:text-slate-200">{isAr ? "الدولة والمنطقة الزمنية" : "Country / Timezone"}</TableHead>
              <TableHead className="text-xs font-extrabold text-slate-800 dark:text-slate-200 text-end">{isAr ? "إجراءات التحكم" : "Actions"}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {resorts?.length ? (
              resorts.map((resort) => {
                const typeKey = (resort.property_type as keyof typeof TYPE_CONFIG) || "resort";
                const conf = TYPE_CONFIG[typeKey] || TYPE_CONFIG.resort;
                const Icon = conf.icon;
                const flagDisplay = getTimezoneFlag(resort.timezone);

                return (
                  <TableRow key={resort.id} className="transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/40 border-b border-slate-100 dark:border-slate-800">
                    <TableCell className="py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="flex size-9.5 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-800 border border-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700">
                          <Icon className="size-5" />
                        </div>
                        <div>
                          <p className="font-extrabold text-xs text-slate-900 dark:text-white">{resort.name}</p>
                          {resort.address && (
                            <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 line-clamp-1">{resort.address}</p>
                          )}
                        </div>
                      </div>
                    </TableCell>

                    <TableCell className="py-3.5">
                      <span className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-bold ${conf.badgeColor}`}>
                        <Icon className="size-3.5" />
                        <span>{isAr ? conf.labelAr : conf.labelEn}</span>
                      </span>
                    </TableCell>

                    <TableCell className="py-3.5">
                      <span className="rounded-md bg-slate-100 px-2.5 py-1 font-mono text-xs font-extrabold text-slate-900 border border-slate-300 dark:bg-slate-800 dark:text-white dark:border-slate-700">
                        {resort.code}
                      </span>
                    </TableCell>

                    <TableCell className="py-3.5">
                      <div className="flex items-center gap-1.5 text-xs text-slate-900 dark:text-white font-bold">
                        <span>{flagDisplay}</span>
                        <span className="text-slate-500 dark:text-slate-400 font-mono text-[11px] font-normal">({resort.timezone})</span>
                      </div>
                    </TableCell>

                    <TableCell className="text-end py-3.5">
                      <div className="flex items-center justify-end gap-1.5">
                        <Link
                          href="/property"
                          locale={locale as Locale}
                          title={isAr ? "دليل الوحدات" : "Units"}
                          className="inline-flex items-center gap-1 rounded-lg border border-purple-200 bg-purple-50/70 px-2.5 py-1.5 text-xs font-extrabold text-purple-700 hover:bg-purple-100 hover:border-purple-300 transition-all dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800 cursor-pointer"
                        >
                          <MapPinned className="size-3.5 text-purple-600 dark:text-purple-400" />
                          <span className="hidden sm:inline">{isAr ? "الوحدات" : "Units"}</span>
                        </Link>

                        <Link
                          href="/finance/accounts"
                          locale={locale as Locale}
                          title={isAr ? "دليل الحسابات" : "GL Accounts"}
                          className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50/70 px-2.5 py-1.5 text-xs font-extrabold text-blue-700 hover:bg-blue-100 hover:border-blue-300 transition-all dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800 cursor-pointer"
                        >
                          <Scale className="size-3.5 text-blue-600 dark:text-blue-400" />
                          <span className="hidden sm:inline">{isAr ? "الحسابات" : "GL"}</span>
                        </Link>

                        <button
                          type="button"
                          onClick={() => startEdit(resort)}
                          title={isAr ? "تعديل الكيان" : "Edit Entity"}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-purple-50 hover:text-purple-700 hover:border-purple-300 transition-all dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700 cursor-pointer shadow-2xs"
                        >
                          <Pencil className="size-3.5 text-purple-600" />
                          <span>{isAr ? "تعديل" : "Edit"}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setDeletingResort(resort)}
                          title={isAr ? "حذف الكيان" : "Delete Entity"}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-bold text-red-600 hover:bg-red-50 hover:text-red-700 hover:border-red-300 transition-all dark:bg-slate-800 dark:text-red-400 dark:border-slate-700 cursor-pointer shadow-2xs"
                        >
                          <Trash2 className="size-3.5" />
                          <span>{isAr ? "حذف" : "Delete"}</span>
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            ) : (
              <TableRow>
                <TableCell colSpan={5} className="py-12 text-center text-xs text-slate-500">
                  <Building className="size-8 mx-auto mb-2 text-slate-400" />
                  <p className="font-extrabold text-slate-800 dark:text-slate-200">{isAr ? "لم يتم تسجيل أي كيان عقاري بعد" : "No real estate entities registered yet"}</p>
                  <p className="text-[11px] mt-0.5">{isAr ? "استخدم النموذج أعلاه لإضافة أول قرية، برج، فيلا، أو مجمع تجاري." : "Use the form above to add your first property entity."}</p>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Edit dialog.
          Previously a hand-rolled `fixed inset-0` overlay: no focus trap, no
          Escape handling, no dialog role and no focus return, in a product that
          already ships a Dialog primitive used everywhere else. Rebuilt on that
          primitive so keyboard and screen-reader behaviour comes for free. */}
      <Dialog
        open={editingResort !== null}
        onOpenChange={(next) => {
          if (!next) setEditingResort(null);
        }}
      >
        <DialogContent className="max-w-xl max-h-[90vh] flex flex-col overflow-hidden">
          {editingResort && (
            <>
              <DialogHeader className="shrink-0">
                <div>
                  <DialogTitle>
                    {isAr ? "تعديل بيانات الكيان العقاري" : "Edit property entity"}
                  </DialogTitle>
                  <DialogDescription>
                    <span dir="ltr" className="font-mono">{editingResort.code}</span>
                    {" — "}
                    {editingResort.name}
                  </DialogDescription>
                </div>
              </DialogHeader>

              <form action={editAction} className="flex min-h-0 flex-1 flex-col overflow-hidden">
                <DialogBody className="space-y-5 min-h-0 flex-1 overflow-y-auto p-5">
                  <input type="hidden" name="resortId" value={editingResort.id} />
                  <input type="hidden" name="propertyType" value={editPropertyType} />

                  {/* --- entity type ------------------------------------ */}
                  <section className="space-y-2.5">
                    <div>
                      <Label className="text-xs font-bold">
                        {isAr ? "نوع الكيان العقاري" : "Entity type"}
                      </Label>
                      <p className="text-[11px] text-muted-foreground">
                        {isAr
                          ? "يحدد طريقة عرض الكيان وتصنيفه في التقارير."
                          : "Determines how the entity is presented and grouped in reports."}
                      </p>
                    </div>

                    {/* Two columns, not four. Four cards across a dialog this
                        wide truncated every Arabic label to "محل / مركز ت…",
                        which is a label that cannot be read at all. */}
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {(Object.keys(TYPE_CONFIG) as Array<keyof typeof TYPE_CONFIG>).map((k) => {
                        const conf = TYPE_CONFIG[k];
                        const Icon = conf.icon;
                        const isSelected = editPropertyType === k;
                        return (
                          <button
                            key={k}
                            type="button"
                            aria-pressed={isSelected}
                            onClick={() => setEditPropertyType(k)}
                            className={cn(
                              "flex items-center gap-2.5 rounded-xl border p-2.5 text-start text-xs font-semibold transition-colors cursor-pointer press-feedback motion-control",
                              isSelected
                                ? "border-primary bg-primary/5 text-foreground ring-2 ring-primary/20"
                                : "border-border bg-card text-muted-foreground hover:bg-muted",
                            )}
                          >
                            <span
                              className={cn(
                                "flex size-7 shrink-0 items-center justify-center rounded-lg border",
                                conf.badgeColor,
                              )}
                            >
                              <Icon className="size-3.5" />
                            </span>
                            <span className="min-w-0 flex-1 leading-tight">
                              {isAr ? conf.labelAr : conf.labelEn}
                            </span>
                            {isSelected && <Check className="size-4 shrink-0 text-primary" />}
                          </button>
                        );
                      })}
                    </div>
                  </section>

                  {/* --- identity --------------------------------------- */}
                  <section className="space-y-3">
                    <h4 className="border-b border-border pb-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                      {isAr ? "هوية الكيان" : "Identity"}
                    </h4>

                    <div className="grid gap-3.5 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="resort-name" className="text-xs font-semibold">
                          {isAr ? "اسم الكيان" : "Name"}{" "}
                          <span className="text-destructive">*</span>
                        </Label>
                        <Input
                          id="resort-name"
                          name="name"
                          defaultValue={editingResort.name}
                          required
                          className="h-9.5 text-xs font-bold"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <Label htmlFor="resort-code" className="text-xs font-semibold">
                          {isAr ? "الرمز التعريفي" : "Code"}{" "}
                          <span className="text-destructive">*</span>
                        </Label>
                        <Input
                          id="resort-code"
                          name="code"
                          dir="ltr"
                          defaultValue={editingResort.code}
                          required
                          className="h-9.5 font-mono text-xs font-bold uppercase"
                        />
                        <p className="text-[10px] text-muted-foreground">
                          {isAr
                            ? "يظهر على الوحدات والتقارير — تغييره يغيّر ما يراه المستخدمون."
                            : "Appears on units and reports — changing it changes what people see."}
                        </p>
                      </div>
                    </div>
                  </section>

                  {/* --- location & contact ----------------------------- */}
                  <section className="space-y-3">
                    <h4 className="border-b border-border pb-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                      {isAr ? "الموقع والتواصل" : "Location & contact"}
                    </h4>

                    <div className="space-y-1.5">
                      <Label htmlFor="resort-timezone" className="text-xs font-semibold">
                        {isAr ? "الدولة والمنطقة الزمنية" : "Country & timezone"}{" "}
                        <span className="text-destructive">*</span>
                      </Label>
                      <select
                        id="resort-timezone"
                        name="timezone"
                        defaultValue={editingResort.timezone || "Africa/Cairo"}
                        className="h-9.5 w-full rounded-lg border border-input bg-background px-3 text-xs font-bold text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 cursor-pointer motion-control"
                      >
                        {TIMEZONES.map((tz) => (
                          <option key={tz.value} value={tz.value}>
                            {tz.flag} {isAr ? tz.labelAr : tz.labelEn}
                          </option>
                        ))}
                      </select>
                      <p className="text-[10px] text-muted-foreground">
                        {isAr
                          ? "تُحتسب عليها تواريخ الاستحقاق وإقفال الفترات."
                          : "Due dates and period closing are calculated against it."}
                      </p>
                    </div>

                    <div className="grid gap-3.5 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="resort-address" className="text-xs font-semibold">
                          {isAr ? "المدينة / العنوان" : "City / address"}
                          <span className="ms-1 font-normal text-muted-foreground">
                            {isAr ? "(اختياري)" : "(optional)"}
                          </span>
                        </Label>
                        <Input
                          id="resort-address"
                          name="address"
                          defaultValue={editingResort.address || ""}
                          className="h-9.5 text-xs"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <Label htmlFor="resort-phone" className="text-xs font-semibold">
                          {isAr ? "هاتف التواصل" : "Contact phone"}
                          <span className="ms-1 font-normal text-muted-foreground">
                            {isAr ? "(اختياري)" : "(optional)"}
                          </span>
                        </Label>
                        <Input
                          id="resort-phone"
                          name="phone"
                          dir="ltr"
                          defaultValue={editingResort.phone || ""}
                          placeholder="+20 10 0000 0000"
                          className="h-9.5 font-mono text-xs"
                        />
                      </div>
                    </div>
                  </section>

                  {!editState.ok && (
                    <p
                      role="alert"
                      className="rounded-lg border border-destructive/40 bg-destructive/10 p-2.5 text-xs font-semibold text-destructive"
                    >
                      {editState.error}
                    </p>
                  )}
                </DialogBody>

                <DialogFooter className="shrink-0">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setEditingResort(null)}
                    className="border-border hover:bg-muted text-foreground press-feedback motion-control"
                  >
                    {isAr ? "إلغاء" : "Cancel"}
                  </Button>
                  <Button
                    type="submit"
                    disabled={editPending}
                    className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold shadow-xs press-feedback motion-control"
                  >
                    {editPending
                      ? isAr
                        ? "جارٍ الحفظ…"
                        : "Saving…"
                      : isAr
                        ? "حفظ التعديلات"
                        : "Save changes"}
                  </Button>
                </DialogFooter>
              </form>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* DELETE CONFIRMATION DIALOG */}
      {deletingResort && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-md rounded-2xl border border-red-200 bg-white p-6 shadow-2xl dark:border-red-900 dark:bg-slate-900">
            <div className="flex items-center gap-3 text-red-600">
              <div className="size-10 rounded-xl bg-red-100 flex items-center justify-center text-red-600 dark:bg-red-950">
                <AlertTriangle className="size-5.5" />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900 dark:text-white">
                  {isAr ? "تأكيد حذف الكيان العقاري" : "Confirm Deletion"}
                </h3>
                <p className="text-xs text-red-600 font-bold">
                  {isAr ? "عملية نهائية غير قابلة للتراجع" : "Irreversible Action"}
                </p>
              </div>
            </div>

            <div className="my-4 rounded-xl bg-slate-50 p-3.5 border border-slate-200 dark:bg-slate-800 dark:border-slate-700">
              <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                {isAr ? "الكيان المستهدف:" : "Target Entity:"} <span className="font-extrabold text-purple-700 dark:text-purple-300">{deletingResort.name}</span> ({deletingResort.code})
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                {isAr
                  ? "ملاحظة أمان: لن يسمح النظام بالحذف إذا كانت هناك وحدات عقارية مرتبطة بهذا الكيان لحماية القيود المحاسبية."
                  : "Note: System will prevent deletion if units are mapped to protect accounting ledger."}
              </p>
            </div>

            {!deleteState.ok && (
              <p className="mb-3 text-xs font-bold text-red-700 bg-red-50 p-2.5 rounded-lg border border-red-200">
                {deleteState.error}
              </p>
            )}

            <form action={deleteFormAction}>
              <input type="hidden" name="resortId" value={deletingResort.id} />
              <div className="flex items-center justify-end gap-2.5 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setDeletingResort(null)}
                  className="text-xs font-bold cursor-pointer"
                >
                  {isAr ? "تراجع" : "Cancel"}
                </Button>
                <Button
                  type="submit"
                  disabled={deletePending}
                  size="sm"
                  className="bg-red-600 hover:bg-red-700 text-white font-extrabold text-xs shadow-md cursor-pointer"
                >
                  {deletePending ? (isAr ? "جارٍ الحذف..." : "Deleting...") : (isAr ? "تأكيد الحذف نهائياً" : "Confirm Delete")}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
