"use client";

import { useActionState } from "react";
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
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    upsertPaymentProviderSettingsAction,
    { ok: true },
  );

  return (
    <form action={formAction} className="grid gap-4 rounded-lg border border-dashed p-4 sm:grid-cols-3">
      <input type="hidden" name="organizationId" value={organizationId} />
      <div className="space-y-2">
        <Label>{isAr ? "المزود" : "Provider"}</Label>
        <Select name="provider" defaultValue="FAWRY">
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="FAWRY">Fawry</SelectItem>
            <SelectItem value="PAYMOB">Paymob</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>{isAr ? "البيئة" : "Environment"}</Label>
        <Select name="environment" defaultValue="SANDBOX">
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="SANDBOX">SANDBOX</SelectItem>
            <SelectItem value="PRODUCTION">PRODUCTION</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>{isAr ? "النطاق (اختياري)" : "Scope (optional)"}</Label>
        <Select name="resortId" defaultValue="">
          <SelectTrigger className="w-full">
            <SelectValue placeholder={isAr ? "كل المؤسسة" : "Organization-wide"} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">{isAr ? "كل المؤسسة" : "Organization-wide"}</SelectItem>
            {resorts.map((r) => (
              <SelectItem key={r.id} value={r.id}>
                {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="pps-merchant-identifier">{isAr ? "المعرّف التجاري" : "Merchant identifier"}</Label>
        <Input id="pps-merchant-identifier" name="merchantIdentifier" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="pps-public-key">{isAr ? "المفتاح العام (اختياري)" : "Public key (optional)"}</Label>
        <Input id="pps-public-key" name="publicKey" />
      </div>
      <div />
      <div className="space-y-2">
        <Label htmlFor="pps-api-key">{isAr ? "مفتاح API" : "API key"}</Label>
        <Input
          id="pps-api-key"
          name="apiKey"
          type="password"
          placeholder={isAr ? "اتركه فارغًا للإبقاء عليه" : "Leave blank to keep unchanged"}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="pps-hmac-secret">{isAr ? "سر HMAC" : "HMAC secret"}</Label>
        <Input
          id="pps-hmac-secret"
          name="hmacSecret"
          type="password"
          placeholder={isAr ? "اتركه فارغًا للإبقاء عليه" : "Leave blank to keep unchanged"}
        />
      </div>
      {!state.ok && <p className="text-sm text-destructive sm:col-span-3">{state.error}</p>}
      <div className="sm:col-span-3">
        <Button type="submit" disabled={pending}>
          {isAr ? "حفظ الإعداد" : "Save setting"}
        </Button>
      </div>
    </form>
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
  const [testState, testAction, testPending] = useActionState<ActionResult, FormData>(
    testPaymentProviderConnectionAction,
    { ok: true },
  );
  const [enableState, enableAction, enablePending] = useActionState<ActionResult, FormData>(
    enablePaymentProviderAction,
    { ok: true },
  );
  const [disableState, disableAction, disablePending] = useActionState<ActionResult, FormData>(
    disablePaymentProviderAction,
    { ok: true },
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <form action={testAction}>
          <input type="hidden" name="settingsId" value={settingsId} />
          <Button type="submit" variant="outline" size="sm" disabled={testPending}>
            {isAr ? "اختبار الاتصال" : "Test connection"}
          </Button>
        </form>
        {status !== "ENABLED" ? (
          <form action={enableAction}>
            <input type="hidden" name="settingsId" value={settingsId} />
            <Button type="submit" size="sm" disabled={enablePending || status !== "VERIFIED"}>
              {isAr ? "تفعيل" : "Enable"}
            </Button>
          </form>
        ) : (
          <form action={disableAction}>
            <input type="hidden" name="settingsId" value={settingsId} />
            <Button type="submit" variant="destructive" size="sm" disabled={disablePending}>
              {isAr ? "إيقاف" : "Disable"}
            </Button>
          </form>
        )}
      </div>
      {!testState.ok && (
        <p className="text-xs text-destructive">
          {testState.error === "STALE_VERIFICATION"
            ? isAr
              ? "تغيّر الإعداد أثناء فحص الاتصال، يرجى إعادة المحاولة"
              : "The setting changed while the connection test was running -- please try again"
            : testState.error}
        </p>
      )}
      {!enableState.ok && <p className="text-xs text-destructive">{enableState.error}</p>}
      {!disableState.ok && <p className="text-xs text-destructive">{disableState.error}</p>}
    </div>
  );
}
