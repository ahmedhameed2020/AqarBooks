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
  const [isOpen, setIsOpen] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [showHmac, setShowHmac] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState("FAWRY");

  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    async (prev, formData) => {
      const res = await upsertPaymentProviderSettingsAction(prev, formData);
      if (res.ok) {
        toast.show({
          title: isAr ? "تم حفظ الإعدادات بنجاح" : "Settings Saved",
          description: isAr
            ? "تم حفظ بيانات بوابة الدفع بنجاح. يرجى اختبار الاتصال لتفعيل البوابة."
            : "Payment provider credentials saved. Please run a connection test to enable.",
          variant: "success",
        });
        setIsOpen(false);
      }
      return res;
    },
    { ok: true }
  );

  return (
    <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
        <div>
          <h2 className="text-sm sm:text-base font-black text-slate-950 dark:text-white flex items-center gap-2">
            <CreditCard className="size-4.5 text-indigo-600" />
            <span>{isAr ? "إعداد وربط بوابة دفع جديدة" : "Configure New Payment Gateway"}</span>
          </h2>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            {isAr
              ? "إضافة مفاتيح الربط التجاري لـ Fawry أو Paymob لتفعيل التحصيل الإلكتروني المباشر."
              : "Add API & HMAC keys for Fawry or Paymob to enable digital rent collections."}
          </p>
        </div>

        <Button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          variant={isOpen ? "outline" : "default"}
          size="sm"
          className={
            isOpen
              ? "text-xs font-bold h-8.5"
              : "bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold h-8.5 shadow-sm gap-1.5"
          }
        >
          <Plus className="size-3.5" />
          <span>{isOpen ? (isAr ? "إغلاق النموذج" : "Close Form") : (isAr ? "إضافة بوابة دفع" : "Add Gateway")}</span>
        </Button>
      </div>

      {isOpen && (
        <form action={formAction} className="pt-4 space-y-4">
          <input type="hidden" name="organizationId" value={organizationId} />

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* PROVIDER */}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                {isAr ? "مزود الدفع المعتمد *" : "Payment Provider *"}
              </Label>
              <Select
                name="provider"
                defaultValue={selectedProvider}
                onValueChange={setSelectedProvider}
                items={[
                  { value: "FAWRY", label: isAr ? "Fawry (فوري)" : "Fawry Pay" },
                  { value: "PAYMOB", label: isAr ? "Paymob (باي موب)" : "Paymob Gateway" },
                ]}
              >
                <SelectTrigger className="w-full text-xs h-9.5 font-bold">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="FAWRY">{isAr ? "Fawry (فوري)" : "Fawry Pay"}</SelectItem>
                  <SelectItem value="PAYMOB">{isAr ? "Paymob (باي موب)" : "Paymob Gateway"}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* ENVIRONMENT */}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                {isAr ? "بيئة العمل والربط *" : "Environment *"}
              </Label>
              <Select
                name="environment"
                defaultValue="SANDBOX"
                items={[
                  { value: "SANDBOX", label: isAr ? "تجريبية (Sandbox / Test)" : "Sandbox / Test" },
                  { value: "PRODUCTION", label: isAr ? "حقيقية (Production / Live)" : "Production / Live" },
                ]}
              >
                <SelectTrigger className="w-full text-xs h-9.5 font-bold">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SANDBOX">{isAr ? "تجريبية (Sandbox / Test)" : "Sandbox / Test"}</SelectItem>
                  <SelectItem value="PRODUCTION">{isAr ? "حقيقية (Production / Live)" : "Production / Live"}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* SCOPE */}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                {isAr ? "نطاق الكيان العقاري" : "Property Scope"}
              </Label>
              <Select
                name="resortId"
                defaultValue=""
                items={[
                  { value: "", label: isAr ? "كل المنشأة (عام لكافة الكيانات)" : "Organization-wide (All Entities)" },
                  ...resorts.map((r) => ({ value: r.id, label: r.label })),
                ]}
              >
                <SelectTrigger className="w-full text-xs h-9.5">
                  <SelectValue placeholder={isAr ? "كل المنشأة" : "Organization-wide"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">{isAr ? "كل المنشأة (عام لكافة الكيانات)" : "Organization-wide"}</SelectItem>
                  {resorts.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* MERCHANT IDENTIFIER */}
            <div className="space-y-1.5">
              <Label htmlFor="pps-merchant-identifier" className="text-xs font-bold text-slate-700 dark:text-slate-300">
                {isAr ? "المعرّف التجاري (Merchant ID) *" : "Merchant ID *"}
              </Label>
              <Input
                id="pps-merchant-identifier"
                name="merchantIdentifier"
                required
                placeholder={selectedProvider === "FAWRY" ? "e.g. 10140000000" : "e.g. 123456"}
                className="text-xs h-9.5 font-mono"
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
                className="text-xs h-9.5 font-mono"
              />
            </div>

            {/* API KEY */}
            <div className="space-y-1.5">
              <Label htmlFor="pps-api-key" className="text-xs font-bold text-slate-700 dark:text-slate-300">
                {isAr ? "مفتاح الربط (API Secret Key) *" : "API Secret Key *"}
              </Label>
              <div className="relative">
                <Input
                  id="pps-api-key"
                  name="apiKey"
                  type={showApiKey ? "text" : "password"}
                  placeholder={isAr ? "أدخل مفتاح API السري" : "Enter API secret key"}
                  className="pe-9 text-xs h-9.5 font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute end-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showApiKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>

            {/* HMAC SECRET */}
            <div className="space-y-1.5 sm:col-span-3">
              <Label htmlFor="pps-hmac-secret" className="text-xs font-bold text-slate-700 dark:text-slate-300">
                {isAr ? "مفتاح تشفير التوقيع (HMAC Secret) *" : "HMAC Secret Key *"}
              </Label>
              <div className="relative">
                <Input
                  id="pps-hmac-secret"
                  name="hmacSecret"
                  type={showHmac ? "text" : "password"}
                  placeholder={isAr ? "مفتاح التحقق من صحة إشعارات السداد (Webhook HMAC)" : "Webhook signature verification key"}
                  className="pe-9 text-xs h-9.5 font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowHmac(!showHmac)}
                  className="absolute end-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showHmac ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>
          </div>

          {!state.ok && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 font-bold flex items-center gap-2">
              <AlertCircle className="size-4 shrink-0" />
              <span>{state.error}</span>
            </div>
          )}

          <div className="pt-2 flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsOpen(false)}
              className="text-xs font-bold h-9"
            >
              {isAr ? "إلغاء" : "Cancel"}
            </Button>

            <Button
              type="submit"
              disabled={pending}
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold h-9 px-6 shadow-sm gap-1.5"
            >
              <CheckCircle2 className="size-4" />
              <span>{pending ? (isAr ? "جاري الحفظ..." : "Saving...") : (isAr ? "حفظ وتوثيق بوابة الدفع" : "Save Credentials")}</span>
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
            className="text-xs font-bold h-8 px-2.5 gap-1 text-indigo-700 border-indigo-200 hover:bg-indigo-50 dark:text-indigo-300 dark:border-indigo-800 dark:hover:bg-indigo-950/40"
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
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold h-8 px-3 gap-1 shadow-2xs"
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
              className="text-rose-600 border-rose-200 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-400 text-xs font-bold h-8 px-3 gap-1"
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
