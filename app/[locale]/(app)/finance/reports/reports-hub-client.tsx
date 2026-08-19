"use client";

import { useState, useMemo, useEffect } from "react";
import { Link } from "@/i18n/navigation";
import {
  Scale,
  TrendingUp,
  TrendingDown,
  Wallet,
  Landmark,
  FileSpreadsheet,
  Clock,
  ArrowUpRight,
  ShieldCheck,
  Building2,
  Calendar,
  Layers,
  FileText,
  PieChart,
  DollarSign,
  BookOpen,
  Search,
  Printer,
  Sparkles,
  Palette,
  CheckCircle2,
  KeyRound,
  UserCheck,
  CreditCard,
  Receipt,
  Droplets,
  Wrench,
  CalendarClock,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export interface ReportDefinition {
  id: string;
  href: string;
  category: "STATUTORY" | "LEDGERS" | "RECEIVABLES" | "BUDGETS" | "REAL_ESTATE" | "TAX" | "TREASURY";
  titleAr: string;
  titleEn: string;
  descAr: string;
  descEn: string;
  icon: any;
  badgeAr: string;
  badgeEn: string;
  badgeVariant: "default" | "secondary" | "outline";
  colorClass: string;
  bgGradient: string;
}

const ALL_REPORTS: ReportDefinition[] = [
  {
    id: "trial-balance",
    href: "/finance/reports/trial-balance",
    category: "STATUTORY",
    titleAr: "ميزان المراجعة بالمجاميع والأرصدة",
    titleEn: "Trial Balance Statement",
    descAr: "كشف شامل لأرصدة وحركات كافة الحسابات المدينة والدائنة مع فحص التوازن الفوري والاعتماد المحاسبي.",
    descEn: "Comprehensive summary of debit and credit balances with automated balance integrity check.",
    icon: Scale,
    badgeAr: "أساسي ومعتمد",
    badgeEn: "Core Statutory",
    badgeVariant: "default",
    colorClass: "text-blue-600 dark:text-blue-400",
    bgGradient: "from-blue-600/10 to-indigo-600/10",
  },
  {
    id: "income-statement",
    href: "/finance/reports/income-statement",
    category: "STATUTORY",
    titleAr: "قائمة الدخل والأرباح والخسائر",
    titleEn: "Income Statement (P&L)",
    descAr: "بيان شجري للإيرادات المحققة والمصروفات التشغيلية وصافي الفائض أو العجز المالي وهوامش الربحية.",
    descEn: "Full report of revenues, operating expenditures, and net period surplus or deficit.",
    icon: TrendingUp,
    badgeAr: "قائمة ختامية",
    badgeEn: "Statutory",
    badgeVariant: "default",
    colorClass: "text-emerald-600 dark:text-emerald-400",
    bgGradient: "from-emerald-600/10 to-teal-600/10",
  },
  {
    id: "balance-sheet",
    href: "/finance/reports/balance-sheet",
    category: "STATUTORY",
    titleAr: "الميزانية العمومية والمركز المالي",
    titleEn: "Balance Sheet",
    descAr: "بيان الأصول المتداولة والثابتة، الخصوم والالتزامات، وحقوق الملكية وفحص المعادلة المحاسبية.",
    descEn: "Statement of financial position: assets, liabilities, and equity balances.",
    icon: Landmark,
    badgeAr: "قائمة ختامية",
    badgeEn: "Statutory",
    badgeVariant: "default",
    colorClass: "text-purple-600 dark:text-purple-400",
    bgGradient: "from-purple-600/10 to-pink-600/10",
  },
  {
    id: "cash-flow",
    href: "/finance/reports/cash-flow",
    category: "STATUTORY",
    titleAr: "قائمة التدفقات النقدية",
    titleEn: "Cash Flow Statement",
    descAr: "حركة السيولة والتدفقات النقدية من الأنشطة التشغيلية والاستثمارية والتمويلية ومطابقة النقدية.",
    descEn: "Inflows and outflows across operational, investing, and financing activities.",
    icon: Wallet,
    badgeAr: "سيولة نقدية",
    badgeEn: "Liquidity",
    badgeVariant: "secondary",
    colorClass: "text-amber-600 dark:text-amber-400",
    bgGradient: "from-amber-600/10 to-orange-600/10",
  },
  {
    id: "rent-roll",
    href: "/finance/reports/rent-roll",
    category: "REAL_ESTATE",
    titleAr: "جدول الإيجارات وحصر العقود (Rent Roll)",
    titleEn: "Rent Roll & Leases Schedule",
    descAr: "التقرير القياسي العالمي لحصر إشغال الوحدات، المستأجرين، القيمة الإيجارية التعاقدية، وتواريخ تجديد وانتهاء العقود.",
    descEn: "Standard property management schedule tracking unit occupancy, tenants, lease terms, and contractual rent.",
    icon: KeyRound,
    badgeAr: "تشغيل وإشغال عقاري",
    badgeEn: "Core PropTech",
    badgeVariant: "default",
    colorClass: "text-indigo-600 dark:text-indigo-400",
    bgGradient: "from-indigo-600/10 to-blue-600/10",
  },
  {
    id: "owner-statement",
    href: "/finance/reports/owner-statement",
    category: "REAL_ESTATE",
    titleAr: "كشف حساب وتوزيعات أرباح الملاك",
    titleEn: "Owner Payout & Distribution",
    descAr: "الحساب المالي للمستثمرين والملاك: حصر الإيرادات المحصلة، استقطاع عمولة الإدارة ورسوم الصيانة، واحتساب صافي الأرباح.",
    descEn: "Statement of account for property owners: collected income, management fees, maintenance charges, and net payout.",
    icon: UserCheck,
    badgeAr: "توزيعات المستثمرين",
    badgeEn: "Owner Statement",
    badgeVariant: "secondary",
    colorClass: "text-emerald-600 dark:text-emerald-400",
    bgGradient: "from-emerald-600/10 to-teal-600/10",
  },
  {
    id: "vat-return",
    href: "/finance/reports/vat-return",
    category: "TAX",
    titleAr: "إقرار ضريبة القيمة المضافة ومطابقة الضرائب",
    titleEn: "VAT Return & Tax Audit",
    descAr: "التقرير الضريبي المعتمد لتقديم الإقرارات الدورية لمصلحة الضرائب وهيئة الزكاة (ETA / ZATCA) ومطابقة ضريبة المخرجات والمدخلات.",
    descEn: "Audited periodic tax return statement comparing output VAT on revenues against deductible input VAT.",
    icon: Receipt,
    badgeAr: "إقرار معتمد",
    badgeEn: "Tax Authority",
    badgeVariant: "default",
    colorClass: "text-purple-600 dark:text-purple-400",
    bgGradient: "from-purple-600/10 to-indigo-600/10",
  },
  {
    id: "pdc",
    href: "/finance/reports/pdc",
    category: "TREASURY",
    titleAr: "سجل الشيكات الآجلة وأوراق القبض (PDC)",
    titleEn: "Post-Dated Cheques Register",
    descAr: "إدارة ومراقبة أوراق القبض والشيكات البنكية تحت التحصيل، تتبع جداول الاستحقاق، ومتابعة التحصيل والمقاصة البنكية.",
    descEn: "Comprehensive treasury register tracking post-dated cheques, maturity schedules, and bank deposit clearances.",
    icon: CreditCard,
    badgeAr: "أوراق قبض وخزينة",
    badgeEn: "Treasury PDC",
    badgeVariant: "outline",
    colorClass: "text-amber-600 dark:text-amber-400",
    bgGradient: "from-amber-600/10 to-orange-600/10",
  },
  {
    id: "property-pnl",
    href: "/finance/reports/property-pnl",
    category: "REAL_ESTATE",
    titleAr: "قائمة أرباح وخسائر العقارات والمنتجعات (Property P&L)",
    titleEn: "Property-Level Profit & Loss",
    descAr: "مقارنة ربحية كل منتجع ومشروع عقاري بشكل مستقل: الإيرادات، مصاريف التشغيل، وصافي الدخل التشغيلي (NOI).",
    descEn: "Segregated property-level P&L comparing revenues, operating expenses, and net operating income (NOI).",
    icon: Building2,
    badgeAr: "ربحية المشاريع",
    badgeEn: "Property NOI",
    badgeVariant: "default",
    colorClass: "text-emerald-600 dark:text-emerald-400",
    bgGradient: "from-emerald-600/10 to-teal-600/10",
  },
  {
    id: "ap-aging",
    href: "/finance/reports/ap-aging",
    category: "RECEIVABLES",
    titleAr: "تقرير أعمار ديون الموردين والالتزامات (AP Aging)",
    titleEn: "AP Supplier Aging Report",
    descAr: "تحليل التزامات المنشأة وفواتير الموردين والمقاولين وتصنيف فترات الاستحقاق لتخطيط السيولة والمدفوعات.",
    descEn: "Accounts payable aging analysis tracking vendor liabilities across standard maturity periods.",
    icon: Clock,
    badgeAr: "موردين والتزامات",
    badgeEn: "AP Liabilities",
    badgeVariant: "secondary",
    colorClass: "text-rose-600 dark:text-rose-400",
    bgGradient: "from-rose-600/10 to-red-600/10",
  },
  {
    id: "fixed-assets",
    href: "/finance/reports/fixed-assets",
    category: "STATUTORY",
    titleAr: "سجل الأصول الثابتة والإهلاك المحاسبي",
    titleEn: "Fixed Assets & Depreciation",
    descAr: "حصر الأصول الرأسمالية والمعدات والمنشآت المشتركة، تتبع أقساط الإهلاك، واحتساب صافي القيمة الدفترية (NBV).",
    descEn: "Fixed assets register tracking capital equipment, acquisition cost, accumulated depreciation, and Net Book Value.",
    icon: Layers,
    badgeAr: "أصول وإهلاك",
    badgeEn: "Fixed Assets",
    badgeVariant: "outline",
    colorClass: "text-cyan-600 dark:text-cyan-400",
    bgGradient: "from-cyan-600/10 to-blue-600/10",
  },
  {
    id: "audit-trail",
    href: "/finance/reports/audit-trail",
    category: "LEDGERS",
    titleAr: "سجل التدقيق والحركات الملغاة ومكافحة التلاعب",
    titleEn: "Audit Trail & Anti-Fraud",
    descAr: "تقرير الحوكمة والرقابة المالية: تتبع السندات الملغاة، القيود العكسية، وتغييرات الصلاحيات مع توثيق الأسباب.",
    descEn: "Immutable audit log tracking voided transactions, payment reversals, RBAC modifications, and change reasons.",
    icon: ShieldCheck,
    badgeAr: "حوكمة ورقابة",
    badgeEn: "Anti-Fraud Trail",
    badgeVariant: "default",
    colorClass: "text-indigo-600 dark:text-indigo-400",
    bgGradient: "from-indigo-600/10 to-purple-600/10",
  },
  {
    id: "cam-allocation",
    href: "/finance/reports/cam-allocation",
    category: "REAL_ESTATE",
    titleAr: "توزيع تكاليف الخدمات المشتركة والصيانة (CAM)",
    titleEn: "Common Area Maintenance (CAM)",
    descAr: "توزيع مصاريف الخدمات المشتركة، الأمن، النظافة، وصيانة المرافق واللاندسكيب على الوحدات والملاك بالمتر المربع.",
    descEn: "Apportion shared operating expenses across units based on square footage ratios and manage CAM collections.",
    icon: Droplets,
    badgeAr: "خدمات مشتركة",
    badgeEn: "CAM Allocation",
    badgeVariant: "default",
    colorClass: "text-teal-600 dark:text-teal-400",
    bgGradient: "from-teal-600/10 to-emerald-600/10",
  },
  {
    id: "cash-flow-forecast",
    href: "/finance/reports/cash-flow-forecast",
    category: "TREASURY",
    titleAr: "توقعات التدفق النقدي والسيولة المستقبلية",
    titleEn: "Cash Flow 90-Day Forecast",
    descAr: "التخطيط المالي الاستباقي لـ 90 يوماً القادمة: نمذجة أوراق القبض والشيكات المستحقة، الإيجارات، وفواتير الموردين.",
    descEn: "Forward-looking 90-day cash modeling tracking maturing cheques, scheduled lease collections, and vendor payment obligations.",
    icon: TrendingUp,
    badgeAr: "تخطيط سيولة",
    badgeEn: "Treasury Runway",
    badgeVariant: "default",
    colorClass: "text-emerald-600 dark:text-emerald-400",
    bgGradient: "from-emerald-600/10 to-teal-600/10",
  },
  {
    id: "capex-opex",
    href: "/finance/reports/capex-opex",
    category: "REAL_ESTATE",
    titleAr: "مصاريف الصيانة الرأسمالية والتشغيلية (CAPEX/OPEX)",
    titleEn: "CAPEX vs OPEX Maintenance",
    descAr: "الفصل المحاسبي بين المصاريف الرأسمالية المعززة لقيمة الأصول (CAPEX) والمصاريف التشغيلية الروتينية (OPEX).",
    descEn: "Accounting classification separating long-term capital improvement projects from routine operating maintenance expenses.",
    icon: Wrench,
    badgeAr: "صيانة وتشغيل",
    badgeEn: "CAPEX / OPEX",
    badgeVariant: "outline",
    colorClass: "text-amber-600 dark:text-amber-400",
    bgGradient: "from-amber-600/10 to-orange-600/10",
  },
  {
    id: "lease-expirations",
    href: "/finance/reports/lease-expirations",
    category: "REAL_ESTATE",
    titleAr: "جداول انتهاء العقود ومعدل دوران الإشغال",
    titleEn: "Lease Expirations Waterfall",
    descAr: "خريطة زمنية تفاعلية لعقود الإيجار المنتهية خلال الـ 12 شهراً القادمة، إدارة طلبات التجديد، وحماية التدفق الإيجاري.",
    descEn: "Interactive 12-month lease expiration schedule tracking upcoming vacancies, tenant renewals, and income at risk.",
    icon: CalendarClock,
    badgeAr: "إشغال وتجديدات",
    badgeEn: "Lease Churn",
    badgeVariant: "secondary",
    colorClass: "text-indigo-600 dark:text-indigo-400",
    bgGradient: "from-indigo-600/10 to-blue-600/10",
  },
  {
    id: "general-ledger",
    href: "/finance/reports/general-ledger",
    category: "LEDGERS",
    titleAr: "دفتر الأستاذ العام التفصيلي",
    titleEn: "General Ledger",
    descAr: "كشف حساب تفصيلي لأي حساب بالدليل المحاسبي بالحركات والقيود المرجعية والرصيد التراكمي.",
    descEn: "Itemized transaction statement with journal references and running balance.",
    icon: BookOpen,
    badgeAr: "تدقيق تفصيلي",
    badgeEn: "Itemized Audit",
    badgeVariant: "outline",
    colorClass: "text-cyan-600 dark:text-cyan-400",
    bgGradient: "from-cyan-600/10 to-blue-600/10",
  },
  {
    id: "aging",
    href: "/finance/reports/aging",
    category: "RECEIVABLES",
    titleAr: "تقرير أعمار الديون والتحصيل (AR Aging)",
    titleEn: "Receivables (AR) Aging Report",
    descAr: "تحليل الذمم المدينة وتصنيف فترات الاستحقاق المتأخرة حسب الوحدات والأعضاء لتقييم المخاطر.",
    descEn: "Analysis of aged receivables and delinquency periods across units and members.",
    icon: Clock,
    badgeAr: "تحصيل وذمم",
    badgeEn: "Collections",
    badgeVariant: "secondary",
    colorClass: "text-rose-600 dark:text-rose-400",
    bgGradient: "from-rose-600/10 to-red-600/10",
  },
  {
    id: "budget-vs-actual",
    href: "/finance/reports/budget-vs-actual",
    category: "BUDGETS",
    titleAr: "الموازنة التقديرية مقابل الفعلي",
    titleEn: "Budget vs Actual Analysis",
    descAr: "مقارنة الصرف والإيراد الفعلي بالموازنات المعتمدة واحتساب نسب الانحراف والوفر المالي.",
    descEn: "Variance analysis comparing approved fiscal budget targets to actual financial activity.",
    icon: PieChart,
    badgeAr: "رقابة مالية",
    badgeEn: "Variance Control",
    badgeVariant: "outline",
    colorClass: "text-violet-600 dark:text-violet-400",
    bgGradient: "from-violet-600/10 to-purple-600/10",
  },
];

export function ReportsHubClient({
  totalRevenue,
  totalExpense,
  netSurplus,
  cashPosition,
  currency,
  organizationName,
  taxId,
  locale,
}: {
  totalRevenue: number;
  totalExpense: number;
  netSurplus: number;
  cashPosition: number;
  currency: string;
  organizationName: string;
  taxId?: string | null;
  locale: string;
}) {
  const isAr = locale === "ar";
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeBrandColor, setActiveBrandColor] = useState<string>("#1E1B4B");

  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("aqarbooks_brand_color");
      if (saved) setActiveBrandColor(saved);
    }
  }, []);

  const fmt = (n: number) =>
    n.toLocaleString(isAr ? "ar-EG" : "en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  const filteredReports = useMemo(() => {
    return ALL_REPORTS.filter((r) => {
      if (selectedCategory !== "ALL" && r.category !== selectedCategory) return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      return (
        r.titleAr.toLowerCase().includes(q) ||
        r.titleEn.toLowerCase().includes(q) ||
        r.descAr.toLowerCase().includes(q) ||
        r.descEn.toLowerCase().includes(q)
      );
    });
  }, [selectedCategory, searchQuery]);

  const categories = [
    { key: "ALL", labelAr: "كافة التقارير والقوائم", labelEn: "All Reports", count: ALL_REPORTS.length },
    { key: "REAL_ESTATE", labelAr: "التشغيل العقاري والمشاريع", labelEn: "Real Estate & Projects", count: 6 },
    { key: "STATUTORY", labelAr: "الحسابات الختامية والأصول", labelEn: "Statutory & Assets", count: 5 },
    { key: "TAX", labelAr: "الضرائب والإقرارات", labelEn: "Tax & Compliance", count: 1 },
    { key: "TREASURY", labelAr: "الخزينة وتوقعات السيولة", labelEn: "Treasury & Forecast", count: 2 },
    { key: "RECEIVABLES", labelAr: "الذمم وأعمار الديون (AR/AP)", labelEn: "Aging (AR/AP)", count: 2 },
    { key: "LEDGERS", labelAr: "دفاتر الأستاذ والرقابة", labelEn: "Ledgers & Audit", count: 2 },
    { key: "BUDGETS", labelAr: "الموازنات والانحرافات", labelEn: "Budgets & Control", count: 1 },
  ];

  return (
    <div className="space-y-6">
      {/* ──────────────────────────────────────────────────────────────────────────
          EXECUTIVE FINANCIAL PULSE BANNER (CLEAN LIGHT DESIGN)
          ────────────────────────────────────────────────────────────────────────── */}
      <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-5 pb-6 border-b border-slate-100 dark:border-slate-800">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="flex size-2 rounded-full bg-emerald-500 animate-pulse" />
              <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-900 text-[10px] font-bold">
                {isAr ? "منظومة التقارير الحية والمعتمدة IFRS" : "Live IFRS Statutory Reports"}
              </Badge>
            </div>
            <h1 className="text-xl font-black tracking-tight text-slate-950 dark:text-white">
              {isAr ? "المؤشرات والأداء المالي للمنشأة" : "Executive Financial Summary"}
            </h1>
            <p className="text-xs text-slate-500 font-medium mt-1 max-w-xl">
              {isAr
                ? `بيانات الأداء المالي الحية لمنشأة «${organizationName}» مستخرجة آلياً من القيود والدفاتر المحاسبية.`
                : `Live statutory financial performance indicators for ${organizationName}.`}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/admin"
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 transition-all shadow-sm"
            >
              <Palette className="size-3.5 text-purple-600 dark:text-purple-400" />
              <span>{isAr ? "هوية البراند وألوان الغلاف" : "Brand Identity"}</span>
              <span className="size-2.5 rounded-full border border-slate-300 dark:border-slate-600" style={{ background: activeBrandColor }} />
            </Link>
          </div>
        </div>

        {/* 4 CORE FINANCIAL PULSE CARDS */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 pt-5">
          <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-800/50">
            <div className="flex items-center justify-between text-slate-500 text-xs font-bold">
              <span>{isAr ? "إجمالي الإيرادات" : "Total Revenue"}</span>
              <TrendingUp className="size-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="mt-2 font-mono text-xl font-black text-emerald-600 dark:text-emerald-400">
              {fmt(totalRevenue)}
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5 font-medium">{currency}</div>
          </div>

          <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-800/50">
            <div className="flex items-center justify-between text-slate-500 text-xs font-bold">
              <span>{isAr ? "إجمالي المصروفات" : "Total Expenses"}</span>
              <TrendingDown className="size-4 text-rose-600 dark:text-rose-400" />
            </div>
            <div className="mt-2 font-mono text-xl font-black text-rose-600 dark:text-rose-400">
              {fmt(totalExpense)}
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5 font-medium">{currency}</div>
          </div>

          <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-800/50">
            <div className="flex items-center justify-between text-slate-500 text-xs font-bold">
              <span>{isAr ? "صافي الفائض المالي" : "Net Surplus"}</span>
              <ShieldCheck className="size-4 text-purple-600 dark:text-purple-400" />
            </div>
            <div className={`mt-2 font-mono text-xl font-black ${netSurplus >= 0 ? "text-purple-600 dark:text-purple-400" : "text-amber-600 dark:text-amber-400"}`}>
              {netSurplus >= 0 ? `+${fmt(netSurplus)}` : fmt(netSurplus)}
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5 font-medium">{currency}</div>
          </div>

          <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-800/50">
            <div className="flex items-center justify-between text-slate-500 text-xs font-bold">
              <span>{isAr ? "السيولة والنقدية" : "Cash Position"}</span>
              <Wallet className="size-4 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="mt-2 font-mono text-xl font-black text-blue-600 dark:text-blue-400">
              {fmt(cashPosition)}
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5 font-medium">{currency}</div>
          </div>
        </div>
      </div>

      {/* ──────────────────────────────────────────────────────────────────────────
          CATEGORY TABS & INSTANT SEARCH
          ────────────────────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
        <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
          {categories.map((cat) => {
            const isSelected = selectedCategory === cat.key;
            return (
              <button
                key={cat.key}
                onClick={() => setSelectedCategory(cat.key)}
                className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl transition-all ${
                  isSelected
                    ? "bg-slate-900 text-white shadow-md dark:bg-white dark:text-slate-900"
                    : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-400 dark:hover:bg-slate-800"
                }`}
              >
                <span>{isAr ? cat.labelAr : cat.labelEn}</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${isSelected ? "bg-white/20 text-white dark:bg-slate-900/20 dark:text-slate-900" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"}`}>
                  {cat.count}
                </span>
              </button>
            );
          })}
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={isAr ? "بحث في القوائم والتقارير..." : "Search reports..."}
            className="ps-9 text-xs h-9 bg-white dark:bg-slate-900"
          />
        </div>
      </div>

      {/* ──────────────────────────────────────────────────────────────────────────
          REPORT CARDS GRID
          ────────────────────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredReports.map((r) => {
          const Icon = r.icon;
          return (
            <Link
              key={r.id}
              href={r.href}
              className="group relative flex flex-col justify-between rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm transition-all hover:border-purple-300 hover:shadow-lg dark:border-slate-800 dark:bg-slate-900 dark:hover:border-purple-800"
            >
              <div>
                {/* CARD TOP BAR */}
                <div className="flex items-start justify-between gap-3">
                  <div className={`flex size-11 items-center justify-center rounded-2xl bg-gradient-to-br ${r.bgGradient} ${r.colorClass} shadow-inner transition-transform group-hover:scale-110`}>
                    <Icon className="size-5" />
                  </div>

                  <Badge variant={r.badgeVariant} className="text-[10px] font-bold">
                    {isAr ? r.badgeAr : r.badgeEn}
                  </Badge>
                </div>

                {/* CARD CONTENT */}
                <div className="mt-4">
                  <h3 className="text-sm font-black text-slate-950 group-hover:text-purple-600 dark:text-white dark:group-hover:text-purple-400 transition-colors flex items-center gap-1.5">
                    <span>{isAr ? r.titleAr : r.titleEn}</span>
                    <ArrowUpRight className="size-4 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all text-purple-600" />
                  </h3>
                  <p className="mt-1.5 text-xs text-slate-500 line-clamp-2 leading-relaxed">
                    {isAr ? r.descAr : r.descEn}
                  </p>
                </div>
              </div>

              {/* CARD FOOTER */}
              <div className="mt-5 pt-3.5 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-[11px] font-bold text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-300 transition-colors">
                <div className="flex items-center gap-2">
                  <span className="flex items-center gap-1 text-[10px] text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/40 px-2 py-0.5 rounded-md">
                    <Printer className="size-3" />
                    <span>PDF</span>
                  </span>
                  <span className="flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-md">
                    <FileSpreadsheet className="size-3" />
                    <span>Excel</span>
                  </span>
                </div>

                <span className="text-purple-600 text-xs font-black group-hover:underline">
                  {isAr ? "فتح التقرير ←" : "Open Report →"}
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
