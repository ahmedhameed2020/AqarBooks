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
  const [viewMode, setViewMode] = useState<"SECTIONS" | "GRID" | "LIST">("SECTIONS");
  const [activeBrandColor, setActiveBrandColor] = useState<string>("#1E1B4B");

  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("aqarbooks_brand_color");
      if (saved) setActiveBrandColor(saved);
      const savedView = localStorage.getItem("aqarbooks_reports_view") as "SECTIONS" | "GRID" | "LIST";
      if (savedView) setViewMode(savedView);
    }
  }, []);

  const changeView = (mode: "SECTIONS" | "GRID" | "LIST") => {
    setViewMode(mode);
    if (typeof window !== "undefined") {
      localStorage.setItem("aqarbooks_reports_view", mode);
    }
  };

  const fmt = (n: number) =>
    n.toLocaleString(isAr ? "ar-EG" : "en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  const categories = [
    { key: "ALL", labelAr: "الكل", labelEn: "All", count: ALL_REPORTS.length },
    { key: "REAL_ESTATE", labelAr: "التشغيل والعقارات", labelEn: "Real Estate", count: 6 },
    { key: "STATUTORY", labelAr: "الحسابات الختامية", labelEn: "Statutory", count: 5 },
    { key: "TAX", labelAr: "الضرائب", labelEn: "Tax", count: 1 },
    { key: "TREASURY", labelAr: "الخزينة والسيولة", labelEn: "Treasury", count: 2 },
    { key: "RECEIVABLES", labelAr: "الذمم (AR/AP)", labelEn: "Aging", count: 2 },
    { key: "LEDGERS", labelAr: "الدفاتر والرقابة", labelEn: "Audit", count: 2 },
    { key: "BUDGETS", labelAr: "الموازنات", labelEn: "Budgets", count: 1 },
  ];

  const categoryGroups = [
    {
      key: "REAL_ESTATE",
      titleAr: "🏢 التشغيل العقاري والمشاريع والملاك",
      titleEn: "🏢 Real Estate Operations & Owners",
      descAr: "حصر الإشغال، الإيجارات، توزيعات الملاك، رسوم الخدمات المشتركة والصيانة",
      descEn: "Occupancy, rent rolls, owner distributions, CAM, and lease churn",
      color: "border-indigo-200 dark:border-indigo-900 bg-indigo-50/20",
    },
    {
      key: "STATUTORY",
      titleAr: "⚖️ القوائم المالية الختامية والأصول الرأسمالية (IFRS)",
      titleEn: "⚖️ Statutory Statements & Fixed Assets (IFRS)",
      descAr: "ميزان المراجعة، الأرباح والخسائر، المركز المالي، التدفقات النقدية، والأصول الثابتة",
      descEn: "Trial balance, P&L, balance sheet, cash flows, and fixed asset schedules",
      color: "border-blue-200 dark:border-blue-900 bg-blue-50/20",
    },
    {
      key: "TREASURY",
      titleAr: "💳 الخزينة وتوقعات السيولة والشيكات",
      titleEn: "💳 Treasury, PDCs & Cash Forecasting",
      descAr: "سجل أوراق القبض والشيكات الآجلة، وتوقعات التدفق النقدي والسيولة لـ 90 يوماً",
      descEn: "Post-dated cheques register and forward-looking 90-day cash runway",
      color: "border-emerald-200 dark:border-emerald-900 bg-emerald-50/20",
    },
    {
      key: "RECEIVABLES",
      titleAr: "📊 الذمم والتحصيل وأعمار الديون (AR / AP)",
      titleEn: "📊 Accounts Receivable & Payable Aging",
      descAr: "تحليل أعمار ديون المستأجرين والوحدات، ومتابعة مستحقات وفواتير الموردين",
      descEn: "Tenant receivables aging and vendor payable maturity analysis",
      color: "border-rose-200 dark:border-rose-900 bg-rose-50/20",
    },
    {
      key: "TAX",
      titleAr: "🏛️ الضرائب والامتثال القانوني",
      titleEn: "🏛️ Tax & Statutory Compliance",
      descAr: "إقرارات ضريبة القيمة المضافة ومطابقة الضرائب الحكومية (ETA / ZATCA)",
      descEn: "VAT return declaration and statutory tax audit schedules",
      color: "border-purple-200 dark:border-purple-900 bg-purple-50/20",
    },
    {
      key: "LEDGERS",
      titleAr: "🛡️ الرقابة والتدقيق الداخلي ودفاتر الأستاذ",
      titleEn: "🛡️ Internal Audit & General Ledgers",
      descAr: "سجل التدقيق والحركات الملغاة ومكافحة التلاعب، ودفتر الأستاذ العام التفصيلي",
      descEn: "Anti-fraud audit log of voids and reversals, and detailed general ledgers",
      color: "border-slate-200 dark:border-slate-800 bg-slate-50/40",
    },
    {
      key: "BUDGETS",
      titleAr: "🎯 الموازنات التقديرية والانحرافات",
      titleEn: "🎯 Fiscal Budgets & Variance Analysis",
      descAr: "مقارنة الصرف الفعلي بالأهداف المعتمدة واحتساب نسب الانحراف والوفر",
      descEn: "Approved fiscal budget targets vs actuals and variance tracking",
      color: "border-violet-200 dark:border-violet-900 bg-violet-50/20",
    },
  ];

  const filteredReports = useMemo(() => {
    return ALL_REPORTS.filter((r) => {
      if (selectedCategory !== "ALL" && r.category !== selectedCategory) return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      return (
        r.titleAr.toLowerCase().includes(q) ||
        r.titleEn.toLowerCase().includes(q) ||
        r.descAr.toLowerCase().includes(q) ||
        r.descEn.toLowerCase().includes(q) ||
        r.badgeAr.toLowerCase().includes(q)
      );
    });
  }, [selectedCategory, searchQuery]);

  // Top 4 Quick Launch Pinned Reports
  const quickLaunchReports = useMemo(() => {
    const quickIds = ["rent-roll", "trial-balance", "owner-statement", "vat-return"];
    return ALL_REPORTS.filter((r) => quickIds.includes(r.id));
  }, []);

  return (
    <div className="space-y-5 pb-12">
      {/* ──────────────────────────────────────────────────────────────────────────
          1. COMPACT EXECUTIVE PULSE HEADER (SLIM & MODERN)
          ────────────────────────────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-sm font-black">
              <FileSpreadsheet className="size-5 text-emerald-400 dark:text-emerald-600" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-black tracking-tight text-slate-950 dark:text-white">
                  {isAr ? "مركز التقارير والقوائم المالية" : "Financial & Real Estate Reports Hub"}
                </h1>
                <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 text-[10px] font-bold py-0">
                  {ALL_REPORTS.length} {isAr ? "تقريراً معتمداً" : "Reports"}
                </Badge>
              </div>
              <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                {isAr
                  ? `منظومة التقارير الحية المعتمدة لمنشأة «${organizationName}»`
                  : `Live certified statutory & property reports for ${organizationName}.`}
              </p>
            </div>
          </div>

          {/* Quick Metrics Bar (Horizontal Compact) */}
          <div className="flex items-center gap-2 overflow-x-auto text-xs font-mono">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200/70 dark:border-slate-700">
              <TrendingUp className="size-3.5 text-emerald-600 shrink-0" />
              <div>
                <span className="text-[9px] text-slate-400 block font-sans">{isAr ? "الإيرادات" : "Revenue"}</span>
                <span className="font-bold text-emerald-700 dark:text-emerald-400">{fmt(totalRevenue)}</span>
              </div>
            </div>

            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200/70 dark:border-slate-700">
              <TrendingDown className="size-3.5 text-rose-600 shrink-0" />
              <div>
                <span className="text-[9px] text-slate-400 block font-sans">{isAr ? "المصروفات" : "Expenses"}</span>
                <span className="font-bold text-rose-600">{fmt(totalExpense)}</span>
              </div>
            </div>

            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-200/80 dark:border-emerald-900/60">
              <ShieldCheck className="size-3.5 text-emerald-700 shrink-0" />
              <div>
                <span className="text-[9px] text-emerald-800 dark:text-emerald-300 block font-sans">{isAr ? "صافي الفائض" : "Net Surplus"}</span>
                <span className="font-bold text-emerald-700 dark:text-emerald-300">
                  {netSurplus >= 0 ? `+${fmt(netSurplus)}` : fmt(netSurplus)}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-blue-50/60 dark:bg-blue-950/30 border border-blue-200/80 dark:border-blue-900/60">
              <Wallet className="size-3.5 text-blue-700 shrink-0" />
              <div>
                <span className="text-[9px] text-blue-800 dark:text-blue-300 block font-sans">{isAr ? "السيولة" : "Cash"}</span>
                <span className="font-bold text-blue-700 dark:text-blue-300">{fmt(cashPosition)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ──────────────────────────────────────────────────────────────────────────
          2. QUICK LAUNCH PINNED BAR (TOP 4 FREQUENT REPORTS)
          ────────────────────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white p-3 px-4 rounded-2xl shadow-sm">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-amber-400 shrink-0 animate-pulse" />
          <span className="text-xs font-black tracking-wide">
            {isAr ? "التقارير الأكثر استخداماً (Quick Launch):" : "Most Frequently Used Reports:"}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          {quickLaunchReports.map((qr) => {
            const QIcon = qr.icon;
            return (
              <Link
                key={qr.id}
                href={qr.href}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 text-[11px] font-bold text-white transition-all backdrop-blur-xs shadow-2xs hover:scale-102"
              >
                <QIcon className="size-3.5 text-emerald-400" />
                <span>{isAr ? qr.titleAr.split("(")[0].trim() : qr.titleEn}</span>
                <ArrowUpRight className="size-3 opacity-60" />
              </Link>
            );
          })}
        </div>
      </div>

      {/* ──────────────────────────────────────────────────────────────────────────
          3. CONTROLS: CATEGORIES, INSTANT SEARCH, AND VIEW SWITCHER
          ────────────────────────────────────────────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
        {/* Category Pills */}
        <div className="flex items-center gap-1 overflow-x-auto w-full lg:w-auto pb-1 lg:pb-0 scrollbar-none">
          {categories.map((cat) => {
            const isSelected = selectedCategory === cat.key;
            return (
              <button
                key={cat.key}
                onClick={() => setSelectedCategory(cat.key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl whitespace-nowrap transition-all ${
                  isSelected
                    ? "bg-slate-900 text-white shadow-xs dark:bg-white dark:text-slate-900"
                    : "bg-slate-50 text-slate-600 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700"
                }`}
              >
                <span>{isAr ? cat.labelAr : cat.labelEn}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                    isSelected
                      ? "bg-white/20 text-white dark:bg-slate-900/20 dark:text-slate-900"
                      : "bg-slate-200/80 text-slate-700 dark:bg-slate-700 dark:text-slate-300"
                  }`}
                >
                  {cat.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Search & View Switcher */}
        <div className="flex items-center gap-2 w-full lg:w-auto justify-between lg:justify-end">
          <div className="relative w-full sm:w-60">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 size-3.5 text-slate-400" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={isAr ? "بحث في 19 تقريراً..." : "Search 19 reports..."}
              className="ps-8 text-xs h-8.5 bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded-xl"
            />
          </div>

          {/* View Mode Toggle Buttons */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shrink-0">
            <button
              onClick={() => changeView("SECTIONS")}
              title={isAr ? "عرض المجموعات المنظمة" : "Sectional View"}
              className={`p-1.5 rounded-lg text-xs font-bold transition-all ${
                viewMode === "SECTIONS"
                  ? "bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-white"
                  : "text-slate-500 hover:text-slate-900 dark:text-slate-400"
              }`}
            >
              <Layers className="size-3.5" />
            </button>
            <button
              onClick={() => changeView("GRID")}
              title={isAr ? "عرض الشبكة المدمجة" : "Grid View"}
              className={`p-1.5 rounded-lg text-xs font-bold transition-all ${
                viewMode === "GRID"
                  ? "bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-white"
                  : "text-slate-500 hover:text-slate-900 dark:text-slate-400"
              }`}
            >
              <div className="grid grid-cols-2 gap-0.5 size-3.5">
                <span className="bg-current rounded-2xs" />
                <span className="bg-current rounded-2xs" />
                <span className="bg-current rounded-2xs" />
                <span className="bg-current rounded-2xs" />
              </div>
            </button>
            <button
              onClick={() => changeView("LIST")}
              title={isAr ? "عرض الجدول والقائمة" : "List View"}
              className={`p-1.5 rounded-lg text-xs font-bold transition-all ${
                viewMode === "LIST"
                  ? "bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-white"
                  : "text-slate-500 hover:text-slate-900 dark:text-slate-400"
              }`}
            >
              <FileText className="size-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* ──────────────────────────────────────────────────────────────────────────
          4A. VIEW 1: CATEGORIZED SECTIONS (MOST INTUITIVE & PROFESSIONAL)
          ────────────────────────────────────────────────────────────────────────── */}
      {viewMode === "SECTIONS" && (
        <div className="space-y-5">
          {categoryGroups.map((group) => {
            const groupReports = filteredReports.filter((r) => r.category === group.key);
            if (groupReports.length === 0) return null;

            return (
              <div
                key={group.key}
                className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900"
              >
                {/* Group Header */}
                <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800 mb-3">
                  <div>
                    <h2 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                      <span>{isAr ? group.titleAr : group.titleEn}</span>
                      <Badge variant="secondary" className="text-[10px] font-mono py-0">
                        {groupReports.length}
                      </Badge>
                    </h2>
                    <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                      {isAr ? group.descAr : group.descEn}
                    </p>
                  </div>
                </div>

                {/* Group Items Grid (Horizontal Compact Cards) */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {groupReports.map((r) => {
                    const Icon = r.icon;
                    return (
                      <Link
                        key={r.id}
                        href={r.href}
                        className="group flex items-start gap-3 p-3 rounded-xl border border-slate-200/70 bg-slate-50/50 hover:bg-white hover:border-slate-400 hover:shadow-md transition-all dark:border-slate-800 dark:bg-slate-800/40 dark:hover:bg-slate-800 dark:hover:border-slate-600"
                      >
                        <div
                          className={`flex size-10 items-center justify-center rounded-xl bg-gradient-to-br ${r.bgGradient} ${r.colorClass} shrink-0 shadow-2xs group-hover:scale-105 transition-transform`}
                        >
                          <Icon className="size-5" />
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1">
                            <h3 className="text-xs font-bold text-slate-900 group-hover:text-indigo-600 dark:text-white dark:group-hover:text-indigo-400 truncate transition-colors">
                              {isAr ? r.titleAr : r.titleEn}
                            </h3>
                            <ArrowUpRight className="size-3.5 text-slate-400 group-hover:text-indigo-600 shrink-0 group-hover:translate-x-0.5 transition-all" />
                          </div>

                          <p className="text-[11px] text-slate-500 line-clamp-1 mt-0.5 leading-normal">
                            {isAr ? r.descAr : r.descEn}
                          </p>

                          <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-200/50 dark:border-slate-700/50">
                            <Badge
                              variant="outline"
                              className="text-[9px] font-bold px-1.5 py-0 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700"
                            >
                              {isAr ? r.badgeAr : r.badgeEn}
                            </Badge>

                            <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-medium">
                              <span className="text-emerald-600 font-bold">Excel</span>
                              <span>·</span>
                              <span className="text-rose-600 font-bold">PDF</span>
                            </div>
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────────────────────
          4B. VIEW 2: COMPACT MODERN GRID (MINIMALIST & SLIM)
          ────────────────────────────────────────────────────────────────────────── */}
      {viewMode === "GRID" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {filteredReports.map((r) => {
            const Icon = r.icon;
            return (
              <Link
                key={r.id}
                href={r.href}
                className="group flex flex-col justify-between p-3.5 rounded-2xl border border-slate-200/80 bg-white hover:border-indigo-400 hover:shadow-md transition-all dark:border-slate-800 dark:bg-slate-900 dark:hover:border-indigo-700"
              >
                <div>
                  <div className="flex items-center justify-between mb-2.5">
                    <div
                      className={`flex size-9 items-center justify-center rounded-xl bg-gradient-to-br ${r.bgGradient} ${r.colorClass} shadow-2xs`}
                    >
                      <Icon className="size-4.5" />
                    </div>
                    <Badge variant="outline" className="text-[9px] font-bold bg-slate-50 dark:bg-slate-800">
                      {isAr ? r.badgeAr : r.badgeEn}
                    </Badge>
                  </div>

                  <h3 className="text-xs font-bold text-slate-900 group-hover:text-indigo-600 dark:text-white dark:group-hover:text-indigo-400 transition-colors line-clamp-1">
                    {isAr ? r.titleAr : r.titleEn}
                  </h3>
                  <p className="text-[10px] text-slate-500 line-clamp-2 mt-1 leading-relaxed">
                    {isAr ? r.descAr : r.descEn}
                  </p>
                </div>

                <div className="flex items-center justify-between mt-3 pt-2 border-t border-slate-100 dark:border-slate-800 text-[10px] font-bold">
                  <div className="flex items-center gap-1 text-slate-400">
                    <span>PDF</span>
                    <span>/</span>
                    <span>XLS</span>
                  </div>
                  <span className="text-indigo-600 group-hover:underline flex items-center gap-0.5">
                    {isAr ? "فتح" : "Open"}
                    <ArrowUpRight className="size-3" />
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────────────────────
          4C. VIEW 3: COMPACT DATA TABLE / LIST (DENSE & FAST)
          ────────────────────────────────────────────────────────────────────────── */}
      {viewMode === "LIST" && (
        <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-start">
              <thead className="bg-slate-50/90 text-slate-800 dark:bg-slate-800 dark:text-slate-200 font-extrabold border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="p-3 text-start">{isAr ? "اسم التقرير والقائمة المالية" : "Report Name"}</th>
                  <th className="p-3 text-start">{isAr ? "التصنيف والمحور" : "Category"}</th>
                  <th className="p-3 text-start">{isAr ? "الوصف المختصر" : "Summary"}</th>
                  <th className="p-3 text-center">{isAr ? "الاعتماد" : "Status"}</th>
                  <th className="p-3 text-end">{isAr ? "فتح التقرير" : "Action"}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredReports.map((r) => {
                  const Icon = r.icon;
                  return (
                    <tr
                      key={r.id}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors group"
                    >
                      <td className="p-3 font-bold text-slate-900 dark:text-white">
                        <Link href={r.href} className="flex items-center gap-2 hover:text-indigo-600">
                          <div
                            className={`flex size-7 items-center justify-center rounded-lg bg-gradient-to-br ${r.bgGradient} ${r.colorClass} shrink-0`}
                          >
                            <Icon className="size-3.5" />
                          </div>
                          <span>{isAr ? r.titleAr : r.titleEn}</span>
                        </Link>
                      </td>

                      <td className="p-3 text-slate-600 dark:text-slate-400 font-medium">
                        {r.category === "REAL_ESTATE" && (isAr ? "التشغيل العقاري" : "Real Estate")}
                        {r.category === "STATUTORY" && (isAr ? "الحسابات الختامية" : "Statutory")}
                        {r.category === "TAX" && (isAr ? "الضرائب والامتثال" : "Tax")}
                        {r.category === "TREASURY" && (isAr ? "الخزينة والسيولة" : "Treasury")}
                        {r.category === "RECEIVABLES" && (isAr ? "الذمم والتحصيل" : "Aging")}
                        {r.category === "LEDGERS" && (isAr ? "الدفاتر والرقابة" : "Ledgers")}
                        {r.category === "BUDGETS" && (isAr ? "الموازنات" : "Budgets")}
                      </td>

                      <td className="p-3 text-slate-500 max-w-sm truncate text-[11px]">
                        {isAr ? r.descAr : r.descEn}
                      </td>

                      <td className="p-3 text-center">
                        <Badge variant="outline" className="text-[10px] bg-slate-50 dark:bg-slate-800">
                          {isAr ? r.badgeAr : r.badgeEn}
                        </Badge>
                      </td>

                      <td className="p-3 text-end">
                        <Link
                          href={r.href}
                          className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-slate-100 hover:bg-indigo-600 hover:text-white text-slate-700 font-bold text-[11px] transition-all dark:bg-slate-800 dark:text-slate-200"
                        >
                          <span>{isAr ? "استعراض" : "View"}</span>
                          <ArrowUpRight className="size-3" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
