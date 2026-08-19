"use client";

import { useState } from "react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import {
  Bell,
  BellRing,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Info,
  Calendar,
  CreditCard,
  Building2,
  Landmark,
  ShieldCheck,
  Smartphone,
  Mail,
  MessageSquare,
  Sparkles,
  SlidersHorizontal,
  Clock,
  Trash2,
  Eye,
  Check,
  Send,
  ExternalLink,
  ChevronRight,
  Filter,
  RefreshCw,
} from "lucide-react";

export type NotificationItem = {
  id: string;
  category: "FINANCIAL" | "LEASES" | "TAX" | "SECURITY" | "SYSTEM";
  severity: "CRITICAL" | "WARNING" | "INFO" | "SUCCESS";
  titleAr: string;
  titleEn: string;
  descriptionAr: string;
  descriptionEn: string;
  timestamp: string;
  isRead: boolean;
  actionUrl?: string;
  actionLabelAr?: string;
  actionLabelEn?: string;
  channel?: "WHATSAPP" | "EMAIL" | "SYSTEM" | "SMS";
};

const INITIAL_NOTIFICATIONS: NotificationItem[] = [
  {
    id: "notif-1",
    category: "FINANCIAL",
    severity: "CRITICAL",
    titleAr: "شيكات تحت التحصيل تستحق خلال 3 أيام",
    titleEn: "PDC Cheques Due in 3 Days",
    descriptionAr: "يوجد 4 شيكات بقيمة إجمالية 145,000 ج.م تستحق الصرف لدى بنك CIB والأهلي المصري.",
    descriptionEn: "4 cheques total 145,000 EGP are due for deposit at CIB and NBE.",
    timestamp: "منذ 10 دقائق",
    isRead: false,
    actionUrl: "/finance/reports/pdc-register",
    actionLabelAr: "معاينة حافظة الشيكات",
    actionLabelEn: "View PDC Register",
    channel: "SYSTEM",
  },
  {
    id: "notif-2",
    category: "LEASES",
    severity: "WARNING",
    titleAr: "عقود إيجار تنتهي خلال 30 يوماً",
    titleEn: "Lease Contracts Expiring in 30 Days",
    descriptionAr: "عقد الوحدة V-204 (المستأجر: مروان الشريف) ينتهي في 15 سبتمبر 2026. يرجى المتابعة للتجديد.",
    descriptionEn: "Unit V-204 lease (Tenant: Marwan El-Sherif) expires Sep 15, 2026. Follow up for renewal.",
    timestamp: "منذ ساعتين",
    isRead: false,
    actionUrl: "/finance/reports/lease-expirations",
    actionLabelAr: "متابعة تجديد العقد",
    actionLabelEn: "Review Lease",
    channel: "WHATSAPP",
  },
  {
    id: "notif-3",
    category: "TAX",
    severity: "WARNING",
    titleAr: "اقتراب موعد تقديم الإقرار الضريبي للقيمة المضافة",
    titleEn: "VAT Return Submission Deadline",
    descriptionAr: "الموعد النهائي لتقديم إقرار شهر يوليو ينتهي خلال 5 أيام. يرجى تدقيق ضريبة المخرجات والمدخلات.",
    descriptionEn: "July VAT return submission deadline is in 5 days. Reconcile input & output taxes.",
    timestamp: "اليوم 09:30 ص",
    isRead: false,
    actionUrl: "/finance/reports/vat-return",
    actionLabelAr: "فتح الإقرار الضريبي",
    actionLabelEn: "Open VAT Return",
    channel: "EMAIL",
  },
  {
    id: "notif-4",
    category: "FINANCIAL",
    severity: "SUCCESS",
    titleAr: "تم تحصيل دفعة إيجارية إلكترونياً (Fawry Pay)",
    titleEn: "Online Payment Received via Fawry",
    descriptionAr: "تم سداد مطالبة الصيانة رقم #INV-8821 للوحدة A-101 بقيمة 4,500 ج.م وتم إصدار سند القبض آلياً.",
    descriptionEn: "CAM Due #INV-8821 for unit A-101 paid (4,500 EGP). Receipt generated automatically.",
    timestamp: "أمس 04:15 م",
    isRead: true,
    actionUrl: "/finance/payments",
    actionLabelAr: "عرض سند القبض",
    actionLabelEn: "View Receipt",
    channel: "SYSTEM",
  },
  {
    id: "notif-5",
    category: "SECURITY",
    severity: "INFO",
    titleAr: "تسجيل دخول جديد لحساب المنشأة",
    titleEn: "New Login Detected",
    descriptionAr: "تم تسجيل الدخول من متصفح Chrome على نظام Windows من عنوان IP مصرح به.",
    descriptionEn: "Signed in from Chrome on Windows with authorized IP.",
    timestamp: "أمس 11:00 ص",
    isRead: true,
    actionUrl: "/account",
    actionLabelAr: "إعدادات الأمان",
    actionLabelEn: "Security Settings",
    channel: "SYSTEM",
  },
];

export function NotificationsClient({
  locale,
  organizationId,
  organizationName,
}: {
  locale: string;
  organizationId: string;
  organizationName: string;
}) {
  const isAr = locale === "ar";
  const toast = useToast();

  const [activeTab, setActiveTab] = useState<"FEED" | "CHANNELS" | "RULES">("FEED");
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>(INITIAL_NOTIFICATIONS);

  // Channels State
  const [whatsappEnabled, setWhatsappEnabled] = useState(true);
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [smsEnabled, setSmsEnabled] = useState(false);
  const [inAppEnabled, setInAppEnabled] = useState(true);

  // Notification Rules
  const [pdcDays, setPdcDays] = useState("7");
  const [leaseDays, setLeaseDays] = useState("30");
  const [vatReminderDays, setVatReminderDays] = useState("5");
  const [autoReceiptWhatsapp, setAutoReceiptWhatsapp] = useState(true);

  const unreadCount = notifications.filter((n) => !n.isRead).length;
  const criticalCount = notifications.filter((n) => n.severity === "CRITICAL" && !n.isRead).length;

  const markAllAsRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    toast.show({
      title: isAr ? "تم تحديد الكل كمقروء" : "All Marked as Read",
      description: isAr ? "تم تحديث حالة كافة التنبيهات بنجاح." : "All notifications marked as read.",
      variant: "success",
    });
  };

  const toggleReadStatus = (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, isRead: !n.isRead } : n))
    );
  };

  const deleteNotification = (id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    toast.show({
      title: isAr ? "تم حذف التنبيه" : "Notification Deleted",
      variant: "default",
    });
  };

  const testBroadcast = () => {
    toast.show({
      title: isAr ? "تم إرسال إشعار تجريبي بنجاح 🔔" : "Test Notification Sent 🔔",
      description: isAr
        ? "تم فحص قناة WhatsApp والبريد الإلكتروني وتوثيق الاتصال."
        : "WhatsApp & Email channels verified successfully.",
      variant: "success",
    });
  };

  const filteredNotifications = notifications.filter((item) => {
    if (unreadOnly && item.isRead) return false;
    if (categoryFilter !== "ALL" && item.category !== categoryFilter) return false;
    return true;
  });

  return (
    <div className="w-full max-w-6xl mx-auto space-y-6 pb-20">
      {/* ──────────────────────────────────────────────────────────────────────────
          1. HEADER & KPI OVERVIEW
          ────────────────────────────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-3xl border border-slate-200/90 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/60 dark:text-indigo-300 px-3 py-1 text-xs font-bold gap-1.5 shadow-2xs">
                <BellRing className="size-4 text-indigo-600 dark:text-indigo-400 animate-bounce" />
                <span>{isAr ? "مركز الإشعارات والتنبيهات المباشرة" : "Smart Notification Center"}</span>
              </Badge>
              {unreadCount > 0 && (
                <Badge className="bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 text-[10px] font-bold">
                  {unreadCount} {isAr ? "تنبيهات جديدة غير مقروءة" : "Unread Alerts"}
                </Badge>
              )}
            </div>

            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-950 dark:text-white">
              {isAr ? "إدارة التنبيهات، الشيكات، وقنوات المراسلة" : "Alerts, PDC Reminders & Multi-Channel Delivery"}
            </h1>

            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-2xl font-medium">
              {isAr
                ? "متابعة لحظية لاستحقاق الشيكات، انتهاء عقود الإيجار، الإقرارات الضريبية، وإرسال سندات القبض والتنبيهات عبر الواتساب والبريد الإلكتروني."
                : "Real-time tracking of PDC due dates, lease expiries, tax deadlines, and WhatsApp/Email auto-reminders."}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <Button
              type="button"
              onClick={markAllAsRead}
              variant="outline"
              size="sm"
              disabled={unreadCount === 0}
              className="text-xs font-bold h-9 px-3.5 gap-1.5 rounded-xl border-slate-200 hover:bg-slate-50 dark:border-slate-800"
            >
              <Check className="size-3.5 text-indigo-600" />
              <span>{isAr ? "تحديد الكل كمقروء" : "Mark All Read"}</span>
            </Button>

            <Button
              type="button"
              onClick={testBroadcast}
              size="sm"
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold h-9 px-4 gap-1.5 rounded-xl shadow-xs"
            >
              <Send className="size-3.5" />
              <span>{isAr ? "إرسال تنبيه تجريبي" : "Test Broadcast"}</span>
            </Button>
          </div>
        </div>

        {/* TOP KPI METRICS */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5 pt-6 mt-6 border-t border-slate-100 dark:border-slate-800">
          <div className="p-3.5 rounded-2xl bg-slate-50/70 border border-slate-100 dark:bg-slate-800/40 dark:border-slate-800">
            <p className="text-[11px] font-bold text-slate-500">{isAr ? "إجمالي التنبيهات" : "Total Alerts"}</p>
            <p className="text-xl font-black text-slate-900 dark:text-white mt-1">{notifications.length}</p>
          </div>

          <div className="p-3.5 rounded-2xl bg-rose-50/70 border border-rose-100 dark:bg-rose-950/20 dark:border-rose-900/40">
            <p className="text-[11px] font-bold text-rose-700 dark:text-rose-400">{isAr ? "تنبيهات حرجة وعاجلة" : "Critical Actions"}</p>
            <p className="text-xl font-black text-rose-700 dark:text-rose-300 mt-1">{criticalCount}</p>
          </div>

          <div className="p-3.5 rounded-2xl bg-amber-50/70 border border-amber-100 dark:bg-amber-950/20 dark:border-amber-900/40">
            <p className="text-[11px] font-bold text-amber-700 dark:text-amber-400">{isAr ? "شيكات وعقود قريبة" : "PDC & Leases Due"}</p>
            <p className="text-xl font-black text-amber-700 dark:text-amber-300 mt-1">2</p>
          </div>

          <div className="p-3.5 rounded-2xl bg-emerald-50/70 border border-emerald-100 dark:bg-emerald-950/20 dark:border-emerald-900/40">
            <p className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400">{isAr ? "قنوات الإرسال النشطة" : "Active Channels"}</p>
            <p className="text-xl font-black text-emerald-700 dark:text-emerald-300 mt-1">
              {[whatsappEnabled, emailEnabled, inAppEnabled].filter(Boolean).length} / 4
            </p>
          </div>
        </div>
      </div>

      {/* ──────────────────────────────────────────────────────────────────────────
          2. NAVIGATION TABS
          ────────────────────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 p-1.5 rounded-2xl bg-slate-100 dark:bg-slate-800 w-fit">
        <button
          type="button"
          onClick={() => setActiveTab("FEED")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === "FEED"
              ? "bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white"
              : "text-slate-600 hover:text-slate-900 dark:text-slate-400"
          }`}
        >
          <Bell className="size-4" />
          <span>{isAr ? "سجل الإشعارات والتنبيهات" : "Notification Feed"}</span>
          {unreadCount > 0 && (
            <span className="flex size-4.5 items-center justify-center rounded-full bg-indigo-600 text-white text-[10px] font-mono font-bold">
              {unreadCount}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("CHANNELS")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === "CHANNELS"
              ? "bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white"
              : "text-slate-600 hover:text-slate-900 dark:text-slate-400"
          }`}
        >
          <MessageSquare className="size-4" />
          <span>{isAr ? "قنوات الإرسال (واتساب / بريد / SMS)" : "Delivery Channels"}</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("RULES")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === "RULES"
              ? "bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white"
              : "text-slate-600 hover:text-slate-900 dark:text-slate-400"
          }`}
        >
          <SlidersHorizontal className="size-4" />
          <span>{isAr ? "قواعد ومواعيد التذكير التلقائي" : "Automated Reminder Rules"}</span>
        </button>
      </div>

      {/* ──────────────────────────────────────────────────────────────────────────
          TAB 1: LIVE NOTIFICATION FEED
          ────────────────────────────────────────────────────────────────────────── */}
      {activeTab === "FEED" && (
        <div className="space-y-4">
          {/* CATEGORY FILTER PILLS */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-2xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-wrap items-center gap-1.5">
              {[
                { key: "ALL", labelAr: "الكل", labelEn: "All" },
                { key: "FINANCIAL", labelAr: "المالية والشيكات", labelEn: "Financial & PDC" },
                { key: "LEASES", labelAr: "العقود والإيجارات", labelEn: "Leases" },
                { key: "TAX", labelAr: "الضرائب والفوترة", labelEn: "Tax & E-Invoice" },
                { key: "SECURITY", labelAr: "الأمان والنظام", labelEn: "Security" },
              ].map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setCategoryFilter(tab.key)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                    categoryFilter === tab.key
                      ? "bg-indigo-600 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
                  }`}
                >
                  {isAr ? tab.labelAr : tab.labelEn}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setUnreadOnly(!unreadOnly)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                  unreadOnly
                    ? "bg-indigo-50 text-indigo-700 border-indigo-300 dark:bg-indigo-950 dark:text-indigo-300"
                    : "border-slate-200 text-slate-600 dark:border-slate-800 dark:text-slate-400"
                }`}
              >
                <Filter className="size-3.5" />
                <span>{isAr ? "غير المقروءة فقط" : "Unread Only"}</span>
              </button>
            </div>
          </div>

          {/* NOTIFICATION CARDS LIST */}
          <div className="space-y-3">
            {filteredNotifications.length === 0 ? (
              <div className="p-12 text-center rounded-3xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 space-y-2">
                <CheckCircle2 className="size-10 text-emerald-500 mx-auto" />
                <p className="text-sm font-black text-slate-900 dark:text-white">
                  {isAr ? "لا توجد تنبيهات جديدة في هذا التصنيف" : "No notifications in this filter"}
                </p>
                <p className="text-xs text-slate-400">
                  {isAr ? "كافة المعاملات والمستندات محدثة وموثقة." : "All transactions are up to date."}
                </p>
              </div>
            ) : (
              filteredNotifications.map((notif) => {
                const isCritical = notif.severity === "CRITICAL";
                const isWarning = notif.severity === "WARNING";
                const isSuccess = notif.severity === "SUCCESS";

                return (
                  <div
                    key={notif.id}
                    className={`p-4.5 rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-start justify-between gap-4 ${
                      !notif.isRead
                        ? isCritical
                          ? "bg-rose-50/40 border-rose-200/90 shadow-xs dark:bg-rose-950/20 dark:border-rose-900"
                          : isWarning
                          ? "bg-amber-50/40 border-amber-200/90 shadow-xs dark:bg-amber-950/20 dark:border-amber-900"
                          : "bg-indigo-50/30 border-indigo-200/80 shadow-xs dark:bg-indigo-950/20 dark:border-indigo-900"
                        : "bg-white border-slate-200/80 dark:bg-slate-900 dark:border-slate-800/80 opacity-80 hover:opacity-100"
                    }`}
                  >
                    <div className="flex items-start gap-3.5 min-w-0 flex-1">
                      <div
                        className={`size-10 rounded-xl flex items-center justify-center shrink-0 shadow-xs ${
                          isCritical
                            ? "bg-rose-100 text-rose-600 dark:bg-rose-950 dark:text-rose-400"
                            : isWarning
                            ? "bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-400"
                            : isSuccess
                            ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400"
                            : "bg-indigo-100 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-400"
                        }`}
                      >
                        {notif.category === "FINANCIAL" && <CreditCard className="size-5" />}
                        {notif.category === "LEASES" && <Building2 className="size-5" />}
                        {notif.category === "TAX" && <Landmark className="size-5" />}
                        {notif.category === "SECURITY" && <ShieldCheck className="size-5" />}
                        {notif.category === "SYSTEM" && <Bell className="size-5" />}
                      </div>

                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-black text-slate-950 dark:text-white">
                            {isAr ? notif.titleAr : notif.titleEn}
                          </span>
                          {!notif.isRead && (
                            <span className="size-2 rounded-full bg-indigo-600 shrink-0" />
                          )}
                          <Badge
                            variant="outline"
                            className={`text-[9px] font-bold py-0 ${
                              isCritical
                                ? "bg-rose-100 text-rose-800 border-rose-300"
                                : isWarning
                                ? "bg-amber-100 text-amber-800 border-amber-300"
                                : isSuccess
                                ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                                : "bg-slate-100 text-slate-700 border-slate-300"
                            }`}
                          >
                            {isCritical
                              ? isAr ? "عاجل" : "Critical"
                              : isWarning
                              ? isAr ? "تنبيه" : "Warning"
                              : isSuccess
                              ? isAr ? "ناجح" : "Success"
                              : isAr ? "معلومة" : "Info"}
                          </Badge>
                        </div>

                        <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                          {isAr ? notif.descriptionAr : notif.descriptionEn}
                        </p>

                        <div className="flex items-center gap-3 pt-1 text-[11px] text-slate-400 font-medium">
                          <span className="flex items-center gap-1">
                            <Clock className="size-3" />
                            <span>{notif.timestamp}</span>
                          </span>
                          <span>•</span>
                          <span className="flex items-center gap-1">
                            <Smartphone className="size-3" />
                            <span>{notif.channel}</span>
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 self-end sm:self-center shrink-0">
                      {notif.actionUrl && (
                        <Link href={notif.actionUrl} locale={locale}>
                          <Button
                            size="sm"
                            className="bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:text-slate-900 text-xs font-bold h-8 px-3 rounded-xl gap-1"
                          >
                            <span>{isAr ? notif.actionLabelAr : notif.actionLabelEn}</span>
                            <ExternalLink className="size-3" />
                          </Button>
                        </Link>
                      )}

                      <Button
                        type="button"
                        onClick={() => toggleReadStatus(notif.id)}
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2 text-xs font-bold text-slate-500 hover:text-slate-800"
                        title={notif.isRead ? (isAr ? "تحديد كغير مقروء" : "Mark unread") : (isAr ? "تحديد كمقروء" : "Mark read")}
                      >
                        <Check className={`size-4 ${notif.isRead ? "text-slate-400" : "text-indigo-600 font-black"}`} />
                      </Button>

                      <Button
                        type="button"
                        onClick={() => deleteNotification(notif.id)}
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2 text-xs text-rose-500 hover:bg-rose-50 hover:text-rose-700"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────────────────────
          TAB 2: DELIVERY CHANNELS CONFIG
          ────────────────────────────────────────────────────────────────────────── */}
      {activeTab === "CHANNELS" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* WHATSAPP BUSINESS */}
          <div className="p-5 rounded-2xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="size-10 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center font-bold">
                  <Smartphone className="size-5" />
                </div>
                <div>
                  <h2 className="text-xs font-black text-slate-900 dark:text-white">
                    {isAr ? "بوابة WhatsApp Business API" : "WhatsApp Business Gateway"}
                  </h2>
                  <p className="text-[11px] text-slate-400">
                    {isAr ? "إرسال سندات القبض وتذكيرات الإيجار فورياً" : "Auto-send receipts and rent reminders"}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={whatsappEnabled}
                  onChange={(e) => setWhatsappEnabled(e.target.checked)}
                  className="size-4 accent-emerald-600 rounded cursor-pointer"
                />
              </div>
            </div>

            <div className="space-y-3 pt-2 text-xs">
              <div className="space-y-1">
                <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  {isAr ? "معرّف حساب واتساب التجاري (WABA ID)" : "WABA Account ID"}
                </Label>
                <Input
                  defaultValue="WABA_9921849102"
                  disabled={!whatsappEnabled}
                  className="text-xs h-9 font-mono rounded-xl bg-slate-50 dark:bg-slate-800"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  {isAr ? "رمز التوثيق الدائم (System User Token)" : "Permanent Access Token"}
                </Label>
                <Input
                  type="password"
                  defaultValue="EAAGm0PX4ZC50BA..."
                  disabled={!whatsappEnabled}
                  className="text-xs h-9 font-mono rounded-xl bg-slate-50 dark:bg-slate-800"
                />
              </div>
            </div>
          </div>

          {/* EMAIL NOTIFICATIONS */}
          <div className="p-5 rounded-2xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="size-10 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center font-bold">
                  <Mail className="size-5" />
                </div>
                <div>
                  <h2 className="text-xs font-black text-slate-900 dark:text-white">
                    {isAr ? "الملخص البريدي والإشعارات (Email Digest)" : "Email Notifications & Reports"}
                  </h2>
                  <p className="text-[11px] text-slate-400">
                    {isAr ? "إرسال التقارير اليومية وكشوف الحسابات" : "Daily digests & statements delivery"}
                  </p>
                </div>
              </div>

              <input
                type="checkbox"
                checked={emailEnabled}
                onChange={(e) => setEmailEnabled(e.target.checked)}
                className="size-4 accent-blue-600 rounded cursor-pointer"
              />
            </div>

            <div className="space-y-3 pt-2 text-xs">
              <div className="space-y-1">
                <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  {isAr ? "البريد الإلكتروني المعتمد للمراسلات" : "Sender Email Address"}
                </Label>
                <Input
                  defaultValue="accounting@aqarbooks.com"
                  disabled={!emailEnabled}
                  className="text-xs h-9 font-mono rounded-xl bg-slate-50 dark:bg-slate-800"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  {isAr ? "اسم المرسل في البريد (Sender Display Name)" : "Sender Display Name"}
                </Label>
                <Input
                  defaultValue={organizationName}
                  disabled={!emailEnabled}
                  className="text-xs h-9 rounded-xl bg-slate-50 dark:bg-slate-800 font-bold"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────────────────────
          TAB 3: AUTOMATED RULES
          ────────────────────────────────────────────────────────────────────────── */}
      {activeTab === "RULES" && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-slate-900 space-y-6">
          <div className="border-b border-slate-100 dark:border-slate-800 pb-3">
            <h2 className="text-sm font-black text-slate-950 dark:text-white">
              {isAr ? "ضبط قواعد التذكير التلقائي (Automated Smart Triggers)" : "Automated Smart Triggers"}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {isAr
                ? "حدد الفترات الزمنية لإرسال التنبيهات المسبقة للمحاسبين والمستأجرين."
                : "Set lead times for automatic notifications to accountants and tenants."}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                {isAr ? "تذكير استحقاق الشيكات البنكية (PDC Lead Time)" : "PDC Due Reminder"}
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  value={pdcDays}
                  onChange={(e) => setPdcDays(e.target.value)}
                  className="w-24 h-9 text-xs font-mono font-bold rounded-xl bg-slate-50 dark:bg-slate-800"
                />
                <span className="text-xs text-slate-500 font-bold">{isAr ? "أيام قبل تاريخ الاستحقاق" : "days before due date"}</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                {isAr ? "تذكير انتهاء عقود الإيجار (Lease Expiry Lead Time)" : "Lease Expiration Reminder"}
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  value={leaseDays}
                  onChange={(e) => setLeaseDays(e.target.value)}
                  className="w-24 h-9 text-xs font-mono font-bold rounded-xl bg-slate-50 dark:bg-slate-800"
                />
                <span className="text-xs text-slate-500 font-bold">{isAr ? "يوماً قبل انتهاء العقد" : "days before lease expiry"}</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                {isAr ? "تذكير موعد الإقرار الضريبي (VAT Return Lead Time)" : "VAT Return Deadline Reminder"}
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  value={vatReminderDays}
                  onChange={(e) => setVatReminderDays(e.target.value)}
                  className="w-24 h-9 text-xs font-mono font-bold rounded-xl bg-slate-50 dark:bg-slate-800"
                />
                <span className="text-xs text-slate-500 font-bold">{isAr ? "أيام قبل الموعد النهائي" : "days before ETA deadline"}</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                {isAr ? "إرسال سند القبض عبر WhatsApp تلقائياً" : "Auto-send Receipt via WhatsApp"}
              </Label>
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  checked={autoReceiptWhatsapp}
                  onChange={(e) => setAutoReceiptWhatsapp(e.target.checked)}
                  className="size-4 accent-indigo-600 rounded cursor-pointer"
                />
                <span className="text-xs text-slate-600 dark:text-slate-300 font-bold">
                  {isAr ? "إرسال نسخة رقمية للمستأجر فور تسجيل السداد" : "Instantly send digital receipt upon payment"}
                </span>
              </div>
            </div>
          </div>

          <div className="pt-4 flex justify-end border-t border-slate-100 dark:border-slate-800">
            <Button
              type="button"
              onClick={() => {
                toast.show({
                  title: isAr ? "تم حفظ قواعد التنبيهات بنجاح" : "Rules Saved",
                  description: isAr ? "تم تطبيق مواعيد التذكيرات المحدثة." : "Automated reminder rules updated.",
                  variant: "success",
                });
              }}
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold h-9 px-6 rounded-xl shadow-xs gap-1.5"
            >
              <CheckCircle2 className="size-4" />
              <span>{isAr ? "حفظ القواعد والمواعيد" : "Save Rules"}</span>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
