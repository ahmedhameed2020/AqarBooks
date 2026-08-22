import {
  LayoutDashboard,
  FileText,
  Receipt,
  Landmark,
  Building2,
  LogOut,
  UserCheck,
  ShieldCheck,
  Building,
  CreditCard,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/actions/auth";
import { LogoMark } from "@/components/marketing/logo-mark";

export function PortalShell({
  locale,
  memberName,
  children,
}: {
  locale: "ar" | "en";
  memberName: string;
  children: React.ReactNode;
}) {
  const isAr = locale === "ar";
  const boundSignOut = signOut.bind(null, locale);

  const links = [
    {
      href: "/portal",
      labelAr: "الرئيسية والمحفظة",
      labelEn: "Dashboard",
      icon: LayoutDashboard,
      descAr: "الملخص والبيانات الحية",
      descEn: "Overview & metrics",
    },
    {
      href: "/portal/statement",
      labelAr: "كشف الحساب المالي",
      labelEn: "Account Statement",
      icon: FileText,
      descAr: "حركة القيود والمسدد",
      descEn: "Ledger & movements",
    },
    {
      href: "/portal/dues",
      labelAr: "المستحقات والسداد",
      labelEn: "Dues & Checkout",
      icon: Landmark,
      descAr: "الفواتير والدفع أونلاين",
      descEn: "Invoices & online pay",
    },
    {
      href: "/portal/payments",
      labelAr: "سجل السندات والمدفوعات",
      labelEn: "Receipts & History",
      icon: Receipt,
      descAr: "إيصالات السداد المعتمدة",
      descEn: "Verified receipts",
    },
    {
      href: "/portal/units",
      labelAr: "العقارات والوحدات",
      labelEn: "My Real Estate",
      icon: Building2,
      descAr: "تفاصيل وحصص الملكية",
      descEn: "Assets & ownership",
    },
  ];

  return (
    <div className="flex min-h-screen w-full bg-slate-950/5 dark:bg-slate-950 text-slate-900 dark:text-slate-100 selection:bg-indigo-900 selection:text-white">
      {/* Executive Sidebar */}
      <aside className="hidden lg:flex w-72 shrink-0 border-e border-border/70 bg-card p-5 flex-col justify-between shadow-xs">
        <div className="space-y-6">
          {/* Brand Header */}
          <div className="flex items-center gap-3 pb-4 border-b border-border/60">
            <LogoMark className="size-9" />
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-base font-black tracking-tight text-slate-900 dark:text-white">
                  {isAr ? "عقار بوكس" : "AqarBooks"}
                </span>
                <span className="inline-flex rounded-full bg-purple-500/15 text-purple-600 dark:text-purple-300 border border-purple-400/30 text-[9px] font-black px-1.5 py-0.2 shadow-2xs">
                  PORTAL
                </span>
              </div>
              <p className="text-[10px] font-bold text-slate-400">
                {isAr ? "بوابة الملاك والمستثمرين" : "Investor & Owner Portal"}
              </p>
            </div>
          </div>

          {/* Member Identity Card */}
          <div className="flex items-center gap-3 p-3 rounded-2xl bg-indigo-50/60 dark:bg-indigo-950/40 border border-indigo-200/60 dark:border-indigo-800/60">
            <div className="size-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-purple-600 text-white flex items-center justify-center font-black text-sm shadow-xs shrink-0">
              {memberName.trim().slice(0, 1)}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1">
                <p className="font-bold text-xs text-slate-900 dark:text-white truncate">
                  {memberName}
                </p>
                <ShieldCheck className="size-3 text-emerald-500 shrink-0" />
              </div>
              <p className="text-[10px] text-slate-500 font-medium">
                {isAr ? "حساب مالك موثق" : "Verified Owner Account"}
              </p>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="space-y-1.5">
            {links.map((l) => {
              const Icon = l.icon;
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  locale={locale}
                  className="flex items-center gap-3 rounded-xl px-3.5 py-3 text-xs font-bold text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100/80 dark:hover:bg-slate-800/60 transition-all group"
                >
                  <div className="size-7 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 group-hover:bg-indigo-600 group-hover:text-white flex items-center justify-center transition-colors">
                    <Icon className="size-3.5" />
                  </div>
                  <div>
                    <span className="block">{isAr ? l.labelAr : l.labelEn}</span>
                    <span className="block text-[10px] font-normal text-slate-400 group-hover:text-indigo-400/80">
                      {isAr ? l.descAr : l.descEn}
                    </span>
                  </div>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Footer sign out */}
        <div className="pt-4 border-t border-border/60">
          <form action={boundSignOut}>
            <Button
              type="submit"
              variant="outline"
              size="sm"
              className="w-full gap-2 text-xs font-bold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 hover:text-rose-700 border-rose-200 dark:border-rose-900/50 rounded-xl"
            >
              <LogOut className="size-3.5" />
              <span>{isAr ? "تسجيل الخروج" : "Sign out"}</span>
            </Button>
          </form>
        </div>
      </aside>

      {/* Main Content Viewport */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile Header */}
        <header className="lg:hidden flex items-center justify-between p-4 border-b border-border/70 bg-card">
          <div className="flex items-center gap-2.5">
            <LogoMark className="size-7.5" />
            <div>
              <span className="font-black text-sm text-slate-900 dark:text-white">
                {isAr ? "بوابة الملاك" : "Owner Portal"}
              </span>
              <p className="text-[10px] text-slate-400 font-bold truncate max-w-[160px]">
                {memberName}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <form action={boundSignOut}>
              <Button type="submit" variant="ghost" size="sm" className="h-8 px-2 text-rose-500">
                <LogOut className="size-4" />
              </Button>
            </form>
          </div>
        </header>

        {/* Mobile Nav Bar */}
        <div className="lg:hidden flex overflow-x-auto gap-1 p-2 border-b border-border/70 bg-slate-100 dark:bg-slate-900/50">
          {links.map((l) => {
            const Icon = l.icon;
            return (
              <Link
                key={l.href}
                href={l.href}
                locale={locale}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap bg-card border border-border/60 text-slate-700 dark:text-slate-300"
              >
                <Icon className="size-3 text-indigo-500" />
                <span>{isAr ? l.labelAr : l.labelEn}</span>
              </Link>
            );
          })}
        </div>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-8 max-w-7xl w-full mx-auto space-y-6">
          {children}
        </main>
      </div>
    </div>
  );
}
