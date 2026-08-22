"use client";

import { useState, useTransition } from "react";
import { Plus, Building2, Check, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { linkOwnershipAction } from "@/lib/actions/property";

export interface UnitOption {
  id: string;
  code: string;
  building_name_ar?: string | null;
  building_name_en?: string | null;
}

export function LinkUnitDialog({
  organizationId,
  memberId,
  memberName,
  units,
  locale,
  trigger,
}: {
  organizationId: string;
  memberId: string;
  memberName: string;
  units: UnitOption[];
  locale: string;
  trigger?: React.ReactElement;
}) {
  const isAr = locale === "ar";
  const [open, setOpen] = useState(false);
  const [selectedUnitId, setSelectedUnitId] = useState<string>("");
  const [sharePercentage, setSharePercentage] = useState<number>(100);
  const [startDate, setStartDate] = useState<string>(
    new Date().toISOString().slice(0, 10)
  );
  const [searchFilter, setSearchFilter] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const filteredUnits = units.filter((u) => {
    const q = searchFilter.toLowerCase().trim();
    if (!q) return true;
    const bAr = u.building_name_ar?.toLowerCase() || "";
    const bEn = u.building_name_en?.toLowerCase() || "";
    return u.code.toLowerCase().includes(q) || bAr.includes(q) || bEn.includes(q);
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedUnitId) {
      setErrorMsg(isAr ? "يرجى اختيار الوحدة أولاً" : "Please select a unit");
      return;
    }

    setErrorMsg(null);
    const fd = new FormData();
    fd.set("organizationId", organizationId);
    fd.set("memberId", memberId);
    fd.set("unitId", selectedUnitId);
    fd.set("sharePercentage", String(sharePercentage || 100));
    fd.set("startDate", startDate);

    startTransition(async () => {
      const res = await linkOwnershipAction({ ok: true }, fd);
      if (res.ok) {
        setOpen(false);
        setSelectedUnitId("");
        setSharePercentage(100);
      } else {
        setErrorMsg(
          res.error || (isAr ? "حدث خطأ أثناء ربط الوحدة" : "Error linking unit")
        );
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          trigger || (
            <Button className="gap-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white shadow-sm font-semibold">
              <Plus className="size-4" />
              <span>{isAr ? "ربط وحدة عقارية" : "Link Real Estate Unit"}</span>
            </Button>
          )
        }
      />
      <DialogContent className="sm:max-w-[480px] p-6">
        <DialogHeader className="space-y-2">
          <div className="size-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200/60 dark:border-indigo-800 flex items-center justify-center text-indigo-600 dark:text-indigo-400 mb-1">
            <Building2 className="size-5" />
          </div>
          <DialogTitle className="text-lg font-bold">
            {isAr ? "ربط وحدة عقارية بالمالك" : "Link Real Estate Unit to Owner"}
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-500">
            {isAr
              ? `تخصيص وإسناد حصة ملكية في وحدة عقارية للمالك (${memberName}).`
              : `Assign an ownership stake in a unit to (${memberName}).`}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          {errorMsg && (
            <div className="flex items-center gap-2 p-3 text-xs text-rose-600 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 rounded-xl">
              <AlertCircle className="size-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Unit selection */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold">
              {isAr ? "اختر الوحدة العقارية *" : "Select Unit *"}
            </Label>
            <Input
              type="text"
              placeholder={isAr ? "ابحث برقم الوحدة أو اسم المبنى..." : "Search by unit code or building..."}
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="text-xs mb-2"
            />
            <div className="max-h-48 overflow-y-auto border border-border/70 rounded-xl p-1 divide-y divide-border/40 bg-slate-50/50 dark:bg-slate-900/50">
              {filteredUnits.length ? (
                filteredUnits.map((u) => {
                  const isSelected = selectedUnitId === u.id;
                  const bName = isAr ? u.building_name_ar : u.building_name_en;
                  return (
                    <button
                      type="button"
                      key={u.id}
                      onClick={() => setSelectedUnitId(u.id)}
                      className={`w-full flex items-center justify-between p-2.5 rounded-lg text-start transition-colors ${
                        isSelected
                          ? "bg-indigo-600 text-white font-bold"
                          : "hover:bg-slate-200/60 dark:hover:bg-slate-800/60 text-slate-800 dark:text-slate-200"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-black">{u.code}</span>
                        {bName && (
                          <span
                            className={`text-xs ${
                              isSelected
                                ? "text-indigo-100"
                                : "text-slate-500 dark:text-slate-400"
                            }`}
                          >
                            • {bName}
                          </span>
                        )}
                      </div>
                      {isSelected && <Check className="size-4 shrink-0" />}
                    </button>
                  );
                })
              ) : (
                <div className="p-4 text-center text-xs text-slate-400">
                  {isAr ? "لا توجد وحدات مطابقة للبحث" : "No matching units"}
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Share Percentage */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">
                {isAr ? "نسبة الملكية (%)" : "Ownership Share (%)"}
              </Label>
              <Input
                type="number"
                min="1"
                max="100"
                step="0.5"
                value={sharePercentage}
                onChange={(e) => setSharePercentage(Number(e.target.value))}
                required
                className="font-bold text-center"
              />
            </div>

            {/* Start Date */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">
                {isAr ? "تاريخ بدء الملكية" : "Start Date"}
              </Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
                className="text-xs text-center"
              />
            </div>
          </div>

          <DialogFooter className="pt-2 gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isPending}
            >
              {isAr ? "إلغاء" : "Cancel"}
            </Button>
            <Button
              type="submit"
              disabled={isPending || !selectedUnitId}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold"
            >
              {isPending ? (
                <>
                  <Loader2 className="size-4 animate-spin me-2" />
                  {isAr ? "جاري الربط..." : "Linking..."}
                </>
              ) : (
                isAr ? "تأكيد ربط الوحدة" : "Confirm Link"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
