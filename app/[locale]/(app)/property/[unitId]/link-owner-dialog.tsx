"use client";

import { useState, useTransition } from "react";
import { UserPlus, UserCheck, Check, AlertCircle, Loader2 } from "lucide-react";
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

export interface MemberOption {
  id: string;
  full_name: string;
  phone?: string | null;
  email?: string | null;
}

export function LinkOwnerDialog({
  organizationId,
  unitId,
  unitCode,
  members,
  locale,
  trigger,
}: {
  organizationId: string;
  unitId: string;
  unitCode: string;
  members: MemberOption[];
  locale: string;
  trigger?: React.ReactElement;
}) {
  const isAr = locale === "ar";
  const [open, setOpen] = useState(false);
  const [selectedMemberId, setSelectedMemberId] = useState<string>("");
  const [sharePercentage, setSharePercentage] = useState<number>(100);
  const [startDate, setStartDate] = useState<string>(
    new Date().toISOString().slice(0, 10)
  );
  const [searchFilter, setSearchFilter] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const filteredMembers = members.filter((m) => {
    const q = searchFilter.toLowerCase().trim();
    if (!q) return true;
    const name = m.full_name.toLowerCase();
    const phone = m.phone?.toLowerCase() || "";
    const email = m.email?.toLowerCase() || "";
    return name.includes(q) || phone.includes(q) || email.includes(q);
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedMemberId) {
      setErrorMsg(isAr ? "يرجى اختيار المالك أولاً" : "Please select an owner");
      return;
    }

    setErrorMsg(null);
    const fd = new FormData();
    fd.set("organizationId", organizationId);
    fd.set("unitId", unitId);
    fd.set("memberId", selectedMemberId);
    fd.set("sharePercentage", String(sharePercentage || 100));
    fd.set("startDate", startDate);

    startTransition(async () => {
      const res = await linkOwnershipAction({ ok: true }, fd);
      if (res.ok) {
        setOpen(false);
        setSelectedMemberId("");
        setSharePercentage(100);
      } else {
        setErrorMsg(
          res.error || (isAr ? "حدث خطأ أثناء ربط المالك" : "Error linking owner")
        );
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          trigger || (
            <Button size="sm" className="gap-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white font-semibold shadow-xs">
              <UserPlus className="size-3.5" />
              <span>{isAr ? "ربط مالك / شريك جديد" : "Link Owner / Co-owner"}</span>
            </Button>
          )
        }
      />
      <DialogContent className="sm:max-w-[480px] p-6">
        <DialogHeader className="space-y-2">
          <div className="size-10 rounded-xl bg-violet-50 dark:bg-violet-950/60 border border-violet-200/60 dark:border-violet-800 flex items-center justify-center text-violet-600 dark:text-violet-400 mb-1">
            <UserCheck className="size-5" />
          </div>
          <DialogTitle className="text-lg font-bold">
            {isAr ? "إسناد وتعيين مالك للوحدة" : "Assign Owner to Unit"}
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-500">
            {isAr
              ? `إضافة مالك أو شريك بحصة ملكية للوحدة العقارية (${unitCode}).`
              : `Assign an owner or co-owner stake for unit (${unitCode}).`}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          {errorMsg && (
            <div className="flex items-center gap-2 p-3 text-xs text-rose-600 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 rounded-xl">
              <AlertCircle className="size-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Member selection */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold">
              {isAr ? "اختر المالك / العضو من الدليل *" : "Select Member / Owner *"}
            </Label>
            <Input
              type="text"
              placeholder={isAr ? "ابحث باسم المالك، الهاتف، أو البريد..." : "Search by owner name, phone, or email..."}
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="text-xs mb-2"
            />
            <div className="max-h-48 overflow-y-auto border border-border/70 rounded-xl p-1 divide-y divide-border/40 bg-slate-50/50 dark:bg-slate-900/50">
              {filteredMembers.length ? (
                filteredMembers.map((m) => {
                  const isSelected = selectedMemberId === m.id;
                  return (
                    <button
                      type="button"
                      key={m.id}
                      onClick={() => setSelectedMemberId(m.id)}
                      className={`w-full flex items-center justify-between p-2.5 rounded-lg text-start transition-colors ${
                        isSelected
                          ? "bg-violet-600 text-white font-bold"
                          : "hover:bg-slate-200/60 dark:hover:bg-slate-800/60 text-slate-800 dark:text-slate-200"
                      }`}
                    >
                      <div className="flex flex-col">
                        <span className="text-sm font-bold">{m.full_name}</span>
                        {(m.phone || m.email) && (
                          <span
                            className={`text-xs ${
                              isSelected
                                ? "text-violet-100"
                                : "text-slate-500 dark:text-slate-400"
                            }`}
                            dir="ltr"
                          >
                            {m.phone || m.email}
                          </span>
                        )}
                      </div>
                      {isSelected && <Check className="size-4 shrink-0" />}
                    </button>
                  );
                })
              ) : (
                <div className="p-4 text-center text-xs text-slate-400">
                  {isAr ? "لا يوجد أعضاء مطابقون للبحث" : "No matching members"}
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
              disabled={isPending || !selectedMemberId}
              className="bg-violet-600 hover:bg-violet-700 text-white font-bold"
            >
              {isPending ? (
                <>
                  <Loader2 className="size-4 animate-spin me-2" />
                  {isAr ? "جاري الحفظ..." : "Saving..."}
                </>
              ) : (
                isAr ? "إسناد الملكية" : "Assign Ownership"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
