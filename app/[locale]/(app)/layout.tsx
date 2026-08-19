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
import { getCurrentUser, isPlatformAdmin } from "@/lib/auth/session";
import { getPrimaryOrganization } from "@/lib/auth/org-context";
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
      labelAr: "عقار بوكس",
      labelEn: "AqarBooks",
      groups: [
        homeGroup,
        {
          key: "property",
          labelAr: "العقارات والمشاريع",
          labelEn: "Properties & Operations",
          items: [
            {
              href: "/admin/resorts",
              labelAr: "الكيانات والمشاريع",
              labelEn: "Entities & Resorts",
              icon: <Building className={ic} />,
            },
            {
              href: "/property",
              labelAr: "الوحدات السكنية والتجارية",
              labelEn: "Units Management",
              icon: <MapPinned className={ic} />,
              subItems: [
                { href: "/property", labelAr: "كافة الوحدات", labelEn: "All Units" },
                { href: "/finance/reports/rent-roll", labelAr: "جدول الإيجارات (Rent Roll)", labelEn: "Rent Roll Schedule" },
                { href: "/finance/reports/lease-expirations", labelAr: "جداول انتهاء العقود", labelEn: "Lease Expirations" },
                { href: "/import", labelAr: "استيراد وحدات", labelEn: "Bulk Import" },
              ],
            },
            {
              href: "/members",
              labelAr: "الأعضاء والملاك",
              labelEn: "Members & Owners",
              icon: <Users className={ic} />,
              subItems: [
                { href: "/members", labelAr: "دليل الملاك والمستأجرين", labelEn: "Members Directory" },
                { href: "/finance/reports/owner-statement", labelAr: "كشف حساب الملاك وتوزيعاتهم", labelEn: "Owner Statements" },
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
              href: "/finance/accounts",
              labelAr: "دليل الحسابات والقيود",
              labelEn: "Chart of Accounts",
              icon: <Scale className={ic} />,
              subItems: [
                { href: "/finance/accounts", labelAr: "شجرة الحسابات", labelEn: "Accounts Tree" },
                { href: "/finance/journals", labelAr: "قيود اليومية المحاسبية", labelEn: "Journal Entries" },
                { href: "/admin/finance/periods", labelAr: "الفترات والسنوات المالية", labelEn: "Fiscal Periods" },
                { href: "/finance/budgets", labelAr: "الموازنات التقديرية", labelEn: "Fiscal Budgets" },
                { href: "/finance/reports/general-ledger", labelAr: "دفتر الأستاذ العام", labelEn: "General Ledger" },
              ],
            },
            {
              href: "/finance/dues",
              labelAr: "الاستحقاقات والمقبوضات",
              labelEn: "Receivables & Billing",
              icon: <Receipt className={ic} />,
              subItems: [
                { href: "/finance/dues", labelAr: "المطالبات والاستحقاقات", labelEn: "Dues & Invoices" },
                { href: "/finance/payments", labelAr: "سندات القبض والتحصيل", labelEn: "Receipt Vouchers" },
                { href: "/finance/service-charges", labelAr: "رسوم الخدمات والصيانة", labelEn: "Service Charges" },
                { href: "/finance/reports/cam-allocation", labelAr: "توزيع تكاليف الخدمات (CAM)", labelEn: "CAM Allocation" },
                { href: "/finance/reports/aging", labelAr: "أعمار ديون العملاء (AR)", labelEn: "AR Aging" },
              ],
            },
            {
              href: "/finance/cashier",
              labelAr: "الخزينة والسيولة والشيكات",
              labelEn: "Treasury & Banking",
              icon: <Wallet className={ic} />,
              subItems: [
                { href: "/finance/cashier", labelAr: "الخزينة والمقبوضات الفورية", labelEn: "Cashier" },
                { href: "/finance/banks", labelAr: "الحسابات البنكية", labelEn: "Bank Accounts" },
                { href: "/finance/reports/pdc", labelAr: "سجل الشيكات الآجلة (PDC)", labelEn: "PDC Register" },
                { href: "/finance/reports/cash-flow-forecast", labelAr: "توقعات السيولة (90 يوم)", labelEn: "Cash Runway Forecast" },
                { href: "/finance/banks/reconciliation", labelAr: "المطابقة والتسوية البنكية", labelEn: "Bank Reconciliation" },
              ],
            },
            {
              href: "/finance/suppliers",
              labelAr: "المشتريات والمصروفات",
              labelEn: "Purchasing & Payables",
              icon: <Truck className={ic} />,
              subItems: [
                { href: "/finance/suppliers", labelAr: "الموردون والمقاولون", labelEn: "Vendors & Suppliers" },
                { href: "/finance/expenses", labelAr: "سندات الصرف والمصروفات", labelEn: "Expense Vouchers" },
                { href: "/finance/reports/ap-aging", labelAr: "أعمار ديون الموردين (AP)", labelEn: "AP Aging" },
                { href: "/finance/reports/capex-opex", labelAr: "مصاريف CAPEX / OPEX", labelEn: "CAPEX vs OPEX" },
                { href: "/finance/commissions", labelAr: "عمولات الوسطاء والمسوقين", labelEn: "Broker Commissions" },
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
              labelAr: "مركز التقارير (19 تقريراً)",
              labelEn: "Reports Hub (19 Reports)",
              icon: <BarChart3 className={ic} />,
              subItems: [
                { href: "/finance/reports/trial-balance", labelAr: "ميزان المراجعة بالمجاميع", labelEn: "Trial Balance" },
                { href: "/finance/reports/income-statement", labelAr: "قائمة الدخل والأرباح (P&L)", labelEn: "Income Statement" },
                { href: "/finance/reports/balance-sheet", labelAr: "الميزانية والمركز المالي", labelEn: "Balance Sheet" },
                { href: "/finance/reports/cash-flow", labelAr: "قائمة التدفقات النقدية", labelEn: "Cash Flow Statement" },
                { href: "/finance/reports/property-pnl", labelAr: "أرباح وخسائر المشاريع", labelEn: "Property-Level P&L" },
                { href: "/finance/reports/fixed-assets", labelAr: "الأصول الثابتة والإهلاك", labelEn: "Fixed Assets & NBV" },
                { href: "/finance/reports/audit-trail", labelAr: "سجل التدقيق والحوكمة", labelEn: "Audit Trail & Logs" },
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
              href: "/finance/einvoice",
              labelAr: "الفوترة الإلكترونية والإقرارات",
              labelEn: "E-Invoicing & VAT",
              icon: <Landmark className={ic} />,
              subItems: [
                { href: "/finance/einvoice", labelAr: "القرارات وسجل الفواتير", labelEn: "Tax Invoices Log" },
                { href: "/finance/reports/vat-return", labelAr: "إقرار القيمة المضافة (VAT)", labelEn: "VAT Return Statement" },
                { href: "/finance/tax-mapping", labelAr: "التصنيف والوعاء الضريبي", labelEn: "Tax Mapping" },
                { href: "/finance/einvoice-items", labelAr: "تكويد أصناف السلع والخدمات", labelEn: "GS1 / EGS Item Codes" },
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
                { href: "/admin", labelAr: "إعدادات المنشأة والبراند", labelEn: "Organization Profile" },
                { href: "/admin/users", labelAr: "المستخدمون وفريق العمل", labelEn: "Team & Users" },
                { href: "/admin/roles", labelAr: "الصلاحيات والمصفوفة", labelEn: "Roles & Permissions" },
                { href: "/finance/payment-providers", labelAr: "بوابات الدفع الإلكتروني", labelEn: "Payment Gateways" },
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
        <SiteHeader locale={loc} />
        <div className="flex flex-1 flex-col md:flex-row">
          <AppSidebar
            workspaces={workspaces}
            locale={loc}
            userProfile={userProfile}
            signOutAction={boundSignOut}
          />
          <main className="flex-1 p-6 sm:p-8 min-w-0 bg-slate-50/70 dark:bg-[#090D16] transition-colors">{children}</main>
        </div>
      </div>
    </Toaster>
  );
}
