"use client";

import { useState, useMemo, useTransition } from "react";
import {
  Users,
  UserPlus,
  Shield,
  ShieldCheck,
  ShieldAlert,
  Search,
  Mail,
  MoreVertical,
  Check,
  Lock,
  Unlock,
  Trash2,
  Calendar,
  LayoutGrid,
  List,
  CheckCircle2,
  Clock,
  AlertTriangle,
  UserCheck,
  KeyRound,
  Filter,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import {
  inviteUserAction,
  changeUserRoleAction,
  updateUserStatusAction,
  removeUserAction,
} from "@/lib/actions/users";

export interface UserItem {
  id: string;
  userId: string;
  email: string;
  fullName: string | null;
  status: "active" | "invited" | "suspended" | "inactive";
  roleId: string | null;
  roleKey: string | null;
  roleNameAr: string | null;
  roleNameEn: string | null;
  createdAt: string;
  isCurrentUser: boolean;
}

export interface RoleOption {
  id: string;
  key: string;
  name_ar: string;
  name_en: string;
}

export function UsersClient({
  users: initialUsers,
  roles,
  organizationId,
  organizationName,
  locale,
}: {
  users: UserItem[];
  roles: RoleOption[];
  organizationId: string;
  organizationName: string;
  locale: string;
}) {
  const isAr = locale === "ar";
  const toast = useToast();
  const [isPending, startTransition] = useTransition();

  const [users, setUsers] = useState<UserItem[]>(initialUsers);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [roleFilter, setRoleFilter] = useState<string>("ALL");
  const [viewMode, setViewMode] = useState<"cards" | "table">("cards");

  // Invite Modal State
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteFullName, setInviteFullName] = useState("");
  const [inviteRoleKey, setInviteRoleKey] = useState(roles[0]?.key || "ACCOUNTANT");

  // Change Role Modal State
  const [roleModalUser, setRoleModalUser] = useState<UserItem | null>(null);
  const [selectedNewRoleId, setSelectedNewRoleId] = useState<string>("");

  // Status Change State
  const [statusModalUser, setStatusModalUser] = useState<UserItem | null>(null);
  const [targetStatus, setTargetStatus] = useState<"active" | "suspended">("suspended");

  // Filtered users
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      if (statusFilter !== "ALL" && u.status !== statusFilter) return false;
      if (roleFilter !== "ALL" && u.roleKey !== roleFilter) return false;
      if (!searchQuery.trim()) return true;

      const q = searchQuery.toLowerCase().trim();
      return (
        u.email.toLowerCase().includes(q) ||
        (u.fullName && u.fullName.toLowerCase().includes(q)) ||
        (u.roleNameAr && u.roleNameAr.toLowerCase().includes(q)) ||
        (u.roleNameEn && u.roleNameEn.toLowerCase().includes(q))
      );
    });
  }, [users, searchQuery, statusFilter, roleFilter]);

  // Statistics
  const totalCount = users.length;
  const activeCount = users.filter((u) => u.status === "active").length;
  const invitedCount = users.filter((u) => u.status === "invited").length;
  const suspendedCount = users.filter((u) => u.status === "suspended" || u.status === "inactive").length;

  // Handle Invite Submit
  const handleInviteSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;

    const formData = new FormData();
    formData.append("organizationId", organizationId);
    formData.append("email", inviteEmail.trim());
    formData.append("roleKey", inviteRoleKey);
    if (inviteFullName.trim()) {
      formData.append("fullName", inviteFullName.trim());
    }

    startTransition(async () => {
      const res = await inviteUserAction({ ok: true }, formData);
      if (res.ok) {
        toast.add({
          type: "success",
          title: isAr ? "تم إرسال الدعوة بنجاح" : "Invitation Sent",
          description: isAr
            ? `تم إرسال دعوة الانضمام إلى ${inviteEmail}`
            : `Invitation sent to ${inviteEmail}`,
        });
        setIsInviteOpen(false);
        setInviteEmail("");
        setInviteFullName("");
        // Reload or update local list
        window.location.reload();
      } else {
        toast.add({
          type: "error",
          title: isAr ? "تعذر إرسال الدعوة" : "Failed to send invitation",
          description: res.error || (isAr ? "حدث خطأ أثناء إرسال الدعوة" : "Unknown error"),
        });
      }
    });
  };

  // Handle Change Role
  const handleConfirmRoleChange = () => {
    if (!roleModalUser || !selectedNewRoleId) return;
    const targetRole = roles.find((r) => r.id === selectedNewRoleId);
    if (!targetRole) return;

    startTransition(async () => {
      const res = await changeUserRoleAction(
        organizationId,
        roleModalUser.userId,
        selectedNewRoleId
      );

      if (res.ok) {
        setUsers((prev) =>
          prev.map((u) =>
            u.userId === roleModalUser.userId
              ? {
                  ...u,
                  roleId: targetRole.id,
                  roleKey: targetRole.key,
                  roleNameAr: targetRole.name_ar,
                  roleNameEn: targetRole.name_en,
                }
              : u
          )
        );
        toast.add({
          type: "success",
          title: isAr ? "تم تغيير الدور بنجاح" : "Role Updated",
          description: isAr
            ? `تم تعيين دور «${targetRole.name_ar}» للمستخدم ${roleModalUser.fullName || roleModalUser.email}`
            : `Assigned role ${targetRole.name_en} to ${roleModalUser.fullName || roleModalUser.email}`,
        });
        setRoleModalUser(null);
      } else {
        toast.add({
          type: "error",
          title: isAr ? "تعذر تغيير الدور" : "Failed to change role",
          description: res.error,
        });
      }
    });
  };

  // Handle Toggle Status
  const handleConfirmStatusChange = () => {
    if (!statusModalUser) return;

    startTransition(async () => {
      const res = await updateUserStatusAction(
        organizationId,
        statusModalUser.userId,
        targetStatus
      );

      if (res.ok) {
        setUsers((prev) =>
          prev.map((u) =>
            u.userId === statusModalUser.userId
              ? { ...u, status: targetStatus }
              : u
          )
        );
        toast.add({
          type: "success",
          title: isAr ? "تم تحديث حالة الحساب" : "Status Updated",
          description: isAr
            ? targetStatus === "active"
              ? "تم إعادة تنشيط الحساب بنجاح"
              : "تم تجميد حساب المستخدم بنجاح"
            : `User account is now ${targetStatus}`,
        });
        setStatusModalUser(null);
      } else {
        toast.add({
          type: "error",
          title: isAr ? "تعذر تحديث الحالة" : "Failed to update status",
          description: res.error,
        });
      }
    });
  };

  // Handle Remove User
  const handleRemoveUser = (user: UserItem) => {
    if (user.isCurrentUser) return;
    const confirmMsg = isAr
      ? `هل أنت متأكد من حذف المستخدم «${user.fullName || user.email}» من المنشأة؟`
      : `Are you sure you want to remove ${user.fullName || user.email}?`;

    if (!window.confirm(confirmMsg)) return;

    startTransition(async () => {
      const res = await removeUserAction(organizationId, user.userId);
      if (res.ok) {
        setUsers((prev) => prev.filter((u) => u.userId !== user.userId));
        toast.add({
          type: "success",
          title: isAr ? "تم إزالة المستخدم" : "User Removed",
          description: isAr ? "تم حذف المستخدم من المنشأة بنجاح" : "User has been removed from organization",
        });
      } else {
        toast.add({
          type: "error",
          title: isAr ? "تعذر إزالة المستخدم" : "Failed to remove user",
          description: res.error,
        });
      }
    });
  };

  // Helper for status badge
  const renderStatusBadge = (status: UserItem["status"]) => {
    switch (status) {
      case "active":
        return (
          <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-900 text-[10px] font-bold gap-1">
            <span className="size-1.5 rounded-full bg-emerald-500" />
            <span>{isAr ? "نشط" : "Active"}</span>
          </Badge>
        );
      case "invited":
        return (
          <Badge className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-900 text-[10px] font-bold gap-1">
            <Clock className="size-3 text-amber-500" />
            <span>{isAr ? "بانتظار القبول" : "Invited"}</span>
          </Badge>
        );
      case "suspended":
      case "inactive":
        return (
          <Badge className="bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-900 text-[10px] font-bold gap-1">
            <Lock className="size-3 text-rose-500" />
            <span>{isAr ? "مجمد / معلق" : "Suspended"}</span>
          </Badge>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* ──────────────────────────────────────────────────────────────────────────
          EXECUTIVE TEAM PULSE BANNER (CLEAN LIGHT DESIGN)
          ────────────────────────────────────────────────────────────────────────── */}
      <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-5 pb-6 border-b border-slate-100 dark:border-slate-800">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="flex size-2 rounded-full bg-blue-600 animate-pulse" />
              <Badge className="bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-900 text-[10px] font-bold">
                {isAr ? "إدارة المستخدمين وفريق العمل" : "Team & User Access"}
              </Badge>
            </div>
            <h1 className="text-xl font-black tracking-tight text-slate-950 dark:text-white">
              {isAr ? "أعضاء الفريق وصلاحيات الوصول" : "Team Members & Access Control"}
            </h1>
            <p className="text-xs text-slate-500 font-medium mt-1 max-w-xl">
              {isAr
                ? `إدارة مستخدمي منشأة «${organizationName}»، توزيع الأدوار الوظيفية، إرسال الدعوات والتحكم في تفعيل الحسابات.`
                : `Manage team access, assign roles, send invites, and control account status for ${organizationName}.`}
            </p>
          </div>

          <div>
            <Button
              onClick={() => setIsInviteOpen(true)}
              size="sm"
              className="h-9 text-xs font-bold gap-1.5 bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:text-slate-900 shadow-sm"
            >
              <UserPlus className="size-4" />
              <span>{isAr ? "دعوة عضو جديد للفريق" : "Invite Team Member"}</span>
            </Button>
          </div>
        </div>

        {/* 4 CORE TEAM STATS CARDS */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 pt-5">
          <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-800/50">
            <div className="flex items-center justify-between text-slate-500 text-xs font-bold">
              <span>{isAr ? "إجمالي أعضاء الفريق" : "Total Team"}</span>
              <Users className="size-4 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="mt-2 font-mono text-2xl font-black text-slate-900 dark:text-white">
              {totalCount}
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5 font-medium">{isAr ? "مستخدم مسجل" : "Registered Users"}</div>
          </div>

          <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-800/50">
            <div className="flex items-center justify-between text-slate-500 text-xs font-bold">
              <span>{isAr ? "الحسابات النشطة" : "Active Accounts"}</span>
              <UserCheck className="size-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="mt-2 font-mono text-2xl font-black text-emerald-600 dark:text-emerald-400">
              {activeCount}
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5 font-medium">{isAr ? "وصول نشط للنظام" : "Active Access"}</div>
          </div>

          <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-800/50">
            <div className="flex items-center justify-between text-slate-500 text-xs font-bold">
              <span>{isAr ? "الدعوات المعلقة" : "Pending Invites"}</span>
              <Clock className="size-4 text-amber-600 dark:text-amber-400" />
            </div>
            <div className="mt-2 font-mono text-2xl font-black text-amber-600 dark:text-amber-400">
              {invitedCount}
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5 font-medium">{isAr ? "بانتظار قبول الدعوة" : "Awaiting Acceptance"}</div>
          </div>

          <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-800/50">
            <div className="flex items-center justify-between text-slate-500 text-xs font-bold">
              <span>{isAr ? "الحسابات المجمدة" : "Suspended"}</span>
              <Lock className="size-4 text-rose-600 dark:text-rose-400" />
            </div>
            <div className="mt-2 font-mono text-2xl font-black text-rose-600 dark:text-rose-400">
              {suspendedCount}
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5 font-medium">{isAr ? "موقوف مؤقتاً" : "Access Blocked"}</div>
          </div>
        </div>
      </div>

      {/* ──────────────────────────────────────────────────────────────────────────
          TOOLBAR: SEARCH, FILTERS & VIEW MODE
          ────────────────────────────────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-3 pt-1">
        <div className="flex items-center gap-2 w-full md:w-auto flex-wrap">
          {/* SEARCH BOX */}
          <div className="relative w-full sm:w-64">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={isAr ? "بحث بالاسم أو البريد..." : "Search name or email..."}
              className="ps-9 text-xs h-9 bg-white dark:bg-slate-900"
            />
          </div>

          {/* STATUS FILTER */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-9 px-3 text-xs font-bold rounded-xl border border-slate-200 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 cursor-pointer shadow-sm"
          >
            <option value="ALL">{isAr ? "كافة الحالات" : "All Statuses"}</option>
            <option value="active">{isAr ? "نشط" : "Active"}</option>
            <option value="invited">{isAr ? "تمت الدعوة" : "Invited"}</option>
            <option value="suspended">{isAr ? "مجمد / معلق" : "Suspended"}</option>
          </select>

          {/* ROLE FILTER */}
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="h-9 px-3 text-xs font-bold rounded-xl border border-slate-200 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 cursor-pointer shadow-sm"
          >
            <option value="ALL">{isAr ? "كافة الأدوار" : "All Roles"}</option>
            {roles.map((r) => (
              <option key={r.key} value={r.key}>
                {isAr ? r.name_ar : r.name_en}
              </option>
            ))}
          </select>
        </div>

        {/* VIEW MODE TOGGLE */}
        <div className="flex items-center gap-2 self-end md:self-auto">
          <span className="text-xs text-slate-400 font-semibold">
            {isAr ? `عرض ${filteredUsers.length} من ${totalCount}` : `${filteredUsers.length} of ${totalCount}`}
          </span>

          <div className="flex items-center rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-0.5">
            <button
              onClick={() => setViewMode("cards")}
              className={`p-1.5 rounded-lg transition-colors ${
                viewMode === "cards"
                  ? "bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-white"
                  : "text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              }`}
              title={isAr ? "عرض البطاقات" : "Cards View"}
            >
              <LayoutGrid className="size-4" />
            </button>
            <button
              onClick={() => setViewMode("table")}
              className={`p-1.5 rounded-lg transition-colors ${
                viewMode === "table"
                  ? "bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-white"
                  : "text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              }`}
              title={isAr ? "عرض الجدول" : "Table View"}
            >
              <List className="size-4" />
            </button>
          </div>
        </div>
      </div>

      {/* ──────────────────────────────────────────────────────────────────────────
          MAIN VIEW: CARDS OR TABLE
          ────────────────────────────────────────────────────────────────────────── */}
      {viewMode === "cards" ? (
        /* CARDS GRID VIEW */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredUsers.map((user) => {
            const initials = (user.fullName || user.email)
              .slice(0, 2)
              .toUpperCase();
            const isOwner = user.roleKey === "TENANT_OWNER";
            const isAdmin = user.roleKey === "TENANT_ADMIN";
            const isFinance = user.roleKey === "FINANCE_MANAGER";

            return (
              <div
                key={user.id}
                className="flex flex-col justify-between rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm transition-all hover:border-blue-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
              >
                <div>
                  {/* CARD TOP BAR */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      {/* AVATAR INITIALS */}
                      <div className="flex size-11 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600/10 to-indigo-600/10 text-blue-600 dark:text-blue-400 font-bold text-sm shadow-inner border border-blue-200/50 dark:border-blue-900/50">
                        {initials}
                      </div>

                      <div>
                        <div className="flex items-center gap-1.5">
                          <h3 className="font-black text-sm text-slate-950 dark:text-white">
                            {user.fullName || (isAr ? "مستخدم جديد" : "Team Member")}
                          </h3>
                          {user.isCurrentUser && (
                            <Badge variant="outline" className="text-[9px] px-1 py-0 border-blue-300 text-blue-600">
                              {isAr ? "أنت" : "You"}
                            </Badge>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 text-xs text-slate-500 font-mono mt-0.5">
                          <Mail className="size-3 text-slate-400 shrink-0" />
                          <span dir="ltr" className="truncate max-w-[220px]">{user.email}</span>
                        </div>
                      </div>
                    </div>

                    {/* STATUS BADGE */}
                    <div>{renderStatusBadge(user.status)}</div>
                  </div>

                  {/* ROLE INFO */}
                  <div className="mt-5 rounded-xl bg-slate-50 dark:bg-slate-800/60 p-3 border border-slate-200/60 dark:border-slate-800 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Shield className={`size-4 ${isOwner ? "text-purple-600" : isAdmin ? "text-blue-600" : isFinance ? "text-emerald-600" : "text-slate-500"}`} />
                      <div>
                        <span className="text-[10px] text-slate-400 font-bold block">{isAr ? "الدور الوظيفي والصلاحيات:" : "Assigned Role:"}</span>
                        <span className="text-xs font-black text-slate-900 dark:text-white">
                          {user.roleNameAr ? (isAr ? user.roleNameAr : user.roleNameEn) : (isAr ? "غير محدد" : "Unassigned")}
                        </span>
                      </div>
                    </div>

                    <Badge variant={isOwner ? "default" : "outline"} className="text-[10px] font-mono font-bold">
                      {user.roleKey || "—"}
                    </Badge>
                  </div>
                </div>

                {/* CARD FOOTER ACTIONS */}
                <div className="mt-5 pt-3.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                  <Button
                    onClick={() => {
                      setRoleModalUser(user);
                      setSelectedNewRoleId(user.roleId || roles[0]?.id || "");
                    }}
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs font-bold gap-1 flex-1 border-slate-200 dark:border-slate-700"
                  >
                    <KeyRound className="size-3.5 text-purple-600" />
                    <span>{isAr ? "تغيير الدور" : "Change Role"}</span>
                  </Button>

                  {/* SUSPEND / ACTIVATE TOGGLE */}
                  {!user.isCurrentUser && (
                    <Button
                      onClick={() => {
                        setStatusModalUser(user);
                        setTargetStatus(user.status === "suspended" ? "active" : "suspended");
                      }}
                      variant="outline"
                      size="sm"
                      className={`h-8 px-2.5 text-xs font-bold gap-1 ${
                        user.status === "suspended"
                          ? "text-emerald-600 border-emerald-200 hover:bg-emerald-50"
                          : "text-rose-600 border-rose-200 hover:bg-rose-50"
                      }`}
                      title={user.status === "suspended" ? (isAr ? "تنشيط الحساب" : "Activate") : (isAr ? "تجميد الحساب" : "Suspend")}
                    >
                      {user.status === "suspended" ? <Unlock className="size-3.5" /> : <Lock className="size-3.5" />}
                    </Button>
                  )}

                  {/* REMOVE BUTTON */}
                  {!user.isCurrentUser && (
                    <Button
                      onClick={() => handleRemoveUser(user)}
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                      title={isAr ? "حذف العضو" : "Remove"}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* TABLE VIEW */
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-sm">
          <Table>
            <TableHeader className="bg-slate-50 dark:bg-slate-800/60">
              <TableRow>
                <TableHead className="font-bold">{isAr ? "عضو الفريق" : "Team Member"}</TableHead>
                <TableHead className="font-bold">{isAr ? "البريد الإلكتروني" : "Email"}</TableHead>
                <TableHead className="font-bold">{isAr ? "الدور الوظيفي" : "Role"}</TableHead>
                <TableHead className="font-bold">{isAr ? "الحالة" : "Status"}</TableHead>
                <TableHead className="text-end font-bold">{isAr ? "إجراءات" : "Actions"}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredUsers.map((user) => (
                <TableRow key={user.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      <div className="flex size-8 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400 font-bold text-xs">
                        {(user.fullName || user.email).slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <span className="font-bold text-slate-900 dark:text-white block text-xs">
                          {user.fullName || (isAr ? "مستخدم" : "Member")}
                        </span>
                        {user.isCurrentUser && (
                          <span className="text-[10px] text-blue-600 font-semibold">{isAr ? "(حسابك الحالي)" : "(You)"}</span>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-slate-600 dark:text-slate-300">
                    {user.email}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="font-bold text-xs gap-1.5">
                      <Shield className="size-3 text-purple-600" />
                      <span>{user.roleNameAr ? (isAr ? user.roleNameAr : user.roleNameEn) : "—"}</span>
                    </Badge>
                  </TableCell>
                  <TableCell>{renderStatusBadge(user.status)}</TableCell>
                  <TableCell className="text-end">
                    <div className="flex items-center justify-end gap-1.5">
                      <Button
                        onClick={() => {
                          setRoleModalUser(user);
                          setSelectedNewRoleId(user.roleId || roles[0]?.id || "");
                        }}
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs font-bold text-indigo-600 hover:text-indigo-700"
                      >
                        {isAr ? "تغيير الدور" : "Change Role"}
                      </Button>

                      {!user.isCurrentUser && (
                        <>
                          <Button
                            onClick={() => {
                              setStatusModalUser(user);
                              setTargetStatus(user.status === "suspended" ? "active" : "suspended");
                            }}
                            variant="ghost"
                            size="sm"
                            className={`size-7 p-0 ${
                              user.status === "suspended"
                                ? "text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                                : "text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                            }`}
                            title={user.status === "suspended" ? (isAr ? "تنشيط الحساب" : "Activate") : (isAr ? "تجميد الحساب" : "Suspend")}
                          >
                            {user.status === "suspended" ? <Unlock className="size-3.5" /> : <Lock className="size-3.5" />}
                          </Button>

                          <Button
                            onClick={() => handleRemoveUser(user)}
                            variant="ghost"
                            size="sm"
                            className="size-7 p-0 text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                            title={isAr ? "حذف المستخدم" : "Remove"}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────────────────────
          INVITE TEAM MEMBER MODAL
          ────────────────────────────────────────────────────────────────────────── */}
      <Dialog open={isInviteOpen} onOpenChange={setIsInviteOpen}>
        <DialogContent className="max-w-md rounded-3xl p-6">
          <DialogHeader>
            <DialogTitle className="text-base font-black text-slate-950 dark:text-white flex items-center gap-2">
              <UserPlus className="size-5 text-blue-600" />
              <span>{isAr ? "دعوة عضو جديد لفريق العمل" : "Invite Team Member"}</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500 mt-1">
              {isAr
                ? "سيتم إرسال رابط دعوة بريدي للمستخدم لتعيين كلمة المرور والانضمام مباشرة للمنشأة."
                : "An email invitation will be sent for the user to set their password and join."}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleInviteSubmit} className="space-y-4 pt-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold">{isAr ? "البريد الإلكتروني المهني *" : "Email Address *"}</Label>
              <Input
                type="email"
                required
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="accountant@company.com"
                className="text-xs h-9 bg-slate-50 dark:bg-slate-800"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold">{isAr ? "الاسم الكامل (اختياري)" : "Full Name (Optional)"}</Label>
              <Input
                type="text"
                value={inviteFullName}
                onChange={(e) => setInviteFullName(e.target.value)}
                placeholder={isAr ? "أحمد محمد علي" : "Ahmed Ali"}
                className="text-xs h-9 bg-slate-50 dark:bg-slate-800"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold">{isAr ? "الدور الوظيفي والصلاحيات *" : "Assigned Role *"}</Label>
              <select
                value={inviteRoleKey}
                onChange={(e) => setInviteRoleKey(e.target.value)}
                className="w-full h-9 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white cursor-pointer"
              >
                {roles.map((role) => (
                  <option key={role.key} value={role.key}>
                    {isAr ? role.name_ar : role.name_en} ({role.key})
                  </option>
                ))}
              </select>
            </div>

            <DialogFooter className="pt-3 flex items-center justify-between">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsInviteOpen(false)}
                className="text-xs font-bold h-9"
              >
                {isAr ? "إلغاء" : "Cancel"}
              </Button>

              <Button
                type="submit"
                disabled={isPending}
                size="sm"
                className="bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:text-slate-900 text-xs font-bold h-9 px-5 gap-1.5 shadow-sm"
              >
                {isPending ? (
                  <span>{isAr ? "جاري الإرسال..." : "Sending..."}</span>
                ) : (
                  <>
                    <UserPlus className="size-4" />
                    <span>{isAr ? "إرسال الدعوة الآن" : "Send Invitation"}</span>
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ──────────────────────────────────────────────────────────────────────────
          CHANGE ROLE MODAL
          ────────────────────────────────────────────────────────────────────────── */}
      <Dialog open={Boolean(roleModalUser)} onOpenChange={(open) => !open && setRoleModalUser(null)}>
        <DialogContent className="max-w-md rounded-3xl p-6">
          <DialogHeader>
            <DialogTitle className="text-base font-black text-slate-950 dark:text-white flex items-center gap-2">
              <KeyRound className="size-5 text-purple-600" />
              <span>{isAr ? "تغيير الدور الوظيفي للمستخدم" : "Change User Role"}</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500 mt-1">
              {isAr
                ? `اختر الدور الجديد للمستخدم «${roleModalUser?.fullName || roleModalUser?.email}».`
                : `Select new role assignment for ${roleModalUser?.fullName || roleModalUser?.email}.`}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold">{isAr ? "الدور الوظيفي الجديد" : "New Role"}</Label>
              <select
                value={selectedNewRoleId}
                onChange={(e) => setSelectedNewRoleId(e.target.value)}
                className="w-full h-9 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white cursor-pointer"
              >
                {roles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {isAr ? role.name_ar : role.name_en} ({role.key})
                  </option>
                ))}
              </select>
            </div>

            <DialogFooter className="pt-3 flex items-center justify-between">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setRoleModalUser(null)}
                className="text-xs font-bold h-9"
              >
                {isAr ? "إلغاء" : "Cancel"}
              </Button>

              <Button
                onClick={handleConfirmRoleChange}
                disabled={isPending}
                size="sm"
                className="bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold h-9 px-5 gap-1.5 shadow-sm"
              >
                {isPending ? (
                  <span>{isAr ? "جاري التحديث..." : "Updating..."}</span>
                ) : (
                  <>
                    <CheckCircle2 className="size-4" />
                    <span>{isAr ? "تأكيد تغيير الدور" : "Confirm Role"}</span>
                  </>
                )}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* ──────────────────────────────────────────────────────────────────────────
          SUSPEND / ACTIVATE CONFIRMATION MODAL
          ────────────────────────────────────────────────────────────────────────── */}
      <Dialog open={Boolean(statusModalUser)} onOpenChange={(open) => !open && setStatusModalUser(null)}>
        <DialogContent className="max-w-md rounded-3xl p-6">
          <DialogHeader>
            <DialogTitle className="text-base font-black text-slate-950 dark:text-white flex items-center gap-2">
              {targetStatus === "suspended" ? (
                <Lock className="size-5 text-rose-600" />
              ) : (
                <Unlock className="size-5 text-emerald-600" />
              )}
              <span>
                {targetStatus === "suspended"
                  ? isAr ? "تأكيد تجميد حساب المستخدم" : "Suspend Account"
                  : isAr ? "تأكيد إعادة تنشيط الحساب" : "Reactivate Account"}
              </span>
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500 mt-2 leading-relaxed">
              {targetStatus === "suspended"
                ? isAr
                  ? `سيتم إيقاف صلاحيات وصول المستخدم «${statusModalUser?.fullName || statusModalUser?.email}» ولن يتمكن من تسجيل الدخول حتى إعادة تنشيطه.`
                  : `User ${statusModalUser?.fullName || statusModalUser?.email} will be blocked from accessing the organization.`
                : isAr
                  ? `سيتم إعادة تفعيل وصول المستخدم «${statusModalUser?.fullName || statusModalUser?.email}» للنظام بكامل صلاحياته.`
                  : `User access will be fully restored.`}
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="pt-4 flex items-center justify-between">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setStatusModalUser(null)}
              className="text-xs font-bold h-9"
            >
              {isAr ? "تراجع" : "Cancel"}
            </Button>

            <Button
              onClick={handleConfirmStatusChange}
              disabled={isPending}
              size="sm"
              className={`text-xs font-bold h-9 px-5 gap-1.5 shadow-sm text-white ${
                targetStatus === "suspended"
                  ? "bg-rose-600 hover:bg-rose-700"
                  : "bg-emerald-600 hover:bg-emerald-700"
              }`}
            >
              {isPending ? (
                <span>{isAr ? "جاري المعالجة..." : "Processing..."}</span>
              ) : targetStatus === "suspended" ? (
                <>
                  <Lock className="size-4" />
                  <span>{isAr ? "تجميد الحساب الآن" : "Suspend Now"}</span>
                </>
              ) : (
                <>
                  <Unlock className="size-4" />
                  <span>{isAr ? "إعادة التنشيط الآن" : "Reactivate Now"}</span>
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
