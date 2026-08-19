"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Layers,
  Plus,
  Building2,
  Calendar,
  DollarSign,
  AlertCircle,
  RefreshCw,
  Tag,
  Scale,
} from "lucide-react";
import { createServiceChargeLevy } from "@/lib/actions/service-charges";
import { useToast } from "@/components/ui/toast";
import { getCurrencyLabel } from "@/lib/currency";

export type Option = { id: string; label: string };

const ALLOCATION_BASES = [
  { value: "AREA", labelAr: "توزيع حسب المساحة (By Area)", labelEn: "By Area (Proportionate)" },
  { value: "EQUAL", labelAr: "توزيع بالتساوي (Equal Split)", labelEn: "Equal Split" },
  { value: "CUSTOM", labelAr: "أوزان مخصصة (Custom Weights)", labelEn: "Custom Weights" },
] as const;

export function CreateLevyDialog({
  open,
  onOpenChange,
  organizationId,
  properties,
  dueTypes,
  receivableAccounts,
  currency = "EGP",
  locale,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  properties: Option[];
  dueTypes: Option[];
  receivableAccounts: Option[];
  currency?: string;
  locale: string;
}) {
  const isAr = locale === "ar";
  const currencyLabel = getCurrencyLabel(currency, isAr);
  const router = useRouter();
  const toast = useToast();
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [propertyId, setPropertyId] = useState<string>(properties[0]?.id ?? "");
  const [dueTypeId, setDueTypeId] = useState<string>(dueTypes[0]?.id ?? "");
  const [receivableAccountId, setReceivableAccountId] = useState<string>(receivableAccounts[0]?.id ?? "");
  const [allocationBasis, setAllocationBasis] = useState<string>("AREA");
  const [totalAmount, setTotalAmount] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [issueDate, setIssueDate] = useState(new Date().toISOString().split("T")[0]);
  const [dueDate, setDueDate] = useState(new Date().toISOString().split("T")[0]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!name.trim() || !propertyId || !dueTypeId || !receivableAccountId || !totalAmount || Number(totalAmount) <= 0) {
      setErrorMsg(isAr ? "يرجى تعبئة جميع الحقول المطلوبة" : "Please fill in all required fields");
      return;
    }

    startTransition(async () => {
      const formData = new FormData();
      formData.set("organizationId", organizationId);
      formData.set("name", name.trim());
      formData.set("propertyId", propertyId);
      formData.set("dueTypeId", dueTypeId);
      formData.set("receivableAccountId", receivableAccountId);
      formData.set("allocationBasis", allocationBasis);
      formData.set("totalAmount", totalAmount);
      formData.set("periodStart", periodStart);
      formData.set("periodEnd", periodEnd);
      formData.set("issueDate", issueDate);
      formData.set("dueDate", dueDate);

      const res = await createServiceChargeLevy({ ok: true }, formData);

      if (res.ok) {
        toast.add({
          type: "success",
          title: isAr ? "تم إنشاء تحصيلة رسوم الخدمة" : "Service Charge Levy Created",
          description: isAr ? `تم تسجيل تحصيلة "${name}" بنجاح` : `Created levy "${name}" successfully`,
        });
        onOpenChange(false);
        router.refresh();
      } else {
        setErrorMsg(res.error || (isAr ? "فشل إنشاء التحصيلة" : "Failed to create levy"));
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="p-5 pb-3 border-b border-slate-200 dark:border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-blue-600/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400">
              <Layers className="size-5" />
            </div>
            <div>
              <DialogTitle>{isAr ? "إنشاء تحصيلة رسوم خدمة وصيانة" : "Create Service Charge Levy"}</DialogTitle>
              <DialogDescription>
                {isAr
                  ? "توزيع تكلفة التشغيل والمصروفات على وحدات العقار بأساس حسابي دقيق."
                  : "Distribute common area operational expenses across units based on area/weights."}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <DialogBody className="p-5 space-y-4 overflow-y-auto flex-1">
            {errorMsg && (
              <div role="alert" className="flex items-center gap-2.5 rounded-xl border border-red-200 bg-red-50/90 p-3 text-xs font-semibold text-red-700 dark:border-red-900/50 dark:bg-red-950/50 dark:text-red-300">
                <AlertCircle className="size-4 shrink-0 text-red-600 dark:text-red-400" />
                <span>{errorMsg}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5 text-start sm:col-span-2">
                <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  {isAr ? "مسمى / عنوان التحصيلة *" : "Levy Name / Title *"}
                </Label>
                <Input
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={isAr ? "مثال: رسوم صيانة وتشغيل الربع الثاني 2026" : "e.g. Q2 2026 Maintenance & Service Levy"}
                  className="text-sm"
                />
              </div>

              <div className="space-y-1.5 text-start">
                <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  {isAr ? "المشروع / العقار *" : "Property *"}
                </Label>
                <Select value={propertyId} onValueChange={(val) => setPropertyId(val ?? "")} items={properties.map((p) => ({ value: p.id, label: p.label }))}>
                  <SelectTrigger className="w-full text-xs">
                    <SelectValue placeholder={isAr ? "اختر العقار..." : "Select property..."} />
                  </SelectTrigger>
                  <SelectContent>
                    {properties.map((p) => (
                      <SelectItem key={p.id} value={p.id} className="text-xs font-bold">
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5 text-start">
                <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  {isAr ? "أساس وطريقة التوزيع *" : "Allocation Basis *"}
                </Label>
                <Select value={allocationBasis} onValueChange={(val) => setAllocationBasis(val ?? "AREA")} items={ALLOCATION_BASES.map((b) => ({ value: b.value, label: isAr ? b.labelAr : b.labelEn }))}>
                  <SelectTrigger className="w-full text-xs font-bold">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ALLOCATION_BASES.map((b) => (
                      <SelectItem key={b.value} value={b.value} className="text-xs">
                        {isAr ? b.labelAr : b.labelEn}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5 text-start">
                <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  {isAr ? "نوع المستحق الصادر *" : "Due Type *"}
                </Label>
                <Select value={dueTypeId} onValueChange={(val) => setDueTypeId(val ?? "")} items={dueTypes.map((d) => ({ value: d.id, label: d.label }))}>
                  <SelectTrigger className="w-full text-xs">
                    <SelectValue placeholder={isAr ? "اختر النوع..." : "Select due type..."} />
                  </SelectTrigger>
                  <SelectContent>
                    {dueTypes.map((d) => (
                      <SelectItem key={d.id} value={d.id} className="text-xs">
                        {d.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5 text-start">
                <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  {isAr ? "حساب الذمم المدينة *" : "Receivable Account *"}
                </Label>
                <Select value={receivableAccountId} onValueChange={(val) => setReceivableAccountId(val ?? "")} items={receivableAccounts.map((a) => ({ value: a.id, label: a.label }))}>
                  <SelectTrigger className="w-full text-xs">
                    <SelectValue placeholder={isAr ? "اختر الحساب..." : "Select account..."} />
                  </SelectTrigger>
                  <SelectContent>
                    {receivableAccounts.map((a) => (
                      <SelectItem key={a.id} value={a.id} className="text-xs">
                        {a.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5 text-start">
              <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                {isAr ? "إجمالي المبلغ المطلوب توزيعه بالكامل *" : "Total Amount to Distribute *"}
              </Label>
              <div className="relative">
                <Input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  value={totalAmount}
                  onChange={(e) => setTotalAmount(e.target.value)}
                  placeholder="0.00"
                  className="font-mono text-sm font-bold ps-3 pe-14 text-start"
                  dir="ltr"
                />
                <div className="absolute inset-y-0 end-0 flex items-center pe-3 pointer-events-none text-xs font-bold text-slate-400">
                  {currencyLabel}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5 text-start">
                <Label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                  <Calendar className="size-3 text-slate-400" />
                  <span>{isAr ? "بداية فترة التغطية *" : "Period Start *"}</span>
                </Label>
                <Input
                  type="date"
                  required
                  value={periodStart}
                  onChange={(e) => setPeriodStart(e.target.value)}
                  className="font-mono text-xs"
                />
              </div>

              <div className="space-y-1.5 text-start">
                <Label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                  <Calendar className="size-3 text-slate-400" />
                  <span>{isAr ? "نهاية فترة التغطية *" : "Period End *"}</span>
                </Label>
                <Input
                  type="date"
                  required
                  value={periodEnd}
                  onChange={(e) => setPeriodEnd(e.target.value)}
                  className="font-mono text-xs"
                />
              </div>
            </div>
          </DialogBody>

          <DialogFooter className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 shrink-0 flex items-center justify-between w-full">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
              {isAr ? "إلغاء" : "Cancel"}
            </Button>
            <Button type="submit" disabled={isPending || !name.trim() || !totalAmount || Number(totalAmount) <= 0} className="bg-blue-600 hover:bg-blue-700 text-white font-bold gap-1.5">
              {isPending ? <RefreshCw className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
              <span>{isAr ? "إنشاء التحصيلة وحساب الأنصبة" : "Create Levy & Compute Shares"}</span>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
