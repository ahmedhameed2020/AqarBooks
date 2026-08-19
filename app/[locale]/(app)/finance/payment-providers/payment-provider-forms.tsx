"use client";

import { useState, useActionState } from "react";
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
  upsertPaymentProviderSettingsAction,
  enablePaymentProviderAction,
  disablePaymentProviderAction,
  testPaymentProviderConnectionAction,
} from "@/lib/actions/payment-provider-settings";
import type { ActionResult } from "@/lib/actions/platform";
import {
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  CreditCard,
  KeyRound,
  ShieldCheck,
  Building2,
  Globe2,
  Plus,
  RefreshCw,
  Power,
  PowerOff,
  Sparkles,
  Lock,
  Copy,
} from "lucide-react";
import { useToast } from "@/components/ui/toast";

type Option = { id: string; label: string };

export function UpsertPaymentProviderSettingsForm({
  organizationId,
  resorts,
  locale,
}: {
  organizationId: string;
  resorts: Option[];
  locale: string;
}) {
  const isAr = locale === "ar";
  const toast = useToast();
  const [isOpen, setIsOpen] = useState(true);
  const [showApiKey, setShowApiKey] = useState(false);
  const [showHmac, setShowHmac] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<"FAWRY" | "PAYMOB">("FAWRY");
  const [environment, setEnvironment] = useState<"SANDBOX" | "PRODUCTION">("SANDBOX");

  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    async (prev, formData) => {
      const res = await upsertPaymentProviderSettingsAction(prev, formData);
      if (res.ok) {
        toast.show({
          title: isAr ? "تم حفظ إعدادات البوابة بنجاح" : "Settings Saved Successfully",
          description: isAr
            ? "تم توثيق بيانات الاعتماد. اضغط على «فحص الاتصال» ثم «تفعيل» لتشغيل البوابة."
            : "Payment provider credentials saved. Run a connection test to enable.",
          variant: "success",
        });
      }
      return res;
    },
    { ok: true }
  );

  return (
    <div className="rounded-3xl border border-slate-200/90 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      {/* Form Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-100 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400">
              <KeyRound className="size-4.5" />
            </div>
            <h2 className="text-base font-black text-slate-950 dark:text-white">
              {isAr ? "ربط وإعداد بوابة الدفع الإلكتروني" : "Configure Payment Gateway"}
            </h2>
          </div>
          <p className="text-xs text-slate-500 font-medium mt-1">
            {isAr
              ? "اختر المزود، ثم أدخل مفاتيح الربط والبيئة لتفعيل التحصيل الإلكتروني للمستأجرين والملاك."
              : "Select payment provider and enter credentials to enable digital collections."}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            variant="outline"
            size="sm"
            className="text-xs font-bold h-8.5 rounded-xl gap-1.5"
          >
            <span>{isOpen ? (isAr ? "إخفاء النموذج" : "Hide Form") : (isAr ? "إظهار النموذج" : "Show Form")}</span>
          </Button>
        </div>
      </div>

      {isOpen && (
        <form action={formAction} className="pt-6 space-y-6">
          <input type="hidden" name="organizationId" value={organizationId} />
          <input type="hidden" name="provider" value={selectedProvider} />
          <input type="hidden" name="environment" value={environment} />

          {/* 1. INTERACTIVE PROVIDER SELECTOR CARDS */}
          <div className="space-y-2">
            <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
              {isAr ? "1. حدد مزود الدفع التجاري *" : "1. Select Payment Provider *"}
            </Label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {/* FAWRY BUTTON CARD */}
              <button
                type="button"
                onClick={() => setSelectedProvider("FAWRY")}
                className={`flex items-center gap-3.5 p-3.5 rounded-2xl border text-start transition-all cursor-pointer ${
                  selectedProvider === "FAWRY"
                    ? "border-amber-500 bg-amber-50/60 dark:bg-amber-950/30 ring-2 ring-amber-500/20 shadow-xs"
                    : "border-slate-200 bg-slate-50/50 hover:bg-slate-100/60 dark:border-slate-800 dark:bg-slate-800/40"
                }`}
              >
                <div className="size-11 rounded-xl bg-gradient-to-tr from-amber-500 to-yellow-500 flex items-center justify-center text-white font-black text-xs shadow-md shadow-amber-500/20 shrink-0">
                  FAWRY
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-slate-900 dark:text-white">
                      {isAr ? "Fawry Pay (فوري باي)" : "Fawry Pay"}
                    </span>
                    {selectedProvider === "FAWRY" && (
                      <CheckCircle2 className="size-4 text-amber-600 shrink-0" />
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                    {isAr ? "أكواد فوري، المحافظ الذكية، ومنافذ التجزئة" : "Fawry reference code, Kiosks, Meeza"}
                  </p>
                </div>
              </button>

              {/* PAYMOB BUTTON CARD */}
              <button
                type="button"
                onClick={() => setSelectedProvider("PAYMOB")}
                className={`flex items-center gap-3.5 p-3.5 rounded-2xl border text-start transition-all cursor-pointer ${
                  selectedProvider === "PAYMOB"
                    ? "border-blue-500 bg-blue-50/60 dark:bg-blue-950/30 ring-2 ring-blue-500/20 shadow-xs"
                    : "border-slate-200 bg-slate-50/50 hover:bg-slate-100/60 dark:border-slate-800 dark:bg-slate-800/40"
                }`}
              >
                <div className="size-11 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white font-black text-xs shadow-md shadow-blue-600/20 shrink-0">
                  PAYMOB
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-slate-900 dark:text-white">
                      {isAr ? "Paymob Gateway (باي موب)" : "Paymob Digital"}
                    </span>
                    {selectedProvider === "PAYMOB" && (
                      <CheckCircle2 className="size-4 text-blue-600 shrink-0" />
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                    {isAr ? "بطاقات Visa/Mastercard ومحافظ الهاتف والتقسيط" : "Visa/Mastercard, Mobile Wallets"}
                  </p>
                </div>
              </button>
            </div>
          </div>

          {/* 2. ENVIRONMENT & SCOPE ROW */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
            {/* ENVIRONMENT TOGGLE */}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                {isAr ? "بيئة العمل (Environment) *" : "Environment *"}
              </Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setEnvironment("SANDBOX")}
                  className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                    environment === "SANDBOX"
                      ? "bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300"
                      : "bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700"
                  }`}
                >
                  <span>{isAr ? "تجريبية (Sandbox)" : "Sandbox / Test"}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setEnvironment("PRODUCTION")}
                  className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                    environment === "PRODUCTION"
                      ? "bg-emerald-50 text-emerald-800 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300"
                      : "bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700"
                  }`}
                >
                  <span>{isAr ? "حقيقية (Production)" : "Production / Live"}</span>
                </button>
              </div>
            </div>

            {/* PROPERTY SCOPE */}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                {isAr ? "نطاق الكيان العقاري التابع" : "Property Scope"}
              </Label>
              <Select
                name="resortId"
                defaultValue=""
                items={[
                  { value: "", label: isAr ? "كل المنشأة (عام لكافة الكيانات)" : "Organization-wide (All Entities)" },
                  ...resorts.map((r) => ({ value: r.id, label: r.label })),
                ]}
              >
                <SelectTrigger className="w-full text-xs h-9.5 rounded-xl font-bold bg-slate-50 dark:bg-slate-800">
                  <SelectValue placeholder={isAr ? "كل المنشأة (عام لكافة الكيانات)" : "Organization-wide"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">{isAr ? "كل المنشأة (عام لكافة الكيانات)" : "Organization-wide (All Entities)"}</SelectItem>
                  {resorts.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* 3. CREDENTIALS INPUTS */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* MERCHANT ID */}
            <div className="space-y-1.5">
              <Label htmlFor="pps-merchant-identifier" className="text-xs font-bold text-slate-700 dark:text-slate-300">
                {isAr ? "المعرّف التجاري (Merchant ID / Code) *" : "Merchant ID / Code *"}
              </Label>
              <Input
                id="pps-merchant-identifier"
                name="merchantIdentifier"
                required
                placeholder={selectedProvider === "FAWRY" ? "e.g. 10140000000" : "e.g. 123456"}
                className="text-xs h-9.5 font-mono rounded-xl bg-slate-50 dark:bg-slate-800 font-bold"
              />
            </div>

            {/* PUBLIC KEY */}
            <div className="space-y-1.5">
              <Label htmlFor="pps-public-key" className="text-xs font-bold text-slate-700 dark:text-slate-300">
                {isAr ? "المفتاح العام (Public Key - اختياري)" : "Public Key (Optional)"}
              </Label>
              <Input
                id="pps-public-key"
                name="publicKey"
                placeholder="e.g. PK_live_..."
                className="text-xs h-9.5 font-mono rounded-xl bg-slate-50 dark:bg-slate-800"
              />
            </div>

            {/* API KEY */}
            <div className="space-y-1.5">
              <Label htmlFor="pps-api-key" className="text-xs font-bold text-slate-700 dark:text-slate-300">
                {isAr ? "مفتاح الربط السري (API Secret Key) *" : "API Secret Key *"}
              </Label>
              <div className="relative">
                <Input
                  id="pps-api-key"
                  name="apiKey"
                  type={showApiKey ? "text" : "password"}
                  placeholder={isAr ? "أدخل مفتاح API السري" : "Enter API secret key"}
                  className="pe-9 text-xs h-9.5 font-mono rounded-xl bg-slate-50 dark:bg-slate-800"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute end-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showApiKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>

            {/* HMAC SECRET */}
            <div className="space-y-1.5">
              <Label htmlFor="pps-hmac-secret" className="text-xs font-bold text-slate-700 dark:text-slate-300">
                {isAr ? "مفتاح توقيع الإشعارات (HMAC Secret) *" : "HMAC Secret Key *"}
              </Label>
              <div className="relative">
                <Input
                  id="pps-hmac-secret"
                  name="hmacSecret"
                  type={showHmac ? "text" : "password"}
                  placeholder={isAr ? "مفتاح التحقق من صحة Webhook" : "Webhook signature verification key"}
                  className="pe-9 text-xs h-9.5 font-mono rounded-xl bg-slate-50 dark:bg-slate-800"
                />
                <button
                  type="button"
                  onClick={() => setShowHmac(!showHmac)}
                  className="absolute end-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showHmac ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>
          </div>

          {!state.ok && (
            <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-700 font-bold flex items-center gap-2">
              <AlertCircle className="size-4 shrink-0" />
              <span>{state.error}</span>
            </div>
          )}

          <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100 dark:border-slate-800">
            <Button
              type="submit"
              disabled={pending}
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold h-9.5 px-6 rounded-xl shadow-sm gap-1.5"
            >
              <CheckCircle2 className="size-4" />
              <span>{pending ? (isAr ? "جاري الحفظ والتوثيق..." : "Saving...") : (isAr ? "حفظ وتوثيق بوابة الدفع" : "Save Gateway Credentials")}</span>
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

export function PaymentProviderRowActions({
  settingsId,
  status,
  locale,
}: {
  settingsId: string;
  status: string;
  locale: string;
}) {
  const isAr = locale === "ar";
  const toast = useToast();

  const [testState, testAction, testPending] = useActionState<ActionResult, FormData>(
    async (prev, formData) => {
      const res = await testPaymentProviderConnectionAction(prev, formData);
      if (res.ok) {
        toast.show({
          title: isAr ? "تم الاتصال بنجاح" : "Connection Verified",
          description: isAr ? "تم اختبار بيانات الاتصال بنجاح. البوابة جاهزة للتفعيل." : "Connection test passed successfully.",
          variant: "success",
        });
      } else {
        toast.show({
          title: isAr ? "فشل اختبار الاتصال" : "Verification Failed",
          description: res.error,
          variant: "error",
        });
      }
      return res;
    },
    { ok: true }
  );

  const [enableState, enableAction, enablePending] = useActionState<ActionResult, FormData>(
    async (prev, formData) => {
      const res = await enablePaymentProviderAction(prev, formData);
      if (res.ok) {
        toast.show({
          title: isAr ? "تم تفعيل بوابة الدفع" : "Provider Enabled",
          description: isAr ? "أصبحت بوابة الدفع نشطة وجاهزة لتحصيل الإيجارات والمطالبات." : "Gateway is now live.",
          variant: "success",
        });
      }
      return res;
    },
    { ok: true }
  );

  const [disableState, disableAction, disablePending] = useActionState<ActionResult, FormData>(
    async (prev, formData) => {
      const res = await disablePaymentProviderAction(prev, formData);
      if (res.ok) {
        toast.show({
          title: isAr ? "تم إيقاف البوابة" : "Provider Disabled",
          description: isAr ? "تم إيقاف بوابة الدفع مؤقتاً." : "Gateway disabled.",
          variant: "default",
        });
      }
      return res;
    },
    { ok: true }
  );

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5">
        {/* TEST CONNECTION BUTTON */}
        <form action={testAction}>
          <input type="hidden" name="settingsId" value={settingsId} />
          <Button
            type="submit"
            variant="outline"
            size="sm"
            disabled={testPending}
            className="text-xs font-bold h-8 px-2.5 rounded-xl gap-1 text-indigo-700 border-indigo-200 hover:bg-indigo-50 dark:text-indigo-300 dark:border-indigo-800 dark:hover:bg-indigo-950/40"
          >
            <RefreshCw className={`size-3 ${testPending ? "animate-spin" : ""}`} />
            <span>{testPending ? (isAr ? "جاري الفحص..." : "Testing...") : (isAr ? "فحص الاتصال" : "Test")}</span>
          </Button>
        </form>

        {/* ENABLE / DISABLE BUTTON */}
        {status !== "ENABLED" ? (
          <form action={enableAction}>
            <input type="hidden" name="settingsId" value={settingsId} />
            <Button
              type="submit"
              size="sm"
              disabled={enablePending || status !== "VERIFIED"}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold h-8 px-3 rounded-xl gap-1 shadow-2xs"
            >
              <Power className="size-3" />
              <span>{enablePending ? (isAr ? "جاري التفعيل..." : "Enabling...") : (isAr ? "تفعيل" : "Enable")}</span>
            </Button>
          </form>
        ) : (
          <form action={disableAction}>
            <input type="hidden" name="settingsId" value={settingsId} />
            <Button
              type="submit"
              variant="outline"
              size="sm"
              disabled={disablePending}
              className="text-rose-600 border-rose-200 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-400 text-xs font-bold h-8 px-3 rounded-xl gap-1"
            >
              <PowerOff className="size-3" />
              <span>{disablePending ? (isAr ? "جاري الإيقاف..." : "Disabling...") : (isAr ? "إيقاف" : "Disable")}</span>
            </Button>
          </form>
        )}
      </div>

      {!testState.ok && (
        <p className="text-[11px] text-rose-600 font-bold">
          {testState.error === "STALE_VERIFICATION"
            ? isAr
              ? "تغيّر الإعداد أثناء فحص الاتصال"
              : "Setting changed during test"
            : testState.error}
        </p>
      )}
    </div>
  );
}
