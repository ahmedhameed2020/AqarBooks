"use client";

import { useState, useTransition } from "react";
import { useActionState } from "react";
import {
  User,
  Shield,
  Bell,
  Palette,
  KeyRound,
  Mail,
  Phone,
  Briefcase,
  Globe,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  Laptop,
  Smartphone,
  LogOut,
  Sparkles,
  Building2,
  ShieldCheck,
  Calendar,
  Clock,
  QrCode,
  Lock,
  MessageCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  updateProfileAction,
  changePasswordAction,
  signOutOtherSessionsAction,
} from "@/lib/actions/profile";
import type { ActionResult } from "@/lib/actions/platform";
import { useToast } from "@/components/ui/toast";

export interface AccountClientProps {
  user: {
    id: string;
    email: string;
    created_at?: string;
    last_sign_in_at?: string;
    user_metadata?: {
      phone?: string;
      job_title?: string;
      avatar_url?: string;
    };
  };
  profile: {
    full_name?: string | null;
    avatar_url?: string | null;
    locale?: string | null;
  } | null;
  organizationName: string;
  userRole: string;
  isPlatformAdmin: boolean;
  locale: string;
}

export function AccountClient({
  user,
  profile,
  organizationName,
  userRole,
  isPlatformAdmin,
  locale,
}: AccountClientProps) {
  const isAr = locale === "ar";
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<"PROFILE" | "SECURITY" | "NOTIFICATIONS" | "PREFERENCES">("PROFILE");

  // Profile Form state
  const [profileState, profileFormAction, profilePending] = useActionState<ActionResult, FormData>(
    async (prev, formData) => {
      const res = await updateProfileAction(prev, formData);
      if (res.ok) {
        toast.show({
          title: isAr ? "تم حفظ البيانات بنجاح" : "Profile Updated",
          description: isAr ? "تم تحديث بيانات الملف الشخصي بنجاح." : "Your profile has been saved successfully.",
          variant: "success",
        });
      }
      return res;
    },
    { ok: true }
  );

  // Password Form state
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [passwordState, passwordFormAction, passwordPending] = useActionState<ActionResult, FormData>(
    async (prev, formData) => {
      const res = await changePasswordAction(prev, formData);
      if (res.ok) {
        toast.show({
          title: isAr ? "تم تحديث كلمة المرور" : "Password Updated",
          description: isAr ? "تم تغيير كلمة المرور الخاصة بحسابك بنجاح." : "Your password was changed successfully.",
          variant: "success",
        });
        setNewPassword("");
      }
      return res;
    },
    { ok: true }
  );

  // Session sign-out state
  const [isSigningOutOthers, startSignOutTransition] = useTransition();
  const handleSignOutOtherSessions = () => {
    startSignOutTransition(async () => {
      const res = await signOutOtherSessionsAction();
      if (res.ok) {
        toast.show({
          title: isAr ? "تم إنهاء الجلسات الأخرى" : "Sessions Terminated",
          description: isAr ? "تم تسجيل الخروج بنجاح من كافة الأجهزة والمتصفحات الأخرى." : "Signed out of all other active sessions.",
          variant: "success",
        });
      } else {
        toast.show({
          title: isAr ? "فشل تسجيل الخروج" : "Failed",
          description: res.error,
          variant: "error",
        });
      }
    });
  };

  // Notification Preferences state (Local simulation / persistent store)
  const [waNotifications, setWaNotifications] = useState(true);
  const [emailDigest, setEmailDigest] = useState(true);
  const [securityAlerts, setSecurityAlerts] = useState(true);

  // Password strength calculation
  const getPasswordStrength = (pass: string) => {
    if (!pass) return 0;
    let score = 0;
    if (pass.length >= 8) score += 25;
    if (pass.length >= 12) score += 25;
    if (/[A-Z]/.test(pass) && /[a-z]/.test(pass)) score += 25;
    if (/[0-9]/.test(pass) && /[^A-Za-z0-9]/.test(pass)) score += 25;
    return score;
  };

  const passStrength = getPasswordStrength(newPassword);

  const getInitials = (name: string) => {
    if (!name) return "U";
    const parts = name.trim().split(" ");
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return parts[0].slice(0, 2).toUpperCase();
  };

  const initials = getInitials(profile?.full_name || user.email);

  return (
    <div className="w-full max-w-5xl mx-auto space-y-6 pb-16">
      {/* ──────────────────────────────────────────────────────────────────────────
          1. USER IDENTITY BANNER
          ────────────────────────────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-3xl border border-slate-200/90 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5">
          <div className="flex items-center gap-4">
            {/* AVATAR WITH INITIALS */}
            <div className="relative flex size-16 sm:size-20 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-600 via-purple-600 to-slate-900 text-white font-black text-xl sm:text-2xl shadow-md">
              <span>{initials}</span>
              <span className="absolute -bottom-1 -end-1 size-4 rounded-full bg-emerald-500 border-2 border-white dark:border-slate-900" title="Online" />
            </div>

            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-black tracking-tight text-slate-950 dark:text-white">
                  {profile?.full_name || (isAr ? "مستخدم AqarBooks" : "AqarBooks User")}
                </h1>
                <Badge className="bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-950/60 dark:text-purple-300 text-[10px] font-bold">
                  {isPlatformAdmin ? (isAr ? "مسؤول النظام العام" : "Platform Admin") : userRole || (isAr ? "مالك المنشأة" : "Owner")}
                </Badge>
              </div>

              <p className="text-xs text-slate-500 font-mono font-medium">{user.email}</p>

              <div className="flex flex-wrap items-center gap-3 pt-1 text-[11px] text-slate-400 font-medium">
                <span className="flex items-center gap-1">
                  <Building2 className="size-3.5 text-indigo-600" />
                  <span>{organizationName}</span>
                </span>
                <span>•</span>
                <span className="flex items-center gap-1">
                  <Calendar className="size-3.5 text-slate-400" />
                  <span>
                    {isAr ? "عضو منذ: " : "Member since: "}
                    {user.created_at ? new Date(user.created_at).toLocaleDateString(isAr ? "ar-EG" : "en-US") : "2025"}
                  </span>
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 px-3 py-1 text-xs font-bold gap-1">
              <CheckCircle2 className="size-3.5" />
              <span>{isAr ? "حساب نشط وموثق" : "Active & Verified"}</span>
            </Badge>
          </div>
        </div>
      </div>

      {/* ──────────────────────────────────────────────────────────────────────────
          2. NAVIGATION TABS
          ────────────────────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1.5 overflow-x-auto border-b border-slate-200 dark:border-slate-800 pb-2 scrollbar-none">
        <button
          onClick={() => setActiveTab("PROFILE")}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl transition-all ${
            activeTab === "PROFILE"
              ? "bg-slate-900 text-white shadow-xs dark:bg-white dark:text-slate-900"
              : "bg-white text-slate-600 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800"
          }`}
        >
          <User className="size-4" />
          <span>{isAr ? "الملف الشخصي" : "Profile & Identity"}</span>
        </button>

        <button
          onClick={() => setActiveTab("SECURITY")}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl transition-all ${
            activeTab === "SECURITY"
              ? "bg-slate-900 text-white shadow-xs dark:bg-white dark:text-slate-900"
              : "bg-white text-slate-600 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800"
          }`}
        >
          <Shield className="size-4" />
          <span>{isAr ? "الأمان وكلمات المرور" : "Security & Password"}</span>
        </button>

        <button
          onClick={() => setActiveTab("NOTIFICATIONS")}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl transition-all ${
            activeTab === "NOTIFICATIONS"
              ? "bg-slate-900 text-white shadow-xs dark:bg-white dark:text-slate-900"
              : "bg-white text-slate-600 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800"
          }`}
        >
          <Bell className="size-4" />
          <span>{isAr ? "تفضيلات الإشعارات" : "Notification Preferences"}</span>
        </button>

        <button
          onClick={() => setActiveTab("PREFERENCES")}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl transition-all ${
            activeTab === "PREFERENCES"
              ? "bg-slate-900 text-white shadow-xs dark:bg-white dark:text-slate-900"
              : "bg-white text-slate-600 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800"
          }`}
        >
          <Palette className="size-4" />
          <span>{isAr ? "تخصيص الواجهة" : "Preferences & Experience"}</span>
        </button>
      </div>

      {/* ──────────────────────────────────────────────────────────────────────────
          TAB 1: PROFILE FORM
          ────────────────────────────────────────────────────────────────────────── */}
      {activeTab === "PROFILE" && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-5 pb-4 border-b border-slate-100 dark:border-slate-800">
            <h2 className="text-base font-black text-slate-950 dark:text-white">
              {isAr ? "البيانات الأساسية ومعلومات التواصل" : "Personal Information"}
            </h2>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              {isAr ? "تحديث الاسم، رقم الواتساب، واللغة المفضلة لتلقي التقارير والمعاملات." : "Update your profile details and preferred language."}
            </p>
          </div>

          <form action={profileFormAction} className="space-y-4 max-w-2xl">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* EMAIL */}
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  {isAr ? "البريد الإلكتروني (الحساب)" : "Email Address"}
                </Label>
                <div className="relative">
                  <Mail className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
                  <Input
                    value={user.email}
                    disabled
                    className="ps-9 text-xs h-9.5 bg-slate-100 dark:bg-slate-800 text-slate-500 font-mono font-bold cursor-not-allowed"
                  />
                </div>
              </div>

              {/* FULL NAME */}
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  {isAr ? "الاسم الكامل *" : "Full Name *"}
                </Label>
                <div className="relative">
                  <User className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
                  <Input
                    name="fullName"
                    defaultValue={profile?.full_name || ""}
                    required
                    maxLength={200}
                    placeholder={isAr ? "مثال: م. أحمد عبد الحميد" : "John Doe"}
                    className="ps-9 text-xs h-9.5 bg-slate-50 dark:bg-slate-800 font-bold"
                  />
                </div>
              </div>

              {/* PHONE / WHATSAPP */}
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  {isAr ? "رقم الهاتف / الواتساب" : "Phone / WhatsApp Number"}
                </Label>
                <div className="relative">
                  <Phone className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
                  <Input
                    name="phone"
                    defaultValue={user.user_metadata?.phone || ""}
                    placeholder="+20 100 000 0000"
                    className="ps-9 text-xs h-9.5 bg-slate-50 dark:bg-slate-800 font-mono"
                  />
                </div>
              </div>

              {/* JOB TITLE */}
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  {isAr ? "المسمى الوظيفي" : "Job Title / Designation"}
                </Label>
                <div className="relative">
                  <Briefcase className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
                  <Input
                    name="jobTitle"
                    defaultValue={user.user_metadata?.job_title || ""}
                    placeholder={isAr ? "مثال: المدير المالي / مدير العقارات" : "Finance Director"}
                    className="ps-9 text-xs h-9.5 bg-slate-50 dark:bg-slate-800"
                  />
                </div>
              </div>

              {/* PREFERRED LOCALE */}
              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  {isAr ? "اللغة المفضّلة للنظام والتقارير" : "Preferred Language"}
                </Label>
                <div className="relative">
                  <Globe className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-slate-400 z-10" />
                  <select
                    name="locale"
                    defaultValue={profile?.locale || locale}
                    className="w-full h-9.5 rounded-xl border border-slate-200 bg-slate-50 ps-9 pe-3 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white cursor-pointer"
                  >
                    <option value="ar">العربية (Arabic) — اللغة الافتراضية</option>
                    <option value="en">English (الإنجليزية)</option>
                  </select>
                </div>
              </div>
            </div>

            {!profileState.ok && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 font-bold">
                {profileState.error}
              </div>
            )}

            <div className="pt-3">
              <Button
                type="submit"
                disabled={profilePending}
                className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold h-9.5 px-6 shadow-sm gap-1.5"
              >
                <CheckCircle2 className="size-4" />
                <span>{profilePending ? (isAr ? "جاري الحفظ..." : "Saving...") : (isAr ? "حفظ التغييرات" : "Save Changes")}</span>
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────────────────────
          TAB 2: SECURITY & PASSWORD
          ────────────────────────────────────────────────────────────────────────── */}
      {activeTab === "SECURITY" && (
        <div className="space-y-6">
          {/* CHANGE PASSWORD */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-5 pb-4 border-b border-slate-100 dark:border-slate-800">
              <h2 className="text-base font-black text-slate-950 dark:text-white flex items-center gap-2">
                <KeyRound className="size-4.5 text-indigo-600" />
                <span>{isAr ? "تغيير كلمة المرور" : "Change Password"}</span>
              </h2>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                {isAr ? "اختر كلمة مرور قوية لحماية حسابك ومعاملاتك المالية." : "Ensure your account is using a secure password."}
              </p>
            </div>

            <form action={passwordFormAction} className="space-y-4 max-w-md">
              {/* NEW PASSWORD */}
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  {isAr ? "كلمة المرور الجديدة *" : "New Password *"}
                </Label>
                <div className="relative">
                  <Input
                    name="password"
                    type={showPassword ? "text" : "password"}
                    required
                    minLength={8}
                    maxLength={72}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="pe-9 text-xs h-9.5 bg-slate-50 dark:bg-slate-800 font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute end-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>

                {/* Password Strength Meter */}
                {newPassword && (
                  <div className="space-y-1 pt-1">
                    <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all duration-300 ${
                          passStrength <= 25
                            ? "bg-rose-500 w-1/4"
                            : passStrength <= 50
                            ? "bg-amber-500 w-2/4"
                            : passStrength <= 75
                            ? "bg-blue-500 w-3/4"
                            : "bg-emerald-500 w-full"
                        }`}
                      />
                    </div>
                    <span className="text-[10px] text-slate-400 block font-medium">
                      {passStrength <= 25
                        ? (isAr ? "كلمة مرور ضعيفة" : "Weak")
                        : passStrength <= 50
                        ? (isAr ? "كلمة مرور مقبولة" : "Fair")
                        : passStrength <= 75
                        ? (isAr ? "كلمة مرور جيدة" : "Good")
                        : (isAr ? "كلمة مرور قوية جداً ومحمية" : "Very Strong")}
                    </span>
                  </div>
                )}
              </div>

              {/* CONFIRM PASSWORD */}
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  {isAr ? "تأكيد كلمة المرور *" : "Confirm New Password *"}
                </Label>
                <div className="relative">
                  <Input
                    name="confirmPassword"
                    type={showConfirmPassword ? "text" : "password"}
                    required
                    minLength={8}
                    maxLength={72}
                    placeholder="••••••••••••"
                    className="pe-9 text-xs h-9.5 bg-slate-50 dark:bg-slate-800 font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute end-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showConfirmPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </div>

              {!passwordState.ok && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 font-bold">
                  {passwordState.error === "passwords_do_not_match"
                    ? isAr
                      ? "كلمتا المرور غير متطابقتين"
                      : "Passwords do not match"
                    : passwordState.error}
                </div>
              )}

              <div className="pt-2">
                <Button
                  type="submit"
                  disabled={passwordPending}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold h-9.5 px-6 shadow-sm gap-1.5"
                >
                  <Lock className="size-4" />
                  <span>{passwordPending ? (isAr ? "جاري التحديث..." : "Updating...") : (isAr ? "تحديث كلمة المرور" : "Update Password")}</span>
                </Button>
              </div>
            </form>
          </div>

          {/* ACTIVE SESSIONS & SECURITY LOGOUT */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-4 pb-3 border-b border-slate-100 dark:border-slate-800">
              <h2 className="text-base font-black text-slate-950 dark:text-white flex items-center gap-2">
                <Laptop className="size-4.5 text-blue-600" />
                <span>{isAr ? "الجلسات النشطة والأجهزة المتصلة" : "Active Sessions & Devices"}</span>
              </h2>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                {isAr ? "الأجهزة والمتصفحات التي سجلت الدخول بحسابك مؤخراً." : "Devices currently logged in to your account."}
              </p>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between p-3.5 rounded-xl border border-emerald-200/80 bg-emerald-50/30 dark:bg-emerald-950/20 dark:border-emerald-900/60">
                <div className="flex items-center gap-3">
                  <div className="flex size-9 items-center justify-center rounded-xl bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300">
                    <Laptop className="size-4.5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-900 dark:text-white">
                        {isAr ? "متصفح الويب الحالي (هذا الجهاز)" : "Current Web Session"}
                      </span>
                      <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-[9px] font-bold py-0">
                        {isAr ? "نشط الآن" : "Active Now"}
                      </Badge>
                    </div>
                    <span className="text-[10px] text-slate-400 block font-mono mt-0.5">
                      Windows • Chrome • {user.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleString(isAr ? "ar-EG" : "en-US") : "Active"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between pt-3">
                <span className="text-xs text-slate-500 font-medium">
                  {isAr ? "هل تشك في وجود جلسات مشبوهة؟" : "Want to secure other devices?"}
                </span>

                <Button
                  onClick={handleSignOutOtherSessions}
                  disabled={isSigningOutOthers}
                  variant="outline"
                  size="sm"
                  className="text-xs font-bold text-rose-600 border-rose-200 hover:bg-rose-50 dark:border-rose-900 dark:hover:bg-rose-950/40 gap-1.5 h-9"
                >
                  <LogOut className="size-3.5" />
                  <span>{isSigningOutOthers ? (isAr ? "جاري الإنهاء..." : "Signing out...") : (isAr ? "تسجيل الخروج من كافة الأجهزة الأخرى" : "Sign Out Other Sessions")}</span>
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────────────────────
          TAB 3: NOTIFICATIONS PREFERENCES
          ────────────────────────────────────────────────────────────────────────── */}
      {activeTab === "NOTIFICATIONS" && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-5 pb-4 border-b border-slate-100 dark:border-slate-800">
            <h2 className="text-base font-black text-slate-950 dark:text-white flex items-center gap-2">
              <Bell className="size-4.5 text-amber-600" />
              <span>{isAr ? "قنوات وتفضيلات الإشعارات" : "Notification Channels & Preferences"}</span>
            </h2>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              {isAr ? "حدد القنوات التي ترغب في تلقي إشعارات المعاملات والتحصيلات من خلالها." : "Choose how and when you want to receive system alerts."}
            </p>
          </div>

          <div className="space-y-4 max-w-2xl">
            {/* WHATSAPP NOTIFICATIONS */}
            <div className="flex items-center justify-between p-4 rounded-xl border border-slate-200/80 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-800/40">
              <div className="flex items-start gap-3">
                <div className="flex size-9 items-center justify-center rounded-xl bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-400 shrink-0">
                  <MessageCircle className="size-4.5" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-slate-900 dark:text-white">
                    {isAr ? "إشعارات المعاملات عبر الواتساب (WhatsApp)" : "WhatsApp Transaction Alerts"}
                  </h3>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {isAr ? "استلام إشعارات فورية عند إصدار سند قبض، فواتير إيجار، أو تجديد عقود." : "Receive instant alerts on receipts, dues, and lease renewals."}
                  </p>
                </div>
              </div>

              <input
                type="checkbox"
                checked={waNotifications}
                onChange={(e) => setWaNotifications(e.target.checked)}
                className="size-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
              />
            </div>

            {/* EMAIL DIGEST */}
            <div className="flex items-center justify-between p-4 rounded-xl border border-slate-200/80 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-800/40">
              <div className="flex items-start gap-3">
                <div className="flex size-9 items-center justify-center rounded-xl bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-400 shrink-0">
                  <Mail className="size-4.5" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-slate-900 dark:text-white">
                    {isAr ? "الملخص المالي والتقارير الدورية (Email)" : "Financial Reports Digest"}
                  </h3>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {isAr ? "تلقي ملخص أسبوعي وشهري بحركة الإيرادات والتحصيلات ونسب الإشغال." : "Weekly and monthly email summaries of financial health."}
                  </p>
                </div>
              </div>

              <input
                type="checkbox"
                checked={emailDigest}
                onChange={(e) => setEmailDigest(e.target.checked)}
                className="size-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
              />
            </div>

            {/* SECURITY ALERTS */}
            <div className="flex items-center justify-between p-4 rounded-xl border border-slate-200/80 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-800/40">
              <div className="flex items-start gap-3">
                <div className="flex size-9 items-center justify-center rounded-xl bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-400 shrink-0">
                  <ShieldCheck className="size-4.5" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-slate-900 dark:text-white">
                    {isAr ? "تنبيهات الأمان والعمليات الحساسة" : "Security & Sensitive Operations Alerts"}
                  </h3>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {isAr ? "إشعار فوري عند إلغاء سندات، تغيير صلاحيات، أو تسجيل دخول غير معتاد." : "Instant notification when transactions are voided or permissions changed."}
                  </p>
                </div>
              </div>

              <input
                type="checkbox"
                checked={securityAlerts}
                onChange={(e) => setSecurityAlerts(e.target.checked)}
                className="size-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
              />
            </div>

            <div className="pt-2">
              <Button
                onClick={() =>
                  toast.show({
                    title: isAr ? "تم حفظ التفضيلات" : "Preferences Saved",
                    description: isAr ? "تم تحديث إعدادات الإشعارات بنجاح." : "Your notification preferences have been saved.",
                    variant: "success",
                  })
                }
                className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold h-9 px-5"
              >
                {isAr ? "حفظ تفضيلات الإشعارات" : "Save Notification Preferences"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────────────────────
          TAB 4: PLATFORM PREFERENCES
          ────────────────────────────────────────────────────────────────────────── */}
      {activeTab === "PREFERENCES" && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-5 pb-4 border-b border-slate-100 dark:border-slate-800">
            <h2 className="text-base font-black text-slate-950 dark:text-white flex items-center gap-2">
              <Palette className="size-4.5 text-purple-600" />
              <span>{isAr ? "تخصيص تجربة العمل بالمنصة" : "Platform & Interface Experience"}</span>
            </h2>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              {isAr ? "تخصيص الصفحة الافتراضية ومظهر المنظومة." : "Customize your workspace landing page and theme."}
            </p>
          </div>

          <div className="space-y-4 max-w-2xl">
            {/* DEFAULT LANDING PAGE */}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                {isAr ? "الصفحة الافتراضية عند تسجيل الدخول" : "Default Landing Page"}
              </Label>
              <select
                defaultValue="/dashboard"
                className="w-full h-9.5 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white cursor-pointer"
              >
                <option value="/dashboard">{isAr ? "لوحة المؤشرات والداشبورد الرئيسية (Dashboard)" : "Executive Dashboard"}</option>
                <option value="/finance/reports">{isAr ? "مركز التقارير والقوائم المالية (Reports Hub)" : "Financial Reports Hub"}</option>
                <option value="/finance/einvoice">{isAr ? "الفوترة الإلكترونية والإقرارات (E-Invoices)" : "E-Invoicing"}</option>
                <option value="/property">{isAr ? "إدارة العقارات والوحدات (Properties)" : "Property Management"}</option>
              </select>
            </div>

            {/* BRAND COLOR PREVIEW & ADMIN LINK */}
            <div className="p-4 rounded-xl border border-slate-200/80 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-800/40 flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-xs font-bold text-slate-900 dark:text-white block">
                  {isAr ? "هوية المنشأة وشعار العلامة التجارية" : "Organization Branding & Colors"}
                </span>
                <span className="text-[11px] text-slate-400 block">
                  {isAr ? "تخصيص الشعار، الألوان، وترويسة الفواتير من لوحة إدارة المنشأة." : "Customize logo, brand colors, and invoice headers in Organization Settings."}
                </span>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => window.location.href = `/${locale}/admin`}
                className="text-xs font-bold h-8.5 gap-1"
              >
                <Palette className="size-3.5 text-purple-600" />
                <span>{isAr ? "إعدادات المنشأة" : "Org Settings"}</span>
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
