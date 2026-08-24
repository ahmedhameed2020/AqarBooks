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
import { denyIfMissingPermission } from "@/lib/auth/page-guard";
import {
  CreditCard,
  ShieldCheck,
  Zap,
  Globe2,
  Lock,
  Building2,
  CheckCircle2,
  AlertCircle,
  Clock,
  Sparkles,
  Smartphone,
} from "lucide-react";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const isAr = locale === "ar";
  return {
    title: isAr
      ? "بوابات الدفع الإلكتروني والتحصيل — AqarBooks"
      : "Payment Gateways & Digital Collection — AqarBooks",
    description: isAr
      ? "إدارة وربط بوابات الدفع الرقمي (فوري، باي موب، فيزا، ماستركارد، ومحافظ إلكترونية) لتحصيل الإيجارات والمطالبات آلياً."
      : "Configure and manage payment gateways (Fawry, Paymob, Credit Cards, e-Wallets) for automated digital rent collections.",
  };
}

const STATUS_META: Record<
  string,
  { ar: string; en: string; badgeClass: string }
> = {
  DRAFT: {
    ar: "غير مُعد (مسودة)",
    en: "Draft",
    badgeClass: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300",
  },
  VALIDATING: {
    ar: "جارٍ التحقق والفحص",
    en: "Validating",
    badgeClass: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/50 dark:text-blue-300",
  },
  VERIFIED: {
    ar: "تم التحقق (جاهز للتفعيل)",
    en: "Verified",
    badgeClass: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300",
  },
  ENABLED: {
    ar: "مفعّل ويعمل مباشرة",
    en: "Enabled & Active",
    badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300",
  },
  DISABLED: {
    ar: "موقوف مؤقتاً",
    en: "Disabled",
    badgeClass: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/50 dark:text-rose-300",
  },
};

const PROVIDER_INFO: Record<
  string,
  { label: string; logoText: string; color: string; descAr: string; descEn: string }
> = {
  FAWRY: {
    label: "Fawry Pay (فوري)",
    logoText: "FAWRY",
    color: "from-amber-500 to-yellow-500",
    descAr: "منافذ فوري، نقاط البيع، المحافظ الذكية، وكروت ميزة",
    descEn: "Fawry POS, Kiosks, Smart Wallets & Meeza cards",
  },
  PAYMOB: {
    label: "Paymob (باي موب)",
    logoText: "PAYMOB",
    color: "from-blue-600 to-indigo-600",
    descAr: "بطاقات الائتمان، فودافون كاش، المحافظ الإلكترونية، والتقسيط",
    descEn: "Credit cards, Vodafone Cash, e-Wallets & Installments",
  },
};

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

  const denied = await denyIfMissingPermission(organization.id, "finance.online_payments.manage", locale);
  if (denied) return denied;

  const supabase = await createClient();

  const [{ data: settings, error: settingsError }, { data: resorts }] = await Promise.all([
    supabase.rpc("list_payment_provider_settings", { p_organization_id: organization.id }),
    supabase.from("resorts").select("id, name").eq("organization_id", organization.id).order("name"),
  ]);

  const resortNameById = new Map((resorts ?? []).map((r) => [r.id, r.name]));

  const totalConfigured = settings?.length ?? 0;
  const activeCount = (settings ?? []).filter((s) => s.status === "ENABLED").length;

  return (
    <div className="w-full max-w-6xl mx-auto space-y-6 pb-16">
      {/* ──────────────────────────────────────────────────────────────────────────
          1. HEADER & BREADCRUMB
          ────────────────────────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold text-purple-600 dark:text-purple-400 mb-1">
            <span>{isAr ? "المحاسبة والمالية" : "Finance & Treasury"}</span>
            <span>/</span>
            <span className="text-slate-800 dark:text-slate-200 font-extrabold">
              {isAr ? "بوابات الدفع الإلكتروني" : "Payment Gateways"}
            </span>
          </div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white sm:text-3xl flex items-center gap-2.5">
            <CreditCard className="size-7 text-indigo-600" />
            <span>{isAr ? "بوابات الدفع الإلكتروني والتحصيل الرقمي" : "Payment Gateways & Digital Collection"}</span>
          </h1>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mt-1">
            {isAr
              ? "ربط وتوثيق حسابات فوري وباي موب لتحصيل مطالبات الإيجار ورسوم الخدمات إلكترونياً وتحديث القيود آلياً."
              : "Configure and verify Fawry & Paymob merchant accounts for automated tenant payments and ledger posting."}
          </p>
        </div>
      </div>

      {/* ──────────────────────────────────────────────────────────────────────────
          2. KPI SUMMARY RIBBON
          ────────────────────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-200/90 bg-white p-4.5 flex items-center gap-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <div className="size-11 rounded-xl bg-gradient-to-tr from-indigo-600 to-purple-600 flex items-center justify-center text-white shadow-md shadow-indigo-600/20">
            <CreditCard className="size-5.5" />
          </div>
          <div>
            <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400">{isAr ? "البوابات النشطة حالياً" : "Active Gateways"}</p>
            <p className="text-xl font-black text-slate-900 dark:text-white font-mono mt-0.5">{activeCount}</p>
            <span className="text-[10px] text-slate-400 block">{totalConfigured} {isAr ? "بوابات مُعدّة" : "configured"}</span>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200/90 bg-white p-4.5 flex items-center gap-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <div className="size-11 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-600 flex items-center justify-center text-white shadow-md shadow-emerald-600/20">
            <Zap className="size-5.5" />
          </div>
          <div>
            <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400">{isAr ? "قنوات السداد المدعومة" : "Payment Channels"}</p>
            <p className="text-xl font-black text-emerald-600 dark:text-emerald-400 font-mono mt-0.5">{isAr ? "كافة القنوات" : "Omnichannel"}</p>
            <span className="text-[10px] text-slate-400 block">{isAr ? "بطاقات، محافظ، كود فوري" : "Cards, Wallets, Kiosks"}</span>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200/90 bg-white p-4.5 flex items-center gap-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <div className="size-11 rounded-xl bg-gradient-to-tr from-blue-600 to-cyan-600 flex items-center justify-center text-white shadow-md shadow-blue-600/20">
            <ShieldCheck className="size-5.5" />
          </div>
          <div>
            <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400">{isAr ? "التشفير والأمان" : "Security Standard"}</p>
            <p className="text-xl font-black text-blue-600 dark:text-blue-400 font-mono mt-0.5">PCI-DSS</p>
            <span className="text-[10px] text-slate-400 block">{isAr ? "تشفير HMAC مشدد" : "HMAC Signature Verify"}</span>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200/90 bg-white p-4.5 flex items-center gap-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <div className="size-11 rounded-xl bg-gradient-to-tr from-purple-600 to-pink-600 flex items-center justify-center text-white shadow-md shadow-purple-600/20">
            <Globe2 className="size-5.5" />
          </div>
          <div>
            <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400">{isAr ? "تحديث السداد لحظياً" : "Live Sync"}</p>
            <p className="text-xl font-black text-purple-600 dark:text-purple-400 font-mono mt-0.5">Webhook</p>
            <span className="text-[10px] text-slate-400 block">{isAr ? "إصدار سندات فورية" : "Instant Receipt Posting"}</span>
          </div>
        </div>
      </div>

      {/* ──────────────────────────────────────────────────────────────────────────
          3. PROVIDER BANNER CARDS
          ────────────────────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* FAWRY CARD */}
        <div className="rounded-2xl border border-amber-200/80 bg-gradient-to-br from-amber-50/50 via-white to-amber-50/20 p-4.5 shadow-xs dark:border-amber-900/60 dark:bg-slate-900">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-xl bg-gradient-to-tr from-amber-500 to-yellow-500 flex items-center justify-center text-white font-black text-xs shadow-md shadow-amber-500/20">
                FAWRY
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-900 dark:text-white">
                  {isAr ? "Fawry Pay (فوري باي)" : "Fawry Pay Integration"}
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {isAr ? "إصدار كود دفع فوري للمستأجر والسداد عبر آلاف المنافذ والمحافظ وكروت ميزة." : "Issue Fawry reference codes for kiosk and mobile payments."}
                </p>
              </div>
            </div>
            <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-[10px] font-bold">
              {isAr ? "مدعوم رسمياً" : "Official Partner"}
            </Badge>
          </div>
        </div>

        {/* PAYMOB CARD */}
        <div className="rounded-2xl border border-blue-200/80 bg-gradient-to-br from-blue-50/50 via-white to-blue-50/20 p-4.5 shadow-xs dark:border-blue-900/60 dark:bg-slate-900">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white font-black text-xs shadow-md shadow-blue-600/20">
                PAYMOB
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-900 dark:text-white">
                  {isAr ? "Paymob Gateway (باي موب)" : "Paymob Digital Gateway"}
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {isAr ? "روابط دفع آمنة لبطاقات Visa/Mastercard ومحافظ الهاتف والمحافظ البنكية والتقسيط." : "Secure checkout for cards, digital mobile wallets, and installments."}
                </p>
              </div>
            </div>
            <Badge className="bg-blue-100 text-blue-800 border-blue-200 text-[10px] font-bold">
              {isAr ? "مدعوم رسمياً" : "Official Partner"}
            </Badge>
          </div>
        </div>
      </div>

      {/* ──────────────────────────────────────────────────────────────────────────
          4. FORM COMPONENT
          ────────────────────────────────────────────────────────────────────────── */}
      <UpsertPaymentProviderSettingsForm
        organizationId={organization.id}
        resorts={(resorts ?? []).map((r) => ({ id: r.id, label: r.name }))}
        locale={locale}
      />

      {settingsError && (
        <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 font-bold flex items-center gap-2">
          <AlertCircle className="size-4 shrink-0" />
          <span>{isAr ? "تعذر تحميل إعدادات بوابات الدفع." : "Could not load settings."}</span>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────────────────────
          5. CONFIGURED PROVIDERS TABLE
          ────────────────────────────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-slate-200/90 bg-white shadow-xs overflow-hidden dark:border-slate-800 dark:bg-slate-900">
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <h2 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
            <Lock className="size-4 text-indigo-600" />
            <span>{isAr ? "سجل بوابات الدفع المهيأة بالمؤسسة" : "Configured Payment Gateways"}</span>
          </h2>
          <span className="text-xs text-slate-400 font-bold font-mono">
            {totalConfigured} {isAr ? "سجلات" : "records"}
          </span>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-slate-50/80 dark:bg-slate-800/60">
              <TableRow className="border-b border-slate-200/80 dark:border-slate-800">
                <TableHead className="text-xs font-bold text-slate-700 dark:text-slate-300">{isAr ? "المزود التجاري" : "Provider"}</TableHead>
                <TableHead className="text-xs font-bold text-slate-700 dark:text-slate-300">{isAr ? "البيئة" : "Environment"}</TableHead>
                <TableHead className="text-xs font-bold text-slate-700 dark:text-slate-300">{isAr ? "نطاق الكيان" : "Scope"}</TableHead>
                <TableHead className="text-xs font-bold text-slate-700 dark:text-slate-300">{isAr ? "المعرّف التجاري (Merchant ID)" : "Merchant ID"}</TableHead>
                <TableHead className="text-xs font-bold text-slate-700 dark:text-slate-300">{isAr ? "حالة المفاتيح" : "Security Keys"}</TableHead>
                <TableHead className="text-xs font-bold text-slate-700 dark:text-slate-300">{isAr ? "حالة البوابة" : "Status"}</TableHead>
                <TableHead className="text-xs font-bold text-slate-700 dark:text-slate-300">{isAr ? "تاريخ التحقق" : "Last Verified"}</TableHead>
                <TableHead className="text-xs font-bold text-slate-700 dark:text-slate-300 text-center">{isAr ? "الإجراءات" : "Action"}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {settings?.length ? (
                settings.map((row) => {
                  const meta = STATUS_META[row.status] ?? {
                    ar: row.status,
                    en: row.status,
                    badgeClass: "bg-slate-100 text-slate-700",
                  };
                  const providerInfo = PROVIDER_INFO[row.provider] ?? {
                    label: row.provider,
                    logoText: row.provider.slice(0, 4),
                    color: "from-slate-600 to-slate-800",
                    descAr: "",
                    descEn: "",
                  };
                  const scopeLabel = row.property_id
                    ? (resortNameById.get(row.property_id) ?? row.property_id)
                    : isAr
                    ? "كل المنشأة (كافة الكيانات)"
                    : "Organization-wide";

                  return (
                    <TableRow key={row.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 border-b border-slate-100 dark:border-slate-800/60">
                      {/* PROVIDER */}
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <div className={`size-7.5 rounded-lg bg-gradient-to-tr ${providerInfo.color} flex items-center justify-center text-white font-black text-[9px] shadow-xs`}>
                            {providerInfo.logoText}
                          </div>
                          <div>
                            <span className="text-xs font-bold text-slate-900 dark:text-white block">
                              {providerInfo.label}
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono">
                              {row.provider}
                            </span>
                          </div>
                        </div>
                      </TableCell>

                      {/* ENVIRONMENT */}
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            row.environment === "PRODUCTION"
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] font-bold"
                              : "bg-amber-50 text-amber-700 border-amber-200 text-[10px] font-bold"
                          }
                        >
                          {row.environment === "PRODUCTION"
                            ? isAr ? "إنتاج حقيقي" : "Production"
                            : isAr ? "بيئة تجريبية" : "Sandbox"}
                        </Badge>
                      </TableCell>

                      {/* SCOPE */}
                      <TableCell>
                        <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
                          <Building2 className="size-3.5 text-slate-400 shrink-0" />
                          <span>{scopeLabel}</span>
                        </div>
                      </TableCell>

                      {/* MERCHANT ID */}
                      <TableCell className="font-mono text-xs font-bold text-slate-900 dark:text-white">
                        {row.merchant_identifier}
                      </TableCell>

                      {/* KEYS */}
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Badge
                            variant="outline"
                            className={
                              row.has_api_key
                                ? "bg-emerald-50 text-emerald-700 border-emerald-200 text-[9px] font-mono font-bold"
                                : "bg-rose-50 text-rose-700 border-rose-200 text-[9px] font-mono"
                            }
                          >
                            API: {row.has_api_key ? "✓" : "✗"}
                          </Badge>
                          <Badge
                            variant="outline"
                            className={
                              row.has_hmac_secret
                                ? "bg-blue-50 text-blue-700 border-blue-200 text-[9px] font-mono font-bold"
                                : "bg-slate-100 text-slate-500 border-slate-200 text-[9px] font-mono"
                            }
                          >
                            HMAC: {row.has_hmac_secret ? "✓" : "✗"}
                          </Badge>
                        </div>
                      </TableCell>

                      {/* STATUS */}
                      <TableCell>
                        <div className="space-y-1">
                          <Badge className={`${meta.badgeClass} text-[10px] font-bold px-2 py-0.5`}>
                            {isAr ? meta.ar : meta.en}
                          </Badge>
                          {row.status === "DRAFT" && row.last_verification_error && (
                            <p className="text-[10px] text-rose-600 font-bold">{row.last_verification_error}</p>
                          )}
                        </div>
                      </TableCell>

                      {/* LAST VERIFIED */}
                      <TableCell className="text-slate-400 text-[11px] font-mono">
                        {row.verified_at ? (
                          new Date(row.verified_at).toLocaleDateString(isAr ? "ar-EG" : "en-US")
                        ) : (
                          <span className="text-slate-300 dark:text-slate-600">—</span>
                        )}
                      </TableCell>

                      {/* ACTIONS */}
                      <TableCell className="text-center">
                        <PaymentProviderRowActions settingsId={row.id} status={row.status} locale={locale} />
                      </TableCell>
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-slate-400 text-xs font-medium">
                    {isAr ? "لا توجد بوابات دفع مهيأة حتى الآن. اضغط على «إضافة بوابة دفع» بالأعلى لربط فوري أو باي موب." : "No payment gateways configured yet. Click 'Add Gateway' above to connect Fawry or Paymob."}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
