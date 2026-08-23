"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  AlertTriangle,
  CheckCircle2,
  Landmark,
  FileText,
  CreditCard,
  UserRound,
  BellOff,
  RotateCcw,
  SlidersHorizontal,
  Loader2,
  Save,
  Info,
  ArrowLeft,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/components/ui/toast";
import {
  dismissAlertAction,
  restoreAllAlertsAction,
  saveAlertSettingsAction,
} from "@/lib/actions/alerts";
import type { AlertCategory, AlertSettings, OperationalAlert } from "@/lib/alerts/operational-alerts";
import { cn } from "@/lib/utils";

// What this page used to be: a static array of three invented alerts held in
// useState, plus channel switches for WhatsApp, email and SMS that were also
// useState and sent nothing. Deleting an alert mutated the array, so a refresh
// brought it back -- and every organization saw the same three, because they
// were literals in the source rather than anything about that tenant.
//
// It is now a view over derived facts. Alerts come from the ledger, silencing
// one writes a row, and the thresholds are per-organization settings. The
// channel switches are gone rather than left lying: a switch that claims to
// message an owner and does nothing is worse than no switch, because staff will
// believe the owner was told.

const CATEGORY_META: Record<
  AlertCategory,
  { icon: typeof Bell; ar: string; en: string; tone: string }
> = {
  FINANCIAL: {
    icon: Landmark,
    ar: "المستحقات",
    en: "Receivables",
    tone: "bg-rose-100 text-rose-600 dark:bg-rose-950 dark:text-rose-400",
  },
  CHEQUES: {
    icon: CreditCard,
    ar: "الشيكات",
    en: "Cheques",
    tone: "bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-400",
  },
  LEASES: {
    icon: FileText,
    ar: "العقود",
    en: "Leases",
    tone: "bg-indigo-100 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-400",
  },
  PORTAL: {
    icon: UserRound,
    ar: "البوابة",
    en: "Portal",
    tone: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  },
};

export function NotificationsClient({
  locale,
  alerts,
  settings,
  dismissedCount,
  canManageSettings,
}: {
  locale: string;
  alerts: OperationalAlert[];
  settings: AlertSettings;
  dismissedCount: number;
  canManageSettings: boolean;
}) {
  const isAr = locale === "ar";
  const router = useRouter();
  const toast = useToast();
  const [tab, setTab] = useState<"FEED" | "SETTINGS">("FEED");
  const [categoryFilter, setCategoryFilter] = useState<AlertCategory | "ALL">("ALL");
  const [isPending, startTransition] = useTransition();

  const [form, setForm] = useState<AlertSettings>(settings);

  const visible =
    categoryFilter === "ALL" ? alerts : alerts.filter((a) => a.category === categoryFilter);

  const criticalCount = alerts.filter((a) => a.severity === "CRITICAL").length;

  function handleDismiss(key: string) {
    startTransition(async () => {
      const res = await dismissAlertAction(key);
      if (!res.ok) {
        toast.add({ title: isAr ? "تعذّر إخفاء التنبيه" : "Could not hide the alert", type: "error" });
        return;
      }
      router.refresh();
    });
  }

  function handleRestoreAll() {
    startTransition(async () => {
      const res = await restoreAllAlertsAction();
      if (!res.ok) {
        toast.add({ title: isAr ? "تعذّرت الاستعادة" : "Could not restore", type: "error" });
        return;
      }
      router.refresh();
      toast.add({ title: isAr ? "أُعيدت كل التنبيهات المخفية" : "Hidden alerts restored", type: "success" });
    });
  }

  function handleSaveSettings() {
    startTransition(async () => {
      const res = await saveAlertSettingsAction({
        chequeLeadDays: form.chequeLeadDays,
        leaseLeadDays: form.leaseLeadDays,
        overdueMinDays: form.overdueMinDays,
        chequesEnabled: form.chequesEnabled,
        leasesEnabled: form.leasesEnabled,
        overdueEnabled: form.overdueEnabled,
        unreachableOwnersEnabled: form.unreachableOwnersEnabled,
      });
      if (!res.ok) {
        toast.add({
          title: isAr ? "تعذّر حفظ الإعدادات" : "Could not save settings",
          description:
            res.error === "forbidden"
              ? isAr
                ? "تحتاج صلاحية إدارة إعدادات الكيان."
                : "You need the tenant-settings permission."
              : undefined,
          type: "error",
        });
        return;
      }
      router.refresh();
      toast.add({ title: isAr ? "تم حفظ الإعدادات" : "Settings saved", type: "success" });
    });
  }

  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
            {isAr ? "التنبيهات التشغيلية" : "Operational alerts"}
          </h1>
          <p className="max-w-2xl text-xs leading-relaxed text-muted-foreground sm:text-sm">
            {isAr
              ? "تُشتق هذه التنبيهات لحظيًا من دفاترك — لا تُخزَّن ولا تتقادم. يختفي التنبيه من تلقاء نفسه بمجرد زوال سببه."
              : "These are derived from your ledger as you read them — never stored, never stale. An alert disappears by itself the moment its cause does."}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {dismissedCount > 0 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isPending}
              onClick={handleRestoreAll}
              className="h-9 gap-2 rounded-xl text-xs font-semibold"
            >
              <RotateCcw className="size-3.5" />
              {isAr ? `إظهار المخفي (${dismissedCount})` : `Restore hidden (${dismissedCount})`}
            </Button>
          )}
        </div>
      </div>

      {/* tabs */}
      <div className="flex items-center gap-1 rounded-xl border border-border bg-muted/50 p-1">
        {(
          [
            ["FEED", isAr ? "التنبيهات" : "Alerts"],
            ["SETTINGS", isAr ? "الإعدادات والعتبات" : "Rules & thresholds"],
          ] as [typeof tab, string][]
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            className={cn(
              "flex-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
              tab === value
                ? "bg-background text-foreground shadow-2xs"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
            {value === "FEED" && alerts.length > 0 && (
              <span className="ms-1.5 tabular-nums opacity-60">({alerts.length})</span>
            )}
          </button>
        ))}
      </div>

      {tab === "FEED" ? (
        <>
          {alerts.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              {(["ALL", "FINANCIAL", "CHEQUES", "LEASES", "PORTAL"] as const)
                .filter(
                  (c) => c === "ALL" || alerts.some((a) => a.category === c),
                )
                .map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCategoryFilter(c)}
                    className={cn(
                      "rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition-colors",
                      categoryFilter === c
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-card text-muted-foreground hover:bg-muted",
                    )}
                  >
                    {c === "ALL"
                      ? isAr
                        ? `الكل (${alerts.length})`
                        : `All (${alerts.length})`
                      : isAr
                        ? CATEGORY_META[c].ar
                        : CATEGORY_META[c].en}
                  </button>
                ))}
            </div>
          )}

          {visible.length === 0 ? (
            <div className="space-y-2 rounded-2xl border border-dashed border-border bg-card px-6 py-14 text-center">
              <CheckCircle2 className="mx-auto size-9 text-emerald-500" />
              <p className="text-sm font-bold text-foreground">
                {alerts.length === 0
                  ? isAr
                    ? "لا شيء يحتاج انتباهك"
                    : "Nothing needs your attention"
                  : isAr
                    ? "لا تنبيهات في هذا التصنيف"
                    : "No alerts in this category"}
              </p>
              <p className="mx-auto max-w-md text-xs leading-relaxed text-muted-foreground">
                {alerts.length === 0
                  ? isAr
                    ? "لا مطالبات متأخرة، ولا شيكات أو عقود تستحق خلال المدة المحددة في الإعدادات."
                    : "No overdue dues, and no cheques or leases falling due within the windows set in your rules."
                  : isAr
                    ? "جرّب تصنيفًا آخر."
                    : "Try another category."}
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {visible.map((alert) => {
                const meta = CATEGORY_META[alert.category];
                const Icon = meta.icon;
                return (
                  <article
                    key={alert.key}
                    className={cn(
                      "flex flex-wrap items-start gap-3 rounded-2xl border bg-card p-4",
                      alert.severity === "CRITICAL"
                        ? "border-rose-500/40"
                        : alert.severity === "WARNING"
                          ? "border-amber-500/40"
                          : "border-border",
                    )}
                  >
                    <span
                      className={cn(
                        "flex size-9 shrink-0 items-center justify-center rounded-xl",
                        meta.tone,
                      )}
                    >
                      <Icon className="size-4" />
                    </span>

                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-sm font-bold text-foreground">
                          {isAr ? alert.titleAr : alert.titleEn}
                        </h2>
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[10px] font-semibold",
                            alert.severity === "CRITICAL"
                              ? "border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400"
                              : alert.severity === "WARNING"
                                ? "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                                : "bg-muted text-muted-foreground",
                          )}
                        >
                          {alert.severity === "CRITICAL"
                            ? isAr
                              ? "عاجل"
                              : "Critical"
                            : alert.severity === "WARNING"
                              ? isAr
                                ? "تحذير"
                                : "Warning"
                              : isAr
                                ? "للعلم"
                                : "Info"}
                        </Badge>
                      </div>
                      <p className="text-xs leading-relaxed text-muted-foreground">
                        {isAr ? alert.bodyAr : alert.bodyEn}
                      </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      <Link
                        href={alert.href}
                        locale={locale}
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 text-[11px] font-semibold text-foreground hover:bg-muted"
                      >
                        {isAr ? alert.actionAr : alert.actionEn}
                        <ArrowLeft className="size-3 rtl:rotate-180" />
                      </Link>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        disabled={isPending}
                        onClick={() => handleDismiss(alert.key)}
                        aria-label={isAr ? "إخفاء هذا التنبيه" : "Hide this alert"}
                        title={
                          isAr
                            ? "يُخفى حتى يتغيّر سببه"
                            : "Hidden until its underlying facts change"
                        }
                      >
                        <BellOff className="size-3.5" />
                      </Button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          {alerts.length > 0 && (
            <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
              <Info className="mt-0.5 size-3.5 shrink-0" />
              {isAr
                ? `${criticalCount} تنبيه عاجل. إخفاء تنبيه يخصّك وحدك ولا يؤثر على زملائك، ويعود التنبيه تلقائيًا إذا تغيّرت الوقائع التي أنشأته.`
                : `${criticalCount} critical. Hiding an alert affects only you, and it returns automatically if the facts behind it change.`}
            </p>
          )}
        </>
      ) : (
        <div className="space-y-5">
          <section className="space-y-4 rounded-2xl border border-border bg-card p-5">
            <div>
              <h2 className="flex items-center gap-2 text-sm font-bold text-foreground">
                <SlidersHorizontal className="size-4 text-primary" />
                {isAr ? "ما الذي يُعتبر عاجلًا" : "What counts as urgent"}
              </h2>
              <p className="text-xs text-muted-foreground">
                {isAr
                  ? "تسري هذه العتبات على كل مستخدمي الكيان — الجميع ينظر إلى نفس الدفاتر ويجب ألا يختلفوا على تعريف الاستعجال."
                  : "These apply to everyone in the organization — the same ledger should not mean different definitions of urgent."}
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="cheque-lead" className="text-xs font-semibold">
                  {isAr ? "تنبيه الشيكات قبل (يوم)" : "Cheque lead time (days)"}
                </Label>
                <Input
                  id="cheque-lead"
                  type="number"
                  min={1}
                  max={180}
                  dir="ltr"
                  value={form.chequeLeadDays}
                  onChange={(e) =>
                    setForm({ ...form, chequeLeadDays: Number(e.target.value) || 1 })
                  }
                  disabled={!canManageSettings}
                  className="h-9 text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="lease-lead" className="text-xs font-semibold">
                  {isAr ? "تنبيه العقود قبل (يوم)" : "Lease lead time (days)"}
                </Label>
                <Input
                  id="lease-lead"
                  type="number"
                  min={1}
                  max={365}
                  dir="ltr"
                  value={form.leaseLeadDays}
                  onChange={(e) => setForm({ ...form, leaseLeadDays: Number(e.target.value) || 1 })}
                  disabled={!canManageSettings}
                  className="h-9 text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="overdue-min" className="text-xs font-semibold">
                  {isAr ? "اعتبار المطالبة متأخرة بعد (يوم)" : "Overdue after (days)"}
                </Label>
                <Input
                  id="overdue-min"
                  type="number"
                  min={0}
                  max={365}
                  dir="ltr"
                  value={form.overdueMinDays}
                  onChange={(e) => setForm({ ...form, overdueMinDays: Number(e.target.value) || 0 })}
                  disabled={!canManageSettings}
                  className="h-9 text-xs"
                />
              </div>
            </div>
          </section>

          <section className="space-y-3 rounded-2xl border border-border bg-card p-5">
            <div>
              <h2 className="text-sm font-bold text-foreground">
                {isAr ? "التنبيهات المُفعّلة" : "Active alert types"}
              </h2>
              <p className="text-xs text-muted-foreground">
                {isAr
                  ? "إيقاف نوع يخفيه عن الجميع في هذا الكيان."
                  : "Switching a type off hides it for everyone in this organization."}
              </p>
            </div>

            {(
              [
                ["overdueEnabled", isAr ? "المطالبات المتأخرة" : "Overdue dues"],
                ["chequesEnabled", isAr ? "الشيكات المستحقة قريبًا" : "Cheques falling due"],
                ["leasesEnabled", isAr ? "العقود المنتهية قريبًا" : "Leases expiring"],
                [
                  "unreachableOwnersEnabled",
                  isAr ? "ملاك بلا وسيلة تواصل" : "Owners with no contact details",
                ],
              ] as [keyof AlertSettings, string][]
            ).map(([key, label]) => (
              <label
                key={key}
                className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-border/60 bg-muted/30 p-3"
              >
                <Checkbox
                  checked={Boolean(form[key])}
                  disabled={!canManageSettings}
                  onCheckedChange={(checked) => setForm({ ...form, [key]: checked === true })}
                />
                <span className="text-xs font-semibold text-foreground">{label}</span>
              </label>
            ))}
          </section>

          {/* The WhatsApp / email / SMS switches that used to sit here are gone.
              They persisted nothing and sent nothing. What replaced them is a
              statement of what actually happens, which is a daily email and
              nothing else. */}
          <div className="space-y-2 rounded-2xl border border-border bg-muted/40 p-4">
            <p className="flex items-start gap-2 text-[11px] leading-relaxed text-muted-foreground">
              <Info className="mt-0.5 size-4 shrink-0" />
              {isAr
                ? "يصل ملخّص واحد بالبريد كل صباح لموظفي الكيان الذين يملكون صلاحية قراءة المستحقات، ولا يُرسل شيء في الأيام التي لا تنبيهات فيها. لا يوجد إرسال عبر واتساب أو الرسائل النصية."
                : "One email digest goes out each morning to staff who may read receivables, and nothing is sent on days with no alerts. There is no WhatsApp or SMS delivery."}
            </p>
            <p className="ps-6 text-[11px] leading-relaxed text-muted-foreground">
              {isAr
                ? "ولمراسلة مالك بعينه، استخدم «تذكير بالسداد» في صفحته — يفتح لك الرسالة لمراجعتها قبل الإرسال بنفسك."
                : "To message a specific owner, use the payment reminder on their profile — it opens the message for you to review and send yourself."}
            </p>
          </div>

          {canManageSettings ? (
            <div className="flex justify-end">
              <Button type="button" disabled={isPending} onClick={handleSaveSettings} className="gap-2">
                {isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
                {isAr ? "حفظ الإعدادات" : "Save settings"}
              </Button>
            </div>
          ) : (
            <p className="rounded-xl border border-border bg-muted/40 p-3 text-[11px] text-muted-foreground">
              {isAr
                ? "العرض فقط — تحتاج صلاحية إدارة إعدادات الكيان لتغيير هذه القيم."
                : "View only — changing these values needs the tenant-settings permission."}
            </p>
          )}
        </div>
      )}
    </main>
  );
}
