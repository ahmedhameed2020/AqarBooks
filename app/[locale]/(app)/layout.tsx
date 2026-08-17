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
  Building,
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
  Scale,
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
    items: [
      {
        href: "/dashboard",
        labelAr: "الرئيسية",
        labelEn: "Dashboard",
        icon: <LayoutDashboard className={ic} />,
      },
    ],
  };

  const workspaces: SidebarWorkspace[] = [];

  if (organization) {
    workspaces.push({
      key: "tenant",
      labelAr: "عقار بوكس",
      labelEn: "AqarBooks",
      groups: [
        homeGroup,
        {
          key: "property",
          labelAr: "العقارات",
          labelEn: "Properties",
          items: [
            {
              href: "/admin/resorts",
              labelAr: "الكيانات العقارية",
              labelEn: "Entities",
              icon: <Building className={ic} />,
            },
            {
              href: "/property",
              labelAr: "الوحدات",
              labelEn: "Units",
              icon: <MapPinned className={ic} />,
              subItems: [
                { href: "/import", labelAr: "استيراد", labelEn: "Import" },
              ],
            },
            {
              href: "/members",
              labelAr: "الأعضاء",
              labelEn: "Members",
              icon: <Users className={ic} />,
            },
          ],
        },
        {
          key: "finance",
          labelAr: "المحاسبة",
          labelEn: "Accounting",
          items: [
            {
              href: "/finance/accounts",
              labelAr: "الحسابات",
              labelEn: "Accounts",
              icon: <Scale className={ic} />,
              subItems: [
                { href: "/finance/journals", labelAr: "القيود", labelEn: "Journals" },
                { href: "/finance/budgets", labelAr: "الموازنات", labelEn: "Budgets" },
                { href: "/admin/finance/periods", labelAr: "الفترات", labelEn: "Periods" },
              ],
            },
            {
              href: "/finance/dues",
              labelAr: "الاستحقاقات",
              labelEn: "Receivables",
              icon: <Receipt className={ic} />,
              subItems: [
                { href: "/finance/payments", labelAr: "المقبوضات", labelEn: "Receipts" },
              ],
            },
            {
              href: "/finance/cashier",
              labelAr: "الخزينة",
              labelEn: "Treasury",
              icon: <Wallet className={ic} />,
              subItems: [
                { href: "/finance/banks", labelAr: "البنوك", labelEn: "Banks" },
                { href: "/finance/banks/reconciliation", labelAr: "المطابقة البنكية", labelEn: "Reconciliation" },
              ],
            },
            {
              href: "/finance/suppliers",
              labelAr: "المشتريات",
              labelEn: "Purchasing",
              icon: <Truck className={ic} />,
              subItems: [
                { href: "/finance/expenses", labelAr: "المصروفات", labelEn: "Expenses" },
              ],
            },
          ],
        },
        {
          key: "reports",
          labelAr: "التقارير",
          labelEn: "Reports",
          items: [
            {
              href: "/finance/reports",
              labelAr: "القوائم المالية",
              labelEn: "Financials",
              icon: <BarChart3 className={ic} />,
              subItems: [
                { href: "/finance/payment-providers", labelAr: "الضرائب", labelEn: "Tax" },
              ],
            },
          ],
        },
        {
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
                { href: "/admin/users", labelAr: "المستخدمون", labelEn: "Users" },
                { href: "/admin/roles", labelAr: "الصلاحيات", labelEn: "Roles" },
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
