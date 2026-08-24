import { redirect, Link } from "@/i18n/navigation";
import { SiteHeader } from "@/components/site-header";
import {
  AppSidebar,
  type SidebarNavGroup,
  type SidebarWorkspace,
  type UserSidebarProfile,
} from "@/components/app-sidebar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/toast";
import { AskAqarBooksDrawer } from "@/components/ai/ask-aqarbooks-drawer";
import { getCurrentUser, isPlatformAdmin } from "@/lib/auth/session";
import { getPrimaryOrganization } from "@/lib/auth/org-context";
import { getOperationalAlerts } from "@/lib/alerts/operational-alerts";
import {
  buildPermissionChecker,
  collectNavPermissionKeys,
  filterNavByPermission,
} from "@/lib/auth/nav-permissions";
import { createClient } from "@/lib/supabase/server";
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
  Landmark,
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

  const supabase = await createClient();

  const [platformAdmin, organization, { data: profile }] = await Promise.all([
    isPlatformAdmin(user!.id),
    getPrimaryOrganization(user!.id),
    supabase
      .from("profiles")
      .select("full_name, avatar_url")
      .eq("id", user!.id)
      .maybeSingle(),
  ]);

  // Derived from live data on the server, so the bell can never show a count
  // that disagrees with the ledger. Every query inside runs as this user, so an
  // alert about dues only reaches someone allowed to read dues.
  const alerts = organization ? await getOperationalAlerts(organization.id, user!.id) : [];

  const homeGroup: SidebarNavGroup = {
    key: "home",
    items: [
      {
        href: "/dashboard",
        labelAr: "الرئيسية والداشبورد",
        labelEn: "Dashboard",
        icon: <LayoutDashboard className={ic} />,
      },
    ],
  };

  const workspaces: SidebarWorkspace[] = [];

  if (organization) {
    workspaces.push({
      key: "tenant",
      labelAr: "AqarBooks",
      labelEn: "AqarBooks",
      groups: [
        homeGroup,
        {
          key: "property",
          labelAr: "العقارات والمشاريع",
          labelEn: "Properties & Operations",
          items: [
            {
              href: "/admin/resorts", permission: "tenant.settings.manage",
              labelAr: "الكيانات والمشاريع",
              labelEn: "Entities & Resorts",
              icon: <Building className={ic} />,
            },
            {
              href: "/property", permission: "property.units.manage",
              labelAr: "الوحدات السكنية والتجارية",
              labelEn: "Units Management",
              icon: <MapPinned className={ic} />,
              subItems: [
                { href: "/property", permission: "property.units.manage", labelAr: "كافة الوحدات", labelEn: "All Units" },
                { href: "/finance/reports/rent-roll", permission: "property.reports.read", labelAr: "جدول الإيجارات (Rent Roll)", labelEn: "Rent Roll Schedule" },
                { href: "/finance/reports/lease-expirations", permission: "property.reports.read", labelAr: "جداول انتهاء العقود", labelEn: "Lease Expirations" },
                { href: "/import", permission: "property.units.manage", labelAr: "استيراد وحدات", labelEn: "Bulk Import" },
              ],
            },
            {
              href: "/members", permission: "property.members.manage",
              labelAr: "الأعضاء والملاك",
              labelEn: "Members & Owners",
              icon: <Users className={ic} />,
              subItems: [
                { href: "/members", permission: "property.members.manage", labelAr: "دليل الملاك والمستأجرين", labelEn: "Members Directory" },
                { href: "/finance/reports/owner-statement", permission: "property.reports.read", labelAr: "كشف حساب الملاك وتوزيعاتهم", labelEn: "Owner Statements" },
              ],
            },
          ],
        },
        {
          key: "finance",
          labelAr: "المحاسبة والمالية",
          labelEn: "Finance & Accounting",
          items: [
            {
              href: "/finance/accounts", permission: "finance.accounts.view",
              labelAr: "دليل الحسابات والقيود",
              labelEn: "Chart of Accounts",
              icon: <Scale className={ic} />,
              subItems: [
                { href: "/finance/accounts", permission: "finance.accounts.view", labelAr: "شجرة الحسابات", labelEn: "Accounts Tree" },
                { href: "/finance/journals", permission: "finance.accounts.view", labelAr: "قيود اليومية المحاسبية", labelEn: "Journal Entries" },
                { href: "/admin/finance/periods", permission: "finance.periods.manage", labelAr: "الفترات والسنوات المالية", labelEn: "Fiscal Periods" },
                { href: "/finance/budgets", permission: "finance.budgets.manage", labelAr: "الموازنات التقديرية", labelEn: "Fiscal Budgets" },
                { href: "/finance/assets", permission: "finance.assets.manage", labelAr: "الأصول الثابتة والإهلاك", labelEn: "Fixed Assets" },
                { href: "/finance/projects", permission: "finance.accounts.manage", labelAr: "المشاريع والأعمال تحت التنفيذ", labelEn: "Projects & WIP" },
                { href: "/finance/exchange-rates", permission: "finance.fx.manage", labelAr: "أسعار الصرف", labelEn: "Exchange Rates" },
                { href: "/admin/finance/accounting-accounts", permission: "finance.accounts.manage", labelAr: "الحسابات المعيَّنة", labelEn: "Designated Accounts" },
                { href: "/finance/reports/general-ledger", permission: "finance.reports.read", labelAr: "دفتر الأستاذ العام", labelEn: "General Ledger" },
              ],
            },
            {
              href: "/finance/dues", permission: "finance.dues.read",
              labelAr: "الاستحقاقات والمقبوضات",
              labelEn: "Receivables & Billing",
              icon: <Receipt className={ic} />,
              subItems: [
                { href: "/finance/dues", permission: "finance.dues.read", labelAr: "المطالبات والاستحقاقات", labelEn: "Dues & Invoices" },
                { href: "/finance/payments", permission: "finance.payments.read", labelAr: "سندات القبض والتحصيل", labelEn: "Receipt Vouchers" },
                { href: "/finance/service-charges", permission: "finance.service_charges.manage", labelAr: "رسوم الخدمات والصيانة", labelEn: "Service Charges" },
                { href: "/finance/dunning", permission: "finance.dunning.manage", labelAr: "التحصيل والمتأخرات", labelEn: "Collections" },
                { href: "/finance/reports/cam-allocation", permission: "finance.reports.read", labelAr: "توزيع تكاليف الخدمات (CAM)", labelEn: "CAM Allocation" },
                { href: "/finance/reports/aging", permission: "finance.dues.read", labelAr: "أعمار ديون العملاء (AR)", labelEn: "AR Aging" },
              ],
            },
            {
              href: "/finance/cashier", permission: "cashier.transactions.create",
              labelAr: "الخزينة والسيولة والشيكات",
              labelEn: "Treasury & Banking",
              icon: <Wallet className={ic} />,
              subItems: [
                { href: "/finance/cashier", permission: "cashier.transactions.create", labelAr: "الخزينة والمقبوضات الفورية", labelEn: "Cashier" },
                { href: "/finance/banks", permission: "banking.accounts.view", labelAr: "الحسابات البنكية", labelEn: "Bank Accounts" },
                { href: "/finance/reports/pdc", permission: "finance.reports.read", labelAr: "سجل الشيكات الآجلة (PDC)", labelEn: "PDC Register" },
                { href: "/finance/reports/cash-flow-forecast", permission: "finance.reports.read", labelAr: "توقعات السيولة (90 يوم)", labelEn: "Cash Runway Forecast" },
                { href: "/finance/banks/reconciliation", permission: "finance.bank_reconciliation.manage", labelAr: "المطابقة والتسوية البنكية", labelEn: "Bank Reconciliation" },
              ],
            },
            {
              href: "/finance/suppliers", permission: "finance.suppliers.read",
              labelAr: "المشتريات والمصروفات",
              labelEn: "Purchasing & Payables",
              icon: <Truck className={ic} />,
              subItems: [
                { href: "/finance/suppliers", permission: "finance.suppliers.read", labelAr: "الموردون والمقاولون", labelEn: "Vendors & Suppliers" },
                { href: "/finance/expenses", permission: "finance.expenses.read", labelAr: "سندات الصرف والمصروفات", labelEn: "Expense Vouchers" },
                { href: "/finance/reports/ap-aging", permission: "finance.reports.read", labelAr: "أعمار ديون الموردين (AP)", labelEn: "AP Aging" },
                { href: "/finance/reports/capex-opex", permission: "finance.reports.read", labelAr: "مصاريف CAPEX / OPEX", labelEn: "CAPEX vs OPEX" },
                { href: "/finance/commissions", permission: "finance.commissions.manage", labelAr: "عمولات الوسطاء والمسوقين", labelEn: "Broker Commissions" },
              ],
            },
          ],
        },
        {
          key: "reports",
          labelAr: "التقارير والقوائم المالية",
          labelEn: "Financial Reports",
          items: [
            {
              href: "/finance/reports",
              labelAr: "مركز التقارير المالية",
              labelEn: "Reports Hub (19 Reports)",
              icon: <BarChart3 className={ic} />,
              subItems: [
                { href: "/finance/reports/trial-balance", permission: "finance.reports.read", labelAr: "ميزان المراجعة بالمجاميع", labelEn: "Trial Balance" },
                { href: "/finance/reports/income-statement", permission: "finance.reports.read", labelAr: "قائمة الدخل والأرباح (P&L)", labelEn: "Income Statement" },
                { href: "/finance/reports/balance-sheet", permission: "finance.reports.read", labelAr: "الميزانية والمركز المالي", labelEn: "Balance Sheet" },
                { href: "/finance/reports/cash-flow", permission: "finance.reports.read", labelAr: "قائمة التدفقات النقدية", labelEn: "Cash Flow Statement" },
                { href: "/finance/reports/property-pnl", permission: "finance.reports.read", labelAr: "أرباح وخسائر المشاريع", labelEn: "Property-Level P&L" },
                { href: "/finance/reports/fixed-assets", permission: "finance.reports.read", labelAr: "الأصول الثابتة والإهلاك", labelEn: "Fixed Assets & NBV" },
                { href: "/finance/reports/budget-vs-actual", permission: "finance.reports.read", labelAr: "الموازنة مقابل الفعلي", labelEn: "Budget vs Actual" },
                { href: "/finance/reports/audit-trail", permission: "finance.reports.read", labelAr: "سجل التدقيق والحوكمة", labelEn: "Audit Trail & Logs" },
              ],
            },
          ],
        },
        {
          key: "tax",
          labelAr: "الضرائب والامتثال",
          labelEn: "Tax & Compliance",
          items: [
            {
              href: "/finance/einvoice", permission: "finance.einvoice.manage",
              labelAr: "الفوترة الإلكترونية والإقرارات",
              labelEn: "E-Invoicing & VAT",
              icon: <Landmark className={ic} />,
              subItems: [
                { href: "/finance/einvoice", permission: "finance.einvoice.manage", labelAr: "القرارات وسجل الفواتير", labelEn: "Tax Invoices Log" },
                { href: "/finance/reports/vat-return", permission: "finance.reports.read", labelAr: "إقرار القيمة المضافة (VAT)", labelEn: "VAT Return Statement" },
                { href: "/finance/tax-mapping", permission: "finance.tax_mapping.manage", labelAr: "التصنيف والوعاء الضريبي", labelEn: "Tax Mapping" },
                { href: "/finance/einvoice-items", permission: "finance.einvoice.manage", labelAr: "تكويد أصناف السلع والخدمات", labelEn: "GS1 / EGS Item Codes" },
              ],
            },
          ],
        },
        {
          key: "settings",
          labelAr: "الإعدادات والحساب",
          labelEn: "Settings & Account",
          items: [
            {
              href: "/account",
              labelAr: "حسابي والأمان الشخصي",
              labelEn: "My Account & Security",
              icon: <Settings className={ic} />,
              subItems: [
                { href: "/account", labelAr: "الملف الشخصي وكلمة المرور", labelEn: "Profile & Password" },
                { href: "/notifications", labelAr: "مركز الإشعارات والتنبيهات", labelEn: "Notification Center" },
                { href: "/admin", permission: "tenant.settings.manage", labelAr: "إعدادات المنشأة والبراند", labelEn: "Organization Profile" },
                { href: "/admin/users", permission: "tenant.users.manage", labelAr: "المستخدمون وفريق العمل", labelEn: "Team & Users" },
                { href: "/admin/roles", permission: "tenant.roles.manage", labelAr: "الصلاحيات والمصفوفة", labelEn: "Roles & Permissions" },
                { href: "/admin/ai-governance", permission: "tenant.settings.manage", labelAr: "حوكمة الذكاء الاصطناعي (Shadow Pilot)", labelEn: "AI Governance & Pilot" },
                { href: "/finance/payment-providers", permission: "finance.online_payments.manage", labelAr: "بوابات الدفع الإلكتروني", labelEn: "Payment Gateways" },
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

  // Pruned before it is serialised, so a branch the viewer may not open is
  // genuinely absent from the payload rather than hidden with CSS. The whole
  // tree used to ship to everyone: someone with only property access was shown
  // thirty-odd finance links that would bounce them, and the menu disclosed
  // every module and its exact route.
  const navWorkspaces = organization
    ? filterNavByPermission(
        workspaces,
        await buildPermissionChecker(organization.id, collectNavPermissionKeys(workspaces)),
      )
    : workspaces;

  // Counts on the two entries where a number changes what someone does next.
  // Sourced from the same derivation the alert centre reads, so the menu and
  // the alerts can never disagree about how much is overdue.
  const overdueAlert = alerts.find((a) => a.key.startsWith("overdue_dues:"));
  const overdueCount = overdueAlert ? Number(overdueAlert.key.split(":")[1]) || 0 : 0;

  if (overdueCount > 0) {
    for (const workspace of navWorkspaces) {
      for (const group of workspace.groups) {
        for (const item of group.items) {
          for (const sub of item.subItems ?? []) {
            if (sub.href === "/finance/dunning" || sub.href === "/finance/reports/aging") {
              item.badge = overdueCount;
            }
          }
        }
      }
    }
  }

  if (navWorkspaces.length === 0) {
    navWorkspaces.push({ key: "empty", labelAr: "", labelEn: "", groups: [homeGroup] });
  }

  const boundSignOut = signOut.bind(null, loc);
  const isAr = loc === "ar";

  const userProfile: UserSidebarProfile = {
    name: profile?.full_name || organization?.name || user!.email?.split("@")[0],
    email: user!.email ?? "",
    role: platformAdmin
      ? isAr
        ? "مسؤول النظام العام"
        : "Platform Admin"
      : isAr
      ? "مالك المنشأة"
      : "Organization Owner",
    orgName: organization?.name,
    isSuperAdmin: platformAdmin,
  };

  return (
    <Toaster>
      <div className="flex min-h-full flex-1 flex-col">
        <SiteHeader locale={loc} alerts={alerts} />
        <div className="flex flex-1 flex-col md:flex-row">
          <AppSidebar
            workspaces={navWorkspaces}
            locale={loc}
            userProfile={userProfile}
            signOutAction={boundSignOut}
          />
          <main className="flex-1 p-3.5 sm:p-6 md:p-8 min-w-0 max-w-full overflow-x-hidden bg-slate-50/70 dark:bg-[#090D16] transition-colors">{children}</main>
        </div>
        <AskAqarBooksDrawer locale={loc} />
      </div>
    </Toaster>
  );
}
