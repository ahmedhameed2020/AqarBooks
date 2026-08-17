import { setRequestLocale } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getCurrentUser } from "@/lib/auth/session";
import { getPrimaryOrganization } from "@/lib/auth/org-context";
import { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/i18n/routing";
import { UpsertPaymentProviderSettingsForm, PaymentProviderRowActions } from "./payment-provider-forms";

const STATUS_META: Record<string, { ar: string; en: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  DRAFT: { ar: "غير مُعد", en: "Draft", variant: "outline" },
  VALIDATING: { ar: "جارٍ التحقق", en: "Validating", variant: "secondary" },
  VERIFIED: { ar: "تم التحقق", en: "Verified", variant: "secondary" },
  ENABLED: { ar: "مفعّل", en: "Enabled", variant: "default" },
  DISABLED: { ar: "موقوف", en: "Disabled", variant: "destructive" },
};

const PROVIDER_LABEL: Record<string, string> = { FAWRY: "Fawry", PAYMOB: "Paymob" };

export default async function PaymentProvidersPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const isAr = locale === "ar";

  const user = await getCurrentUser();
  const organization = user ? await getPrimaryOrganization(user.id) : null;
  if (!organization) return null;

  const supabase = await createClient();

  // list_payment_provider_settings runs as the caller (RLS-gated by
  // has_permission(..., 'finance.online_payments.manage')) -- a user
  // without that permission gets an empty list, not an error, matching
  // this codebase's convention of failing closed via RLS rather than an
  // app-layer permission check duplicated here.
  const [{ data: settings, error: settingsError }, { data: resorts }] = await Promise.all([
    supabase.rpc("list_payment_provider_settings", { p_organization_id: organization.id }),
    supabase.from("resorts").select("id, name").eq("organization_id", organization.id).order("name"),
  ]);

  const resortNameById = new Map((resorts ?? []).map((r) => [r.id, r.name]));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold">{isAr ? "مزودو الدفع الإلكتروني" : "Payment Providers"}</h1>
        <p className="text-sm text-muted-foreground">
          {isAr
            ? "اضبط بيانات اعتماد Fawry/Paymob الخاصة بمؤسستك. الإعداد وحده لا يُفعّل أي مزود -- التفعيل يتطلب اختبار اتصال ناجح ثم تأكيدًا صريحًا."
            : "Configure your organization's Fawry/Paymob credentials. Configuring alone never enables a provider -- enabling requires a successful connection test followed by an explicit confirmation."}
        </p>
      </div>

      <UpsertPaymentProviderSettingsForm
        organizationId={organization.id}
        resorts={(resorts ?? []).map((r) => ({ id: r.id, label: r.name }))}
        locale={locale}
      />

      {settingsError && (
        <p className="text-sm text-destructive">{isAr ? "تعذر تحميل الإعدادات." : "Could not load settings."}</p>
      )}

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{isAr ? "المزود" : "Provider"}</TableHead>
              <TableHead>{isAr ? "البيئة" : "Environment"}</TableHead>
              <TableHead>{isAr ? "النطاق" : "Scope"}</TableHead>
              <TableHead>{isAr ? "المعرّف التجاري" : "Merchant ID"}</TableHead>
              <TableHead>{isAr ? "المفاتيح" : "Keys"}</TableHead>
              <TableHead>{isAr ? "الحالة" : "Status"}</TableHead>
              <TableHead>{isAr ? "آخر تحقق" : "Last verified"}</TableHead>
              <TableHead>{isAr ? "إجراء" : "Action"}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {settings?.length ? (
              settings.map((row) => {
                const meta = STATUS_META[row.status] ?? { ar: row.status, en: row.status, variant: "outline" as const };
                const scopeLabel = row.property_id
                  ? (resortNameById.get(row.property_id) ?? row.property_id)
                  : isAr
                    ? "كل المؤسسة"
                    : "Organization-wide";
                return (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{PROVIDER_LABEL[row.provider] ?? row.provider}</TableCell>
                    <TableCell className="text-muted-foreground">{row.environment}</TableCell>
                    <TableCell className="text-muted-foreground">{scopeLabel}</TableCell>
                    <TableCell className="text-muted-foreground">{row.merchant_identifier}</TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {row.has_api_key ? "API •••• " : (isAr ? "لا API" : "no API")}
                      {row.has_hmac_secret ? "HMAC ••••" : isAr ? "لا HMAC" : "no HMAC"}
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <Badge variant={meta.variant}>{isAr ? meta.ar : meta.en}</Badge>
                        {row.status === "DRAFT" && row.last_verification_error && (
                          <p className="text-xs text-destructive">{row.last_verification_error}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {row.verified_at ? new Date(row.verified_at).toLocaleString(isAr ? "ar-EG" : "en-US") : "—"}
                    </TableCell>
                    <TableCell>
                      <PaymentProviderRowActions settingsId={row.id} status={row.status} locale={locale} />
                    </TableCell>
                  </TableRow>
                );
              })
            ) : (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground">
                  {isAr ? "لا توجد إعدادات مزودي دفع بعد" : "No payment provider settings yet"}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
