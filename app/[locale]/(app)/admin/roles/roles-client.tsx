"use client";

import { useState, useMemo, useTransition } from "react";
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  Users,
  Key,
  Search,
  Plus,
  Edit,
  Check,
  Printer,
  FileSpreadsheet,
  Layers,
  Lock,
  Unlock,
  AlertCircle,
  Building,
  DollarSign,
  Landmark,
  Wallet,
  Clock,
  BookOpen,
  ShoppingBag,
  Settings,
  ChevronRight,
  Filter,
  CheckCircle2,
  X,
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
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { updateRolePermissionsAction, createRoleAction } from "@/lib/actions/roles";
import { generateFinancialStatementPdf } from "@/lib/reports/financial-statements-pdf";
import { exportFinancialStatementToExcel } from "@/lib/reports/financial-excel-export";

export interface RoleItem {
  id: string;
  key: string;
  name_ar: string;
  name_en: string;
  is_system?: boolean;
  permissionIds: string[];
  userCount: number;
}

export interface PermissionItem {
  id: string;
  key: string;
  description: string;
  module: string;
}

const MODULE_DEFINITIONS: Record<
  string,
  {
    nameAr: string;
    nameEn: string;
    icon: any;
    color: string;
    bg: string;
  }
> = {
  finance: {
    nameAr: "المالية والمحاسبة العامة",
    nameEn: "Finance & Accounting",
    icon: DollarSign,
    color: "text-emerald-600 dark:text-emerald-400",
    bg: "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900",
  },
  property: {
    nameAr: "العقارات والوحدات والتشغيل",
    nameEn: "Property & Units",
    icon: Building,
    color: "text-purple-600 dark:text-purple-400",
    bg: "bg-purple-50 dark:bg-purple-950/40 border-purple-200 dark:border-purple-900",
  },
  banking: {
    nameAr: "العمليات البنكية والشيكات",
    nameEn: "Banking & Cheques",
    icon: Landmark,
    color: "text-blue-600 dark:text-blue-400",
    bg: "bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-900",
  },
  cashier: {
    nameAr: "الخزينة ونقاط الكاشير",
    nameEn: "Cashier & POS",
    icon: Wallet,
    color: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900",
  },
  receivables: {
    nameAr: "المستحقات والتحصيل",
    nameEn: "Receivables & Aging",
    icon: Clock,
    color: "text-rose-600 dark:text-rose-400",
    bg: "bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900",
  },
  tenant: {
    nameAr: "إدارة المنشأة والمستخدمين",
    nameEn: "Tenant & Users",
    icon: Settings,
    color: "text-indigo-600 dark:text-indigo-400",
    bg: "bg-indigo-50 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-900",
  },
  purchasing: {
    nameAr: "المشتريات والموردين",
    nameEn: "Purchasing & Suppliers",
    icon: ShoppingBag,
    color: "text-cyan-600 dark:text-cyan-400",
    bg: "bg-cyan-50 dark:bg-cyan-950/40 border-cyan-200 dark:border-cyan-900",
  },
  inventory: {
    nameAr: "المستودعات والمخازن",
    nameEn: "Inventory",
    icon: Layers,
    color: "text-teal-600 dark:text-teal-400",
    bg: "bg-teal-50 dark:bg-teal-950/40 border-teal-200 dark:border-teal-900",
  },
  members: {
    nameAr: "الملاك وبوابة الخدمات",
    nameEn: "Members & Portal",
    icon: Users,
    color: "text-violet-600 dark:text-violet-400",
    bg: "bg-violet-50 dark:bg-violet-950/40 border-violet-200 dark:border-violet-900",
  },
  platform: {
    nameAr: "إدارة المنصة",
    nameEn: "Platform Admin",
    icon: Shield,
    color: "text-slate-600 dark:text-slate-400",
    bg: "bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800",
  },
};

export function RolesClient({
  roles: initialRoles,
  allPermissions,
  organizationId,
  organizationName,
  taxId,
  locale,
}: {
  roles: RoleItem[];
  allPermissions: PermissionItem[];
  organizationId: string;
  organizationName: string;
  taxId?: string | null;
  locale: string;
}) {
  const isAr = locale === "ar";
  const toast = useToast();
  const [isPending, startTransition] = useTransition();

  const [roles, setRoles] = useState<RoleItem[]>(initialRoles);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedModule, setSelectedModule] = useState<string>("ALL");

  // Edit Permissions Dialog State
  const [editingRole, setEditingRole] = useState<RoleItem | null>(null);
  const [selectedPermIds, setSelectedPermIds] = useState<Set<string>>(new Set());
  const [permSearch, setPermSearch] = useState("");

  // Create Role Dialog State
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newNameAr, setNewNameAr] = useState("");
  const [newNameEn, setNewNameEn] = useState("");
  const [newPermIds, setNewPermIds] = useState<Set<string>>(new Set());

  // Group permissions by module
  const permissionsByModule = useMemo(() => {
    const map = new Map<string, PermissionItem[]>();
    for (const p of allPermissions) {
      const list = map.get(p.module) || [];
      list.push(p);
      map.set(p.module, list);
    }
    return map;
  }, [allPermissions]);

  // Open Edit Dialog
  const handleOpenEdit = (role: RoleItem) => {
    setEditingRole(role);
    setSelectedPermIds(new Set(role.permissionIds));
    setPermSearch("");
  };

  // Toggle single permission
  const handleTogglePerm = (permId: string) => {
    setSelectedPermIds((prev) => {
      const next = new Set(prev);
      if (next.has(permId)) next.delete(permId);
      else next.add(permId);
      return next;
    });
  };

  // Toggle entire module
  const handleToggleModule = (moduleKey: string) => {
    const modulePerms = permissionsByModule.get(moduleKey) || [];
    const allSelected = modulePerms.every((p) => selectedPermIds.has(p.id));

    setSelectedPermIds((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        modulePerms.forEach((p) => next.delete(p.id));
      } else {
        modulePerms.forEach((p) => next.add(p.id));
      }
      return next;
    });
  };

  // Save Permissions
  const handleSavePermissions = () => {
    if (!editingRole) return;
    const permArray = Array.from(selectedPermIds);

    startTransition(async () => {
      const res = await updateRolePermissionsAction(
        organizationId,
        editingRole.id,
        permArray
      );

      if (res.ok) {
        setRoles((prev) =>
          prev.map((r) =>
            r.id === editingRole.id ? { ...r, permissionIds: permArray } : r
          )
        );
        toast.add({
          type: "success",
          title: isAr ? "تم تحديث الصلاحيات بنجاح" : "Permissions Updated",
          description: isAr
            ? `تم حفظ ${permArray.length} صلاحية للدور «${editingRole.name_ar}»`
            : `Saved ${permArray.length} permissions for ${editingRole.name_en}`,
        });
        setEditingRole(null);
      } else {
        toast.add({
          type: "error",
          title: isAr ? "تعذر حفظ الصلاحيات" : "Failed to update permissions",
          description: res.error || (isAr ? "حدث خطأ غير متوقع" : "Unknown error"),
        });
      }
    });
  };

  // PDF Export
  const handleExportPdf = () => {
    generateFinancialStatementPdf(
      {
        title: isAr ? "مصفوفة الأدوار والصلاحيات المعتمدة للمنشأة" : "Statutory RBAC & Internal Controls Matrix",
        subtitle: isAr ? "جدول حوكمة الصلاحيات والأدوار الوظيفية المعتمدة" : "Official Role-Based Access Control Matrix",
        organizationName,
        taxNumber: taxId || undefined,
        currencyLabel: "RBAC",
        dateRangeLabel: new Date().toISOString().slice(0, 10),
        columns: [
          { header: isAr ? "المسمى الوظيفي للدور" : "Role Name", key: "roleName", align: "start", width: "25%" },
          { header: isAr ? "الرمز النظامي (Key)" : "System Key", key: "key", align: "start", width: "20%" },
          { header: isAr ? "نوع الدور" : "Role Type", key: "type", align: "center", width: "15%" },
          { header: isAr ? "المستخدمين النشطين" : "Active Users", key: "users", isNumber: true, width: "15%" },
          { header: isAr ? "الصلاحيات الممنوحة" : "Granted Perms", key: "permsCount", isNumber: true, width: "25%" },
        ],
        rows: roles.map((r) => ({
          roleName: isAr ? r.name_ar : r.name_en,
          key: r.key,
          type: r.is_system ? (isAr ? "نظامي أساسي" : "System Core") : (isAr ? "مخصص" : "Custom"),
          users: r.userCount,
          permsCount: `${r.permissionIds.length} / ${allPermissions.length}`,
        })),
        totalRow: {
          roleName: isAr ? "إجمالي الأدوار" : "Total Roles",
          key: `${roles.length} ${isAr ? "أدوار" : "roles"}`,
          type: "",
          users: roles.reduce((s, r) => s + r.userCount, 0),
          permsCount: `${allPermissions.length} ${isAr ? "صلاحية مسجلة" : "system perms"}`,
        },
        summaries: [
          { label: isAr ? "إجمالي الأدوار" : "Total Roles", value: roles.length, highlight: true },
          { label: isAr ? "إجمالي الصلاحيات بالنظام" : "System Permissions", value: allPermissions.length },
        ],
        notes: [
          isAr
            ? "تحدد هذه المصفوفة صلاحيات الوصول وتوزيع المهام الرقابية والمالية وفقاً لمعايير الحوكمة والتدقيق الداخلي."
            : "Establishes authorization boundaries and segregation of duties for internal controls compliance.",
        ],
      },
      locale
    );
  };

  // Excel Export
  const handleExportExcel = async () => {
    toast.add({
      type: "info",
      title: isAr ? "جاري تصدير مصفوفة الصلاحيات..." : "Exporting RBAC Matrix...",
      description: isAr ? "يتم تجهيز ملف الإكسل" : "Preparing workbook",
    });

    await exportFinancialStatementToExcel(
      {
        filename: "roles_permissions_matrix",
        sheetName: isAr ? "مصفوفة الصلاحيات" : "RBAC Matrix",
        reportTitle: isAr ? "مصفوفة الأدوار والصلاحيات والحوكمة" : "Roles & Permissions Matrix",
        organizationName,
        taxNumber: taxId || undefined,
        currencyLabel: "RBAC",
        dateRangeLabel: new Date().toISOString().slice(0, 10),
        columns: [
          { header: isAr ? "المسمى الوظيفي" : "Role Name", key: "roleName", isNumber: false, width: 28 },
          { header: isAr ? "الرمز النظامي" : "Key", key: "key", isNumber: false, width: 25 },
          { header: isAr ? "نوع الدور" : "Type", key: "type", isNumber: false, width: 18 },
          { header: isAr ? "المستخدمين" : "Users", key: "users", isNumber: true, width: 16 },
          { header: isAr ? "عدد الصلاحيات" : "Granted Permissions", key: "permsCount", isNumber: true, width: 22 },
        ],
        rows: roles.map((r) => ({
          roleName: isAr ? r.name_ar : r.name_en,
          key: r.key,
          type: r.is_system ? "System" : "Custom",
          users: r.userCount,
          permsCount: r.permissionIds.length,
        })),
        totalRow: {
          roleName: isAr ? "الإجمالي" : "Total",
          key: `${roles.length} Roles`,
          type: "",
          users: roles.reduce((s, r) => s + r.userCount, 0),
          permsCount: allPermissions.length,
        },
      },
      locale
    );

    toast.add({
      type: "success",
      title: isAr ? "تم تصدير الإكسل بنجاح" : "Excel Exported Successfully",
      description: isAr ? "تم تحميل ملف مصفوفة الصلاحيات" : "RBAC Matrix downloaded",
    });
  };

  const filteredRoles = useMemo(() => {
    return roles.filter((r) => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      return (
        r.name_ar.toLowerCase().includes(q) ||
        r.name_en.toLowerCase().includes(q) ||
        r.key.toLowerCase().includes(q)
      );
    });
  }, [roles, searchQuery]);

  return (
    <div className="space-y-6">
      {/* ──────────────────────────────────────────────────────────────────────────
          EXECUTIVE RBAC PULSE BANNER (LIGHT & CRISP DESIGN)
          ────────────────────────────────────────────────────────────────────────── */}
      <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-5 pb-6 border-b border-slate-100 dark:border-slate-800">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="flex size-2 rounded-full bg-purple-600 animate-pulse" />
              <Badge className="bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/50 dark:text-purple-300 dark:border-purple-900 text-[10px] font-bold">
                {isAr ? "منظومة الصلاحيات والحوكمة الداخلية RBAC" : "Role-Based Access Control"}
              </Badge>
            </div>
            <h1 className="text-xl font-black tracking-tight text-slate-950 dark:text-white">
              {isAr ? "إدارة الأدوار وصلاحيات المستخدمين" : "Roles & Permissions Governance"}
            </h1>
            <p className="text-xs text-slate-500 font-medium mt-1 max-w-xl">
              {isAr
                ? `حوكمة صلاحيات الوصول، وتوزيع المهام الرقابية والمالية لمنشأة «${organizationName}» مع التعديل والتصدير الفوري.`
                : `Manage authorization boundaries and user privileges for ${organizationName}.`}
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Button
              onClick={handleExportPdf}
              variant="outline"
              size="sm"
              className="h-9 text-xs font-bold gap-1.5 border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200"
            >
              <Printer className="size-3.5 text-purple-600 dark:text-purple-400" />
              <span>{isAr ? "طباعة مصفوفة الصلاحيات" : "Print Matrix"}</span>
            </Button>

            <Button
              onClick={handleExportExcel}
              size="sm"
              className="h-9 text-xs font-bold gap-1.5 bg-emerald-700 hover:bg-emerald-800 text-white shadow-sm"
            >
              <FileSpreadsheet className="size-3.5" />
              <span>{isAr ? "تصدير إكسل" : "Export Excel"}</span>
            </Button>
          </div>
        </div>

        {/* 4 CORE RBAC STATS CARDS */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 pt-5">
          <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-800/50">
            <div className="flex items-center justify-between text-slate-500 text-xs font-bold">
              <span>{isAr ? "إجمالي الأدوار الوظيفية" : "Total Roles"}</span>
              <Shield className="size-4 text-purple-600 dark:text-purple-400" />
            </div>
            <div className="mt-2 font-mono text-2xl font-black text-slate-900 dark:text-white">
              {roles.length}
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5 font-medium">{isAr ? "أدوار معتمدة بالمنشأة" : "Active Roles"}</div>
          </div>

          <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-800/50">
            <div className="flex items-center justify-between text-slate-500 text-xs font-bold">
              <span>{isAr ? "صلاحيات النظام المسجلة" : "System Permissions"}</span>
              <Key className="size-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="mt-2 font-mono text-2xl font-black text-emerald-600 dark:text-emerald-400">
              {allPermissions.length}
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5 font-medium">{isAr ? "موزعة على 8 وحدات نظام" : "Across 8 Modules"}</div>
          </div>

          <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-800/50">
            <div className="flex items-center justify-between text-slate-500 text-xs font-bold">
              <span>{isAr ? "المستخدمين المعينين" : "Assigned Users"}</span>
              <Users className="size-4 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="mt-2 font-mono text-2xl font-black text-slate-900 dark:text-white">
              {roles.reduce((s, r) => s + r.userCount, 0)}
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5 font-medium">{isAr ? "تعيينات نشطة" : "Active Assignments"}</div>
          </div>

          <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-800/50">
            <div className="flex items-center justify-between text-slate-500 text-xs font-bold">
              <span>{isAr ? "مستوى الحوكمة والرقابة" : "Security Posture"}</span>
              <ShieldCheck className="size-4 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div className="mt-2 font-mono text-lg font-black text-indigo-600 dark:text-indigo-400">
              {isAr ? "مشدد (RLS)" : "Strict RLS"}
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5 font-medium">{isAr ? "فصل المهام المحاسبية" : "Segregation of Duties"}</div>
          </div>
        </div>
      </div>

      {/* ──────────────────────────────────────────────────────────────────────────
          TOOLBAR & SEARCH
          ────────────────────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={isAr ? "بحث بالدور أو الرمز النظامي..." : "Search roles by name or key..."}
            className="ps-9 text-xs h-9 bg-white dark:bg-slate-900"
          />
        </div>

        <div className="text-xs font-bold text-slate-500">
          {isAr ? `عرض ${filteredRoles.length} دور وظيفي` : `Showing ${filteredRoles.length} roles`}
        </div>
      </div>

      {/* ──────────────────────────────────────────────────────────────────────────
          ROLE CARDS GRID
          ────────────────────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredRoles.map((role) => {
          const grantedCount = role.permissionIds.length;
          const totalCount = allPermissions.length;
          const percentage = totalCount > 0 ? Math.round((grantedCount / totalCount) * 100) : 0;
          const isOwner = role.key === "TENANT_OWNER";
          const isAdmin = role.key === "TENANT_ADMIN";
          const isFinance = role.key === "FINANCE_MANAGER";

          return (
            <div
              key={role.id}
              className="flex flex-col justify-between rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm transition-all hover:border-indigo-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
            >
              <div>
                {/* ROLE CARD HEADER */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div
                      className={`flex size-11 items-center justify-center rounded-2xl ${
                        isOwner
                          ? "bg-purple-600/10 text-purple-600 dark:bg-purple-500/20 dark:text-purple-400"
                          : isAdmin
                          ? "bg-blue-600/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400"
                          : isFinance
                          ? "bg-emerald-600/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400"
                          : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                      }`}
                    >
                      <Shield className="size-5" />
                    </div>
                    <div>
                      <h3 className="font-black text-sm text-slate-950 dark:text-white">
                        {isAr ? role.name_ar : role.name_en}
                      </h3>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="font-mono text-[10px] text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                          {role.key}
                        </span>
                      </div>
                    </div>
                  </div>

                  <Badge
                    variant={isOwner || isAdmin ? "default" : "outline"}
                    className="text-[10px] font-bold"
                  >
                    {isOwner
                      ? isAr ? "صلاحيات كاملة" : "Full Access"
                      : role.is_system
                      ? isAr ? "نظامي" : "System"
                      : isAr ? "مخصص" : "Custom"}
                  </Badge>
                </div>

                {/* PERMISSION PROGRESS BAR */}
                <div className="mt-5 space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span className="text-slate-500">{isAr ? "الصلاحيات الممنوحة:" : "Granted Privileges:"}</span>
                    <span className="font-mono text-slate-900 dark:text-white">
                      {grantedCount} <span className="text-[10px] text-slate-400 font-normal">/ {totalCount} ({percentage}%)</span>
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        percentage > 80
                          ? "bg-purple-600"
                          : percentage > 40
                          ? "bg-indigo-600"
                          : "bg-emerald-600"
                      }`}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>

                {/* USER COUNT */}
                <div className="mt-4 flex items-center gap-2 text-xs text-slate-500 font-semibold">
                  <Users className="size-3.5 text-slate-400" />
                  <span>
                    {role.userCount > 0
                      ? isAr
                        ? `${role.userCount} مستخدمين معينين بهذا الدور`
                        : `${role.userCount} users assigned`
                      : isAr
                      ? "لا يوجد مستخدمين معينين حالياً"
                      : "No users currently assigned"}
                  </span>
                </div>
              </div>

              {/* ACTION BUTTON */}
              <div className="mt-5 pt-3.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <Button
                  onClick={() => handleOpenEdit(role)}
                  size="sm"
                  className="w-full h-8 text-xs font-bold gap-1.5 bg-slate-900 hover:bg-slate-800 text-white dark:bg-slate-800 dark:hover:bg-slate-700 shadow-sm"
                >
                  <Key className="size-3.5 text-indigo-400" />
                  <span>{isAr ? "تعديل وفحص الصلاحيات الممنوحة" : "Inspect & Edit Permissions"}</span>
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {/* ──────────────────────────────────────────────────────────────────────────
          PERMISSIONS INSPECTOR & EDIT MODAL
          ────────────────────────────────────────────────────────────────────────── */}
      <Dialog open={Boolean(editingRole)} onOpenChange={(open) => !open && setEditingRole(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col p-0 overflow-hidden rounded-3xl">
          <DialogHeader className="p-6 pb-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle className="text-base font-black text-slate-950 dark:text-white flex items-center gap-2">
                  <Key className="size-4 text-indigo-600" />
                  <span>
                    {isAr ? "تخصيص صلاحيات الدور:" : "Configure Privileges for:"} {editingRole && (isAr ? editingRole.name_ar : editingRole.name_en)}
                  </span>
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-500 mt-0.5">
                  {isAr
                    ? "حدد الصلاحيات الممنوحة لهذا الدور الوظيفي عبر مختلف وحدات النظام."
                    : "Toggle authorization capabilities across system modules."}
                </DialogDescription>
              </div>

              <Badge className="bg-indigo-600 text-white font-mono text-xs">
                {selectedPermIds.size} / {allPermissions.length}
              </Badge>
            </div>

            <div className="relative mt-3">
              <Search className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
              <Input
                value={permSearch}
                onChange={(e) => setPermSearch(e.target.value)}
                placeholder={isAr ? "بحث في الصلاحيات..." : "Search permissions..."}
                className="ps-9 text-xs h-8 bg-white dark:bg-slate-900"
              />
            </div>
          </DialogHeader>

          {/* PERMISSIONS BY MODULE SCROLLABLE LIST */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {Array.from(permissionsByModule.entries()).map(([moduleKey, perms]) => {
              const def = MODULE_DEFINITIONS[moduleKey] || {
                nameAr: moduleKey,
                nameEn: moduleKey,
                icon: Shield,
                color: "text-slate-600",
                bg: "bg-slate-50 border-slate-200",
              };
              const Icon = def.icon;

              const filteredPerms = perms.filter((p) => {
                if (!permSearch.trim()) return true;
                const q = permSearch.toLowerCase().trim();
                return p.key.toLowerCase().includes(q) || p.description.toLowerCase().includes(q);
              });

              if (filteredPerms.length === 0) return null;

              const allModuleSelected = perms.every((p) => selectedPermIds.has(p.id));
              const someModuleSelected = perms.some((p) => selectedPermIds.has(p.id));

              return (
                <div key={moduleKey} className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-sm">
                  {/* MODULE HEADER */}
                  <div className="flex items-center justify-between p-3.5 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800">
                    <div className="flex items-center gap-2.5">
                      <div className={`p-1.5 rounded-lg ${def.bg}`}>
                        <Icon className={`size-4 ${def.color}`} />
                      </div>
                      <div>
                        <h4 className="text-xs font-black text-slate-900 dark:text-white">
                          {isAr ? def.nameAr : def.nameEn}
                        </h4>
                        <span className="text-[10px] text-slate-400 font-mono">{moduleKey}.* ({perms.length})</span>
                      </div>
                    </div>

                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleToggleModule(moduleKey)}
                      className="text-[11px] h-7 font-bold text-indigo-600 hover:text-indigo-700"
                    >
                      {allModuleSelected ? (isAr ? "إلغاء تحديد الكل" : "Deselect All") : (isAr ? "تحديد الكل" : "Select All")}
                    </Button>
                  </div>

                  {/* PERMISSION ITEMS */}
                  <div className="divide-y divide-slate-100 dark:divide-slate-800/60 p-2">
                    {filteredPerms.map((perm) => {
                      const isChecked = selectedPermIds.has(perm.id);

                      return (
                        <div
                          key={perm.id}
                          onClick={() => handleTogglePerm(perm.id)}
                          className={`flex items-start justify-between gap-3 p-2.5 rounded-xl cursor-pointer transition-all ${
                            isChecked
                              ? "bg-indigo-50/50 dark:bg-indigo-950/20"
                              : "hover:bg-slate-50 dark:hover:bg-slate-800/40"
                          }`}
                        >
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs font-bold text-slate-900 dark:text-white">
                                {perm.key}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-500">{perm.description}</p>
                          </div>

                          <div
                            className={`size-5 rounded-lg border flex items-center justify-center shrink-0 transition-all ${
                              isChecked
                                ? "bg-indigo-600 border-indigo-600 text-white"
                                : "border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800"
                            }`}
                          >
                            {isChecked && <Check className="size-3 stroke-[3]" />}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          <DialogFooter className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex items-center justify-between">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditingRole(null)}
              className="text-xs font-bold h-9"
            >
              {isAr ? "إلغاء" : "Cancel"}
            </Button>

            <Button
              onClick={handleSavePermissions}
              disabled={isPending}
              size="sm"
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold h-9 px-5 gap-1.5 shadow-sm"
            >
              {isPending ? (
                <span>{isAr ? "جاري الحفظ..." : "Saving..."}</span>
              ) : (
                <>
                  <CheckCircle2 className="size-4" />
                  <span>{isAr ? "حفظ التعديلات الممنوحة" : "Save Grants"}</span>
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
