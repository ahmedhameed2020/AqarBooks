"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  UserCheck,
  Plus,
  Percent,
  CreditCard,
  Building2,
  Calendar,
  Layers,
  FileText,
  DollarSign,
  AlertCircle,
  RefreshCw,
  CheckCircle2,
  ListFilter,
  Phone,
  Mail,
  ShieldCheck,
  Calculator,
} from "lucide-react";
import {
  createBroker,
  accrueCommissionAction,
  payCommissionAction,
} from "@/lib/actions/commissions";
import { useToast } from "@/components/ui/toast";
import { getCurrencyLabel } from "@/lib/currency";

export type Option = { id: string; label: string };

export type BrokerItem = {
  id: string;
  name: string;
  broker_type: "INTERNAL" | "EXTERNAL" | string;
  default_wht_rate: number;
  tax_id?: string | null;
  phone?: string | null;
  email?: string | null;
  is_active: boolean;
  totalCommissions?: number;
  accruedCount?: number;
};

/* ──────────────────────────────────────────────────────────────────────────
   1. CREATE BROKER DIALOG
   ────────────────────────────────────────────────────────────────────────── */
export function CreateBrokerDialog({
  open,
  onOpenChange,
  organizationId,
  locale,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  locale: string;
}) {
  const isAr = locale === "ar";
  const router = useRouter();
  const toast = useToast();
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [brokerType, setBrokerType] = useState<"EXTERNAL" | "INTERNAL">("EXTERNAL");
  const [defaultWhtRate, setDefaultWhtRate] = useState("0");
  const [taxId, setTaxId] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!name.trim()) {
      setErrorMsg(isAr ? "يرجى كتابة اسم الوسيط أو المكتب" : "Please enter broker name");
      return;
    }

    startTransition(async () => {
      const formData = new FormData();
      formData.set("organizationId", organizationId);
      formData.set("name", name.trim());
      formData.set("brokerType", brokerType);
      formData.set("defaultWhtRate", defaultWhtRate || "0");
      if (taxId.trim()) formData.set("taxId", taxId.trim());
      if (phone.trim()) formData.set("phone", phone.trim());
      if (email.trim()) formData.set("email", email.trim());

      const res = await createBroker({ ok: true }, formData);

      if (res.ok) {
        toast.add({
          type: "success",
          title: isAr ? "تم تسجيل الوسيط بنجاح" : "Broker Added Successfully",
          description: isAr
            ? `تمت إضافة الوسيط "${name}" إلى دليل الوسطاء`
            : `Broker "${name}" added to directory`,
        });
        onOpenChange(false);
        setName("");
        setTaxId("");
        setPhone("");
        setEmail("");
        router.refresh();
      } else {
        const err = res.error || "";
        if (err === "duplicate_broker") {
          setErrorMsg(isAr ? "يوجد وسيط مسجل بنفس الاسم مسبقاً." : "A broker with that name already exists.");
        } else {
          setErrorMsg(isAr ? "تعذر حفظ بيانات الوسيط." : "Failed to add broker.");
        }
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <div className="flex size-10 items-center justify-center rounded-xl bg-blue-600/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400">
            <UserCheck className="size-5" />
          </div>
          <div>
            <DialogTitle>{isAr ? "إضافة وسيط جديد" : "Add New Broker"}</DialogTitle>
            <DialogDescription>
              {isAr
                ? "تسجيل وسيط خارجي أو مندوب مبيعات داخلي مع نسبة خصم المنبع الافتراضية."
                : "Register an external broker or in-house agent with default withholding tax."}
            </DialogDescription>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <DialogBody className="space-y-4">
            {errorMsg && (
              <div
                role="alert"
                className="flex items-center gap-2.5 rounded-xl border border-red-200 bg-red-50/90 p-3 text-xs font-semibold text-red-700 dark:border-red-900/50 dark:bg-red-950/50 dark:text-red-300"
              >
                <AlertCircle className="size-4 shrink-0 text-red-600 dark:text-red-400" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Name & Type */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5 text-start">
                <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  {isAr ? "اسم الوسيط / المكتب *" : "Broker / Agency Name *"}
                </Label>
                <Input
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={isAr ? "مثال: شركة الأهرام العقارية" : "e.g. Al-Ahram Brokerage"}
                  className="text-sm"
                />
              </div>

              <div className="space-y-1.5 text-start">
                <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  {isAr ? "نوع الوسيط" : "Broker Type"}
                </Label>
                <Select
                  value={brokerType}
                  onValueChange={(val) => setBrokerType((val as typeof brokerType) ?? "EXTERNAL")}
                  items={[
                    { value: "EXTERNAL", label: isAr ? "مكتب / مسوق خارجي" : "External Agency" },
                    { value: "INTERNAL", label: isAr ? "مندوب مبيعات داخلي" : "In-House Agent" },
                  ]}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="EXTERNAL">{isAr ? "مكتب / مسوق خارجي" : "External Agency"}</SelectItem>
                    <SelectItem value="INTERNAL">{isAr ? "مندوب مبيعات داخلي" : "In-House Agent"}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Default WHT & Tax ID */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5 text-start">
                <Label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                  <Percent className="size-3 text-slate-400" />
                  <span>{isAr ? "نسبة خصم المنبع الافتراضية %" : "Default Withholding %"}</span>
                </Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={defaultWhtRate}
                  onChange={(e) => setDefaultWhtRate(e.target.value)}
                  placeholder="0"
                  className="font-mono text-sm"
                />
              </div>

              <div className="space-y-1.5 text-start">
                <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  {isAr ? "الرقم الضريبي" : "Tax ID / Registration"}
                </Label>
                <Input
                  value={taxId}
                  onChange={(e) => setTaxId(e.target.value)}
                  placeholder={isAr ? "اختياري" : "Optional"}
                  className="font-mono text-sm"
                />
              </div>
            </div>

            {/* Phone & Email */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5 text-start">
                <Label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                  <Phone className="size-3 text-slate-400" />
                  <span>{isAr ? "رقم الهاتف / واتساب" : "Phone / WhatsApp"}</span>
                </Label>
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="010XXXXXXXX"
                  className="font-mono text-sm"
                  dir="ltr"
                />
              </div>

              <div className="space-y-1.5 text-start">
                <Label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                  <Mail className="size-3 text-slate-400" />
                  <span>{isAr ? "البريد الإلكتروني" : "Email Address"}</span>
                </Label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="broker@example.com"
                  className="text-sm"
                  dir="ltr"
                />
              </div>
            </div>
          </DialogBody>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              {isAr ? "إلغاء" : "Cancel"}
            </Button>
            <Button
              type="submit"
              disabled={isPending}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold gap-1.5"
            >
              {isPending ? <RefreshCw className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
              <span>{isAr ? "حفظ الوسيط" : "Save Broker"}</span>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   2. ACCRUE COMMISSION DIALOG
   ────────────────────────────────────────────────────────────────────────── */
export function AccrueCommissionDialog({
  open,
  onOpenChange,
  organizationId,
  brokers,
  properties,
  liabilityAccounts,
  currency = "EGP",
  locale,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  brokers: Option[];
  properties: Option[];
  liabilityAccounts: Option[];
  currency?: string;
  locale: string;
}) {
  const isAr = locale === "ar";
  const currencyLabel = getCurrencyLabel(currency, isAr);
  const router = useRouter();
  const toast = useToast();
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [brokerId, setBrokerId] = useState<string>(brokers[0]?.id ?? "");
  const [propertyId, setPropertyId] = useState<string>(properties[0]?.id ?? "");
  const [calcMode, setCalcMode] = useState<"PERCENT" | "FIXED">("PERCENT");
  const [basisAmount, setBasisAmount] = useState<string>("");
  const [ratePercent, setRatePercent] = useState<string>("2.5");
  const [grossAmount, setGrossAmount] = useState<string>("");
  const [whtRate, setWhtRate] = useState<string>("0");
  const [whtAccountId, setWhtAccountId] = useState<string>(liabilityAccounts[0]?.id ?? "");
  const [earnedDate, setEarnedDate] = useState<string>(
    new Date().toISOString().split("T")[0]
  );
  const [note, setNote] = useState<string>("");

  // Live calculated amounts
  const computedGross =
    calcMode === "PERCENT"
      ? (Number(basisAmount || 0) * Number(ratePercent || 0)) / 100
      : Number(grossAmount || 0);

  const computedWht = (computedGross * Number(whtRate || 0)) / 100;
  const computedNet = Math.max(0, computedGross - computedWht);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!brokerId) {
      setErrorMsg(isAr ? "يرجى اختيار الوسيط" : "Please select a broker");
      return;
    }
    if (!propertyId) {
      setErrorMsg(isAr ? "يرجى اختيار المشروع / العقار" : "Please select a property");
      return;
    }
    if (calcMode === "PERCENT" && (!basisAmount || Number(basisAmount) <= 0)) {
      setErrorMsg(isAr ? "يرجى إدخال قيمة الصفقة / الأساس" : "Please enter deal basis amount");
      return;
    }
    if (calcMode === "FIXED" && (!grossAmount || Number(grossAmount) <= 0)) {
      setErrorMsg(isAr ? "يرجى إدخال مبلغ العمولة الإجمالي" : "Please enter gross commission");
      return;
    }
    if (Number(whtRate || 0) > 0 && !whtAccountId) {
      setErrorMsg(isAr ? "يرجى تحديد حساب التزام ضريبة الخصم من المنبع" : "WHT account required for tax deduction");
      return;
    }

    startTransition(async () => {
      const formData = new FormData();
      formData.set("organizationId", organizationId);
      formData.set("brokerId", brokerId);
      formData.set("propertyId", propertyId);
      formData.set("earnedDate", earnedDate);

      if (calcMode === "PERCENT") {
        formData.set("basisAmount", basisAmount);
        formData.set("ratePercent", ratePercent);
      } else {
        formData.set("grossAmount", grossAmount);
        formData.set("basisAmount", "0");
      }

      if (Number(whtRate || 0) > 0) {
        formData.set("whtRate", whtRate);
        formData.set("whtAccountId", whtAccountId);
      }

      if (note.trim()) formData.set("note", note.trim());

      const res = await accrueCommissionAction({ ok: true }, formData);

      if (res.ok) {
        toast.add({
          type: "success",
          title: isAr ? "تم تسجيل استحقاق العمولة بنجاح" : "Commission Accrued Successfully",
          description: isAr
            ? `تم إثبات استحقاق عمولة بمبلغ ${computedNet.toLocaleString()} ${currencyLabel} وترحيل القيد المحاسبي.`
            : `Accrued net commission of ${computedNet.toLocaleString()} ${currencyLabel}`,
        });
        onOpenChange(false);
        setBasisAmount("");
        setGrossAmount("");
        setNote("");
        router.refresh();
      } else {
        const err = res.error || "";
        if (err.includes("COMMISSION_ACCOUNTS_NOT_SET")) {
          setErrorMsg(
            isAr
              ? "لم تُحدَّد حسابات مصروف العمولة والتزامها في إعدادات المالية. يرجى تحديدها أولاً في شجرة الحسابات."
              : "Commission accounts are not configured in finance settings."
          );
        } else if (err.includes("NO_OPEN_FISCAL_PERIOD")) {
          setErrorMsg(isAr ? "لا توجد فترة مالية مفتوحة تغطي تاريخ الاستحقاق." : "No open fiscal period covers this date.");
        } else {
          setErrorMsg(err || (isAr ? "حدث خطأ أثناء تسجيل العمولة." : "Failed to accrue commission."));
        }
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <div className="flex size-10 items-center justify-center rounded-xl bg-purple-600/10 text-purple-600 dark:bg-purple-500/20 dark:text-purple-400">
            <Calculator className="size-5" />
          </div>
          <div>
            <DialogTitle>{isAr ? "تسجيل استحقاق عمولة وسيط" : "Accrue Broker Commission"}</DialogTitle>
            <DialogDescription>
              {isAr
                ? "إثبات استحقاق العمولة المحاسبي مع حساب ضريبة الخصم من المنبع وترحيل القيد المزدوج."
                : "Record accrued commission liability and auto-post double-entry GL transactions."}
            </DialogDescription>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <DialogBody className="space-y-4">
            {errorMsg && (
              <div
                role="alert"
                className="flex items-center gap-2.5 rounded-xl border border-red-200 bg-red-50/90 p-3 text-xs font-semibold text-red-700 dark:border-red-900/50 dark:bg-red-950/50 dark:text-red-300"
              >
                <AlertCircle className="size-4 shrink-0 text-red-600 dark:text-red-400" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Broker & Property */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5 text-start">
                <Label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                  <UserCheck className="size-3 text-blue-600" />
                  <span>{isAr ? "الوسيط *" : "Broker *"}</span>
                </Label>
                <Select
                  value={brokerId}
                  onValueChange={(val) => setBrokerId(val ?? "")}
                  items={brokers.map((b) => ({ value: b.id, label: b.label }))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={isAr ? "اختر الوسيط..." : "Select broker..."} />
                  </SelectTrigger>
                  <SelectContent>
                    {brokers.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5 text-start">
                <Label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                  <Building2 className="size-3 text-purple-600" />
                  <span>{isAr ? "المشروع / العقار *" : "Property / Deal *"}</span>
                </Label>
                <Select
                  value={propertyId}
                  onValueChange={(val) => setPropertyId(val ?? "")}
                  items={properties.map((p) => ({ value: p.id, label: p.label }))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={isAr ? "اختر العقار..." : "Select property..."} />
                  </SelectTrigger>
                  <SelectContent>
                    {properties.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Mode selector */}
            <div className="flex items-center gap-2 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
              <button
                type="button"
                onClick={() => setCalcMode("PERCENT")}
                className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${
                  calcMode === "PERCENT"
                    ? "bg-white text-slate-900 shadow-2xs dark:bg-slate-900 dark:text-white"
                    : "text-slate-500 hover:text-slate-900"
                }`}
              >
                {isAr ? "نسبة مئوية من الصفقة (%)" : "Percentage of Deal (%)"}
              </button>
              <button
                type="button"
                onClick={() => setCalcMode("FIXED")}
                className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${
                  calcMode === "FIXED"
                    ? "bg-white text-slate-900 shadow-2xs dark:bg-slate-900 dark:text-white"
                    : "text-slate-500 hover:text-slate-900"
                }`}
              >
                {isAr ? "مبلغ إجمالي ثابت مقطوع" : "Fixed Gross Amount"}
              </button>
            </div>

            {/* Calculations Fields */}
            {calcMode === "PERCENT" ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5 text-start">
                  <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    {isAr ? "قيمة الصفقة / العقد" : "Deal / Basis Amount"}
                  </Label>
                  <div className="relative">
                    <Input
                      type="number"
                      step="0.01"
                      min="0.01"
                      required
                      value={basisAmount}
                      onChange={(e) => setBasisAmount(e.target.value)}
                      placeholder="1,000,000"
                      className="font-mono text-sm pe-12"
                      dir="ltr"
                    />
                    <div className="absolute inset-y-0 end-0 flex items-center pe-3 pointer-events-none text-xs font-bold text-slate-400">
                      {currencyLabel}
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5 text-start">
                  <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    {isAr ? "نسبة العمولة %" : "Commission Rate %"}
                  </Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0.01"
                    max="100"
                    required
                    value={ratePercent}
                    onChange={(e) => setRatePercent(e.target.value)}
                    placeholder="2.5"
                    className="font-mono text-sm"
                    dir="ltr"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-1.5 text-start">
                <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  {isAr ? "مبلغ العمولة الإجمالي" : "Gross Commission Amount"}
                </Label>
                <div className="relative">
                  <Input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    value={grossAmount}
                    onChange={(e) => setGrossAmount(e.target.value)}
                    placeholder="25,000.00"
                    className="font-mono text-sm pe-12"
                    dir="ltr"
                  />
                  <div className="absolute inset-y-0 end-0 flex items-center pe-3 pointer-events-none text-xs font-bold text-slate-400">
                    {currencyLabel}
                  </div>
                </div>
              </div>
            )}

            {/* Withholding Tax (WHT) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5 text-start">
                <Label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                  <Percent className="size-3 text-rose-600" />
                  <span>{isAr ? "نسبة خصم المنبع %" : "Withholding Rate %"}</span>
                </Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={whtRate}
                  onChange={(e) => setWhtRate(e.target.value)}
                  placeholder="0"
                  className="font-mono text-sm"
                  dir="ltr"
                />
              </div>

              {Number(whtRate || 0) > 0 && (
                <div className="space-y-1.5 text-start">
                  <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    {isAr ? "حساب التزام الضريبة" : "WHT Liability Account"}
                  </Label>
                  <Select
                    value={whtAccountId}
                    onValueChange={(val) => setWhtAccountId(val ?? "")}
                    items={liabilityAccounts.map((a) => ({ value: a.id, label: a.label }))}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder={isAr ? "اختر الحساب..." : "Select account..."} />
                    </SelectTrigger>
                    <SelectContent>
                      {liabilityAccounts.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {/* Date & Note */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5 text-start">
                <Label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                  <Calendar className="size-3 text-slate-400" />
                  <span>{isAr ? "تاريخ الاستحقاق" : "Earned Date"}</span>
                </Label>
                <Input
                  type="date"
                  required
                  value={earnedDate}
                  onChange={(e) => setEarnedDate(e.target.value)}
                  className="font-mono text-sm"
                />
              </div>

              <div className="space-y-1.5 text-start">
                <Label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                  <FileText className="size-3 text-slate-400" />
                  <span>{isAr ? "البيان / الملاحظات" : "Notes"}</span>
                </Label>
                <Input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={isAr ? "مثال: عمولة بيع الوحدة A-102" : "e.g. Sale of Unit A-102"}
                  className="text-sm"
                />
              </div>
            </div>

            {/* Live Calculation Summary Banner */}
            <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-3.5 space-y-2 dark:border-blue-900/50 dark:bg-blue-950/30">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-600 dark:text-slate-300">{isAr ? "إجمالي العمولة المستحقة:" : "Gross Commission:"}</span>
                <span className="font-mono font-bold text-slate-900 dark:text-white">
                  {computedGross.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {currencyLabel}
                </span>
              </div>

              {computedWht > 0 && (
                <div className="flex items-center justify-between text-xs text-rose-600">
                  <span>{isAr ? `ضريبة الخصم من المنبع (${whtRate}%):` : `Withheld Tax (${whtRate}%):`}</span>
                  <span className="font-mono font-bold">
                    - {computedWht.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {currencyLabel}
                  </span>
                </div>
              )}

              <div className="flex items-center justify-between text-sm font-black border-t border-blue-200/80 dark:border-blue-900/60 pt-2">
                <span className="text-blue-950 dark:text-blue-200">{isAr ? "صافي المستحق للوسيط:" : "Net Payable to Broker:"}</span>
                <span className="font-mono text-blue-700 dark:text-blue-400 text-base">
                  {computedNet.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {currencyLabel}
                </span>
              </div>
            </div>
          </DialogBody>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              {isAr ? "إلغاء" : "Cancel"}
            </Button>
            <Button
              type="submit"
              disabled={isPending || computedNet <= 0}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold gap-1.5"
            >
              {isPending ? <RefreshCw className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />}
              <span>{isAr ? "ترحيل الاستحقاق" : "Accrue Commission"}</span>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   3. PAY COMMISSION DIALOG
   ────────────────────────────────────────────────────────────────────────── */
export function PayCommissionDialog({
  open,
  onOpenChange,
  commissionId,
  brokerName,
  netAmount,
  grossAmount,
  whtAmount,
  cashAccounts,
  currency = "EGP",
  locale,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  commissionId: string | null;
  brokerName: string;
  netAmount: number;
  grossAmount: number;
  whtAmount: number;
  cashAccounts: Option[];
  currency?: string;
  locale: string;
}) {
  const isAr = locale === "ar";
  const currencyLabel = getCurrencyLabel(currency, isAr);
  const router = useRouter();
  const toast = useToast();
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [cashAccountId, setCashAccountId] = useState<string>(cashAccounts[0]?.id ?? "");
  const [paidDate, setPaidDate] = useState<string>(
    new Date().toISOString().split("T")[0]
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!commissionId) return;
    setErrorMsg(null);

    if (!cashAccountId) {
      setErrorMsg(isAr ? "يرجى تحديد حساب الصرف / الخزينة" : "Please select payment account");
      return;
    }

    startTransition(async () => {
      const formData = new FormData();
      formData.set("commissionId", commissionId);
      formData.set("cashAccountId", cashAccountId);
      formData.set("paidDate", paidDate);

      const res = await payCommissionAction({ ok: true }, formData);

      if (res.ok) {
        toast.add({
          type: "success",
          title: isAr ? "تم سداد العمولة بنجاح" : "Commission Settled",
          description: isAr
            ? `تم صرف مبلغ ${netAmount.toLocaleString()} ${currencyLabel} للوسيط ${brokerName}`
            : `Paid ${netAmount.toLocaleString()} ${currencyLabel} to ${brokerName}`,
        });
        onOpenChange(false);
        router.refresh();
      } else {
        setErrorMsg(
          res.error ||
            (isAr ? "حدث خطأ أثناء تسجيل السداد." : "Failed to record payment.")
        );
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex size-10 items-center justify-center rounded-xl bg-emerald-600/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400">
            <CreditCard className="size-5" />
          </div>
          <div>
            <DialogTitle>{isAr ? "سداد عمولة وسيط" : "Settle Broker Commission"}</DialogTitle>
            <DialogDescription>
              {isAr
                ? `صرف صافي العمولة المستحقة للوسيط وإقفال حساب الالتزام.`
                : `Pay accrued net commission and settle payable liability.`}
            </DialogDescription>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <DialogBody className="space-y-4">
            {errorMsg && (
              <div
                role="alert"
                className="flex items-center gap-2.5 rounded-xl border border-red-200 bg-red-50/90 p-3 text-xs font-semibold text-red-700 dark:border-red-900/50 dark:bg-red-950/50 dark:text-red-300"
              >
                <AlertCircle className="size-4 shrink-0 text-red-600 dark:text-red-400" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Summary Box */}
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 space-y-2 dark:border-slate-800 dark:bg-slate-900/50">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">{isAr ? "الوسيط المستفيد:" : "Beneficiary:"}</span>
                <span className="font-bold text-slate-900 dark:text-white">{brokerName}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">{isAr ? "المبلغ الإجمالي:" : "Gross Amount:"}</span>
                <span className="font-mono">{grossAmount.toLocaleString()} {currencyLabel}</span>
              </div>
              {whtAmount > 0 && (
                <div className="flex items-center justify-between text-xs text-rose-600">
                  <span>{isAr ? "خصم المنبع المحتجز:" : "Withheld Tax:"}</span>
                  <span className="font-mono">- {whtAmount.toLocaleString()} {currencyLabel}</span>
                </div>
              )}
              <div className="flex items-center justify-between text-sm font-black border-t border-slate-200 dark:border-slate-800 pt-2">
                <span className="text-slate-900 dark:text-white">{isAr ? "صافي المبلغ للصرف:" : "Net Payable:"}</span>
                <span className="font-mono text-emerald-600 dark:text-emerald-400 text-base">
                  {netAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{" "}
                  {currencyLabel}
                </span>
              </div>
            </div>

            {/* Payment Account */}
            <div className="space-y-1.5 text-start">
              <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                {isAr ? "حساب الدفع / الخزينة / البنك *" : "Payment Account / Vault *"}
              </Label>
              <Select
                value={cashAccountId}
                onValueChange={(val) => setCashAccountId(val ?? "")}
                items={cashAccounts.map((a) => ({ value: a.id, label: a.label }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={isAr ? "اختر الحساب..." : "Select account..."} />
                </SelectTrigger>
                <SelectContent>
                  {cashAccounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Paid Date */}
            <div className="space-y-1.5 text-start">
              <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                {isAr ? "تاريخ الصرف والسداد" : "Payment Date"}
              </Label>
              <Input
                type="date"
                required
                value={paidDate}
                onChange={(e) => setPaidDate(e.target.value)}
                className="font-mono text-sm"
              />
            </div>
          </DialogBody>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              {isAr ? "إلغاء" : "Cancel"}
            </Button>
            <Button
              type="submit"
              disabled={isPending}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold gap-1.5"
            >
              {isPending ? <RefreshCw className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />}
              <span>{isAr ? "تأكيد صرف السند" : "Confirm Payment"}</span>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   4. MANAGE BROKERS DIALOG
   ────────────────────────────────────────────────────────────────────────── */
export function ManageBrokersDialog({
  open,
  onOpenChange,
  brokers,
  onAddNewBroker,
  currency = "EGP",
  locale,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  brokers: BrokerItem[];
  onAddNewBroker: () => void;
  currency?: string;
  locale: string;
}) {
  const isAr = locale === "ar";
  const currencyLabel = getCurrencyLabel(currency, isAr);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <div className="flex size-10 items-center justify-center rounded-xl bg-blue-600/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400">
            <UserCheck className="size-5" />
          </div>
          <div>
            <DialogTitle>{isAr ? "دليل وسجل الوسطاء" : "Brokers Directory"}</DialogTitle>
            <DialogDescription>
              {isAr
                ? `قائمة بجميع الوسطاء المسجلين والمسوقين المعتمدين (${brokers.length})`
                : `List of all registered brokers and agents (${brokers.length})`}
            </DialogDescription>
          </div>
        </DialogHeader>

        <DialogBody className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">
              {isAr ? "الوسطاء والمسوقون المعتمدون" : "Approved Brokers"}
            </span>
            <Button
              type="button"
              size="sm"
              onClick={() => {
                onOpenChange(false);
                onAddNewBroker();
              }}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold gap-1 text-xs"
            >
              <Plus className="size-3.5" />
              <span>{isAr ? "إضافة وسيط جديد" : "Add Broker"}</span>
            </Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[350px] overflow-y-auto pe-1">
            {brokers.length ? (
              brokers.map((b) => (
                <div
                  key={b.id}
                  className="flex flex-col justify-between rounded-xl border border-slate-200/90 bg-white p-3.5 shadow-2xs dark:border-slate-800 dark:bg-slate-900/60 space-y-2"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-slate-900 dark:text-white">
                        {b.name}
                      </span>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          b.broker_type === "INTERNAL"
                            ? "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300"
                            : "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                        }`}
                      >
                        {b.broker_type === "INTERNAL"
                          ? isAr
                            ? "داخلي"
                            : "Internal"
                          : isAr
                          ? "مكتب خارجي"
                          : "External"}
                      </span>
                    </div>

                    <div className="mt-2 space-y-1 text-xs text-slate-500">
                      {b.tax_id && (
                        <p>
                          <span className="text-slate-400">{isAr ? "الرقم الضريبي: " : "Tax ID: "}</span>
                          <span className="font-mono font-bold text-slate-700 dark:text-slate-300">{b.tax_id}</span>
                        </p>
                      )}
                      {b.phone && (
                        <p>
                          <span className="text-slate-400">{isAr ? "الهاتف: " : "Phone: "}</span>
                          <span className="font-mono text-slate-700 dark:text-slate-300">{b.phone}</span>
                        </p>
                      )}
                      <p>
                        <span className="text-slate-400">{isAr ? "نسبة الخصم: " : "WHT Rate: "}</span>
                        <span className="font-mono font-bold text-rose-600">{b.default_wht_rate}%</span>
                      </p>
                    </div>
                  </div>

                  {b.totalCommissions !== undefined && (
                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
                      <span className="text-slate-400">{isAr ? "إجمالي العمولات:" : "Total Earned:"}</span>
                      <span className="font-mono font-bold text-slate-900 dark:text-white">
                        {b.totalCommissions.toLocaleString()} {currencyLabel}
                      </span>
                    </div>
                  )}
                </div>
              ))
            ) : (
              <div className="col-span-2 py-8 text-center text-xs text-slate-400">
                {isAr ? "لا يوجد وسطاء مسجلون بعد" : "No brokers registered yet"}
              </div>
            )}
          </div>
        </DialogBody>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {isAr ? "إغلاق" : "Close"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
