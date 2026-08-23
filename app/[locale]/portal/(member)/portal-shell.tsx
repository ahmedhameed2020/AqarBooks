import { LogOut, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/actions/auth";
import { LogoMark } from "@/components/marketing/logo-mark";
import { PortalNav, PortalMobileNav } from "./portal-nav";

export function PortalShell({
  locale,
  memberName,
  organizationName,
  children,
}: {
  locale: "ar" | "en";
  memberName: string;
  organizationName: string;
  children: React.ReactNode;
}) {
  const isAr = locale === "ar";
  const boundSignOut = signOut.bind(null, locale);

  return (
    <div className="flex min-h-screen w-full bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      {/* Sidebar. Fixed 17rem: enough for a two-line label, not so much that it
          eats the width an owner needs for a statement table. */}
      <aside className="hidden w-68 shrink-0 flex-col justify-between border-e border-border/70 bg-card p-4 lg:flex">
        <div className="space-y-5">
          <div className="flex items-center gap-3 border-b border-border/60 pb-4">
            <LogoMark className="size-9" />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-bold tracking-tight text-slate-900 dark:text-white">
                  {isAr ? "عقار بوكس" : "AqarBooks"}
                </span>
                <span className="rounded-md border border-indigo-400/30 bg-indigo-500/10 px-1.5 py-px text-[9px] font-bold text-indigo-600 dark:text-indigo-300">
                  PORTAL
                </span>
              </div>
              <p className="truncate text-[10px] font-semibold text-slate-400">{organizationName}</p>
            </div>
          </div>

          {/* Whose financial information am I looking at -- kept visible on
              every screen rather than only on the dashboard. */}
          <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-slate-50 p-3 dark:bg-slate-900/60">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white">
              {memberName.trim().slice(0, 1) || "?"}
            </div>
            <div className="min-w-0">
              <p className="flex items-center gap-1 truncate text-xs font-bold text-slate-900 dark:text-white">
                <span className="truncate">{memberName}</span>
                <ShieldCheck className="size-3 shrink-0 text-emerald-500" />
              </p>
              <p className="text-[10px] font-medium text-slate-500">
                {isAr ? "حساب مالك مُوثّق" : "Verified owner account"}
              </p>
            </div>
          </div>

          <PortalNav locale={locale} />
        </div>

        <div className="border-t border-border/60 pt-4">
          <form action={boundSignOut}>
            <Button
              type="submit"
              variant="outline"
              size="sm"
              className="w-full gap-2 rounded-xl border-rose-200 text-xs font-semibold text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:border-rose-900/50 dark:text-rose-400 dark:hover:bg-rose-950/40"
            >
              <LogOut className="size-3.5" />
              <span>{isAr ? "تسجيل الخروج" : "Sign out"}</span>
            </Button>
          </form>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-border/70 bg-card p-3 lg:hidden">
          <div className="flex min-w-0 items-center gap-2.5">
            <LogoMark className="size-7" />
            <div className="min-w-0">
              <span className="block text-sm font-bold text-slate-900 dark:text-white">
                {isAr ? "بوابة الملاك" : "Owner Portal"}
              </span>
              <p className="max-w-[180px] truncate text-[10px] font-semibold text-slate-400">
                {memberName}
              </p>
            </div>
          </div>
          <form action={boundSignOut}>
            <Button
              type="submit"
              variant="ghost"
              size="sm"
              aria-label={isAr ? "تسجيل الخروج" : "Sign out"}
              className="h-8 px-2 text-rose-500"
            >
              <LogOut className="size-4" />
            </Button>
          </form>
        </header>

        <div className="lg:hidden">
          <PortalMobileNav locale={locale} />
        </div>

        <main className="mx-auto w-full max-w-7xl flex-1 space-y-6 overflow-y-auto p-4 sm:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
