"use client";

import { useState, useMemo, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import {
  Scale,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Search,
  Check,
  RotateCcw,
  Edit3,
  ExternalLink,
  Layers,
  FileCheck2,
  Percent,
  RefreshCw,
  AlertCircle,
  HelpCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  setDueTypeRevenueNature,
  approveDueTypeRevenueNature,
  revokeDueTypeRevenueNatureApproval,
} from "@/lib/actions/tax-mapping";
import { useToast } from "@/components/ui/toast";
import type { NatureOption } from "./tax-mapping-forms";

export type MappingItem = {
  due_type_id: string;
  due_type_name_ar: string;
  due_type_name_en: string;
  mapping_id: string | null;
  revenue_nature: string | null;
  nature_name_ar: string | null;
  nature_name_en: string | null;
  status: "APPROVED" | "REVIEW_REQUIRED" | "UNMAPPED" | string;
  notes: string | null;
  approved_at: string | null;
  updated_at: string | null;
};

export function TaxMappingClient({
  mappings,
  natures,
  canManage,
  locale,
}: {
  mappings: MappingItem[];
  natures: NatureOption[];
  canManage: boolean;
  locale: string;
}) {
  const isAr = locale === "ar";
  const router = useRouter();
  const toast = useToast();

  const [activeTab, setActiveTab] = useState<"ALL" | "PENDING" | "APPROVED">("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedMapping, setSelectedMapping] = useState<MappingItem | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

  // Edit Form States
  const [editNature, setEditNature] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const openEditDialog = (item: MappingItem) => {
    setSelectedMapping(item);
    setEditNature(item.revenue_nature || "");
    setEditNotes(item.notes || "");
    setErrorMsg(null);
    setIsEditDialogOpen(true);
  };

  const handleSaveMapping = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMapping) return;
    setErrorMsg(null);

    if (!editNature) {
      setErrorMsg(isAr ? "يرجى اختيار طبيعة الإيراد الضريبي" : "Please select revenue nature");
      return;
    }

    startTransition(async () => {
      const formData = new FormData();
      formData.set("dueTypeId", selectedMapping.due_type_id);
      formData.set("revenueNature", editNature);
      if (editNotes.trim()) formData.set("notes", editNotes.trim());

      const res = await setDueTypeRevenueNature({ ok: true }, formData);
      if (res.ok) {
        toast.add({
          type: "success",
          title: isAr ? "تم حفظ الربط الضريبي" : "Tax Mapping Saved",
          description: isAr
            ? `تم تحديث التصنيف الضريبي للبند "${selectedMapping.due_type_name_ar}"`
            : `Updated tax mapping for "${selectedMapping.due_type_name_en}"`,
        });
        setIsEditDialogOpen(false);
        router.refresh();
      } else {
        setErrorMsg(res.error || (isAr ? "فشل حفظ الربط" : "Failed to save mapping"));
      }
    });
  };

  const handleApprove = (mappingId: string, name: string) => {
    startTransition(async () => {
      const formData = new FormData();
      formData.set("mappingId", mappingId);
      const res = await approveDueTypeRevenueNature({ ok: true }, formData);
      if (res.ok) {
        toast.add({
          type: "success",
          title: isAr ? "تم اعتماد الربط الضريبي" : "Mapping Approved",
          description: isAr
            ? `تم اعتماد التصنيف الضريبي لبند "${name}" قانونياً`
            : `Approved statutory mapping for "${name}"`,
        });
        router.refresh();
      } else {
        toast.add({
          type: "error",
          title: isAr ? "فشل الاعتماد" : "Approval Failed",
          description: res.error || (isAr ? "حدث خطأ أثناء الاعتماد" : "An error occurred"),
        });
      }
    });
  };

  const handleRevoke = (mappingId: string, name: string) => {
    startTransition(async () => {
      const formData = new FormData();
      formData.set("mappingId", mappingId);
      const res = await revokeDueTypeRevenueNatureApproval({ ok: true }, formData);
      if (res.ok) {
        toast.add({
          type: "info",
          title: isAr ? "تم إلغاء الاعتماد" : "Approval Revoked",
          description: isAr
            ? `تمت إعادة بند "${name}" إلى قائمة انتظار المراجعة`
            : `Returned "${name}" to pending review`,
        });
        router.refresh();
      } else {
        toast.add({
          type: "error",
          title: isAr ? "فشل إلغاء الاعتماد" : "Revoke Failed",
          description: res.error || (isAr ? "حدث خطأ" : "An error occurred"),
        });
      }
    });
  };

  // Filter items
  const filteredMappings = useMemo(() => {
    return mappings.filter((m) => {
      const matchesTab =
        activeTab === "ALL" ||
        (activeTab === "APPROVED" && m.status === "APPROVED") ||
        (activeTab === "PENDING" && m.status !== "APPROVED");

      if (!matchesTab) return false;

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      return (
        m.due_type_name_ar.toLowerCase().includes(q) ||
        m.due_type_name_en.toLowerCase().includes(q) ||
        (m.nature_name_ar || "").toLowerCase().includes(q) ||
        (m.nature_name_en || "").toLowerCase().includes(q) ||
        (m.revenue_nature || "").toLowerCase().includes(q)
      );
    });
  }, [mappings, activeTab, searchQuery]);

  const pendingCount = mappings.filter((m) => m.status !== "APPROVED").length;
  const approvedCount = mappings.filter((m) => m.status === "APPROVED").length;

  return (
    <div className="space-y-6">
      {/* ──────────────────────────────────────────────────────────────────────────
          MAIN ACTION TOOLBAR & TABS
          ────────────────────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white dark:bg-slate-900 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl w-full sm:w-auto">
          <button
            onClick={() => setActiveTab("ALL")}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all ${
              activeTab === "ALL"
                ? "bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
            }`}
          >
            <Layers className="size-3.5 text-blue-600" />
            <span>{isAr ? "جميع بنود المطالبات" : "All Due Types"}</span>
            <Badge variant="secondary" className="text-[10px] h-4 px-1 ms-1">
              {mappings.length}
            </Badge>
          </button>

          <button
            onClick={() => setActiveTab("PENDING")}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all ${
              activeTab === "PENDING"
                ? "bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
            }`}
          >
            <Clock className="size-3.5 text-amber-600" />
            <span>{isAr ? "بانتظار المراجعة والاعتماد" : "Pending Review"}</span>
            {pendingCount > 0 && (
              <Badge className="text-[10px] bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950 dark:text-amber-300 ms-1 h-4 px-1">
                {pendingCount}
              </Badge>
            )}
          </button>

          <button
            onClick={() => setActiveTab("APPROVED")}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all ${
              activeTab === "APPROVED"
                ? "bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
            }`}
          >
            <CheckCircle2 className="size-3.5 text-emerald-600" />
            <span>{isAr ? "المعتمدة قانونياً" : "Approved"}</span>
            <Badge variant="secondary" className="text-[10px] h-4 px-1 ms-1">
              {approvedCount}
            </Badge>
          </button>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={isAr ? "بحث في البنود والتصنيفات..." : "Search due types..."}
            className="ps-9 text-xs h-9"
          />
        </div>
      </div>

      {/* ──────────────────────────────────────────────────────────────────────────
          HIGH-CONTRAST TAX MAPPINGS TABLE
          ────────────────────────────────────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-start">
            <thead className="bg-slate-900 text-white dark:bg-slate-800/90 font-bold border-b border-slate-800">
              <tr>
                <th className="p-3.5 text-start">{isAr ? "بند المطالبة (الاستحقاق)" : "Due Type Name"}</th>
                <th className="p-3.5 text-start">{isAr ? "طبيعة الإيراد والتصنيف الضريبي" : "Revenue Tax Nature"}</th>
                <th className="p-3.5 text-center">{isAr ? "المعاملة الضريبية" : "Tax Treatment"}</th>
                <th className="p-3.5 text-start">{isAr ? "المستند / المرجع" : "Reference Notes"}</th>
                <th className="p-3.5 text-center">{isAr ? "الحالة" : "Status"}</th>
                <th className="p-3.5 text-end">{isAr ? "الإجراءات" : "Actions"}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredMappings.length ? (
                filteredMappings.map((m) => {
                  const isApproved = m.status === "APPROVED";
                  const isExempt =
                    (m.revenue_nature || "").includes("RESIDENTIAL_RENT") ||
                    (m.revenue_nature || "").includes("RESIDENTIAL_UNIT_SALE");

                  return (
                    <tr
                      key={m.due_type_id}
                      className="hover:bg-slate-50/70 dark:hover:bg-slate-800/50 transition-colors group"
                    >
                      {/* 1. Due Type Name */}
                      <td className="p-3.5 font-bold text-slate-900 dark:text-white">
                        <div className="flex items-center gap-2">
                          <Scale className="size-4 text-purple-600 shrink-0" />
                          <div>
                            <div>{isAr ? m.due_type_name_ar : m.due_type_name_en}</div>
                            {m.approved_at && (
                              <div className="text-[10px] text-slate-400 font-normal mt-0.5">
                                {isAr ? "اعتمد بتاريخ: " : "Approved: "}
                                {new Date(m.approved_at).toLocaleDateString(isAr ? "ar-EG" : "en-GB")}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* 2. Revenue Nature */}
                      <td className="p-3.5">
                        {m.revenue_nature ? (
                          <div>
                            <div className="font-bold text-slate-800 dark:text-slate-200">
                              {isAr ? m.nature_name_ar ?? m.revenue_nature : m.nature_name_en ?? m.revenue_nature}
                            </div>
                            <span className="font-mono text-[10px] text-slate-400">{m.revenue_nature}</span>
                          </div>
                        ) : (
                          <span className="text-amber-600 dark:text-amber-400 text-xs font-semibold">
                            {isAr ? "⚠️ غير مربوط بعد" : "Unmapped"}
                          </span>
                        )}
                      </td>

                      {/* 3. Tax Treatment Rate */}
                      <td className="p-3.5 text-center">
                        {m.revenue_nature ? (
                          isExempt ? (
                            <Badge variant="outline" className="text-[10px] bg-slate-50 text-slate-700">
                              {isAr ? "معفى 0%" : "Exempt 0%"}
                            </Badge>
                          ) : (
                            <Badge className="text-[10px] bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-950 dark:text-purple-300">
                              {isAr ? "خاضع 14%" : "Standard 14%"}
                            </Badge>
                          )
                        ) : (
                          <span className="text-slate-400 text-[11px]">—</span>
                        )}
                      </td>

                      {/* 4. Reference Notes */}
                      <td className="p-3.5 text-slate-600 dark:text-slate-400 text-[11px]">
                        {m.notes || "—"}
                      </td>

                      {/* 5. Status Badge */}
                      <td className="p-3.5 text-center">
                        {isApproved ? (
                          <Badge className="text-[10px] font-bold bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300">
                            {isAr ? "✓ معتمد قانونياً" : "Approved"}
                          </Badge>
                        ) : (
                          <Badge className="text-[10px] font-bold bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950 dark:text-amber-300">
                            {isAr ? "يحتاج مراجعة" : "Review Required"}
                          </Badge>
                        )}
                      </td>

                      {/* 6. Actions */}
                      <td className="p-3.5 text-end">
                        {canManage ? (
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openEditDialog(m)}
                              className="h-7 text-xs px-2.5 gap-1 font-bold border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                            >
                              <Edit3 className="size-3" />
                              <span>{isAr ? "تحديد الربط" : "Map"}</span>
                            </Button>

                            {!isApproved && m.mapping_id && (
                              <Button
                                size="sm"
                                disabled={isPending}
                                onClick={() => handleApprove(m.mapping_id!, isAr ? m.due_type_name_ar : m.due_type_name_en)}
                                className="h-7 text-xs px-2.5 gap-1 font-bold bg-emerald-600 hover:bg-emerald-700 text-white"
                              >
                                <Check className="size-3" />
                                <span>{isAr ? "اعتماد" : "Approve"}</span>
                              </Button>
                            )}

                            {isApproved && m.mapping_id && (
                              <Button
                                variant="ghost"
                                size="sm"
                                disabled={isPending}
                                onClick={() => handleRevoke(m.mapping_id!, isAr ? m.due_type_name_ar : m.due_type_name_en)}
                                className="h-7 text-[11px] px-2 text-slate-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                              >
                                <RotateCcw className="size-3" />
                                <span>{isAr ? "إلغاء الاعتماد" : "Revoke"}</span>
                              </Button>
                            )}
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-400">{isAr ? "عرض فقط" : "View only"}</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={6} className="p-10 text-center text-slate-400 text-xs">
                    {isAr ? "لا توجد بنود مطالبات مطابقة" : "No due types found"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ──────────────────────────────────────────────────────────────────────────
          MODAL: MAP REVENUE NATURE DIALOG
          ────────────────────────────────────────────────────────────────────────── */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex size-10 items-center justify-center rounded-xl bg-purple-600/10 text-purple-600 dark:bg-purple-500/20 dark:text-purple-400">
              <Scale className="size-5" />
            </div>
            <div>
              <DialogTitle>
                {isAr ? "تحديد التصنيف الضريبي للبند" : "Set Due Type Tax Mapping"}
              </DialogTitle>
              <DialogDescription>
                {selectedMapping
                  ? isAr
                    ? `ربط بند "${selectedMapping.due_type_name_ar}" بطبيعة الإيراد لتحديد الوعاء والضريبة.`
                    : `Map "${selectedMapping.due_type_name_en}" to statutory revenue nature.`
                  : ""}
              </DialogDescription>
            </div>
          </DialogHeader>

          <form onSubmit={handleSaveMapping}>
            <DialogBody className="space-y-4">
              {errorMsg && (
                <div role="alert" className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700 dark:border-red-900/50 dark:bg-red-950/50 dark:text-red-300">
                  <AlertCircle className="size-4 shrink-0 text-red-600 dark:text-red-400" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <div className="space-y-1.5 text-start">
                <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  {isAr ? "طبيعة الإيراد الضريبي المعتمدة *" : "Statutory Revenue Nature *"}
                </Label>
                <select
                  value={editNature}
                  onChange={(e) => setEditNature(e.target.value)}
                  required
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-2.5 text-xs font-semibold text-slate-900 dark:text-white shadow-sm focus:border-purple-500 focus:outline-none"
                >
                  <option value="" disabled>
                    {isAr ? "— اختر التصنيف الضريبي —" : "— Select Revenue Nature —"}
                  </option>
                  {natures.map((n) => (
                    <option key={n.code} value={n.code} disabled={n.isDerived}>
                      {n.label} {n.isDerived ? (isAr ? " (يرث التوريد الأصلي)" : " (Inherits)") : ""}
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-slate-500">
                  {isAr
                    ? "يحدد ما إذا كان البند خاضعاً لضريبة القيمة المضافة 14% أو معفى قانونياً 0%."
                    : "Determines statutory VAT treatment and standard rate applicability."}
                </p>
              </div>

              <div className="space-y-1.5 text-start">
                <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  {isAr ? "مستند أو مرجع قانوني / ملاحظات" : "Reference / Legal Notes"}
                </Label>
                <Input
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder={isAr ? "مثال: مادة 31 من قانون القيمة المضافة / عقد الإدارة" : "e.g. VAT Law Article / Contract"}
                  className="text-xs"
                />
              </div>
            </DialogBody>

            <DialogFooter className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 flex items-center justify-between">
              <Button type="button" variant="outline" onClick={() => setIsEditDialogOpen(false)} disabled={isPending}>
                {isAr ? "إلغاء" : "Cancel"}
              </Button>
              <Button type="submit" disabled={isPending || !editNature} className="bg-purple-600 hover:bg-purple-700 text-white font-bold gap-1.5">
                {isPending ? <RefreshCw className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />}
                <span>{isAr ? "حفظ وتحديث الربط" : "Save Mapping"}</span>
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
