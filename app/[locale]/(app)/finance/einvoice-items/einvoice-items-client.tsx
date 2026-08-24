"use client";

import { useState, useMemo, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import {
  Barcode,
  Package,
  Layers,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Search,
  Plus,
  Edit3,
  Link as LinkIcon,
  ShieldCheck,
  Percent,
  RefreshCw,
  AlertCircle,
  HelpCircle,
  Tag,
  Check,
  X,
  FileCheck2,
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
  saveCatalogueItem,
  linkDueTypeToItem,
} from "@/lib/actions/einvoice-items";
import { useToast } from "@/components/ui/toast";

export type CatalogueItemRow = {
  id: string;
  code: string;
  name_ar: string;
  name_en: string;
  unit_code: string;
  item_code_type: string | null;
  item_code: string | null;
  is_active: boolean;
  linked_due_types: number;
};

export type DueTypeLinkRow = {
  due_type_id: string;
  due_type_name_ar: string;
  due_type_name_en: string;
  catalogue_item_id: string | null;
  item_name_ar: string | null;
  item_code: string | null;
  item_code_type: string | null;
};

export type EmissionGap = {
  gap_code: string;
  detail: string;
};

export type ItemOption = {
  id: string;
  label: string;
  hasCode: boolean;
};

export function EInvoiceItemsClient({
  items,
  links,
  gaps,
  organizationId,
  canManage,
  locale,
}: {
  items: CatalogueItemRow[];
  links: DueTypeLinkRow[];
  gaps: EmissionGap[];
  organizationId: string;
  canManage: boolean;
  locale: string;
}) {
  const isAr = locale === "ar";
  const router = useRouter();
  const toast = useToast();

  const [activeTab, setActiveTab] = useState<"LINKS" | "CATALOGUE" | "GAPS">("LINKS");
  const [searchQuery, setSearchQuery] = useState("");

  // Create/Edit Item Dialog States
  const [isItemDialogOpen, setIsItemDialogOpen] = useState(false);
  const [itemCode, setItemCode] = useState("");
  const [itemNameAr, setItemNameAr] = useState("");
  const [itemNameEn, setItemNameEn] = useState("");
  const [unitCode, setUnitCode] = useState("EA");
  const [itemCodeType, setItemCodeType] = useState<"EGS" | "GS1">("EGS");
  const [authorityItemCode, setAuthorityItemCode] = useState("");
  const [isItemPending, startItemTransition] = useTransition();
  const [itemError, setItemError] = useState<string | null>(null);

  // Link Due Type Dialog States
  const [isLinkDialogOpen, setIsLinkDialogOpen] = useState(false);
  const [selectedLink, setSelectedLink] = useState<DueTypeLinkRow | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<string>("");
  const [isLinkPending, startLinkTransition] = useTransition();
  const [linkError, setLinkError] = useState<string | null>(null);

  const openCreateItemDialog = () => {
    setItemCode("");
    setItemNameAr("");
    setItemNameEn("");
    setUnitCode("EA");
    setItemCodeType("EGS");
    setAuthorityItemCode("");
    setItemError(null);
    setIsItemDialogOpen(true);
  };

  const openEditItemDialog = (item: CatalogueItemRow) => {
    setItemCode(item.code);
    setItemNameAr(item.name_ar);
    setItemNameEn(item.name_en);
    setUnitCode(item.unit_code);
    setItemCodeType((item.item_code_type as "EGS" | "GS1") || "EGS");
    setAuthorityItemCode(item.item_code || "");
    setItemError(null);
    setIsItemDialogOpen(true);
  };

  const openLinkDialog = (link: DueTypeLinkRow) => {
    setSelectedLink(link);
    setSelectedItemId(link.catalogue_item_id || "");
    setLinkError(null);
    setIsLinkDialogOpen(true);
  };

  const handleSaveItem = (e: React.FormEvent) => {
    e.preventDefault();
    setItemError(null);

    if (!itemCode.trim() || !itemNameAr.trim() || !itemNameEn.trim()) {
      setItemError(isAr ? "يرجى ملء جميع الحقول الإلزامية" : "Please fill required fields");
      return;
    }

    startItemTransition(async () => {
      const formData = new FormData();
      formData.set("organizationId", organizationId);
      formData.set("code", itemCode.trim());
      formData.set("nameAr", itemNameAr.trim());
      formData.set("nameEn", itemNameEn.trim());
      formData.set("unitCode", unitCode || "EA");
      if (authorityItemCode.trim()) {
        formData.set("itemCodeType", itemCodeType);
        formData.set("itemCode", authorityItemCode.trim());
      }

      const res = await saveCatalogueItem({ ok: true }, formData);
      if (res.ok) {
        toast.add({
          type: "success",
          title: isAr ? "تم حفظ صنف الكتالوج" : "Catalogue Item Saved",
          description: isAr ? `تم حفظ الصنف "${itemNameAr}" بنجاح` : `Saved item "${itemNameEn}"`,
        });
        setIsItemDialogOpen(false);
        router.refresh();
      } else {
        setItemError(res.error || (isAr ? "فشل حفظ الصنف" : "Failed to save item"));
      }
    });
  };

  const handleSaveLink = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLink) return;
    setLinkError(null);

    startLinkTransition(async () => {
      const formData = new FormData();
      formData.set("dueTypeId", selectedLink.due_type_id);
      if (selectedItemId) formData.set("catalogueItemId", selectedItemId);

      const res = await linkDueTypeToItem({ ok: true }, formData);
      if (res.ok) {
        toast.add({
          type: "success",
          title: isAr ? "تم ربط بند المطالبة" : "Due Type Linked",
          description: isAr
            ? `تم ربط "${selectedLink.due_type_name_ar}" بالصنف الضريبي المعتمد`
            : `Linked "${selectedLink.due_type_name_en}" to catalogue item`,
        });
        setIsLinkDialogOpen(false);
        router.refresh();
      } else {
        setLinkError(res.error || (isAr ? "فشل ربط البند" : "Failed to link item"));
      }
    });
  };

  // Filter links
  const filteredLinks = useMemo(() => {
    if (!searchQuery.trim()) return links;
    const q = searchQuery.toLowerCase().trim();
    return links.filter(
      (l) =>
        l.due_type_name_ar.toLowerCase().includes(q) ||
        l.due_type_name_en.toLowerCase().includes(q) ||
        (l.item_name_ar || "").toLowerCase().includes(q) ||
        (l.item_code || "").toLowerCase().includes(q)
    );
  }, [links, searchQuery]);

  // Filter items
  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return items;
    const q = searchQuery.toLowerCase().trim();
    return items.filter(
      (i) =>
        i.name_ar.toLowerCase().includes(q) ||
        i.name_en.toLowerCase().includes(q) ||
        i.code.toLowerCase().includes(q) ||
        (i.item_code || "").toLowerCase().includes(q)
    );
  }, [items, searchQuery]);

  const activeItemsOptions = useMemo(() => {
    return items
      .filter((i) => i.is_active)
      .map((i) => ({
        id: i.id,
        label: `${isAr ? i.name_ar : i.name_en} (${i.item_code_type ? `${i.item_code_type}: ${i.item_code}` : isAr ? "بلا كود" : "No Code"})`,
        hasCode: Boolean(i.item_code),
      }));
  }, [items, isAr]);

  const unlinkedCount = links.filter((l) => !l.catalogue_item_id || !l.item_code).length;
  const linkedCount = links.filter((l) => l.catalogue_item_id && l.item_code).length;

  return (
    <div className="space-y-6">
      {/* ──────────────────────────────────────────────────────────────────────────
          MAIN ACTION TOOLBAR & TABS
          ────────────────────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white dark:bg-slate-900 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl w-full sm:w-auto">
          <button
            onClick={() => setActiveTab("LINKS")}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all ${
              activeTab === "LINKS"
                ? "bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
            }`}
          >
            <LinkIcon className="size-3.5 text-blue-600" />
            <span>{isAr ? "خريطة ربط بنود المطالبات بالأكواد" : "Due Types Coding"}</span>
            <Badge variant="secondary" className="text-[10px] h-4 px-1 ms-1">
              {links.length}
            </Badge>
          </button>

          <button
            onClick={() => setActiveTab("CATALOGUE")}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all ${
              activeTab === "CATALOGUE"
                ? "bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
            }`}
          >
            <Package className="size-3.5 text-purple-600" />
            <span>{isAr ? "كتالوج الأصناف الضريبية" : "Item Catalogue"}</span>
            <Badge variant="secondary" className="text-[10px] h-4 px-1 ms-1">
              {items.length}
            </Badge>
          </button>

          <button
            onClick={() => setActiveTab("GAPS")}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all ${
              activeTab === "GAPS"
                ? "bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
            }`}
          >
            <AlertTriangle className={`size-3.5 ${gaps.length > 0 ? "text-rose-600" : "text-emerald-600"}`} />
            <span>{isAr ? "فحص الجاهزية والنواقص" : "Emission Gaps"}</span>
            {gaps.length > 0 ? (
              <Badge className="text-[10px] bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-950 dark:text-rose-300 ms-1 h-4 px-1">
                {gaps.length}
              </Badge>
            ) : (
              <Badge className="text-[10px] bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 ms-1 h-4 px-1">
                0
              </Badge>
            )}
          </button>
        </div>

        <div className="flex items-center gap-2.5 w-full sm:w-auto">
          <div className="relative w-full sm:w-56">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={isAr ? "بحث..." : "Search..."}
              className="ps-9 text-xs h-9"
            />
          </div>

          {canManage && (
            <Button
              size="sm"
              onClick={openCreateItemDialog}
              className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold gap-1.5 text-xs h-9 shrink-0 press-feedback motion-control"
            >
              <Plus className="size-3.5" />
              <span>{isAr ? "إضافة صنف جديد" : "Add Item"}</span>
            </Button>
          )}
        </div>
      </div>

      {/* ──────────────────────────────────────────────────────────────────────────
          TAB 1: DUE TYPES CODING & MAPPING TABLE
          ────────────────────────────────────────────────────────────────────────── */}
      {activeTab === "LINKS" && (
        <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-start">
              <thead className="bg-slate-900 text-white dark:bg-slate-800/90 font-bold border-b border-slate-800">
                <tr>
                  <th className="p-3.5 text-start">{isAr ? "بند المطالبة (الاستحقاق)" : "Due Type Name"}</th>
                  <th className="p-3.5 text-start">{isAr ? "صنف الكتالوج المقترن" : "Linked Catalogue Item"}</th>
                  <th className="p-3.5 text-center">{isAr ? "معيار التكويد" : "Code Type"}</th>
                  <th className="p-3.5 text-start">{isAr ? "كود الصنف الضريبي (Authority Code)" : "Tax Authority Code"}</th>
                  <th className="p-3.5 text-center">{isAr ? "حالة الربط" : "Status"}</th>
                  <th className="p-3.5 text-end">{isAr ? "الإجراءات" : "Actions"}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredLinks.length ? (
                  filteredLinks.map((l) => {
                    const isCoded = l.catalogue_item_id && l.item_code;

                    return (
                      <tr
                        key={l.due_type_id}
                        className="hover:bg-slate-50/70 dark:hover:bg-slate-800/50 transition-colors group"
                      >
                        <td className="p-3.5 font-bold text-slate-900 dark:text-white">
                          <div className="flex items-center gap-2">
                            <Tag className="size-4 text-purple-600 shrink-0" />
                            <span>{isAr ? l.due_type_name_ar : l.due_type_name_en}</span>
                          </div>
                        </td>

                        <td className="p-3.5">
                          {l.item_name_ar ? (
                            <span className="font-semibold text-slate-800 dark:text-slate-200">
                              {l.item_name_ar}
                            </span>
                          ) : (
                            <span className="text-amber-600 dark:text-amber-400 text-xs font-semibold">
                              {isAr ? "⚠️ غير مقترن بصنف" : "Unlinked"}
                            </span>
                          )}
                        </td>

                        <td className="p-3.5 text-center">
                          {l.item_code_type ? (
                            <Badge className="text-[10px] font-mono bg-blue-50 text-blue-700 border-blue-200">
                              {l.item_code_type}
                            </Badge>
                          ) : (
                            <span className="text-slate-400 text-[11px]">—</span>
                          )}
                        </td>

                        <td className="p-3.5">
                          {l.item_code ? (
                            <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                              {l.item_code}
                            </span>
                          ) : (
                            <span className="text-slate-400 text-[11px]">—</span>
                          )}
                        </td>

                        <td className="p-3.5 text-center">
                          {isCoded ? (
                            <Badge className="text-[10px] font-bold bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300">
                              {isAr ? "✓ مكود وجاهز" : "Coded"}
                            </Badge>
                          ) : (
                            <Badge className="text-[10px] font-bold bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950 dark:text-amber-300">
                              {isAr ? "يحتاج تكويد" : "Needs Code"}
                            </Badge>
                          )}
                        </td>

                        <td className="p-3.5 text-end">
                          {canManage ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openLinkDialog(l)}
                              className="h-7 text-xs px-2.5 gap-1 font-bold border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                            >
                              <LinkIcon className="size-3" />
                              <span>{isAr ? "تعيين الصنف" : "Link Item"}</span>
                            </Button>
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
                      {isAr ? "لا توجد بنود مطالبات مطابقة" : "No due type links found"}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────────────────────
          TAB 2: CATALOGUE ITEMS TABLE
          ────────────────────────────────────────────────────────────────────────── */}
      {activeTab === "CATALOGUE" && (
        <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-start">
              <thead className="bg-slate-900 text-white dark:bg-slate-800/90 font-bold border-b border-slate-800">
                <tr>
                  <th className="p-3.5 text-start">{isAr ? "كود الصنف الداخلي" : "Item Internal Code"}</th>
                  <th className="p-3.5 text-start">{isAr ? "المسمى (بالعربية)" : "Arabic Name"}</th>
                  <th className="p-3.5 text-start">{isAr ? "المسمى (بالإنجليزية)" : "English Name"}</th>
                  <th className="p-3.5 text-center">{isAr ? "وحدة القياس" : "Unit Code"}</th>
                  <th className="p-3.5 text-start">{isAr ? "كود الصنف الضريبي (GS1 / EGS)" : "Tax Authority Code"}</th>
                  <th className="p-3.5 text-center">{isAr ? "البنود المرتبطة" : "Linked Due Types"}</th>
                  <th className="p-3.5 text-end">{isAr ? "الإجراءات" : "Actions"}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredItems.length ? (
                  filteredItems.map((i) => (
                    <tr
                      key={i.id}
                      className="hover:bg-slate-50/70 dark:hover:bg-slate-800/50 transition-colors group"
                    >
                      <td className="p-3.5 font-mono font-bold text-slate-900 dark:text-white">
                        <div className="flex items-center gap-1.5">
                          <Package className="size-3.5 text-purple-600 shrink-0" />
                          <span>{i.code}</span>
                        </div>
                      </td>

                      <td className="p-3.5 font-bold text-slate-900 dark:text-white">
                        {i.name_ar}
                      </td>

                      <td className="p-3.5 text-slate-600 dark:text-slate-400 font-medium">
                        {i.name_en}
                      </td>

                      <td className="p-3.5 text-center font-mono">
                        <Badge variant="outline" className="text-[10px]">
                          {i.unit_code}
                        </Badge>
                      </td>

                      <td className="p-3.5">
                        {i.item_code ? (
                          <div>
                            <span className="font-mono font-bold text-slate-800 dark:text-slate-200 me-1.5">
                              {i.item_code}
                            </span>
                            <Badge className="text-[9px] font-mono bg-purple-50 text-purple-700 border-purple-200">
                              {i.item_code_type}
                            </Badge>
                          </div>
                        ) : (
                          <span className="text-amber-600 text-xs font-semibold">{isAr ? "بلا كود ضريبي" : "No Code"}</span>
                        )}
                      </td>

                      <td className="p-3.5 text-center font-mono font-bold text-slate-700 dark:text-slate-300">
                        {i.linked_due_types}
                      </td>

                      <td className="p-3.5 text-end">
                        {canManage ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openEditItemDialog(i)}
                            className="h-7 text-xs px-2.5 gap-1 font-bold border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                          >
                            <Edit3 className="size-3" />
                            <span>{isAr ? "تعديل" : "Edit"}</span>
                          </Button>
                        ) : (
                          <span className="text-[11px] text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="p-10 text-center text-slate-400 text-xs">
                      {isAr ? "لا توجد أصناف مسجلة في الكتالوج" : "No catalogue items found"}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────────────────────
          TAB 3: EMISSION READINESS GAPS
          ────────────────────────────────────────────────────────────────────────── */}
      {activeTab === "GAPS" && (
        <div className="space-y-4">
          {gaps.length === 0 ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-8 dark:border-emerald-900/50 dark:bg-emerald-950/30 text-center space-y-2">
              <div className="size-12 mx-auto rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-sm">
                <CheckCircle2 className="size-6" />
              </div>
              <h3 className="text-sm font-black text-emerald-950 dark:text-emerald-200">
                {isAr ? "منظومة الفوترة الإلكترونية مكتملة وجاهزة 100%!" : "100% Ready for E-Invoice Emission!"}
              </h3>
              <p className="text-xs text-emerald-700 dark:text-emerald-400 max-w-md mx-auto">
                {isAr
                  ? "كافة بنود الاستحقاقات مربوطة بأصناف كتالوج معتمدة وتحمل أكواد ضريبية رسمية (EGS / GS1)."
                  : "All active due types are mapped to valid catalogue items with official tax authority codes."}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="text-xs font-bold text-slate-700 dark:text-slate-300">
                {isAr ? "النواقص التي تمنع الإرسال التلقائي للفواتير الضريبية:" : "Gaps blocking e-invoice emission:"}
              </div>
              {gaps.map((g, i) => (
                <div
                  key={`${g.gap_code}-${i}`}
                  className="rounded-xl border border-rose-200 bg-rose-50/80 p-3.5 dark:border-rose-900/50 dark:bg-rose-950/40 flex items-start gap-3"
                >
                  <AlertCircle className="size-4 text-rose-600 shrink-0 mt-0.5" />
                  <div className="space-y-0.5 text-xs">
                    <span className="font-mono font-bold text-rose-900 dark:text-rose-200">{g.gap_code}</span>
                    <p className="text-rose-700 dark:text-rose-300">{g.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────────────────────
          MODAL 1: ADD / EDIT CATALOGUE ITEM
          ────────────────────────────────────────────────────────────────────────── */}
      <Dialog open={isItemDialogOpen} onOpenChange={setIsItemDialogOpen}>
        <DialogContent className="max-w-md motion-surface">
          <DialogHeader>
            <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Package className="size-5" />
            </div>
            <div>
              <DialogTitle>
                {itemCode ? (isAr ? "تعديل صنف بالكتالوج" : "Edit Catalogue Item") : (isAr ? "إضافة صنف ضريبي جديد" : "Add Catalogue Item")}
              </DialogTitle>
              <DialogDescription>
                {isAr
                  ? "تسجيل بيانات الصنف وكود مصلحة الضرائب المعتمد (EGS / GS1)."
                  : "Register catalogue item and tax authority standard code."}
              </DialogDescription>
            </div>
          </DialogHeader>

          <form onSubmit={handleSaveItem}>
            <DialogBody className="space-y-4">
              {itemError && (
                <div role="alert" className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700 dark:border-red-900/50 dark:bg-red-950/50 dark:text-red-300">
                  <AlertCircle className="size-4 shrink-0 text-red-600 dark:text-red-400" />
                  <span>{itemError}</span>
                </div>
              )}

              <div className="space-y-1.5 text-start">
                <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  {isAr ? "كود الصنف الداخلي *" : "Internal Item Code *"}
                </Label>
                <Input
                  required
                  value={itemCode}
                  onChange={(e) => setItemCode(e.target.value)}
                  placeholder="e.g. SRV-MAINT-01"
                  dir="ltr"
                  className="text-xs font-mono font-bold"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5 text-start">
                  <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    {isAr ? "المسمى (بالعربية) *" : "Arabic Name *"}
                  </Label>
                  <Input
                    required
                    value={itemNameAr}
                    onChange={(e) => setItemNameAr(e.target.value)}
                    placeholder="مثال: رسوم صيانة دورية"
                    className="text-xs"
                  />
                </div>

                <div className="space-y-1.5 text-start">
                  <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    {isAr ? "المسمى (بالإنجليزية) *" : "English Name *"}
                  </Label>
                  <Input
                    required
                    value={itemNameEn}
                    onChange={(e) => setItemNameEn(e.target.value)}
                    placeholder="e.g. Maintenance Fee"
                    className="text-xs"
                  />
                </div>
              </div>

              <div className="space-y-1.5 text-start">
                <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  {isAr ? "وحدة القياس (Unit Code)" : "Unit Code"}
                </Label>
                <select
                  value={unitCode}
                  onChange={(e) => setUnitCode(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-2.5 text-xs font-semibold text-slate-900 dark:text-white"
                >
                  <option value="EA">{isAr ? "وحدة / عدد (EA - Each)" : "EA - Each"}</option>
                  <option value="MON">{isAr ? "شهر (MON - Month)" : "MON - Month"}</option>
                  <option value="ANN">{isAr ? "سنة (ANN - Year)" : "ANN - Year"}</option>
                  <option value="MTR">{isAr ? "متر (MTR - Metre)" : "MTR - Metre"}</option>
                  <option value="MTK">{isAr ? "متر مربع (MTK - Square Metre)" : "MTK - Square Metre"}</option>
                  <option value="HUR">{isAr ? "ساعة (HUR - Hour)" : "HUR - Hour"}</option>
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1 border-t border-slate-100 dark:border-slate-800">
                <div className="space-y-1.5 text-start">
                  <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    {isAr ? "معيار التكويد" : "Code Standard"}
                  </Label>
                  <select
                    value={itemCodeType}
                    onChange={(e) => setItemCodeType(e.target.value as "EGS" | "GS1")}
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-2.5 text-xs font-semibold text-slate-900 dark:text-white"
                  >
                    <option value="EGS">EGS (مصر)</option>
                    <option value="GS1">GS1 (عالمي)</option>
                  </select>
                </div>

                <div className="space-y-1.5 text-start sm:col-span-2">
                  <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    {isAr ? "كود الصنف بمصلحة الضرائب" : "Tax Authority Code"}
                  </Label>
                  <Input
                    value={authorityItemCode}
                    onChange={(e) => setAuthorityItemCode(e.target.value)}
                    placeholder={itemCodeType === "EGS" ? "EG-100234567-SRV01" : "6221234567890"}
                    dir="ltr"
                    className="text-xs font-mono"
                  />
                </div>
              </div>
            </DialogBody>

            <DialogFooter className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 flex items-center justify-between">
              <Button type="button" variant="outline" onClick={() => setIsItemDialogOpen(false)} disabled={isItemPending}>
                {isAr ? "إلغاء" : "Cancel"}
              </Button>
              <Button type="submit" disabled={isItemPending} className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold gap-1.5 press-feedback motion-control">
                {isItemPending ? <RefreshCw className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                <span>{isAr ? "حفظ الصنف" : "Save Item"}</span>
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ──────────────────────────────────────────────────────────────────────────
          MODAL 2: LINK DUE TYPE TO CATALOGUE ITEM
          ────────────────────────────────────────────────────────────────────────── */}
      <Dialog open={isLinkDialogOpen} onOpenChange={setIsLinkDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex size-10 items-center justify-center rounded-xl bg-blue-600/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400">
              <LinkIcon className="size-5" />
            </div>
            <div>
              <DialogTitle>
                {isAr ? "ربط بند المطالبة بصنف ضريبي" : "Link Due Type to Item"}
              </DialogTitle>
              <DialogDescription>
                {selectedLink
                  ? isAr
                    ? `تحديد الصنف المعتمد لبند "${selectedLink.due_type_name_ar}".`
                    : `Select statutory item for "${selectedLink.due_type_name_en}".`
                  : ""}
              </DialogDescription>
            </div>
          </DialogHeader>

          <form onSubmit={handleSaveLink}>
            <DialogBody className="space-y-4">
              {linkError && (
                <div role="alert" className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700 dark:border-red-900/50 dark:bg-red-950/50 dark:text-red-300">
                  <AlertCircle className="size-4 shrink-0 text-red-600 dark:text-red-400" />
                  <span>{linkError}</span>
                </div>
              )}

              <div className="space-y-1.5 text-start">
                <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  {isAr ? "اختر صنف الكتالوج المقترن *" : "Catalogue Item *"}
                </Label>
                <select
                  value={selectedItemId}
                  onChange={(e) => setSelectedItemId(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-2.5 text-xs font-semibold text-slate-900 dark:text-white"
                >
                  <option value="">{isAr ? "— بلا ربط (غير مقترن) —" : "— Unlinked —"}</option>
                  {activeItemsOptions.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-slate-500">
                  {isAr
                    ? "الصنف المختار سيحمل كود التكويد الضريبي (EGS / GS1) عند رفع الفاتورة لمصلحة الضرائب."
                    : "Carries statutory code when exporting invoice to tax authority."}
                </p>
              </div>
            </DialogBody>

            <DialogFooter className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 flex items-center justify-between">
              <Button type="button" variant="outline" onClick={() => setIsLinkDialogOpen(false)} disabled={isLinkPending}>
                {isAr ? "إلغاء" : "Cancel"}
              </Button>
              <Button type="submit" disabled={isLinkPending} className="bg-blue-600 hover:bg-blue-700 text-white font-bold gap-1.5">
                {isLinkPending ? <RefreshCw className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                <span>{isAr ? "حفظ الربط" : "Save Link"}</span>
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
