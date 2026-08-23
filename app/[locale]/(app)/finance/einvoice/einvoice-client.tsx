"use client";

import { useState, useMemo, useTransition } from "react";
import { Link } from "@/i18n/navigation";
import {
  FileCheck2,
  ShieldCheck,
  Building2,
  Calendar,
  Layers,
  DollarSign,
  AlertCircle,
  CheckCircle2,
  Clock,
  Landmark,
  FileText,
  Percent,
  Search,
  Scale,
  RefreshCw,
  Globe,
  Settings,
  ExternalLink,
  Plus,
  Printer,
  FileSpreadsheet,
  QrCode,
  Eye,
  Zap,
  Tag,
  Receipt,
  User,
  MapPin,
  Check,
  X,
  HelpCircle,
  Share2,
  Mail,
  MessageCircle,
  Download,
  Copy,
  ArrowUpDown,
  Filter,
  Sparkles,
  Info,
  BadgeCheck,
  ShieldAlert,
  ArrowUpRight,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { issueDueAction } from "@/lib/actions/receivables";
import { generateFinancialStatementPdf } from "@/lib/reports/financial-statements-pdf";
import { exportFinancialStatementToExcel } from "@/lib/reports/financial-excel-export";
import { getCurrencyLabel } from "@/lib/currency";

export type TaxDecisionItem = {
  id: string;
  source_type: string;
  source_id: string;
  unit_code?: string;
  unit_id?: string;
  owner_name?: string;
  description?: string;
  nature_name: string;
  taxable_base: number;
  vat_rate: number;
  vat_amount: number;
  gross_amount: number;
  decided_at: string;
  is_exempt: boolean;
};

export type RevenueNatureItem = {
  code: string;
  name_ar: string;
  name_en: string;
  is_derived: boolean;
  standard_rate?: string;
};

export type EInvoiceProfileData = {
  id: string;
  jurisdiction: string;
  environment: string;
  taxpayer_id: string | null;
  branch_code?: string | null;
  activity_code?: string | null;
  status: string;
  enabled: boolean;
  verified_at?: string | null;
  last_verification_error?: string | null;
  updated_at?: string | null;
};

export type FormOption = { id: string; label: string };

export const JURISDICTION_INFO: Record<
  string,
  {
    arName: string;
    enName: string;
    authorityAr: string;
    authorityEn: string;
    flag: string;
    standardVat: string;
    portalNameAr: string;
    portalNameEn: string;
  }
> = {
  EG: {
    arName: "جمهورية مصر العربية",
    enName: "Egypt",
    authorityAr: "مصلحة الضرائب المصرية (منظومة الفاتورة والإيصال الإلكتروني - ETA)",
    authorityEn: "Egyptian Tax Authority (ETA E-Invoicing & E-Receipt)",
    flag: "🇪🇬",
    standardVat: "14%",
    portalNameAr: "البوابة الإلكترونية لمصلحة الضرائب المصرية",
    portalNameEn: "ETA Taxpayer Portal",
  },
  EG_ETA: {
    arName: "جمهورية مصر العربية",
    enName: "Egypt",
    authorityAr: "مصلحة الضرائب المصرية (منظومة الفاتورة والإيصال الإلكتروني - ETA)",
    authorityEn: "Egyptian Tax Authority (ETA E-Invoicing & E-Receipt)",
    flag: "🇪🇬",
    standardVat: "14%",
    portalNameAr: "البوابة الإلكترونية لمصلحة الضرائب المصرية",
    portalNameEn: "ETA Taxpayer Portal",
  },
  SA: {
    arName: "المملكة العربية السعودية",
    enName: "Saudi Arabia",
    authorityAr: "هيئة الزكاة والضريبة والجمارك (منظومة فاتورة - ZATCA)",
    authorityEn: "Zakat, Tax and Customs Authority (ZATCA Fatoora)",
    flag: "🇸🇦",
    standardVat: "15%",
    portalNameAr: "بوابة زاتكا للفوترة الإلكترونية (فاتورة)",
    portalNameEn: "ZATCA Fatoora Portal",
  },
  SA_ZATCA: {
    arName: "المملكة العربية السعودية",
    enName: "Saudi Arabia",
    authorityAr: "هيئة الزكاة والضريبة والجمارك (منظومة فاتورة - ZATCA)",
    authorityEn: "Zakat, Tax and Customs Authority (ZATCA Fatoora)",
    flag: "🇸🇦",
    standardVat: "15%",
    portalNameAr: "بوابة زاتكا للفوترة الإلكترونية (فاتورة)",
    portalNameEn: "ZATCA Fatoora Portal",
  },
  AE: {
    arName: "دولة الإمارات العربية المتحدة",
    enName: "United Arab Emirates",
    authorityAr: "الهيئة الاتحادية للضرائب (شبكة الفوترة الإلكترونية PEPPOL)",
    authorityEn: "Federal Tax Authority (FTA PEPPOL Network)",
    flag: "🇦🇪",
    standardVat: "5%",
    portalNameAr: "بوابة الهيئة الاتحادية للضرائب",
    portalNameEn: "FTA Tax Portal",
  },
  AE_PEPPOL: {
    arName: "دولة الإمارات العربية المتحدة",
    enName: "United Arab Emirates",
    authorityAr: "الهيئة الاتحادية للضرائب (شبكة الفوترة الإلكترونية PEPPOL)",
    authorityEn: "Federal Tax Authority (FTA PEPPOL Network)",
    flag: "🇦🇪",
    standardVat: "5%",
    portalNameAr: "بوابة الهيئة الاتحادية للضرائب",
    portalNameEn: "FTA Tax Portal",
  },
};

export function EInvoiceClient({
  taxDecisions,
  revenueNatures,
  profiles = [],
  organizationId,
  organizationName,
  organizationJurisdiction = "EG",
  organizationTaxId,
  organizationAddress,
  organizationPhone,
  currency = "EGP",
  locale,
  resorts = [],
  units = [],
  dueTypes = [],
  receivableAccounts = [],
  periods = [],
  profilesSlot,
}: {
  taxDecisions: TaxDecisionItem[];
  revenueNatures: RevenueNatureItem[];
  profiles?: EInvoiceProfileData[];
  organizationId: string;
  organizationName: string;
  organizationJurisdiction?: string;
  organizationTaxId?: string | null;
  organizationAddress?: string | null;
  organizationPhone?: string | null;
  currency?: string;
  locale: string;
  resorts?: FormOption[];
  units?: (FormOption & { propertyId?: string; ownerName?: string })[];
  dueTypes?: FormOption[];
  receivableAccounts?: FormOption[];
  periods?: FormOption[];
  profilesSlot?: React.ReactNode;
}) {
  const isAr = locale === "ar";
  const currencyLabel = getCurrencyLabel(currency, isAr);
  const toast = useToast();
  const [isPending, startTransition] = useTransition();

  const [activeTab, setActiveTab] = useState<"DECISIONS" | "PROFILES" | "NATURES" | "GUIDE">("DECISIONS");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterTaxTreatment, setFilterTaxTreatment] = useState<"ALL" | "TAXABLE" | "EXEMPT">("ALL");
  const [sortBy, setSortBy] = useState<"NEWEST" | "HIGHEST_AMOUNT">("NEWEST");

  // Create Invoice Modal state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedResortId, setSelectedResortId] = useState(resorts[0]?.id || "");
  const [selectedUnitId, setSelectedUnitId] = useState(units[0]?.id || "");
  const [selectedDueTypeId, setSelectedDueTypeId] = useState(dueTypes[0]?.id || "");
  const [selectedReceivableAccountId, setSelectedReceivableAccountId] = useState(receivableAccounts[0]?.id || "");
  const [selectedPeriodId, setSelectedPeriodId] = useState(periods[0]?.id || "");
  const [invoiceAmount, setInvoiceAmount] = useState<number | "">("");
  const [invoiceDescription, setInvoiceDescription] = useState("");
  const [issueDate, setIssueDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState(
    new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)
  );

  // View / Print Tax Invoice Modal state
  const [viewInvoiceDecision, setViewInvoiceDecision] = useState<TaxDecisionItem | null>(null);
  const [copiedInvoiceId, setCopiedInvoiceId] = useState<string | null>(null);

  const currentJur = JURISDICTION_INFO[organizationJurisdiction] || JURISDICTION_INFO.EG;

  // Active profiles count and status
  const activeProfilesCount = profiles.filter((p) => p.enabled).length;
  const verifiedProfilesCount = profiles.filter((p) => Boolean(p.verified_at)).length;

  // Filtered units based on selected resort
  const filteredUnits = useMemo(() => {
    if (!selectedResortId) return units;
    const matched = units.filter((u) => !u.propertyId || u.propertyId === selectedResortId);
    return matched.length > 0 ? matched : units;
  }, [units, selectedResortId]);

  // Tax calculation helper for create modal
  const calculatedTax = useMemo(() => {
    const base = Number(invoiceAmount) || 0;
    const isExempt = false;
    const rate = isExempt
      ? 0
      : organizationJurisdiction.startsWith("SA")
      ? 15
      : organizationJurisdiction.startsWith("AE")
      ? 5
      : 14;
    const vat = (base * rate) / 100;
    const gross = base + vat;
    return { base, rate, vat, gross };
  }, [invoiceAmount, organizationJurisdiction]);

  // Filtered & Sorted Decisions
  const filteredDecisions = useMemo(() => {
    let list = [...taxDecisions];

    // Filter by tax treatment
    if (filterTaxTreatment === "TAXABLE") {
      list = list.filter((td) => !td.is_exempt && td.vat_rate > 0);
    } else if (filterTaxTreatment === "EXEMPT") {
      list = list.filter((td) => td.is_exempt || td.vat_rate === 0);
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (td) =>
          td.id.toLowerCase().includes(q) ||
          (td.unit_code || "").toLowerCase().includes(q) ||
          (td.owner_name || "").toLowerCase().includes(q) ||
          (td.description || "").toLowerCase().includes(q) ||
          td.nature_name.toLowerCase().includes(q) ||
          td.decided_at.includes(q)
      );
    }

    // Sort
    if (sortBy === "HIGHEST_AMOUNT") {
      list.sort((a, b) => b.gross_amount - a.gross_amount);
    } else {
      list.sort((a, b) => new Date(b.decided_at).getTime() - new Date(a.decided_at).getTime());
    }

    return list;
  }, [taxDecisions, searchQuery, filterTaxTreatment, sortBy]);

  const filteredNatures = useMemo(() => {
    if (!searchQuery.trim()) return revenueNatures;
    const q = searchQuery.toLowerCase().trim();
    return revenueNatures.filter(
      (n) =>
        n.name_ar.includes(q) ||
        n.name_en.toLowerCase().includes(q) ||
        n.code.toLowerCase().includes(q)
    );
  }, [revenueNatures, searchQuery]);

  // Aggregate stats
  const totalTaxableBase = useMemo(() => {
    return taxDecisions.reduce((sum, td) => sum + td.taxable_base, 0);
  }, [taxDecisions]);

  const totalVatAmount = useMemo(() => {
    return taxDecisions.reduce((sum, td) => sum + td.vat_amount, 0);
  }, [taxDecisions]);

  const totalGrossAmount = useMemo(() => {
    return taxDecisions.reduce((sum, td) => sum + td.gross_amount, 0);
  }, [taxDecisions]);

  const exemptDecisionsCount = useMemo(() => {
    return taxDecisions.filter((td) => td.is_exempt || td.vat_rate === 0).length;
  }, [taxDecisions]);

  // Copy invoice ID
  const handleCopyInvoiceId = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopiedInvoiceId(id);
    toast?.add({
      type: "success",
      title: isAr ? "تم نسخ المعرف" : "ID Copied",
      description: id,
    });
    setTimeout(() => setCopiedInvoiceId(null), 2000);
  };

  // Handle Form Submission for Create E-Invoice
  const handleIssueInvoiceSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const effectiveResortId = selectedResortId || resorts[0]?.id;
    const effectiveUnitId = selectedUnitId || filteredUnits[0]?.id || units[0]?.id;
    const effectiveDueTypeId = selectedDueTypeId || dueTypes[0]?.id;
    const effectivePeriodId = selectedPeriodId || periods[0]?.id;

    if (!effectiveResortId || !effectiveUnitId || !effectiveDueTypeId || !effectivePeriodId || !invoiceAmount) {
      toast?.add({
        type: "error",
        title: isAr ? "يرجى تعبئة كافة الحقول المطلوبة" : "Missing Required Fields",
        description: isAr ? "تأكد من اختيار الوحدة، نوع المطالبة، المبلغ، والفترة المالية." : "Please fill in all mandatory invoice fields.",
      });
      return;
    }

    const formData = new FormData();
    formData.append("organizationId", organizationId);
    formData.append("resortId", effectiveResortId);
    formData.append("unitId", effectiveUnitId);
    formData.append("dueTypeId", effectiveDueTypeId);
    formData.append("receivableAccountId", selectedReceivableAccountId || (receivableAccounts[0]?.id || ""));
    formData.append("fiscalPeriodId", effectivePeriodId);
    formData.append("amount", String(invoiceAmount));
    formData.append("issueDate", issueDate);
    formData.append("dueDate", dueDate);
    if (invoiceDescription) formData.append("description", invoiceDescription);

    startTransition(async () => {
      const res = await issueDueAction({ ok: true }, formData);
      if (res.ok) {
        toast?.add({
          type: "success",
          title: isAr ? "تم إصدار الفاتورة الضريبية الإلكترونية بنجاح" : "E-Invoice Issued Successfully",
          description: isAr
            ? `تم قيد الفاتورة بمبلغ ${Number(invoiceAmount).toLocaleString()} ${currencyLabel} وتوليد القرار الضريبي وختمه.`
            : `Invoice recorded with amount ${invoiceAmount} ${currencyLabel} and tax decision stamped.`,
        });
        setIsCreateModalOpen(false);
        setInvoiceAmount("");
        setInvoiceDescription("");
      } else {
        toast?.add({
          type: "error",
          title: isAr ? "تعذر إصدار الفاتورة" : "Invoice Issuance Failed",
          description: res.error || (isAr ? "حدث خطأ غير متوقع أثناء المعالجة" : "Unknown error"),
        });
      }
    });
  };

  // WhatsApp Share
  const handleShareInvoiceWhatsApp = (td: TaxDecisionItem) => {
    const invNumber = td.id.slice(0, 8).toUpperCase();
    const unit = td.unit_code || `#${td.source_id.slice(0, 8)}`;
    const text = isAr
      ? `📄 *فاتورة ضريبية إلكترونية معتمدة*\n` +
        `🏢 *المنشأة الموردة:* ${organizationName}\n` +
        `🔢 *الرقم الضريبي:* ${organizationTaxId || "—"}\n` +
        `🏷️ *رقم الفاتورة:* #${invNumber}\n` +
        `🏠 *الوحدة:* ${unit}\n` +
        `📋 *البيان:* ${td.nature_name}\n` +
        `💵 *الوعاء الصافي:* ${td.taxable_base.toLocaleString()} ${currencyLabel}\n` +
        `📊 *ضريبة القيمة المضافة (${td.vat_rate}%):* ${td.vat_amount.toLocaleString()} ${currencyLabel}\n` +
        `💳 *الإجمالي النهائي المستحق:* ${td.gross_amount.toLocaleString()} ${currencyLabel}\n` +
        `📅 *تاريخ الإصدار:* ${td.decided_at}\n\n` +
        `✅ *حالة الفاتورة:* مختومة ضريبياً وفقاً لمعايير منظومة الفوترة الإلكترونية.`
      : `📄 *Statutory Tax Invoice*\n` +
        `🏢 *Seller:* ${organizationName}\n` +
        `🔢 *Tax ID:* ${organizationTaxId || "—"}\n` +
        `🏷️ *Invoice #:* #${invNumber}\n` +
        `🏠 *Unit:* ${unit}\n` +
        `📋 *Item:* ${td.nature_name}\n` +
        `💵 *Taxable Base:* ${td.taxable_base.toLocaleString()} ${currencyLabel}\n` +
        `📊 *VAT (${td.vat_rate}%):* ${td.vat_amount.toLocaleString()} ${currencyLabel}\n` +
        `💳 *Gross Payable:* ${td.gross_amount.toLocaleString()} ${currencyLabel}\n` +
        `📅 *Date:* ${td.decided_at}\n\n` +
        `✅ *Status:* Stamped & Legally Validated.`;

    const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  // Email Share
  const handleShareInvoiceEmail = (td: TaxDecisionItem) => {
    const invNumber = td.id.slice(0, 8).toUpperCase();
    const unit = td.unit_code || `#${td.source_id.slice(0, 8)}`;
    const subject = isAr
      ? `فاتورة ضريبية إلكترونية رقم #${invNumber} — ${unit} — ${organizationName}`
      : `Tax Invoice #${invNumber} — ${unit} — ${organizationName}`;

    const body = isAr
      ? `السيد/ة المحترم/ة،\n\nنرفق لكم تفاصيل الفاتورة الضريبية الإلكترونية المعتمدة:\n\n` +
        `• رقم الفاتورة: #${invNumber}\n` +
        `• الوحدة المستفيدة: ${unit}\n` +
        `• البيان: ${td.nature_name}\n` +
        `• تاريخ الإصدار: ${td.decided_at}\n` +
        `• الوعاء الصافي: ${td.taxable_base.toLocaleString()} ${currencyLabel}\n` +
        `• ضريبة القيمة المضافة (${td.vat_rate}%): ${td.vat_amount.toLocaleString()} ${currencyLabel}\n` +
        `• الإجمالي النهائي: ${td.gross_amount.toLocaleString()} ${currencyLabel}\n\n` +
        `شاكرين لكم حسن تعاونكم،\n${organizationName}`
      : `Dear Client,\n\nPlease find the details for statutory tax invoice #${invNumber}:\n\n` +
        `• Invoice Number: #${invNumber}\n` +
        `• Unit: ${unit}\n` +
        `• Item: ${td.nature_name}\n` +
        `• Date: ${td.decided_at}\n` +
        `• Taxable Base: ${td.taxable_base.toLocaleString()} ${currencyLabel}\n` +
        `• VAT (${td.vat_rate}%): ${td.vat_amount.toLocaleString()} ${currencyLabel}\n` +
        `• Gross Total: ${td.gross_amount.toLocaleString()} ${currencyLabel}\n\n` +
        `Best regards,\n${organizationName}`;

    const mailtoUrl = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = mailtoUrl;
  };

  // Single Invoice PDF Export
  const handleExportSingleInvoicePdf = (td: TaxDecisionItem) => {
    const invNumber = td.id.slice(0, 8).toUpperCase();
    generateFinancialStatementPdf({
      title: isAr ? "فاتورة ضريبية إلكترونية معتمدة" : "Statutory Tax Invoice",
      subtitle: isAr
        ? `فاتورة رقم #${invNumber} — ${td.unit_code || `#${td.source_id.slice(0, 8)}`}`
        : `Invoice #${invNumber} — ${td.unit_code || `#${td.source_id.slice(0, 8)}`}`,
      organizationName,
      taxNumber: organizationTaxId || undefined,
      currencyLabel,
      dateRangeLabel: td.decided_at,
      columns: [
        { header: isAr ? "البيان / البند الضريبي" : "Description / Tax Nature", key: "item", align: "start" },
        { header: isAr ? "الوعاء الصافي" : "Taxable Base", key: "base", align: "end", isNumber: true },
        { header: isAr ? "نسبة الضريبة" : "VAT Rate", key: "rate", align: "center" },
        { header: isAr ? "مبلغ الضريبة" : "VAT Amount", key: "vat", align: "end", isNumber: true },
        { header: isAr ? "الإجمالي بالضريبة" : "Gross Total", key: "gross", align: "end", isNumber: true },
      ],
      rows: [
        {
          item: td.nature_name,
          base: td.taxable_base.toLocaleString(undefined, { minimumFractionDigits: 2 }),
          rate: `${td.vat_rate}%`,
          vat: td.vat_amount.toLocaleString(undefined, { minimumFractionDigits: 2 }),
          gross: td.gross_amount.toLocaleString(undefined, { minimumFractionDigits: 2 }),
        },
      ],
      summaryCards: [
        { label: isAr ? "صافي الوعاء" : "Net Base", value: `${td.taxable_base.toLocaleString()} ${currencyLabel}` },
        { label: isAr ? `الضريبة (${td.vat_rate}%)` : `VAT (${td.vat_rate}%)`, value: `${td.vat_amount.toLocaleString()} ${currencyLabel}` },
        { label: isAr ? "الإجمالي النهائي" : "Gross Total", value: `${td.gross_amount.toLocaleString()} ${currencyLabel}` },
      ],
      filename: `Tax_Invoice_${invNumber}_${td.decided_at}.pdf`,
    });
  };

  // Full Register Excel Export
  const handleExportExcel = () => {
    const rows = filteredDecisions.map((td) => ({
      unit: td.unit_code || `#${td.source_id.slice(0, 8)}`,
      nature: td.nature_name,
      date: td.decided_at,
      base: td.taxable_base,
      rate: `${td.vat_rate}%`,
      vat: td.vat_amount,
      gross: td.gross_amount,
      status: td.is_exempt ? (isAr ? "معفى 0%" : "Exempt") : isAr ? "مختوم ضريبياً" : "Stamped",
    }));

    exportFinancialStatementToExcel({
      title: isAr ? "سجل الفواتير والإقرارات الضريبية الإلكترونية" : "Statutory Tax Invoices & Decisions Register",
      organizationName,
      currency: currencyLabel,
      columns: [
        { header: isAr ? "الوحدة / المستند" : "Unit / Document", key: "unit" },
        { header: isAr ? "نوع الإيراد" : "Revenue Nature", key: "nature" },
        { header: isAr ? "تاريخ القرار" : "Decision Date", key: "date" },
        { header: isAr ? "الوعاء الخاضع" : "Taxable Base", key: "base", isNumber: true },
        { header: isAr ? "نسبة الضريبة" : "VAT Rate", key: "rate" },
        { header: isAr ? "مبلغ الضريبة" : "VAT Amount", key: "vat", isNumber: true },
        { header: isAr ? "الإجمالي بالضريبة" : "Gross Total", key: "gross", isNumber: true },
        { header: isAr ? "الحالة" : "Status", key: "status" },
      ],
      rows,
      filename: `Tax_Invoices_${new Date().toISOString().slice(0, 10)}.xlsx`,
    });
  };

  // Full Register PDF Export
  const handleExportPdf = () => {
    const rows = filteredDecisions.map((td) => ({
      unit: td.unit_code || `#${td.source_id.slice(0, 8)}`,
      nature: td.nature_name,
      date: td.decided_at,
      base: td.taxable_base.toLocaleString(undefined, { minimumFractionDigits: 2 }),
      rate: `${td.vat_rate}%`,
      vat: td.vat_amount.toLocaleString(undefined, { minimumFractionDigits: 2 }),
      gross: td.gross_amount.toLocaleString(undefined, { minimumFractionDigits: 2 }),
      status: td.is_exempt ? (isAr ? "معفى 0%" : "Exempt") : isAr ? "مختوم" : "Stamped",
    }));

    generateFinancialStatementPdf({
      title: isAr ? "سجل الفواتير والقرارات الضريبية الإلكترونية" : "Statutory Tax Invoices & Decisions Register",
      subtitle: isAr ? "تقرير الامتثال لمنظومة الفوترة الإلكترونية والإقرارات الضريبية" : "Statutory E-Invoicing Compliance Report",
      organizationName,
      taxNumber: organizationTaxId || undefined,
      currencyLabel,
      dateRangeLabel: new Date().toISOString().slice(0, 10),
      columns: [
        { header: isAr ? "الوحدة / المستند" : "Unit / Doc", key: "unit", align: "start" },
        { header: isAr ? "نوع الإيراد" : "Revenue Nature", key: "nature", align: "start" },
        { header: isAr ? "التاريخ" : "Date", key: "date", align: "center" },
        { header: isAr ? "الوعاء الصافي" : "Base", key: "base", align: "end", isNumber: true },
        { header: isAr ? "النسبة" : "Rate", key: "rate", align: "center" },
        { header: isAr ? "الضريبة" : "VAT", key: "vat", align: "end", isNumber: true },
        { header: isAr ? "الإجمالي" : "Gross", key: "gross", align: "end", isNumber: true },
        { header: isAr ? "الحالة" : "Status", key: "status", align: "center" },
      ],
      rows,
      summaryCards: [
        { label: isAr ? "إجمالي الفواتير" : "Total Invoices", value: `${taxDecisions.length}` },
        {
          label: isAr ? "إجمالي الضريبة" : "Total VAT",
          value: `${totalVatAmount.toLocaleString()} ${currencyLabel}`,
        },
        {
          label: isAr ? "الإجمالي الشامل" : "Gross Total",
          value: `${totalGrossAmount.toLocaleString()} ${currencyLabel}`,
        },
      ],
      filename: `Tax_Invoices_${new Date().toISOString().slice(0, 10)}.pdf`,
    });
  };

  return (
    <div className="space-y-6 pb-12">
      {/* ──────────────────────────────────────────────────────────────────────────
          EXECUTIVE HERO HEADER & WORKSPACE TOOLBAR
          ────────────────────────────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-3xl border border-slate-200/90 bg-gradient-to-b from-white via-slate-50/60 to-slate-100/40 p-6 sm:p-8 shadow-sm dark:border-slate-800 dark:from-slate-900 dark:via-slate-900/90 dark:to-slate-950">
        {/* Subtle background glow effect */}
        <div className="pointer-events-none absolute -end-24 -top-24 size-96 rounded-full bg-purple-500/10 blur-3xl dark:bg-purple-500/15" />
        <div className="pointer-events-none absolute -start-24 -bottom-24 size-96 rounded-full bg-indigo-500/10 blur-3xl dark:bg-indigo-500/15" />

        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2.5">
            {/* Breadcrumb & Jurisdiction Badges */}
            <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
              <span className="flex size-7 items-center justify-center rounded-xl bg-purple-100/80 dark:bg-purple-950/80 text-purple-700 dark:text-purple-300 shadow-2xs">
                <Landmark className="size-4 text-purple-600 dark:text-purple-400" />
              </span>
              <span className="text-purple-700 dark:text-purple-300 font-extrabold">{isAr ? "الإدارة المالية والضريبية" : "Tax & Finance"}</span>
              <span className="text-slate-300 dark:text-slate-700">/</span>
              <span className="text-slate-900 dark:text-white font-black">
                {isAr ? "منظومة الفوترة الإلكترونية والإقرارات" : "E-Invoicing & Statutory Compliance"}
              </span>
              <span className="ms-1 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-slate-900 text-white dark:bg-slate-800 dark:text-slate-200 text-[10px] font-mono font-bold shadow-2xs">
                <span>{currentJur.flag}</span>
                <span>{currentJur.arName}</span>
                <span>• {currentJur.standardVat} VAT</span>
              </span>
            </div>

            <h1 className="text-2xl font-black tracking-tight text-slate-950 dark:text-white sm:text-3xl lg:text-4xl">
              {isAr ? "الفوترة والإقرارات الضريبية الإلكترونية" : "E-Invoicing & Statutory Tax Compliance"}
            </h1>

            <p className="max-w-2xl text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-400 leading-relaxed">
              {isAr
                ? "إصدار الفواتير الضريبية المعتمدة للوحدات العقارية، احتساب الوعاء والضريبة آلياً، والتكامل اللحظي مع منظومة الفاتورة والإيصال الإلكتروني (ETA بمصر) وهيئة الزكاة والضريبة والجمارك (ZATCA بالسعودية)."
                : "Issue statutory real estate tax invoices, auto-calculate VAT rates, and synchronize in real-time with ETA (Egypt) & ZATCA (Saudi Arabia)."}
            </p>
          </div>

          {/* ACTIONS: PRIMARY CTAS */}
          <div className="flex flex-wrap items-center gap-2.5">
            <Button
              onClick={() => setIsCreateModalOpen(true)}
              size="sm"
              className="h-10 px-5 text-xs font-black bg-gradient-to-r from-purple-600 via-indigo-600 to-slate-900 hover:from-purple-700 hover:to-indigo-700 text-white shadow-md shadow-purple-600/25 rounded-2xl gap-2 cursor-pointer transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              <Plus className="size-4" />
              <span>{isAr ? "إصدار فاتورة ضريبية جديدة" : "Issue New E-Invoice"}</span>
            </Button>

            <Link href="/finance/einvoice-items">
              <Button
                variant="outline"
                size="sm"
                className="h-10 px-4 text-xs font-bold border-purple-200 bg-white/90 text-purple-700 hover:bg-purple-50 dark:border-purple-900/60 dark:bg-slate-900 dark:text-purple-300 dark:hover:bg-purple-950/40 rounded-2xl gap-1.5 transition-all shadow-2xs"
              >
                <Tag className="size-3.5 text-purple-600 dark:text-purple-400" />
                <span>{isAr ? "كتالوج وتكويد الأصناف (GS1)" : "Item Coding (GS1)"}</span>
                <ArrowUpRight className="size-3 opacity-60" />
              </Button>
            </Link>

            <Link href="/admin">
              <Button
                variant="outline"
                size="sm"
                className="h-10 px-4 text-xs font-bold border-slate-200 bg-white/90 text-slate-700 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 rounded-2xl gap-1.5 transition-all shadow-2xs"
              >
                <Settings className="size-3.5 text-purple-600" />
                <span>{isAr ? "إعدادات بوابات الربط" : "Gateway Settings"}</span>
              </Button>
            </Link>

            <div className="flex items-center gap-1.5">
              <Button
                onClick={handleExportExcel}
                variant="outline"
                size="sm"
                className="h-10 px-3.5 text-xs font-bold border-slate-200 bg-white/90 text-slate-700 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 rounded-2xl gap-1.5 transition-all shadow-2xs"
              >
                <FileSpreadsheet className="size-3.5 text-emerald-600" />
                <span>{isAr ? "إكسل" : "Excel"}</span>
              </Button>

              <Button
                onClick={handleExportPdf}
                variant="outline"
                size="sm"
                className="h-10 px-3.5 text-xs font-bold border-slate-200 bg-white/90 text-slate-700 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 rounded-2xl gap-1.5 transition-all shadow-2xs"
              >
                <FileText className="size-3.5 text-rose-600" />
                <span>{isAr ? "PDF" : "PDF"}</span>
              </Button>
            </div>
          </div>
        </div>

        {/* ──────────────────────────────────────────────────────────────────────
            EXECUTIVE KPI METRIC CARDS (4 BENTO METRICS)
            ────────────────────────────────────────────────────────────────────── */}
        <div className="mt-7 grid grid-cols-2 gap-3.5 sm:grid-cols-4 pt-6 border-t border-slate-200/70 dark:border-slate-800/80">
          {/* 1. Taxable Base */}
          <div className="group relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white/90 p-4.5 shadow-xs transition-all hover:border-purple-300 hover:shadow-md dark:border-slate-800/80 dark:bg-slate-900/90 dark:hover:border-purple-800">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                {isAr ? "إجمالي الوعاء الخاضع" : "Taxable Base"}
              </span>
              <span className="flex size-8 items-center justify-center rounded-xl bg-purple-50 text-purple-600 dark:bg-purple-950/60 dark:text-purple-400 shadow-2xs">
                <DollarSign className="size-4" />
              </span>
            </div>
            <p className="mt-2.5 text-xl font-black tabular-nums text-slate-950 dark:text-white sm:text-2xl">
              {totalTaxableBase.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              <span className="text-xs font-bold text-slate-400 ms-1.5 font-sans">{currencyLabel}</span>
            </p>
            <span className="mt-1 block text-[11px] font-semibold text-slate-400 dark:text-slate-500">
              {isAr ? "صافي إيرادات الخدمات والمطالبات" : "Net statutory revenue base"}
            </span>
          </div>

          {/* 2. Output VAT */}
          <div className="group relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white/90 p-4.5 shadow-xs transition-all hover:border-emerald-300 hover:shadow-md dark:border-slate-800/80 dark:bg-slate-900/90 dark:hover:border-emerald-800">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                {isAr ? "ضريبة القيمة المضافة الصادرة" : "Output Output VAT"}
              </span>
              <span className="flex size-8 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400 shadow-2xs">
                <Percent className="size-4" />
              </span>
            </div>
            <p className="mt-2.5 text-xl font-black tabular-nums text-emerald-600 dark:text-emerald-400 sm:text-2xl">
              {totalVatAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              <span className="text-xs font-bold text-slate-400 ms-1.5 font-sans">{currencyLabel}</span>
            </p>
            <span className="mt-1 block text-[11px] font-semibold text-emerald-600/90 dark:text-emerald-400/90">
              {isAr ? `مختومة ضريبياً بنسبة ${currentJur.standardVat}` : `Calculated VAT at ${currentJur.standardVat}`}
            </span>
          </div>

          {/* 3. Stamped Invoices */}
          <div className="group relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white/90 p-4.5 shadow-xs transition-all hover:border-blue-300 hover:shadow-md dark:border-slate-800/80 dark:bg-slate-900/90 dark:hover:border-blue-800">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                {isAr ? "الفواتير والقرارات المعتمدة" : "Stamped Invoices"}
              </span>
              <span className="flex size-8 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400 shadow-2xs">
                <FileCheck2 className="size-4" />
              </span>
            </div>
            <div className="mt-2.5 flex items-baseline gap-2">
              <p className="text-xl font-black tabular-nums text-slate-950 dark:text-white sm:text-2xl">
                {taxDecisions.length}
              </p>
              {exemptDecisionsCount > 0 && (
                <span className="text-[11px] font-bold text-slate-500">
                  ({exemptDecisionsCount} {isAr ? "معفى 0%" : "exempt"})
                </span>
              )}
            </div>
            <span className="mt-1 block text-[11px] font-semibold text-slate-400 dark:text-slate-500">
              {isAr ? "سجلات محاسبية مدققة 100%" : "Audited statutory records"}
            </span>
          </div>

          {/* 4. Compliance Link Status */}
          <div className="group relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white/90 p-4.5 shadow-xs transition-all hover:border-indigo-300 hover:shadow-md dark:border-slate-800/80 dark:bg-slate-900/90 dark:hover:border-indigo-800">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                {isAr ? "حالة الامتثال والربط الضريبي" : "Compliance Link"}
              </span>
              <span className="flex size-8 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400 shadow-2xs">
                <ShieldCheck className="size-4" />
              </span>
            </div>
            <p className="mt-2.5 text-base font-black text-indigo-700 dark:text-indigo-300 sm:text-lg flex items-center gap-1.5">
              <span>{currentJur.flag}</span>
              <span>{organizationJurisdiction}</span>
            </p>
            <span className="mt-1 block text-[11px] font-semibold text-indigo-600/90 dark:text-indigo-400/90">
              {activeProfilesCount > 0
                ? isAr ? "✓ الإرسال اللحظي مفعّل" : "Active & Auto-filing"
                : verifiedProfilesCount > 0
                ? isAr ? "مُتحقق منه — جاهز للتفعيل" : "Verified — ready"
                : isAr ? "بانتظار إعداد الربط" : "Setup needed"}
            </span>
          </div>
        </div>
      </div>

      {/* ──────────────────────────────────────────────────────────────────────────
          MODULE NAVIGATION TABS (FULL-WIDTH CLEAN SEGMENTED CONTROL)
          ────────────────────────────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-1.5 shadow-2xs">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
          <button
            onClick={() => setActiveTab("DECISIONS")}
            className={`flex items-center justify-center gap-2.5 px-4 py-2.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${
              activeTab === "DECISIONS"
                ? "bg-purple-600 text-white shadow-sm shadow-purple-600/20"
                : "text-slate-600 hover:text-slate-950 hover:bg-slate-100/70 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-800/60"
            }`}
          >
            <FileCheck2 className={`size-4 ${activeTab === "DECISIONS" ? "text-white" : "text-purple-600 dark:text-purple-400"}`} />
            <span>{isAr ? "سجل الفواتير والمطالبات الضريبية" : "Tax Invoices Register"}</span>
            <span
              className={`text-[10px] h-5 px-2 rounded-full font-mono font-bold inline-flex items-center justify-center ${
                activeTab === "DECISIONS"
                  ? "bg-white/20 text-white"
                  : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
              }`}
            >
              {taxDecisions.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab("NATURES")}
            className={`flex items-center justify-center gap-2.5 px-4 py-2.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${
              activeTab === "NATURES"
                ? "bg-purple-600 text-white shadow-sm shadow-purple-600/20"
                : "text-slate-600 hover:text-slate-950 hover:bg-slate-100/70 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-800/60"
            }`}
          >
            <Scale className={`size-4 ${activeTab === "NATURES" ? "text-white" : "text-blue-600 dark:text-blue-400"}`} />
            <span>{isAr ? "دليل تصنيفات الإيراد والقواعد الضريبية" : "Revenue Tax Rules"}</span>
            <span
              className={`text-[10px] h-5 px-2 rounded-full font-mono font-bold inline-flex items-center justify-center ${
                activeTab === "NATURES"
                  ? "bg-white/20 text-white"
                  : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
              }`}
            >
              {revenueNatures.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab("GUIDE")}
            className={`flex items-center justify-center gap-2.5 px-4 py-2.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${
              activeTab === "GUIDE"
                ? "bg-purple-600 text-white shadow-sm shadow-purple-600/20"
                : "text-slate-600 hover:text-slate-950 hover:bg-slate-100/70 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-800/60"
            }`}
          >
            <Zap className={`size-4 ${activeTab === "GUIDE" ? "text-white" : "text-amber-500"}`} />
            <span>{isAr ? "دورة حياة الفاتورة والإرشادات" : "Invoicing Lifecycle"}</span>
          </button>
        </div>
      </div>

      {/* ──────────────────────────────────────────────────────────────────────────
          DEDICATED FILTER & SEARCH TOOLBAR (CLEAN, SPACIOUS, UNCONGESTED)
          ────────────────────────────────────────────────────────────────────────── */}
      {activeTab === "DECISIONS" && (
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3.5 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs">
          {/* Side 1: Quick Filter Chips + Sort */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 bg-slate-100/90 dark:bg-slate-800/80 p-1 rounded-xl text-xs font-bold">
              <button
                onClick={() => setFilterTaxTreatment("ALL")}
                className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                  filterTaxTreatment === "ALL"
                    ? "bg-white text-slate-900 shadow-2xs dark:bg-slate-900 dark:text-white"
                    : "text-slate-600 hover:text-slate-900 dark:text-slate-400"
                }`}
              >
                {isAr ? "الكل" : "All"}
              </button>
              <button
                onClick={() => setFilterTaxTreatment("TAXABLE")}
                className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                  filterTaxTreatment === "TAXABLE"
                    ? "bg-white text-purple-700 shadow-2xs dark:bg-slate-900 dark:text-purple-400"
                    : "text-slate-600 hover:text-slate-900 dark:text-slate-400"
                }`}
              >
                {isAr ? "خاضع للضريبة" : "Taxable"}
              </button>
              <button
                onClick={() => setFilterTaxTreatment("EXEMPT")}
                className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                  filterTaxTreatment === "EXEMPT"
                    ? "bg-white text-emerald-700 shadow-2xs dark:bg-slate-900 dark:text-emerald-400"
                    : "text-slate-600 hover:text-slate-900 dark:text-slate-400"
                }`}
              >
                {isAr ? "معفى 0%" : "Exempt"}
              </button>
            </div>

            {/* Sort Toggle */}
            <button
              onClick={() => setSortBy(sortBy === "NEWEST" ? "HIGHEST_AMOUNT" : "NEWEST")}
              className="flex items-center gap-1.5 h-9 px-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 cursor-pointer transition-all"
            >
              <ArrowUpDown className="size-3.5 text-purple-600" />
              <span>{sortBy === "NEWEST" ? (isAr ? "الأحدث" : "Newest") : isAr ? "الأعلى مبلغاً" : "Highest Amount"}</span>
            </button>
          </div>

          {/* Side 2: Search Input */}
          <div className="relative w-full sm:w-72">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 size-3.5 text-slate-400" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={isAr ? "بحث برقم الفاتورة أو كود الوحدة..." : "Search by invoice # or unit..."}
              className="ps-9 text-xs h-9 bg-slate-50/80 dark:bg-slate-800/80 rounded-xl border-slate-200 dark:border-slate-700"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute end-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────────────────────
          TAB 1: TAX INVOICES & DECISIONS REGISTER
          ────────────────────────────────────────────────────────────────────────── */}
      {activeTab === "DECISIONS" && (
        <div className="overflow-hidden rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-start border-collapse">
              {/* CLEAN ENTERPRISE TABLE HEADER */}
              <thead className="bg-slate-50/90 text-slate-800 dark:bg-slate-800/90 dark:text-slate-200 font-extrabold border-b border-slate-200 dark:border-slate-700 select-none">
                <tr>
                  <th className="p-3.5 text-start">{isAr ? "رقم الفاتورة / الوحدة" : "Invoice # / Unit"}</th>
                  <th className="p-3.5 text-start">{isAr ? "نوع الإيراد الضريبي" : "Revenue Tax Nature"}</th>
                  <th className="p-3.5 text-start">{isAr ? "تاريخ القرار" : "Decision Date"}</th>
                  <th className="p-3.5 text-end">{isAr ? "الوعاء الخاضع (الصافي)" : "Taxable Base"}</th>
                  <th className="p-3.5 text-center">{isAr ? "النسبة" : "Rate"}</th>
                  <th className="p-3.5 text-end">{isAr ? "ضريبة القيمة المضافة" : "VAT Amount"}</th>
                  <th className="p-3.5 text-end">{isAr ? "الإجمالي بالضريبة" : "Gross Total"}</th>
                  <th className="p-3.5 text-center">{isAr ? "الحالة" : "Status"}</th>
                  <th className="p-3.5 text-center">{isAr ? "إجراءات الفاتورة" : "Actions"}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {filteredDecisions.length > 0 ? (
                  filteredDecisions.map((td) => (
                    <tr
                      key={td.id}
                      className="hover:bg-purple-50/30 dark:hover:bg-purple-950/10 transition-colors group"
                    >
                      {/* INVOICE & UNIT */}
                      <td className="p-3.5 font-bold text-slate-900 dark:text-white">
                        <div className="flex items-center gap-2">
                          <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-purple-50 text-purple-600 dark:bg-purple-950/60 dark:text-purple-400">
                            <Receipt className="size-3.5" />
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono font-extrabold text-slate-900 dark:text-white">
                                {td.unit_code || `#${td.source_id.slice(0, 8)}`}
                              </span>
                              <button
                                onClick={() => handleCopyInvoiceId(td.id)}
                                title={isAr ? "نسخ معرف القرار" : "Copy Decision ID"}
                                className="text-slate-400 hover:text-purple-600 transition-colors opacity-0 group-hover:opacity-100"
                              >
                                {copiedInvoiceId === td.id ? <Check className="size-3 text-emerald-600" /> : <Copy className="size-3" />}
                              </button>
                            </div>
                            <span className="font-mono text-[10px] text-slate-400 block">
                              #{td.id.slice(0, 8).toUpperCase()}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* REVENUE NATURE */}
                      <td className="p-3.5 font-bold text-slate-800 dark:text-slate-200">
                        <div>
                          <span>{td.nature_name}</span>
                          {td.description && (
                            <span className="block text-[10px] text-slate-400 font-normal truncate max-w-xs">
                              {td.description}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* DATE */}
                      <td className="p-3.5 font-mono text-[11px] text-slate-600 dark:text-slate-400 whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          <Calendar className="size-3 text-slate-400 shrink-0" />
                          <span>{td.decided_at}</span>
                        </div>
                      </td>

                      {/* TAXABLE BASE */}
                      <td className="p-3.5 text-end font-mono font-bold text-slate-900 dark:text-white text-xs whitespace-nowrap">
                        {td.taxable_base.toLocaleString(undefined, { minimumFractionDigits: 2 })}{" "}
                        <span className="text-[10px] text-slate-400 font-normal font-sans">{currencyLabel}</span>
                      </td>

                      {/* RATE */}
                      <td className="p-3.5 text-center font-mono font-bold">
                        {td.is_exempt || td.vat_rate === 0 ? (
                          <Badge variant="outline" className="text-[10px] bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300">
                            {isAr ? "معفى 0%" : "Exempt 0%"}
                          </Badge>
                        ) : (
                          <Badge className="text-[10px] bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/60 dark:text-purple-300 dark:border-purple-800 font-black">
                            {td.vat_rate}%
                          </Badge>
                        )}
                      </td>

                      {/* VAT AMOUNT */}
                      <td className="p-3.5 text-end font-mono font-bold text-purple-600 dark:text-purple-400 text-xs whitespace-nowrap">
                        {td.vat_amount > 0 ? (
                          <>
                            {td.vat_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}{" "}
                            <span className="text-[10px] text-slate-400 font-normal font-sans">{currencyLabel}</span>
                          </>
                        ) : (
                          <span className="text-slate-400">0.00</span>
                        )}
                      </td>

                      {/* GROSS AMOUNT */}
                      <td className="p-3.5 text-end font-mono font-black text-sm text-slate-950 dark:text-white whitespace-nowrap">
                        {td.gross_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}{" "}
                        <span className="text-[10px] text-slate-400 font-normal font-sans">{currencyLabel}</span>
                      </td>

                      {/* STATUS */}
                      <td className="p-3.5 text-center whitespace-nowrap">
                        <Badge className="text-[10px] font-black bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/80 dark:text-emerald-300 dark:border-emerald-800">
                          {isAr ? "✓ قرار مختوم" : "Stamped"}
                        </Badge>
                      </td>

                      {/* 360° ACTIONS */}
                      <td className="p-3.5 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1">
                          {/* 1. VIEW / PREVIEW & PRINT */}
                          <Button
                            onClick={() => setViewInvoiceDecision(td)}
                            variant="outline"
                            size="sm"
                            title={isAr ? "معاينة وطباعة الفاتورة الضريبية" : "Preview & Print Tax Invoice"}
                            className="h-7.5 text-[11px] font-bold px-2.5 gap-1 border-purple-200 text-purple-700 hover:bg-purple-50 dark:border-purple-900/60 dark:text-purple-300 rounded-lg cursor-pointer transition-all"
                          >
                            <Eye className="size-3" />
                            <span>{isAr ? "معاينة" : "View"}</span>
                          </Button>

                          {/* 2. WHATSAPP */}
                          <Button
                            onClick={() => handleShareInvoiceWhatsApp(td)}
                            variant="ghost"
                            size="sm"
                            title={isAr ? "إرسال عبر واتساب" : "Send via WhatsApp"}
                            className="h-7.5 w-7.5 p-0 text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700 dark:text-emerald-400 dark:hover:bg-emerald-950/40 rounded-lg cursor-pointer"
                          >
                            <MessageCircle className="size-3.5" />
                          </Button>

                          {/* 3. EMAIL */}
                          <Button
                            onClick={() => handleShareInvoiceEmail(td)}
                            variant="ghost"
                            size="sm"
                            title={isAr ? "إرسال عبر البريد الإلكتروني" : "Send via Email"}
                            className="h-7.5 w-7.5 p-0 text-blue-600 hover:bg-blue-50 hover:text-blue-700 dark:text-blue-400 dark:hover:bg-blue-950/40 rounded-lg cursor-pointer"
                          >
                            <Mail className="size-3.5" />
                          </Button>

                          {/* 4. PDF DOWNLOAD */}
                          <Button
                            onClick={() => handleExportSingleInvoicePdf(td)}
                            variant="ghost"
                            size="sm"
                            title={isAr ? "تصدير الفاتورة PDF" : "Download Invoice PDF"}
                            className="h-7.5 w-7.5 p-0 text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:text-rose-400 dark:hover:bg-rose-950/40 rounded-lg cursor-pointer"
                          >
                            <Download className="size-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={9} className="p-14 text-center text-slate-400">
                      <div className="flex flex-col items-center gap-3 max-w-sm mx-auto">
                        <div className="flex size-14 items-center justify-center rounded-2xl bg-purple-50 text-purple-600 dark:bg-purple-950/60 dark:text-purple-400">
                          <FileCheck2 className="size-7" />
                        </div>
                        <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">
                          {searchQuery
                            ? isAr ? "لا توجد نتائج مطابقة لبحثك" : "No matching invoices found"
                            : isAr ? "لا توجد فواتير أو قرارات ضريبية مسجلة بعد" : "No tax invoices or decisions recorded yet"}
                        </h4>
                        <p className="text-xs text-slate-500">
                          {isAr
                            ? "يمكنك إصدار أول فاتورة ضريبية مختومة ومعتمدة بالضغط على زر الإنشاء أدناه."
                            : "Issue your first compliant statutory tax invoice using the button below."}
                        </p>
                        <Button
                          onClick={() => setIsCreateModalOpen(true)}
                          size="sm"
                          className="mt-2 text-xs font-bold bg-purple-600 hover:bg-purple-700 text-white rounded-xl gap-1.5 shadow-sm"
                        >
                          <Plus className="size-3.5" />
                          <span>{isAr ? "إنشاء أول فاتورة إلكترونية الآن" : "Issue First E-Invoice"}</span>
                        </Button>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────────────────────
          TAB 2: REVENUE TAX NATURES & STATUTORY RULES
          ────────────────────────────────────────────────────────────────────────── */}
      {activeTab === "NATURES" && (
        <div className="space-y-4">
          <div className="p-4.5 rounded-2xl bg-purple-50/60 dark:bg-purple-950/20 border border-purple-200/80 dark:border-purple-900/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-purple-600 text-white shadow-xs">
                <Scale className="size-4.5" />
              </div>
              <div>
                <h3 className="text-xs sm:text-sm font-black text-slate-950 dark:text-white">
                  {isAr ? "دليل المعاملات الضريبية للأنشطة العقارية" : "Real Estate Statutory Tax Classification Matrix"}
                </h3>
                <p className="text-[11px] text-slate-600 dark:text-slate-400">
                  {isAr
                    ? `التكييف القانوني الآلي وفقاً لأحكام قانون الضريبة على القيمة المضافة الساري (${currentJur.arName}).`
                    : `Statutory tax classifications according to applicable VAT legislation (${currentJur.enName}).`}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs font-bold">
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 border border-purple-200 dark:border-purple-800 text-purple-700 dark:text-purple-300 font-mono text-[11px]">
                {currentJur.standardVat} Standard Rate
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 font-mono text-[11px]">
                0% Residential Exemption
              </span>
            </div>
          </div>

          <div className="overflow-hidden rounded-3xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-start">
                <thead className="bg-slate-50/90 text-slate-800 dark:bg-slate-800/90 dark:text-slate-200 font-extrabold border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="p-4 text-start">{isAr ? "كود البند الضريبي" : "Nature Code"}</th>
                    <th className="p-4 text-start">{isAr ? "المسمى العربي" : "Arabic Title"}</th>
                    <th className="p-4 text-start">{isAr ? "المسمى الإنجليزي" : "English Title"}</th>
                    <th className="p-4 text-center">{isAr ? "نوع التوريد" : "Supply Type"}</th>
                    <th className="p-4 text-end">{isAr ? "المعاملة الضريبية المعتمدة" : "Statutory Tax Rule"}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                  {filteredNatures.length > 0 ? (
                    filteredNatures.map((n) => (
                      <tr
                        key={n.code}
                        className="hover:bg-slate-50/80 dark:hover:bg-slate-800/60 transition-colors group"
                      >
                        <td className="p-4 font-mono font-bold text-slate-900 dark:text-white">
                          <div className="flex items-center gap-2">
                            <span className="flex size-6 items-center justify-center rounded-md bg-purple-50 text-purple-600 dark:bg-purple-950 dark:text-purple-400">
                              <Scale className="size-3" />
                            </span>
                            <span>{n.code}</span>
                          </div>
                        </td>

                        <td className="p-4 font-bold text-slate-950 dark:text-white text-xs">
                          {n.name_ar}
                        </td>

                        <td className="p-4 text-slate-600 dark:text-slate-400 font-medium">
                          {n.name_en}
                        </td>

                        <td className="p-4 text-center">
                          <Badge
                            variant="outline"
                            className="text-[10px] font-mono border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-300 font-bold"
                          >
                            {n.is_derived ? (isAr ? "مشتق من الأصل" : "Derived") : isAr ? "توريد مباشر" : "Direct Supply"}
                          </Badge>
                        </td>

                        <td className="p-4 text-end font-semibold">
                          {n.code.includes("RESIDENTIAL_RENT") || n.code.includes("RESIDENTIAL_UNIT_SALE") ? (
                            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700">
                              {isAr ? "✓ إعفاء ضريبي (0% معفى بنص القانون)" : "Tax Exempt (0% by Law)"}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-[11px] font-black bg-purple-50 text-purple-800 border border-purple-200 dark:bg-purple-950/80 dark:text-purple-300 dark:border-purple-800">
                              {isAr ? `✓ خاضع بالنسبة القياسية (${currentJur.standardVat})` : `Standard Taxable (${currentJur.standardVat})`}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="p-12 text-center text-slate-400 text-xs">
                        {isAr ? "لا توجد تصنيفات ضريبية مطابقة" : "No tax natures found"}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────────────────────
          TAB 3: INVOICING LIFECYCLE & STATUTORY GUIDE
          ────────────────────────────────────────────────────────────────────────── */}
      {activeTab === "GUIDE" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-3xl border border-slate-200/90 bg-white p-6 space-y-3 dark:border-slate-800 dark:bg-slate-900 shadow-xs transition-all hover:border-purple-300 dark:hover:border-purple-800">
              <div className="flex size-12 items-center justify-center rounded-2xl bg-purple-50 text-purple-600 dark:bg-purple-950/80 shadow-2xs">
                <Plus className="size-5.5" />
              </div>
              <h3 className="text-sm font-black text-slate-900 dark:text-white">
                {isAr ? "1. إصدار المطالبة والفاتورة" : "1. Invoice Issuance"}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                {isAr
                  ? "يتم إصدار الفاتورة الضريبية للوحدة مع تحديد المورد والمشتري، وتحديد نوع الإيراد، وربطها بالحساب المدين والدائن في دفتر الأستاذ العام."
                  : "Issue unit tax invoice with seller/buyer IDs, revenue classification, and atomic double-entry posting."}
              </p>
            </div>

            <div className="rounded-3xl border border-slate-200/90 bg-white p-6 space-y-3 dark:border-slate-800 dark:bg-slate-900 shadow-xs transition-all hover:border-blue-300 dark:hover:border-blue-800">
              <div className="flex size-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-950/80 shadow-2xs">
                <Scale className="size-5.5" />
              </div>
              <h3 className="text-sm font-black text-slate-900 dark:text-white">
                {isAr ? "2. التكييف والختم الضريبي الآلي" : "2. Automated Tax Stamping"}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                {isAr
                  ? "يقوم المحرك الضريبي بفحص نوع الإيراد وتحديد خضوعه للضريبة القياسية أو الإعفاء، وتوليد لقطة القرار الضريبي (Tax Decision Snapshot) وختمها فورياً."
                  : "Automatic tax rules engine determines VAT rate or exemption and stamps an immutable decision snapshot."}
              </p>
            </div>

            <div className="rounded-3xl border border-slate-200/90 bg-white p-6 space-y-3 dark:border-slate-800 dark:bg-slate-900 shadow-xs transition-all hover:border-emerald-300 dark:hover:border-emerald-800">
              <div className="flex size-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/80 shadow-2xs">
                <Share2 className="size-5.5" />
              </div>
              <h3 className="text-sm font-black text-slate-900 dark:text-white">
                {isAr ? "3. الإرسال للضرائب والتوزيع المباشر" : "3. Multi-Channel Distribution & QR"}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                {isAr
                  ? "توليد الفاتورة الضريبية الرسمية المعتمدة مع رمز الاستجابة السريع (QR Code)، مع إمكانية الطباعة الفورية وتصدير PDF والإرسال بنقرة واحدة عبر واتساب والبريد الإلكتروني."
                  : "Share official compliant invoices via WhatsApp, Email, instant Print, or export to standard PDF."}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────────────────────
          MODAL 1: CREATE & ISSUE E-INVOICE WIZARD
          ────────────────────────────────────────────────────────────────────────── */}
      <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
        <DialogContent className="max-w-xl rounded-3xl p-6">
          <DialogHeader>
            <DialogTitle className="text-base font-black text-slate-950 dark:text-white flex items-center gap-2">
              <Plus className="size-5 text-purple-600" />
              <span>{isAr ? "إنشاء وإصدار فاتورة ضريبية إلكترونية" : "Issue New Statutory Tax Invoice"}</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500 mt-1">
              {isAr
                ? "إصدار مطالبة مالية وفاتورة ضريبية رسمية للوحدة مع الختم والتكييف الضريبي المعتمد."
                : "Issue unit financial demand with statutory tax stamp and GL posting."}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleIssueInvoiceSubmit} className="space-y-4 pt-3 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {/* RESORT */}
              <div className="space-y-1.5">
                <Label className="font-bold">{isAr ? "المشروع / الكيان العقاري *" : "Property / Project *"}</Label>
                <select
                  value={selectedResortId || resorts[0]?.id || ""}
                  onChange={(e) => setSelectedResortId(e.target.value)}
                  className="w-full h-9.5 rounded-xl border border-slate-200 bg-slate-50/80 px-3 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white cursor-pointer"
                  required
                >
                  {resorts.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* UNIT */}
              <div className="space-y-1.5">
                <Label className="font-bold">{isAr ? "الوحدة العقارية المستهدفة *" : "Target Unit *"}</Label>
                <select
                  value={selectedUnitId || filteredUnits[0]?.id || ""}
                  onChange={(e) => setSelectedUnitId(e.target.value)}
                  className="w-full h-9.5 rounded-xl border border-slate-200 bg-slate-50/80 px-3 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white cursor-pointer"
                  required
                >
                  {filteredUnits.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.label} {u.ownerName ? `(${u.ownerName})` : ""}
                    </option>
                  ))}
                </select>
              </div>

              {/* DUE TYPE / REVENUE NATURE */}
              <div className="space-y-1.5">
                <Label className="font-bold">{isAr ? "نوع الإيراد / المطالبة *" : "Due Type / Revenue Nature *"}</Label>
                <select
                  value={selectedDueTypeId || dueTypes[0]?.id || ""}
                  onChange={(e) => setSelectedDueTypeId(e.target.value)}
                  className="w-full h-9.5 rounded-xl border border-slate-200 bg-slate-50/80 px-3 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white cursor-pointer"
                  required
                >
                  {dueTypes.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* FISCAL PERIOD */}
              <div className="space-y-1.5">
                <Label className="font-bold">{isAr ? "الفترة المالية المحاسبية *" : "Fiscal Period *"}</Label>
                <select
                  value={selectedPeriodId || periods[0]?.id || ""}
                  onChange={(e) => setSelectedPeriodId(e.target.value)}
                  className="w-full h-9.5 rounded-xl border border-slate-200 bg-slate-50/80 px-3 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white cursor-pointer"
                  required
                >
                  {periods.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* AMOUNT */}
              <div className="space-y-1.5">
                <Label className="font-bold">{isAr ? `قيمة الفاتورة (الوعاء الصافي) (${currencyLabel}) *` : `Invoice Base Amount (${currencyLabel}) *`}</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="1"
                  required
                  value={invoiceAmount}
                  onChange={(e) => setInvoiceAmount(e.target.value ? Number(e.target.value) : "")}
                  placeholder="0.00"
                  className="text-xs h-9.5 bg-slate-50/80 dark:bg-slate-800 font-mono font-bold"
                />
              </div>

              {/* DATES */}
              <div className="space-y-1.5">
                <Label className="font-bold">{isAr ? "تاريخ الاستحقاق *" : "Due Date *"}</Label>
                <Input
                  type="date"
                  required
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="text-xs h-9.5 bg-slate-50/80 dark:bg-slate-800 font-mono"
                />
              </div>
            </div>

            {/* DESCRIPTION */}
            <div className="space-y-1.5">
              <Label className="font-bold">{isAr ? "بيان الفاتورة / الوصف التفصيلي" : "Invoice Description"}</Label>
              <Input
                type="text"
                value={invoiceDescription}
                onChange={(e) => setInvoiceDescription(e.target.value)}
                placeholder={isAr ? "مثال: مقابل خدمات صيانة وتشغيل الربع السنوي" : "e.g. Q1 Maintenance levy"}
                className="text-xs h-9.5 bg-slate-50/80 dark:bg-slate-800"
              />
            </div>

            {/* REAL-TIME TAX CALCULATION PREVIEW */}
            <div className="rounded-2xl bg-purple-50/70 dark:bg-purple-950/20 p-4 border border-purple-200/80 dark:border-purple-900/50 space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-300">
                <span>{isAr ? "الوعاء الصافي (قبل الضريبة):" : "Net Base Amount:"}</span>
                <span className="font-mono font-bold">{calculatedTax.base.toLocaleString()} {currencyLabel}</span>
              </div>
              <div className="flex items-center justify-between text-xs text-purple-700 dark:text-purple-400">
                <span>{isAr ? `ضريبة القيمة المضافة (${calculatedTax.rate}%):` : `VAT (${calculatedTax.rate}%):`}</span>
                <span className="font-mono font-bold">{calculatedTax.vat.toLocaleString()} {currencyLabel}</span>
              </div>
              <div className="pt-2 border-t border-purple-200/60 dark:border-purple-900/60 flex items-center justify-between font-black text-sm text-slate-950 dark:text-white">
                <span>{isAr ? "إجمالي الفاتورة المطلوب سدادها:" : "Gross Payable Total:"}</span>
                <span className="font-mono text-purple-700 dark:text-purple-300 font-extrabold text-base">
                  {calculatedTax.gross.toLocaleString()} {currencyLabel}
                </span>
              </div>
            </div>

            <DialogFooter className="pt-3 flex items-center justify-between gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsCreateModalOpen(false)}
                className="text-xs font-bold h-9 rounded-xl"
              >
                {isAr ? "إلغاء" : "Cancel"}
              </Button>

              <Button
                type="submit"
                disabled={isPending || !invoiceAmount}
                size="sm"
                className="bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold h-9 px-5 gap-1.5 rounded-xl shadow-sm cursor-pointer"
              >
                {isPending ? <span>{isAr ? "جاري الإصدار..." : "Issuing..."}</span> : <span>{isAr ? "إصدار وختم الفاتورة فوراً" : "Issue Tax Invoice"}</span>}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ──────────────────────────────────────────────────────────────────────────
          MODAL 2: OFFICIAL TAX INVOICE PREVIEW & 360° ACTIONS (WITH PRINT STYLES)
          ────────────────────────────────────────────────────────────────────────── */}
      <Dialog open={Boolean(viewInvoiceDecision)} onOpenChange={(open) => !open && setViewInvoiceDecision(null)}>
        <DialogContent className="max-w-2xl rounded-3xl p-6">
          <DialogHeader>
            <DialogTitle className="text-base font-black text-slate-950 dark:text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Receipt className="size-5 text-purple-600" />
                <span>{isAr ? "فاتورة ضريبية رسمية معتمدة" : "Statutory Tax Invoice"}</span>
              </div>
              <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-xs font-bold">
                {isAr ? "✓ مختومة ضريبياً" : "Stamped"}
              </Badge>
            </DialogTitle>
          </DialogHeader>

          {viewInvoiceDecision && (
            <div className="space-y-4 pt-2 text-xs">
              {/* PRINTABLE INVOICE BILLING SHEET */}
              <div id="printable-tax-invoice" className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/40 p-5 space-y-4">
                {/* SELLER & INVOICE META */}
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-700">
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider">{isAr ? "المورد / المنشأة" : "Seller"}</span>
                    <h3 className="text-base font-black text-slate-900 dark:text-white">{organizationName}</h3>
                    <p className="text-slate-500 font-medium">
                      {isAr ? "الرقم الضريبي: " : "Tax ID: "}
                      <strong className="font-mono text-slate-800 dark:text-slate-200">{organizationTaxId || "—"}</strong>
                    </p>
                  </div>

                  <div className="text-start sm:text-end space-y-1 font-mono">
                    <span className="text-[10px] font-bold text-slate-400 block uppercase">{isAr ? "رقم الفاتورة والقرار" : "Invoice #"}</span>
                    <p className="font-black text-sm text-purple-600">#{viewInvoiceDecision.id.slice(0, 8).toUpperCase()}</p>
                    <p className="text-slate-500 text-[11px]">{isAr ? "تاريخ الإصدار: " : "Date: "}{viewInvoiceDecision.decided_at}</p>
                  </div>
                </div>

                {/* BUYER / UNIT */}
                <div className="grid grid-cols-2 gap-3 pb-3 border-b border-slate-200 dark:border-slate-700 text-[11px]">
                  <div>
                    <span className="text-slate-400 block">{isAr ? "العميل / الوحدة المستفيدة:" : "Customer / Unit:"}</span>
                    <span className="font-black text-slate-900 dark:text-white text-xs">{viewInvoiceDecision.unit_code || `#${viewInvoiceDecision.source_id.slice(0, 8)}`}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">{isAr ? "المعاملة الضريبية:" : "Tax Nature:"}</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200">{viewInvoiceDecision.nature_name}</span>
                  </div>
                </div>

                {/* LINE ITEMS TABLE */}
                <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-700">
                      <tr>
                        <th className="p-2.5 text-start">{isAr ? "البند / البيان" : "Item"}</th>
                        <th className="p-2.5 text-end">{isAr ? "الوعاء الصافي" : "Net Base"}</th>
                        <th className="p-2.5 text-center">{isAr ? "الضريبة" : "VAT %"}</th>
                        <th className="p-2.5 text-end">{isAr ? "مبلغ الضريبة" : "VAT Amount"}</th>
                        <th className="p-2.5 text-end">{isAr ? "الإجمالي" : "Total"}</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="p-2.5 font-medium">{viewInvoiceDecision.nature_name}</td>
                        <td className="p-2.5 text-end font-mono">{viewInvoiceDecision.taxable_base.toLocaleString()} {currencyLabel}</td>
                        <td className="p-2.5 text-center font-mono font-bold">{viewInvoiceDecision.vat_rate}%</td>
                        <td className="p-2.5 text-end font-mono text-purple-600 font-bold">{viewInvoiceDecision.vat_amount.toLocaleString()} {currencyLabel}</td>
                        <td className="p-2.5 text-end font-mono font-black text-slate-900 dark:text-white">{viewInvoiceDecision.gross_amount.toLocaleString()} {currencyLabel}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* TOTALS SUMMARY */}
                <div className="flex items-center justify-between pt-2">
                  <div className="flex items-center gap-2.5">
                    <div className="size-13 rounded-xl border border-slate-200 bg-white p-1.5 flex items-center justify-center dark:border-slate-700 dark:bg-slate-800">
                      <QrCode className="size-10 text-slate-800 dark:text-slate-200" />
                    </div>
                    <span className="text-[10px] text-slate-400 max-w-[150px] leading-tight">
                      {isAr ? "رمز التحقق والختم الضريبي الرقمي المعتمد" : "Compliant Statutory QR Stamp"}
                    </span>
                  </div>

                  <div className="space-y-1 text-end">
                    <div className="text-[11px] text-slate-500">
                      {isAr ? "الصافي: " : "Net: "}
                      <span className="font-mono font-bold">{viewInvoiceDecision.taxable_base.toLocaleString()} {currencyLabel}</span>
                    </div>
                    <div className="text-[11px] text-purple-600 font-bold">
                      {isAr ? "الضريبة: " : "VAT: "}
                      <span className="font-mono">{viewInvoiceDecision.vat_amount.toLocaleString()} {currencyLabel}</span>
                    </div>
                    <div className="text-sm font-black text-slate-900 dark:text-white pt-1 border-t border-slate-200 dark:border-slate-700">
                      {isAr ? "الإجمالي النهائي: " : "Gross Total: "}
                      <span className="font-mono text-purple-700 dark:text-purple-400 font-extrabold">
                        {viewInvoiceDecision.gross_amount.toLocaleString()} {currencyLabel}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* ACTION TOOLBAR: 360° ACTIONS */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-1.5">
                  {/* WHATSAPP */}
                  <Button
                    onClick={() => handleShareInvoiceWhatsApp(viewInvoiceDecision)}
                    variant="outline"
                    size="sm"
                    className="h-8.5 text-xs font-bold border-emerald-200 text-emerald-700 hover:bg-emerald-50 rounded-xl gap-1.5"
                  >
                    <MessageCircle className="size-3.5" />
                    <span>{isAr ? "واتساب" : "WhatsApp"}</span>
                  </Button>

                  {/* EMAIL */}
                  <Button
                    onClick={() => handleShareInvoiceEmail(viewInvoiceDecision)}
                    variant="outline"
                    size="sm"
                    className="h-8.5 text-xs font-bold border-blue-200 text-blue-700 hover:bg-blue-50 rounded-xl gap-1.5"
                  >
                    <Mail className="size-3.5" />
                    <span>{isAr ? "إيميل" : "Email"}</span>
                  </Button>

                  {/* PDF DOWNLOAD */}
                  <Button
                    onClick={() => handleExportSingleInvoicePdf(viewInvoiceDecision)}
                    variant="outline"
                    size="sm"
                    className="h-8.5 text-xs font-bold border-rose-200 text-rose-700 hover:bg-rose-50 rounded-xl gap-1.5"
                  >
                    <Download className="size-3.5" />
                    <span>{isAr ? "تحميل PDF" : "PDF"}</span>
                  </Button>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setViewInvoiceDecision(null)}
                    className="text-xs font-bold h-8.5 rounded-xl"
                  >
                    {isAr ? "إغلاق" : "Close"}
                  </Button>

                  <Button
                    onClick={() => handleExportSingleInvoicePdf(viewInvoiceDecision)}
                    size="sm"
                    className="bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold h-8.5 px-4 gap-1.5 rounded-xl shadow-sm cursor-pointer"
                  >
                    <Printer className="size-3.5" />
                    <span>{isAr ? "طباعة الفاتورة" : "Print Invoice"}</span>
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
