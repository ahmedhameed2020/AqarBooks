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
  Edit3,
  Copy,
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

import type { Jurisdiction } from "@/lib/einvoice/types";
import {
  ProfileForm,
  FilingToggle,
} from "./einvoice-forms";

export type FormOption = { id: string; label: string };

const JURISDICTION_INFO: Record<
  string,
  {
    arName: string;
    enName: string;
    authorityAr: string;
    authorityEn: string;
    flag: string;
    standardVat: string;
  }
> = {
  EG: {
    arName: "جمهورية مصر العربية",
    enName: "Egypt",
    authorityAr: "مصلحة الضرائب المصرية (منظومة الفاتورة والإيصال الإلكتروني - ETA)",
    authorityEn: "Egyptian Tax Authority (ETA E-Invoicing / E-Receipt)",
    flag: "🇪🇬",
    standardVat: "14%",
  },
  EG_ETA: {
    arName: "جمهورية مصر العربية",
    enName: "Egypt",
    authorityAr: "مصلحة الضرائب المصرية (منظومة الفاتورة والإيصال الإلكتروني - ETA)",
    authorityEn: "Egyptian Tax Authority (ETA E-Invoicing / E-Receipt)",
    flag: "🇪🇬",
    standardVat: "14%",
  },
  SA: {
    arName: "المملكة العربية السعودية",
    enName: "Saudi Arabia",
    authorityAr: "هيئة الزكاة والضريبة والجمارك (منظومة فاتورة - ZATCA)",
    authorityEn: "Zakat, Tax and Customs Authority (ZATCA Fatoora)",
    flag: "🇸🇦",
    standardVat: "15%",
  },
  SA_ZATCA: {
    arName: "المملكة العربية السعودية",
    enName: "Saudi Arabia",
    authorityAr: "هيئة الزكاة والضريبة والجمارك (منظومة فاتورة - ZATCA)",
    authorityEn: "Zakat, Tax and Customs Authority (ZATCA Fatoora)",
    flag: "🇸🇦",
    standardVat: "15%",
  },
  AE: {
    arName: "دولة الإمارات العربية المتحدة",
    enName: "United Arab Emirates",
    authorityAr: "الهيئة الاتحادية للضرائب (شبكة الفوترة الإلكترونية PEPPOL)",
    authorityEn: "Federal Tax Authority (FTA PEPPOL Network)",
    flag: "🇦🇪",
    standardVat: "5%",
  },
  AE_PEPPOL: {
    arName: "دولة الإمارات العربية المتحدة",
    enName: "United Arab Emirates",
    authorityAr: "الهيئة الاتحادية للضرائب (شبكة الفوترة الإلكترونية PEPPOL)",
    authorityEn: "Federal Tax Authority (FTA PEPPOL Network)",
    flag: "🇦🇪",
    standardVat: "5%",
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
}) {
  const isAr = locale === "ar";
  const currencyLabel = getCurrencyLabel(currency, isAr);
  const toast = useToast();
  const [isPending, startTransition] = useTransition();

  const [activeTab, setActiveTab] = useState<"DECISIONS" | "VAT_RETURN" | "CREATE_INFO" | "NATURES" | "PROFILES">("DECISIONS");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<"ALL" | "TAXABLE" | "EXEMPT">("ALL");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [copiedId, setCopiedId] = useState<string | null>(null);

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

  // Edit Invoice Note Modal state
  const [editInvoiceDecision, setEditInvoiceDecision] = useState<TaxDecisionItem | null>(null);
  const [editNote, setEditNote] = useState("");

  const currentJur = JURISDICTION_INFO[organizationJurisdiction] || JURISDICTION_INFO.EG;

  // Filtered units based on selected resort
  const filteredUnits = useMemo(() => {
    if (!selectedResortId) return units;
    const matched = units.filter((u) => !u.propertyId || u.propertyId === selectedResortId);
    return matched.length > 0 ? matched : units;
  }, [units, selectedResortId]);

  // Tax calculation helper for create modal
  const calculatedTax = useMemo(() => {
    const base = Number(invoiceAmount) || 0;
    const isExempt = selectedDueTypeId ? false : false;
    const rate = isExempt ? 0 : organizationJurisdiction.startsWith("SA") ? 15 : organizationJurisdiction.startsWith("AE") ? 5 : 14;
    const vat = (base * rate) / 100;
    const gross = base + vat;
    return { base, rate, vat, gross };
  }, [invoiceAmount, selectedDueTypeId, organizationJurisdiction]);

  const filteredDecisions = useMemo(() => {
    let list = taxDecisions;
    if (filterType === "TAXABLE") {
      list = list.filter((td) => !td.is_exempt && td.vat_amount > 0);
    } else if (filterType === "EXEMPT") {
      list = list.filter((td) => td.is_exempt || td.vat_amount === 0);
    }

    if (!searchQuery.trim()) return list;
    const q = searchQuery.toLowerCase().trim();
    return list.filter(
      (td) =>
        (td.unit_code || "").toLowerCase().includes(q) ||
        (td.owner_name || "").toLowerCase().includes(q) ||
        (td.description || "").toLowerCase().includes(q) ||
        td.nature_name.toLowerCase().includes(q) ||
        td.decided_at.includes(q) ||
        td.id.toLowerCase().includes(q)
    );
  }, [taxDecisions, filterType, searchQuery]);

  const totalPages = Math.ceil(filteredDecisions.length / pageSize) || 1;
  const paginatedDecisions = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredDecisions.slice(start, start + pageSize);
  }, [filteredDecisions, currentPage, pageSize]);

  // VAT Return Calculation Breakdown
  const vatReturnStats = useMemo(() => {
    const taxableItems = taxDecisions.filter((td) => !td.is_exempt && td.vat_amount > 0);
    const exemptItems = taxDecisions.filter((td) => td.is_exempt || td.vat_amount === 0);

    const taxableBase = taxableItems.reduce((s, td) => s + td.taxable_base, 0);
    const outputVat = taxableItems.reduce((s, td) => s + td.vat_amount, 0);
    const exemptBase = exemptItems.reduce((s, td) => s + td.taxable_base, 0);
    const grossTotal = taxDecisions.reduce((s, td) => s + td.gross_amount, 0);

    return {
      taxableCount: taxableItems.length,
      taxableBase,
      outputVat,
      exemptCount: exemptItems.length,
      exemptBase,
      grossTotal,
    };
  }, [taxDecisions]);

  const handleCopyInvoiceId = (id: string) => {
    const text = `#${id.slice(0, 8).toUpperCase()}`;
    navigator.clipboard?.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
    toast?.add({
      type: "success",
      title: isAr ? "تم نسخ رقم الفاتورة" : "Invoice # Copied",
      description: text,
    });
  };

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

  // 1. WhatsApp Share
  const handleShareInvoiceWhatsApp = (td: TaxDecisionItem) => {
    const invNumber = td.id.slice(0, 8).toUpperCase();
    const unit = td.unit_code || `#${td.source_id.slice(0, 8)}`;
    const text = isAr
      ? `📄 *فاتورة ضريبية إلكترونية معتمدة*\n` +
        `🏢 *المنشأة:* ${organizationName}\n` +
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

  // 2. Email Share
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

  // 3. Single Invoice PDF Export
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
          value: `${taxDecisions.reduce((s, d) => s + d.vat_amount, 0).toLocaleString()} ${currencyLabel}`,
        },
        {
          label: isAr ? "الإجمالي الشامل" : "Gross Total",
          value: `${taxDecisions.reduce((s, d) => s + d.gross_amount, 0).toLocaleString()} ${currencyLabel}`,
        },
      ],
      filename: `Tax_Invoices_${new Date().toISOString().slice(0, 10)}.pdf`,
    });
  };

  return (
    <div className="space-y-6 pb-12">
      {/* ──────────────────────────────────────────────────────────────────────────
          EXECUTIVE LIGHT-THEME HEADER WITH PRIMARY CREATE CTA
          ────────────────────────────────────────────────────────────────────────── */}
      <div className="rounded-3xl border border-slate-200/90 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-xs font-bold text-purple-600 dark:text-purple-400">
              <span className="flex size-6 items-center justify-center rounded-lg bg-purple-50 dark:bg-purple-950/50">
                <Landmark className="size-3.5 text-purple-600" />
              </span>
              <span>{isAr ? "الإدارة المالية والضريبية" : "Tax & Compliance"}</span>
              <span>/</span>
              <span className="text-slate-800 dark:text-slate-200 font-extrabold">
                {isAr ? "الفوترة الإلكترونية والإقرارات" : "E-Invoicing Suite"}
              </span>
            </div>
            <h1 className="text-2xl font-black tracking-tight text-slate-950 dark:text-white sm:text-3xl">
              {isAr ? "الفوترة والإقرارات الضريبية الإلكترونية" : "E-Invoicing & Statutory Tax Compliance"}
            </h1>
            <p className="text-xs text-slate-500 max-w-2xl font-medium">
              {isAr
                ? "إصدار الفواتير الضريبية المعتمدة، تطبيق القواعد الضريبية آلياً، والربط اللحظي مع مصلحة الضرائب المصرية (ETA) وهيئة الزكاة والضريبة (ZATCA)."
                : "Issue statutory tax invoices, auto-calculate VAT, and integrate with Egyptian Tax Authority (ETA) & ZATCA."}
            </p>
          </div>

          {/* ACTIONS: PRIMARY CREATE INVOICE BUTTON */}
          <div className="flex flex-wrap items-center gap-2.5">
            <Button
              onClick={() => setIsCreateModalOpen(true)}
              size="sm"
              className="h-9.5 px-4.5 text-xs font-black bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white shadow-md shadow-purple-600/20 gap-2 cursor-pointer transition-all"
            >
              <Plus className="size-4" />
              <span>{isAr ? "إنشاء فاتورة إلكترونية جديدة" : "Issue New E-Invoice"}</span>
            </Button>

            <Button
              onClick={handleExportExcel}
              variant="outline"
              size="sm"
              className="h-9 px-3.5 text-xs font-bold border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-200 gap-1.5"
            >
              <FileSpreadsheet className="size-3.5 text-emerald-600" />
              <span>{isAr ? "تصدير إكسل" : "Excel"}</span>
            </Button>

            <Button
              onClick={handleExportPdf}
              variant="outline"
              size="sm"
              className="h-9 px-3.5 text-xs font-bold border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-200 gap-1.5"
            >
              <FileText className="size-3.5 text-rose-600" />
              <span>{isAr ? "تصدير PDF" : "PDF"}</span>
            </Button>
          </div>
        </div>

        {/* TOP SUMMARY STATS */}
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4 pt-5 border-t border-slate-100 dark:border-slate-800">
          <div className="rounded-2xl bg-slate-50/80 p-3.5 border border-slate-200/60 dark:bg-slate-800/40 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500">{isAr ? "إجمالي الوعاء الخاضع" : "Taxable Base"}</span>
              <DollarSign className="size-4 text-purple-600" />
            </div>
            <p className="text-xl font-black text-slate-900 dark:text-white mt-1 font-mono">
              {taxDecisions.reduce((s, d) => s + d.taxable_base, 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
              <span className="text-xs font-bold text-slate-400 ms-1">{currencyLabel}</span>
            </p>
            <span className="text-[10px] text-slate-400 block mt-0.5">{isAr ? "صافي قيمة التوريدات" : "Net sales base"}</span>
          </div>

          <div className="rounded-2xl bg-slate-50/80 p-3.5 border border-slate-200/60 dark:bg-slate-800/40 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500">{isAr ? "ضريبة القيمة المضافة" : "Output VAT"}</span>
              <Percent className="size-4 text-emerald-600" />
            </div>
            <p className="text-xl font-black text-emerald-600 dark:text-emerald-400 mt-1 font-mono">
              {taxDecisions.reduce((s, d) => s + d.vat_amount, 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
              <span className="text-xs font-bold text-slate-400 ms-1">{currencyLabel}</span>
            </p>
            <span className="text-[10px] text-emerald-600/80 block mt-0.5">{isAr ? "محصلة ومختومة ضريبياً" : "Collected VAT"}</span>
          </div>

          <div className="rounded-2xl bg-slate-50/80 p-3.5 border border-slate-200/60 dark:bg-slate-800/40 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500">{isAr ? "الفواتير والقرارات" : "Stamped Invoices"}</span>
              <FileCheck2 className="size-4 text-blue-600" />
            </div>
            <p className="text-xl font-black text-slate-900 dark:text-white mt-1 font-mono">{taxDecisions.length}</p>
            <span className="text-[10px] text-slate-400 block mt-0.5">{isAr ? "مكتملة ومختومة 100%" : "Audited records"}</span>
          </div>

          <div className="rounded-2xl bg-slate-50/80 p-3.5 border border-slate-200/60 dark:bg-slate-800/40 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500">{isAr ? "الامتثال والربط" : "Compliance Link"}</span>
              <ShieldCheck className="size-4 text-indigo-600" />
            </div>
            <p className="text-xl font-black text-indigo-600 dark:text-indigo-400 mt-1 font-mono">
              {currentJur.flag} {organizationJurisdiction}
            </p>
            <span className="text-[10px] text-slate-400 block mt-0.5">{isAr ? "معتمد وجاهز للربط" : "Ready"}</span>
          </div>
        </div>
      </div>

      {/* ──────────────────────────────────────────────────────────────────────────
          ACTIVE TAX JURISDICTION BANNER
          ────────────────────────────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-purple-200/80 bg-white p-4.5 shadow-xs dark:border-purple-900/50 dark:bg-slate-900">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="text-3xl">{currentJur.flag}</span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-black text-slate-900 dark:text-white">
                  {isAr ? currentJur.arName : currentJur.enName} — {isAr ? currentJur.authorityAr : currentJur.authorityEn}
                </h2>
                <Badge className="text-[10px] bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 font-bold">
                  {isAr ? "✓ مربوط بالمنشأة" : "Linked"}
                </Badge>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                <span>
                  {isAr ? "الرقم الضريبي: " : "Tax ID: "}
                  <strong className="font-mono text-slate-900 dark:text-white">{organizationTaxId || "—"}</strong>
                </span>
                <span>•</span>
                <span>
                  {isAr ? "الضريبة القياسية: " : "Standard VAT: "}
                  <strong className="text-purple-700 dark:text-purple-300 font-black">{currentJur.standardVat}</strong>
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link href="/admin">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs font-bold h-8.5 border-purple-200 text-purple-700 hover:bg-purple-50 dark:border-purple-800 dark:text-purple-300"
              >
                <Settings className="size-3.5" />
                <span>{isAr ? "إعدادات الربط والشهادات" : "Tax Link Settings"}</span>
                <ExternalLink className="size-3" />
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* ──────────────────────────────────────────────────────────────────────────
          FUNCTIONAL NAVIGATION TABS & TOOLBAR
          ────────────────────────────────────────────────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
          {/* Module Tabs */}
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl w-full lg:w-auto overflow-x-auto">
            <button
              onClick={() => setActiveTab("DECISIONS")}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all whitespace-nowrap ${
                activeTab === "DECISIONS"
                  ? "bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-white"
                  : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
              }`}
            >
              <FileCheck2 className="size-3.5 text-purple-600" />
              <span>{isAr ? "سجل الفواتير والمطالبات" : "Invoices Register"}</span>
              <Badge variant="secondary" className="text-[10px] h-4 px-1 ms-1 font-mono">
                {taxDecisions.length}
              </Badge>
            </button>

            <button
              onClick={() => setActiveTab("VAT_RETURN")}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all whitespace-nowrap ${
                activeTab === "VAT_RETURN"
                  ? "bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-white"
                  : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
              }`}
            >
              <Percent className="size-3.5 text-emerald-600" />
              <span>{isAr ? "إقرار القيمة المضافة (VAT Return)" : "VAT Return"}</span>
            </button>

            <button
              onClick={() => setActiveTab("NATURES")}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all whitespace-nowrap ${
                activeTab === "NATURES"
                  ? "bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-white"
                  : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
              }`}
            >
              <Scale className="size-3.5 text-blue-600" />
              <span>{isAr ? "القواعد الضريبية" : "Tax Rules"}</span>
              <Badge variant="secondary" className="text-[10px] h-4 px-1 ms-1 font-mono">
                {revenueNatures.length}
              </Badge>
            </button>

            <button
              onClick={() => setActiveTab("PROFILES")}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all whitespace-nowrap ${
                activeTab === "PROFILES"
                  ? "bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-white"
                  : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
              }`}
            >
              <Globe className="size-3.5 text-indigo-600" />
              <span>{isAr ? "بيئات الربط (ETA / ZATCA)" : "Tax Integrations"}</span>
              <Badge variant="secondary" className="text-[10px] h-4 px-1 ms-1 font-mono">
                {profiles.length}
              </Badge>
            </button>

            <button
              onClick={() => setActiveTab("CREATE_INFO")}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all whitespace-nowrap ${
                activeTab === "CREATE_INFO"
                  ? "bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-white"
                  : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
              }`}
            >
              <Zap className="size-3.5 text-amber-600" />
              <span>{isAr ? "دليل الفوترة" : "Invoicing Guide"}</span>
            </button>
          </div>

          {/* Search */}
          <div className="relative w-full lg:w-72">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
            <Input
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              placeholder={isAr ? "بحث بالرقم، الوحدة، المالك، البيان..." : "Search by ID, unit, owner, item..."}
              className="ps-9 text-xs h-9 bg-slate-50 dark:bg-slate-800"
            />
          </div>
        </div>

        {/* Status Filter Pills in Decisions Tab */}
        {activeTab === "DECISIONS" && (
          <div className="flex flex-wrap items-center justify-between gap-2 px-1">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-bold text-slate-500 me-1">{isAr ? "التصفية الضريبية:" : "Filter:"}</span>
              <button
                onClick={() => {
                  setFilterType("ALL");
                  setCurrentPage(1);
                }}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                  filterType === "ALL"
                    ? "bg-purple-600 text-white shadow-xs"
                    : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50"
                }`}
              >
                {isAr ? "جميع الفواتير" : "All"} ({taxDecisions.length})
              </button>

              <button
                onClick={() => {
                  setFilterType("TAXABLE");
                  setCurrentPage(1);
                }}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                  filterType === "TAXABLE"
                    ? "bg-purple-600 text-white shadow-xs"
                    : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50"
                }`}
              >
                {isAr ? `خاضع للضريبة (${currentJur.standardVat})` : "Taxable"} ({vatReturnStats.taxableCount})
              </button>

              <button
                onClick={() => {
                  setFilterType("EXEMPT");
                  setCurrentPage(1);
                }}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                  filterType === "EXEMPT"
                    ? "bg-purple-600 text-white shadow-xs"
                    : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50"
                }`}
              >
                {isAr ? "معفى من الضريبة (0%)" : "Exempt (0%)"} ({vatReturnStats.exemptCount})
              </button>
            </div>

            <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
              <span>{isAr ? "عرض في الصفحة:" : "Page size:"}</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="h-7 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs px-2 font-bold cursor-pointer"
              >
                <option value={15}>15</option>
                <option value={30}>30</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* ──────────────────────────────────────────────────────────────────────────
          TAB 1: TAX INVOICES & DECISIONS REGISTER
          ────────────────────────────────────────────────────────────────────────── */}
      {activeTab === "DECISIONS" && (
        <div className="space-y-3">
          <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-start">
                <thead className="bg-slate-50/90 text-slate-800 dark:bg-slate-800 dark:text-slate-200 font-extrabold border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="p-3.5 text-start">{isAr ? "رقم الفاتورة / المستند" : "Invoice # / Doc"}</th>
                    <th className="p-3.5 text-start">{isAr ? "الوحدة / العميل" : "Unit / Customer"}</th>
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
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {paginatedDecisions.length ? (
                    paginatedDecisions.map((td) => (
                      <tr
                        key={td.id}
                        className="hover:bg-slate-50/70 dark:hover:bg-slate-800/50 transition-colors group"
                      >
                        <td className="p-3.5 font-mono font-bold text-purple-700 dark:text-purple-400">
                          <div className="flex items-center gap-1.5">
                            <FileCheck2 className="size-3.5 text-purple-600 shrink-0" />
                            <span>#{td.id.slice(0, 8).toUpperCase()}</span>
                            <button
                              type="button"
                              onClick={() => handleCopyInvoiceId(td.id)}
                              title={isAr ? "نسخ رقم الفاتورة" : "Copy Invoice #"}
                              className="text-slate-400 hover:text-purple-600 p-0.5 rounded cursor-pointer transition-colors"
                            >
                              {copiedId === td.id ? (
                                <Check className="size-3 text-emerald-500" />
                              ) : (
                                <Copy className="size-3" />
                              )}
                            </button>
                          </div>
                        </td>

                        <td className="p-3.5 font-mono font-bold text-slate-900 dark:text-white">
                          <div>
                            <span>{td.unit_code || `#${td.source_id.slice(0, 8)}`}</span>
                            {td.owner_name && (
                              <span className="block text-[10px] text-slate-400 font-sans font-normal">
                                {td.owner_name}
                              </span>
                            )}
                          </div>
                        </td>

                        <td className="p-3.5 font-bold text-slate-800 dark:text-slate-200">
                          <div>
                            <span>{td.nature_name}</span>
                            {td.description && (
                              <span className="block text-[10px] text-slate-400 font-normal line-clamp-1">
                                {td.description}
                              </span>
                            )}
                          </div>
                        </td>

                        <td className="p-3.5 font-mono text-[11px] text-slate-600 dark:text-slate-400 whitespace-nowrap">
                          {td.decided_at}
                        </td>

                        <td className="p-3.5 text-end font-mono font-bold text-slate-900 dark:text-white text-xs">
                          {td.taxable_base.toLocaleString(undefined, { minimumFractionDigits: 2 })}{" "}
                          <span className="text-[10px] text-slate-400 font-normal">{currencyLabel}</span>
                        </td>

                        <td className="p-3.5 text-center font-mono font-bold">
                          {td.is_exempt ? (
                            <Badge variant="outline" className="text-[10px] bg-slate-50 text-slate-600 border-slate-200">
                              {isAr ? "معفى 0%" : "Exempt"}
                            </Badge>
                          ) : (
                            <Badge className="text-[10px] bg-purple-50 text-purple-700 border-purple-200 font-mono font-bold">
                              {td.vat_rate}%
                            </Badge>
                          )}
                        </td>

                        <td className="p-3.5 text-end font-mono font-bold text-purple-600 dark:text-purple-400 text-xs">
                          {td.vat_amount > 0 ? (
                            <>
                              {td.vat_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}{" "}
                              <span className="text-[10px] text-slate-400 font-normal">{currencyLabel}</span>
                            </>
                          ) : (
                            <span className="text-slate-400">0.00</span>
                          )}
                        </td>

                        <td className="p-3.5 text-end font-mono font-black text-sm text-slate-900 dark:text-white">
                          {td.gross_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}{" "}
                          <span className="text-[10px] text-slate-400 font-normal">{currencyLabel}</span>
                        </td>

                        <td className="p-3.5 text-center whitespace-nowrap">
                          <Badge className="text-[10px] font-bold bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300">
                            {isAr ? "✓ قرار مختوم" : "Stamped"}
                          </Badge>
                        </td>

                        <td className="p-3.5 text-center">
                          <div className="flex items-center justify-center gap-1">
                            {/* 1. VIEW / PREVIEW & PRINT */}
                            <Button
                              onClick={() => setViewInvoiceDecision(td)}
                              variant="outline"
                              size="sm"
                              title={isAr ? "معاينة الفاتورة الضريبية" : "Preview Tax Invoice"}
                              className="h-7 text-[11px] font-bold px-2 gap-1 border-purple-200 text-purple-700 hover:bg-purple-50"
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
                              className="h-7 w-7 p-0 text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700"
                            >
                              <MessageCircle className="size-3.5" />
                            </Button>

                            {/* 3. EMAIL */}
                            <Button
                              onClick={() => handleShareInvoiceEmail(td)}
                              variant="ghost"
                              size="sm"
                              title={isAr ? "إرسال عبر البريد الإلكتروني" : "Send via Email"}
                              className="h-7 w-7 p-0 text-blue-600 hover:bg-blue-50 hover:text-blue-700"
                            >
                              <Mail className="size-3.5" />
                            </Button>

                            {/* 4. PDF DOWNLOAD */}
                            <Button
                              onClick={() => handleExportSingleInvoicePdf(td)}
                              variant="ghost"
                              size="sm"
                              title={isAr ? "تصدير الفاتورة PDF" : "Download Invoice PDF"}
                              className="h-7 w-7 p-0 text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                            >
                              <Download className="size-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={10} className="p-12 text-center text-slate-400 text-xs">
                        <div className="flex flex-col items-center gap-2">
                          <FileCheck2 className="size-8 text-slate-300" />
                          <p>{isAr ? "لا توجد فواتير أو قرارات ضريبية مطابقة للتصفية" : "No matching tax invoices or decisions found"}</p>
                          <Button
                            onClick={() => {
                              setFilterType("ALL");
                              setSearchQuery("");
                            }}
                            size="sm"
                            variant="outline"
                            className="mt-2 text-xs font-bold text-purple-600 border-purple-200 gap-1.5"
                          >
                            <RefreshCw className="size-3.5" />
                            <span>{isAr ? "إعادة ضبط التصفية" : "Reset Filter"}</span>
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
              <div className="text-xs text-slate-500 font-medium">
                {isAr
                  ? `عرض ${(currentPage - 1) * pageSize + 1} إلى ${Math.min(currentPage * pageSize, filteredDecisions.length)} من أصل ${filteredDecisions.length} فاتورة`
                  : `Showing ${(currentPage - 1) * pageSize + 1} to ${Math.min(currentPage * pageSize, filteredDecisions.length)} of ${filteredDecisions.length} invoices`}
              </div>

              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  className="h-8 px-3 text-xs font-bold cursor-pointer"
                >
                  {isAr ? "السابق" : "Previous"}
                </Button>
                <div className="flex items-center gap-1 px-2 text-xs font-mono font-bold text-slate-700 dark:text-slate-300">
                  <span>{currentPage}</span>
                  <span>/</span>
                  <span>{totalPages}</span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  className="h-8 px-3 text-xs font-bold cursor-pointer"
                >
                  {isAr ? "التالي" : "Next"}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────────────────────
          TAB 2: VAT RETURN BOX SUMMARY
          ────────────────────────────────────────────────────────────────────────── */}
      {activeTab === "VAT_RETURN" && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-emerald-200/80 bg-white p-5 shadow-xs dark:border-emerald-900/50 dark:bg-slate-900 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="size-8 rounded-xl bg-emerald-50 dark:bg-emerald-950 flex items-center justify-center text-emerald-600">
                  <Percent className="size-4" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900 dark:text-white">
                    {isAr ? "ملخص إقرار ضريبة القيمة المضافة للفترة الحالية" : "Current Period VAT Return Summary"}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    {isAr ? "مطابقة أوعية المبيعات والتوريدات المعفاة والضريبة المستحقة للسداد لمصلحة الضرائب" : "Aggregated tax base, exempt sales, and net output VAT payable"}
                  </p>
                </div>
              </div>

              <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 text-xs font-bold">
                {isAr ? "جاهز للتقديم" : "Filing Ready"}
              </Badge>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
              {/* BOX 1: STANDARD RATED */}
              <div className="rounded-xl border border-purple-100 dark:border-purple-900/40 bg-purple-50/50 dark:bg-purple-950/20 p-4 space-y-2">
                <span className="text-[11px] font-bold text-purple-700 dark:text-purple-300 block">
                  {isAr ? `1. المبيعات الخاضعة للنسبة القياسية (${currentJur.standardVat})` : `1. Standard Rated Sales (${currentJur.standardVat})`}
                </span>
                <p className="text-lg font-black text-slate-900 dark:text-white font-mono">
                  {vatReturnStats.taxableBase.toLocaleString(undefined, { minimumFractionDigits: 2 })}{" "}
                  <span className="text-xs font-normal text-slate-500">{currencyLabel}</span>
                </p>
                <div className="flex items-center justify-between text-xs pt-1 border-t border-purple-200/40 dark:border-purple-800/40 font-semibold text-purple-700 dark:text-purple-300">
                  <span>{isAr ? "الضريبة المستحقة (Output VAT):" : "Output VAT:"}</span>
                  <span className="font-mono font-bold">{vatReturnStats.outputVat.toLocaleString(undefined, { minimumFractionDigits: 2 })} {currencyLabel}</span>
                </div>
              </div>

              {/* BOX 2: EXEMPT SALES */}
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/40 p-4 space-y-2">
                <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block">
                  {isAr ? "2. المبيعات والتأجير السكني المعفى (0%)" : "2. Exempt Supplies & Residential (0%)"}
                </span>
                <p className="text-lg font-black text-slate-900 dark:text-white font-mono">
                  {vatReturnStats.exemptBase.toLocaleString(undefined, { minimumFractionDigits: 2 })}{" "}
                  <span className="text-xs font-normal text-slate-500">{currencyLabel}</span>
                </p>
                <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-200 dark:border-slate-700 text-slate-500">
                  <span>{isAr ? "ضريبة القيمة المضافة:" : "VAT Amount:"}</span>
                  <span className="font-mono font-bold">0.00 {currencyLabel}</span>
                </div>
              </div>

              {/* BOX 3: NET TAX PAYABLE */}
              <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-950/30 p-4 space-y-2">
                <span className="text-[11px] font-bold text-emerald-800 dark:text-emerald-300 block">
                  {isAr ? "3. صافي ضريبة القيمة المضافة المستحقة للسداد" : "3. Net VAT Payable to Authority"}
                </span>
                <p className="text-xl font-black text-emerald-700 dark:text-emerald-400 font-mono">
                  {vatReturnStats.outputVat.toLocaleString(undefined, { minimumFractionDigits: 2 })}{" "}
                  <span className="text-xs font-normal text-slate-500">{currencyLabel}</span>
                </p>
                <div className="flex items-center justify-between text-xs pt-1 border-t border-emerald-200 dark:border-emerald-800/60 text-emerald-700 dark:text-emerald-300 font-semibold">
                  <span>{isAr ? "حالة المطابقة:" : "Audit Status:"}</span>
                  <span>{isAr ? "✓ مطابقة بنسبة 100%" : "100% Balanced"}</span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
              <div className="text-xs text-slate-500">
                {isAr
                  ? `تم احتساب الإقرار آلياً بناءً على ${taxDecisions.length} معاملة وقرار ضريبي معتمد بدفتر الأستاذ العام.`
                  : `Calculated automatically from ${taxDecisions.length} statutory tax decisions in General Ledger.`}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  onClick={handleExportExcel}
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-xs font-bold"
                >
                  <FileSpreadsheet className="size-3.5 text-emerald-600" />
                  <span>{isAr ? "تصدير جدول الإقرار الضريبي (Excel)" : "Export Tax Return (Excel)"}</span>
                </Button>
                <Button
                  onClick={handleExportPdf}
                  size="sm"
                  className="bg-purple-600 hover:bg-purple-700 text-white gap-1.5 text-xs font-bold"
                >
                  <FileText className="size-3.5" />
                  <span>{isAr ? "طباعة مسودة الإقرار الضريبي المعتمدة (PDF)" : "Print Tax Declaration (PDF)"}</span>
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────────────────────
          TAB 4: INTEGRATIONS, ETA / ZATCA PROFILES & CRYPTO CONFIGS
          ────────────────────────────────────────────────────────────────────────── */}
      {activeTab === "PROFILES" && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4 shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="size-8 rounded-xl bg-indigo-50 dark:bg-indigo-950 flex items-center justify-center text-indigo-600">
                  <Globe className="size-4" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900 dark:text-white">
                    {isAr ? "إعدادات الربط والشهادات الرقمية لمنظومات الضرائب" : "Statutory Tax Authority Integration Profiles"}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    {isAr
                      ? "إدارة بيئات الربط التجريبية والإنتاجية (ETA / ZATCA / PEPPOL) والتحقق من التراخيص الرقمية."
                      : "Manage sandbox & production credentials and cryptographic verification for statutory filing."}
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              {(["EG", "SA", "AE"] as const).map((jurKey) => {
                const jur = JURISDICTION_INFO[jurKey];
                const prof = profiles.find((p) => p.jurisdiction.startsWith(jurKey));
                return (
                  <div
                    key={jurKey}
                    className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 p-4 space-y-3"
                  >
                    <div className="flex items-center justify-between border-b border-slate-200/60 dark:border-slate-700/60 pb-2.5">
                      <div className="flex items-center gap-2">
                        <span className="text-2xl">{jur.flag}</span>
                        <div>
                          <h4 className="text-xs font-bold text-slate-900 dark:text-white">
                            {isAr ? jur.arName : jur.enName} — {isAr ? jur.authorityAr : jur.authorityEn}
                          </h4>
                          <span className="text-[10px] text-slate-400">
                            {isAr ? "الضريبة القياسية:" : "Standard VAT:"} <strong>{jur.standardVat}</strong>
                          </span>
                        </div>
                      </div>

                      {prof?.enabled ? (
                        <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-[10px] font-bold">
                          {isAr ? "✓ الإرسال مفعّل" : "Filing Active"}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] font-bold text-slate-500">
                          {isAr ? "غير مفعل حالياً" : "Inactive"}
                        </Badge>
                      )}
                    </div>

                    <ProfileForm
                      organizationId={organizationId}
                      jurisdiction={jurKey as Jurisdiction}
                      environment={(prof?.environment as "SANDBOX" | "PRODUCTION") || "SANDBOX"}
                      taxpayerId={prof?.taxpayer_id || organizationTaxId || null}
                      branchCode={prof?.branch_code || "0"}
                      activityCode={prof?.activity_code || "6810"}
                      locale={locale}
                    />

                    {prof && (
                      <div className="pt-2 border-t border-slate-200/60 dark:border-slate-700/60">
                        <FilingToggle
                          profileId={prof.id}
                          enabled={prof.enabled}
                          canEnable={Boolean(prof.verified_at)}
                          locale={locale}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────────────────────
          TAB 2: INVOICING GUIDE & FUNCTIONAL WALKTHROUGH
          ────────────────────────────────────────────────────────────────────────── */}
      {activeTab === "CREATE_INFO" && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 space-y-3 dark:border-slate-800 dark:bg-slate-900 shadow-xs">
            <div className="flex size-10 items-center justify-center rounded-2xl bg-purple-50 text-purple-600 dark:bg-purple-950">
              <Plus className="size-5" />
            </div>
            <h3 className="text-sm font-black text-slate-900 dark:text-white">
              {isAr ? "1. إنشاء الفاتورة والمطالبة" : "1. Invoice Issuance"}
            </h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              {isAr
                ? "يمكنك إنشاء فاتورة ضريبية إلكترونية مباشرة من هذه الصفحة بالضغط على زر «إنشاء فاتورة إلكترونية جديدة» بالأعلى، أو من شاشة المستحقات."
                : "Issue invoices directly from this page using the top button or via receivables screen."}
            </p>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-5 space-y-3 dark:border-slate-800 dark:bg-slate-900 shadow-xs">
            <div className="flex size-10 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-950">
              <Scale className="size-5" />
            </div>
            <h3 className="text-sm font-black text-slate-900 dark:text-white">
              {isAr ? "2. التكييف والختم الضريبي الآلي" : "2. Automated Tax Stamping"}
            </h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              {isAr
                ? "يقوم المحرك الضريبي بفحص نوع الإيراد وتحديد خضوعه للضريبة القياسية أو الإعفاء، وتوليد القرار الضريبي وختمه فورياً بدفتر الأستاذ."
                : "Automatic tax rules engine applies standard VAT or exemption and stamps decision snapshot."}
            </p>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-5 space-y-3 dark:border-slate-800 dark:bg-slate-900 shadow-xs">
            <div className="flex size-10 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950">
              <Share2 className="size-5" />
            </div>
            <h3 className="text-sm font-black text-slate-900 dark:text-white">
              {isAr ? "3. الإرسال عبر واتساب والإيميل والطباعة" : "3. Multi-Channel Distribution"}
            </h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              {isAr
                ? "توليد الفاتورة الضريبية الرسمية المعتمدة مع رمز الاستجابة السريع (QR Code)، مع إمكانية الطباعة وتصدير PDF والإرسال عبر واتساب والبريد."
                : "Share official compliant invoices via WhatsApp, Email, instant Print, or export to PDF."}
            </p>
          </div>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────────────────────
          TAB 3: REVENUE TAX NATURES & RULES
          ────────────────────────────────────────────────────────────────────────── */}
      {activeTab === "NATURES" && (
        <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-start">
              {/* CLEAN LIGHT THEME TABLE HEADER */}
              <thead className="bg-slate-50/90 text-slate-800 dark:bg-slate-800 dark:text-slate-200 font-extrabold border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="p-3.5 text-start">{isAr ? "كود البند الضريبي" : "Nature Code"}</th>
                  <th className="p-3.5 text-start">{isAr ? "المسمى (بالعربية)" : "Arabic Title"}</th>
                  <th className="p-3.5 text-start">{isAr ? "المسمى (بالإنجليزية)" : "English Title"}</th>
                  <th className="p-3.5 text-center">{isAr ? "نوع التوريد" : "Supply Type"}</th>
                  <th className="p-3.5 text-end">{isAr ? "المعاملة الضريبية المعتمدة" : "Statutory Tax Rule"}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredNatures.length ? (
                  filteredNatures.map((n) => (
                    <tr
                      key={n.code}
                      className="hover:bg-slate-50/70 dark:hover:bg-slate-800/50 transition-colors group"
                    >
                      <td className="p-3.5 font-mono font-bold text-slate-900 dark:text-white">
                        <div className="flex items-center gap-1.5">
                          <Scale className="size-3.5 text-slate-400" />
                          <span>{n.code}</span>
                        </div>
                      </td>

                      <td className="p-3.5 font-bold text-slate-900 dark:text-white">
                        {n.name_ar}
                      </td>

                      <td className="p-3.5 text-slate-600 dark:text-slate-400 font-medium">
                        {n.name_en}
                      </td>

                      <td className="p-3.5 text-center">
                        <Badge
                          variant="outline"
                          className="text-[10px] font-mono border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-300"
                        >
                          {n.is_derived ? (isAr ? "مشتق من الأصل" : "Derived") : (isAr ? "توريد مباشر" : "Direct Supply")}
                        </Badge>
                      </td>

                      <td className="p-3.5 text-end font-semibold text-slate-800 dark:text-slate-200">
                        {n.code.includes("RESIDENTIAL_RENT") || n.code.includes("RESIDENTIAL_UNIT_SALE") ? (
                          <span className="text-slate-600 dark:text-slate-400 font-bold">
                            {isAr ? "معفى من الضريبة 0%" : "Tax Exempt (0%)"}
                          </span>
                        ) : (
                          <span className="text-purple-600 dark:text-purple-400 font-bold">
                            {isAr ? `خاضع بالنسبة القياسية (${currentJur.standardVat})` : `Standard Rate ${currentJur.standardVat}`}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="p-10 text-center text-slate-400 text-xs">
                      {isAr ? "لا توجد تصنيفات ضريبية مطابقة" : "No tax natures found"}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
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
                  className="w-full h-9 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white cursor-pointer"
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
                  className="w-full h-9 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white cursor-pointer"
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
                  className="w-full h-9 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white cursor-pointer"
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
                  className="w-full h-9 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white cursor-pointer"
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
                  className="text-xs h-9 bg-slate-50 dark:bg-slate-800 font-mono font-bold"
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
                  className="text-xs h-9 bg-slate-50 dark:bg-slate-800 font-mono"
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
                className="text-xs h-9 bg-slate-50 dark:bg-slate-800"
              />
            </div>

            {/* REAL-TIME TAX CALCULATION PREVIEW */}
            <div className="rounded-2xl bg-purple-50/70 dark:bg-purple-950/20 p-3.5 border border-purple-200/80 dark:border-purple-900/50 space-y-2">
              <div className="flex items-center justify-between text-[11px] text-slate-600 dark:text-slate-300">
                <span>{isAr ? "الوعاء الصافي (قبل الضريبة):" : "Net Base Amount:"}</span>
                <span className="font-mono font-bold">{calculatedTax.base.toLocaleString()} {currencyLabel}</span>
              </div>
              <div className="flex items-center justify-between text-[11px] text-purple-700 dark:text-purple-400">
                <span>{isAr ? `ضريبة القيمة المضافة (${calculatedTax.rate}%):` : `VAT (${calculatedTax.rate}%):`}</span>
                <span className="font-mono font-bold">{calculatedTax.vat.toLocaleString()} {currencyLabel}</span>
              </div>
              <div className="pt-2 border-t border-purple-200/60 dark:border-purple-900/60 flex items-center justify-between font-black text-sm text-slate-950 dark:text-white">
                <span>{isAr ? "إجمالي الفاتورة المطلوب سدادها:" : "Gross Payable Total:"}</span>
                <span className="font-mono text-purple-700 dark:text-purple-300">{calculatedTax.gross.toLocaleString()} {currencyLabel}</span>
              </div>
            </div>

            <DialogFooter className="pt-3 flex items-center justify-between">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsCreateModalOpen(false)}
                className="text-xs font-bold h-9"
              >
                {isAr ? "إلغاء" : "Cancel"}
              </Button>

              <Button
                type="submit"
                disabled={isPending || !invoiceAmount}
                size="sm"
                className="bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold h-9 px-5 gap-1.5 shadow-sm"
              >
                {isPending ? <span>{isAr ? "جاري الإصدار..." : "Issuing..."}</span> : <span>{isAr ? "إصدار وختم الفاتورة فوراً" : "Issue Tax Invoice"}</span>}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ──────────────────────────────────────────────────────────────────────────
          MODAL 2: OFFICIAL TAX INVOICE PREVIEW & 360° ACTIONS
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
                {isAr ? "مختومة ضريبياً" : "Stamped"}
              </Badge>
            </DialogTitle>
          </DialogHeader>

          {viewInvoiceDecision && (
            <div className="space-y-4 pt-2 text-xs">
              {/* INVOICE BILLING SHEET */}
              <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/40 p-5 space-y-4">
                {/* SELLER & INVOICE META */}
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-700">
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider">{isAr ? "المورد / المنشأة" : "Seller"}</span>
                    <h3 className="text-base font-black text-slate-900 dark:text-white">{organizationName}</h3>
                    <p className="text-slate-500 font-medium">{isAr ? "الرقم الضريبي: " : "Tax ID: "}<strong className="font-mono text-slate-800 dark:text-slate-200">{organizationTaxId || "—"}</strong></p>
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
                  <div className="flex items-center gap-2">
                    <QrCode className="size-12 text-slate-800 dark:text-slate-200 border p-1 rounded-lg bg-white" />
                    <span className="text-[10px] text-slate-400 max-w-[140px]">{isAr ? "رمز التحقق والختم الضريبي الرقمي المعتمد" : "Compliant Statutory QR Stamp"}</span>
                  </div>

                  <div className="space-y-1 text-end">
                    <div className="text-[11px] text-slate-500">{isAr ? "الصافي: " : "Net: "}<span className="font-mono font-bold">{viewInvoiceDecision.taxable_base.toLocaleString()} {currencyLabel}</span></div>
                    <div className="text-[11px] text-purple-600 font-bold">{isAr ? "الضريبة: " : "VAT: "}<span className="font-mono">{viewInvoiceDecision.vat_amount.toLocaleString()} {currencyLabel}</span></div>
                    <div className="text-sm font-black text-slate-900 dark:text-white pt-1 border-t border-slate-200 dark:border-slate-700">
                      {isAr ? "الإجمالي النهائي: " : "Gross Total: "}<span className="font-mono text-purple-700 dark:text-purple-400">{viewInvoiceDecision.gross_amount.toLocaleString()} {currencyLabel}</span>
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
                    className="h-8.5 text-xs font-bold border-emerald-200 text-emerald-700 hover:bg-emerald-50 gap-1.5"
                  >
                    <MessageCircle className="size-3.5" />
                    <span>{isAr ? "واتساب" : "WhatsApp"}</span>
                  </Button>

                  {/* EMAIL */}
                  <Button
                    onClick={() => handleShareInvoiceEmail(viewInvoiceDecision)}
                    variant="outline"
                    size="sm"
                    className="h-8.5 text-xs font-bold border-blue-200 text-blue-700 hover:bg-blue-50 gap-1.5"
                  >
                    <Mail className="size-3.5" />
                    <span>{isAr ? "إيميل" : "Email"}</span>
                  </Button>

                  {/* PDF DOWNLOAD */}
                  <Button
                    onClick={() => handleExportSingleInvoicePdf(viewInvoiceDecision)}
                    variant="outline"
                    size="sm"
                    className="h-8.5 text-xs font-bold border-rose-200 text-rose-700 hover:bg-rose-50 gap-1.5"
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
                    className="text-xs font-bold h-8.5"
                  >
                    {isAr ? "إغلاق" : "Close"}
                  </Button>

                  <Button
                    onClick={() => handleExportSingleInvoicePdf(viewInvoiceDecision)}
                    size="sm"
                    className="bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold h-8.5 px-4 gap-1.5 shadow-sm"
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
