"use client";

import { useState } from "react";
import { 
  Settings, 
  Megaphone, 
  Globe, 
  ShieldCheck, 
  Save, 
  CheckCircle2, 
  AlertCircle,
  Coins,
  Lock,
  UserCheck,
  Zap,
  Sparkles
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

export function PlatformSettingsClient({ locale }: { locale: string }) {
  const isAr = locale === "ar";
  
  const [signupMode, setSignupMode] = useState<"OPEN" | "INVITE_ONLY" | "WAITLIST">("OPEN");
  const [announcementActive, setAnnouncementActive] = useState(false);
  const [announcementTextAr, setAnnouncementTextAr] = useState("تنبيه: تم إطلاق تحديث منظومة الإقرارات الضريبية والفوترة الإلكترونية بنجاح.");
  const [announcementTextEn, setAnnouncementTextEn] = useState("Notice: The regional VAT and e-Invoicing update has been deployed successfully.");
  const [sarRate, setSarRate] = useState("1.00");
  const [egpRate, setEgpRate] = useState("13.50");
  const [aedRate, setAedRate] = useState("0.98");
  const [usdRate, setUsdRate] = useState("0.27");
  const [isSaved, setIsSaved] = useState(false);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 3000);
  };

  return (
    <form onSubmit={handleSave} className="space-y-6 max-w-5xl">
      
      {/* ── 1. Header ────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black tracking-tight text-foreground">
              {isAr ? "إعدادات المنصة والإعلانات العامة" : "Platform Settings & Announcements"}
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-primary/10 text-primary border border-primary/20">
              {isAr ? "تحكم عام" : "Global Config"}
            </span>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            {isAr
              ? "التحكم في سياسات التسجيل، إرسال إعلانات وتنبيهات مباشرة لكافة المنشآت، وضبط العملات."
              : "Control registration policies, broadcast system notifications, and calibrate exchange rates."}
          </p>
        </div>

        <Button type="submit" className="gap-2 font-bold rounded-xl shadow-md">
          {isSaved ? (
            <>
              <CheckCircle2 className="size-4 text-emerald-400" />
              <span>{isAr ? "تم الحفظ بنجاح!" : "Saved successfully!"}</span>
            </>
          ) : (
            <>
              <Save className="size-4" />
              <span>{isAr ? "حفظ التغييرات" : "Save Settings"}</span>
            </>
          )}
        </Button>
      </div>

      {/* ── 2. System Broadcast Announcements Card ────────────────── */}
      <div className="rounded-3xl border bg-card p-6 sm:p-8 shadow-xs space-y-6">
        <div className="flex items-center justify-between border-b pb-4">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-2xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center">
              <Megaphone className="size-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-foreground">
                {isAr ? "بنر الإعلانات والتنبيهات المباشرة (System Broadcast)" : "System Broadcast Banner"}
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {isAr ? "إظهار شريط إعلان علوي في قمة النظام يظهر لجميع المستخدمين والمستأجرين." : "Show a global alert banner at the top of all tenant workspaces."}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setAnnouncementActive(!announcementActive)}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              announcementActive
                ? "bg-purple-600 text-white shadow-xs"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {announcementActive
              ? isAr ? "الإعلان مفعّل" : "Banner Active"
              : isAr ? "معطّل" : "Disabled"}
          </button>
        </div>

        {announcementActive && (
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5 text-start">
              <Label className="text-xs font-bold text-foreground block">
                {isAr ? "نص الإعلان (باللغة العربية):" : "Arabic Announcement Text:"}
              </Label>
              <Input
                value={announcementTextAr}
                onChange={(e) => setAnnouncementTextAr(e.target.value)}
                className="rounded-xl text-xs h-10"
              />
            </div>

            <div className="space-y-1.5 text-start">
              <Label className="text-xs font-bold text-foreground block">
                {isAr ? "نص الإعلان (باللغة الإنجليزية):" : "English Announcement Text:"}
              </Label>
              <Input
                value={announcementTextEn}
                onChange={(e) => setAnnouncementTextEn(e.target.value)}
                className="rounded-xl text-xs h-10"
                dir="ltr"
              />
            </div>

            {/* Live Preview */}
            <div className="p-3.5 rounded-2xl border border-purple-500/30 bg-purple-500/10 text-purple-900 dark:text-purple-200 text-xs font-semibold flex items-center gap-2">
              <Sparkles className="size-4 shrink-0 text-purple-600 dark:text-purple-400" />
              <span>{isAr ? `معاينة حية: ${announcementTextAr}` : `Live Preview: ${announcementTextEn}`}</span>
            </div>
          </div>
        )}
      </div>

      {/* ── 3. Public Registration Policy Card ────────────────────── */}
      <div className="rounded-3xl border bg-card p-6 sm:p-8 shadow-xs space-y-6">
        <div className="flex items-center gap-3 border-b pb-4">
          <div className="size-10 rounded-2xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
            <UserCheck className="size-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-foreground">
              {isAr ? "سياسة التسجيل وقبول المنظمات الجديدة" : "Tenant Registration Policy"}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isAr ? "تحديد ما إذا كان بإمكان العملاء التسجيل مباشرة أو عبر دعوات فقط." : "Control public signup access and waitlist onboarding."}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {(
            [
              { key: "OPEN", labelAr: "تسجيل مفتوح (Open)", labelEn: "Open Public Signup", descAr: "يمكن لأي شركة إنشاء حساب فوري", descEn: "Instant organization onboarding" },
              { key: "INVITE_ONLY", labelAr: "بدعوة فقط (Invite-Only)", labelEn: "Invite Only", descAr: "التسجيل عبر رابط دعوة من الإدارة", descEn: "Requires admin invite link" },
              { key: "WAITLIST", labelAr: "قائمة انتظار (Waitlist)", labelEn: "Waitlist Queue", descAr: "تحويل المسجلين الجدد للمراجعة", descEn: "Queued for admin review" },
            ] as const
          ).map((mode) => {
            const isSelected = signupMode === mode.key;
            return (
              <button
                key={mode.key}
                type="button"
                onClick={() => setSignupMode(mode.key)}
                className={`p-4 rounded-2xl border text-start transition-all cursor-pointer ${
                  isSelected
                    ? "border-primary bg-primary/10 text-primary ring-1 ring-primary shadow-xs"
                    : "border-border bg-card/80 hover:border-border/80 text-muted-foreground hover:text-foreground"
                }`}
              >
                <span className="text-xs font-black text-foreground block">{isAr ? mode.labelAr : mode.labelEn}</span>
                <span className="text-[11px] text-muted-foreground block mt-1">{isAr ? mode.descAr : mode.descEn}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── 4. Baseline Currency Multipliers ───────────────────────── */}
      <div className="rounded-3xl border bg-card p-6 sm:p-8 shadow-xs space-y-6">
        <div className="flex items-center gap-3 border-b pb-4">
          <div className="size-10 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
            <Coins className="size-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-foreground">
              {isAr ? "أسعار الصرف والعملات المعتمدة للمنصة" : "Platform Base Currency Benchmarks"}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isAr ? "المعاملات القياسية لتحويل الإيرادات والتقارير المجمعة عبر المنطقة." : "Baseline rates for regional currency normalization in platform reports."}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-foreground block">
              1 SAR = {sarRate} SAR
            </Label>
            <Input
              value={sarRate}
              onChange={(e) => setSarRate(e.target.value)}
              className="text-xs font-mono rounded-xl h-9"
              disabled
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-foreground block">
              1 SAR = {egpRate} EGP
            </Label>
            <Input
              value={egpRate}
              onChange={(e) => setEgpRate(e.target.value)}
              className="text-xs font-mono rounded-xl h-9"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-foreground block">
              1 SAR = {aedRate} AED
            </Label>
            <Input
              value={aedRate}
              onChange={(e) => setAedRate(e.target.value)}
              className="text-xs font-mono rounded-xl h-9"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-foreground block">
              1 SAR = {usdRate} USD
            </Label>
            <Input
              value={usdRate}
              onChange={(e) => setUsdRate(e.target.value)}
              className="text-xs font-mono rounded-xl h-9"
            />
          </div>
        </div>
      </div>

    </form>
  );
}
