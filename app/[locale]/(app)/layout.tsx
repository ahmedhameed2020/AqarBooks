import { redirect, Link } from "@/i18n/navigation";
import { SiteHeader } from "@/components/site-header";
import { AppSidebar, type SidebarNavGroup, type SidebarWorkspace } from "@/components/app-sidebar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/toast";
import { getCurrentUser, isPlatformAdmin } from "@/lib/auth/session";
import { getPrimaryOrganization } from "@/lib/auth/org-context";
import { signOut } from "@/lib/actions/auth";
import type { Locale } from "@/i18n/routing";
import {
  LayoutDashboard,
  MapPinned,
  Users,
  Settings,
  Building2,
  BookOpen,
  Receipt,
  Wallet,
  Truck,
  BarChart3,
  Inbox,
  ShieldAlert,
} from "lucide-react";

const ic = "size-4 shrink-0";

export default async function AppShellLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const loc = locale as Locale;

  const user = await getCurrentUser();
  if (!user) {
    redirect({ href: "/login", locale: loc });
  }

  const [platformAdmin, organization] = await Promise.all([
    isPlatformAdmin(user!.id),
    getPrimaryOrganization(user!.id),
  ]);

  const homeGroup: SidebarNavGroup = {
    key: "home",
    items: [{ href: "/dashboard", labelAr: "الرئيسية", labelEn: "Dashboard", icon: <LayoutDashboard className={ic} /> }],
  };

  // Two clearly separate workspaces, not one blended nav -- operating the
  // whole platform (every tenant) and managing a single tenant's own books
  // are different mental contexts, even for the rare account that holds
  // both roles. AppSidebar only shows a switcher when there's more than one.
  const workspaces: SidebarWorkspace[] = [];

  if (organization) {
    workspaces.push({
      key: "tenant",
      labelAr: "المنظمة",
      labelEn: "Organization",
      groups: [
        homeGroup,
        {
          key: "property",
          labelAr: "العقارات",
          labelEn: "Property",
          items: [
            { href: "/property", labelAr: "الوحدات", labelEn: "Units", icon: <MapPinned className={ic} /> },
            { href: "/members", labelAr: "الأعضاء", labelEn: "Members", icon: <Users className={ic} /> },
            { href: "/import", labelAr: "استيراد", labelEn: "Import", icon: <BookOpen className={ic} /> },
          ],
        },
        {
          // Themed parent items with nested sub-destinations instead of 9
          // flat siblings -- each parent is still a real page (clicking the
          // label navigates there); the chevron only toggles the reveal.
          // Labels kept to one or two short words throughout (global-app
          // convention) -- the 256px sidebar truncates anything longer, and
          // group/parent context already carries most of the meaning (e.g.
          // "Accounting > Accounts", not "Accounting > Chart of Accounts").
          key: "finance",
          labelAr: "المحاسبة",
          labelEn: "Accounting",
          items: [
            {
              href: "/finance/accounts",
              labelAr: "الحسابات",
              labelEn: "Accounts",
              icon: <BookOpen className={ic} />,
              subItems: [
                { href: "/finance/journals", labelAr: "القيود", labelEn: "Journals" },
                { href: "/admin/finance/periods", labelAr: "الفترات", labelEn: "Periods" },
              ],
            },
            {
              href: "/finance/dues",
              labelAr: "المديونيات",
              labelEn: "Receivables",
              icon: <Receipt className={ic} />,
              subItems: [{ href: "/finance/payments", labelAr: "المدفوعات", labelEn: "Payments" }],
            },
            {
              href: "/finance/cashier",
              labelAr: "الخزينة",
              labelEn: "Treasury",
              icon: <Wallet className={ic} />,
              subItems: [{ href: "/finance/banks", labelAr: "البنوك", labelEn: "Banks" }],
            },
            {
              href: "/finance/suppliers",
              labelAr: "المشتريات",
              labelEn: "Purchasing",
              icon: <Truck className={ic} />,
              subItems: [{ href: "/finance/expenses", labelAr: "المصروفات", labelEn: "Expenses" }],
            },
            { href: "/finance/reports", labelAr: "التقارير", labelEn: "Reports", icon: <BarChart3 className={ic} /> },
          ],
        },
        {
          // Configuration, not daily operation -- deliberately last, below
          // the sections people actually work in day to day.
          key: "settings",
          labelAr: "الإعدادات",
          labelEn: "Settings",
          items: [
            {
              href: "/admin",
              labelAr: "عام",
              labelEn: "General",
              icon: <Settings className={ic} />,
              subItems: [
                { href: "/admin/resorts", labelAr: "المنتجعات", labelEn: "Resorts" },
                { href: "/admin/users", labelAr: "المستخدمون", labelEn: "Users" },
                { href: "/admin/roles", labelAr: "الأدوار", labelEn: "Roles" },
                { href: "/finance/payment-providers", labelAr: "بوابات الدفع", labelEn: "Gateways" },
              ],
            },
          ],
        },
      ],
    });
  }

  if (platformAdmin) {
    workspaces.push({
      key: "platform",
      labelAr: "المنصة",
      labelEn: "Platform",
      groups: [
        homeGroup,
        {
          key: "platform-nav",
          labelAr: "الإدارة",
          labelEn: "Admin",
          items: [
            { href: "/platform/organizations", labelAr: "المنظمات", labelEn: "Organizations", icon: <Building2 className={ic} /> },
            { href: "/platform/leads", labelAr: "العروض", labelEn: "Leads", icon: <Inbox className={ic} /> },
            { href: "/platform/audit", labelAr: "التدقيق", labelEn: "Audit", icon: <ShieldAlert className={ic} /> },
          ],
        },
      ],
    });
  }

  if (workspaces.length === 0) {
    workspaces.push({ key: "empty", labelAr: "", labelEn: "", groups: [homeGroup] });
  }

  const boundSignOut = signOut.bind(null, loc);
  const isAr = loc === "ar";

  return (
    <Toaster>
    <div className="flex min-h-full flex-1 flex-col">
      <SiteHeader locale={loc} />
      <div className="flex flex-1 flex-col md:flex-row">
        <AppSidebar
          workspaces={workspaces}
          locale={loc}
          footer={
            <div className="space-y-2.5">
              <Link
                href="/account"
                locale={loc}
                className="-mx-1 flex items-center gap-2.5 rounded-lg px-1 py-1 transition-colors hover:bg-white/[0.05]"
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-xs font-bold text-sidebar-primary-foreground">
                  {(organization?.name || user!.email || "?")[0].toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-sidebar-foreground">
                    {organization?.name || user!.email}
                  </p>
                  <p className="truncate text-[11px] text-sidebar-foreground/55">{user!.email}</p>
                </div>
              </Link>
              <div className="flex flex-wrap items-center gap-1.5">
                {organization && (
                  <Badge variant="outline" className="border-sidebar-border text-[10px] text-sidebar-foreground/80">
                    {organization.status}
                  </Badge>
                )}
                {platformAdmin && (
                  <Badge className="text-[10px]">{isAr ? "مدير المنصة" : "Super Admin"}</Badge>
                )}
              </div>
              <form action={boundSignOut}>
                <Button
                  type="submit"
                  variant="outline"
                  size="sm"
                  className="w-full border-sidebar-border bg-transparent text-sidebar-foreground hover:bg-white/[0.06]"
                >
                  {isAr ? "تسجيل الخروج" : "Sign out"}
                </Button>
              </form>
            </div>
          }
        />
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
    </Toaster>
  );
}
