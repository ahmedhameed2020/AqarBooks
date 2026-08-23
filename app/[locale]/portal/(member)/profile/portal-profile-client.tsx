"use client";

import {
  BadgeCheck,
  Building2,
  CalendarDays,
  CheckCircle2,
  Info,
  KeyRound,
  Loader2,
  Mail,
  MapPin,
  Phone,
  Receipt,
  ShieldCheck,
  UserRound,
  Wallet,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Money } from "@/components/money";
import { PortalPageHeader, StatCard } from "../portal-ui";

export interface PortalProfileData {
  fullName: string;
  legalName: string | null;
  isCompany: boolean;
  customerType: string | null;
  contactEmail: string | null;
  signInEmail: string | null;
  phone: string | null;
  countryCode: string | null;
  billingAddress: string | null;
  taxRegistrationNumber: string | null;
  identityDocumentType: string | null;
  identityDocumentNumber: string | null;
  identityVerifiedAt: string | null;
  memberSince: string | null;
  organizationName: string;
  currency: string;
  unitsCount: number;
  totalBalance: number;
  lastPaymentAmount: number | null;
  lastPaymentDate: string | null;
}

// Exactly the two values members_identity_document_type_check permits. The
// earlier map invented COMMERCIAL_REGISTER / RESIDENCE_PERMIT / OTHER, which
// the column can never hold.
const ID_DOC_LABELS: Record<string, { ar: string; en: string }> = {
  NATIONAL_ID: { ar: "بطاقة رقم قومي", en: "National ID" },
  PASSPORT: { ar: "جواز سفر", en: "Passport" },
};

// members_customer_type_check permits only these three. The earlier map used
// INDIVIDUAL / COMPANY / GOVERNMENT, so every lookup missed and the raw column
// value was shown to the owner instead.
const CUSTOMER_TYPE_LABELS: Record<string, { ar: string; en: string }> = {
  B2B: { ar: "منشأة", en: "Business" },
  B2C: { ar: "فرد", en: "Individual" },
  UNRESOLVED: { ar: "لم يُحدَّد بعد", en: "Not yet determined" },
};

function Field({
  icon,
  label,
  value,
  mono,
  fallback,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | null;
  mono?: boolean;
  fallback: string;
}) {
  return (
    <div className="space-y-1 rounded-xl border border-border/50 bg-slate-50/60 p-3 dark:bg-slate-900/40">
      <dt className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-400">
        {icon}
        <span>{label}</span>
      </dt>
      <dd
        className={`text-xs font-semibold ${
          value ? "text-slate-800 dark:text-slate-200" : "text-slate-400"
        } ${mono ? "font-mono" : ""}`}
      >
        {value || fallback}
      </dd>
    </div>
  );
}

export function PortalProfileClient({
  profile,
  locale,
}: {
  profile: PortalProfileData;
  locale: string;
}) {
  const isAr = locale === "ar";
  const verified = Boolean(profile.identityVerifiedAt);
  const notProvided = isAr ? "غير مسجّل" : "Not on record";

  return (
    <div className="space-y-6">
      <PortalPageHeader
        title={isAr ? "بياناتي" : "My Profile"}
        description={
          isAr
            ? "بياناتك المسجلة لدى إدارة الكيان، وحالة توثيق هويتك، وأمان حسابك على البوابة."
            : "The details management holds on record for you, your identity verification status, and your portal account security."
        }
      />

      {/* Identity band. Whose financial information this portal is showing, and
          on whose authority -- stated once, plainly, at the top. */}
      <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border/70 bg-card p-5">
        <div className="flex min-w-0 items-center gap-4">
          <div className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-xl font-bold text-white">
            {profile.fullName.trim().slice(0, 1) || "?"}
          </div>
          <div className="min-w-0 space-y-1">
            <h2 className="truncate text-lg font-bold text-slate-900 dark:text-white">
              {profile.fullName}
            </h2>
            {profile.legalName && profile.legalName !== profile.fullName ? (
              <p className="truncate text-xs text-slate-500">
                {isAr ? "الاسم القانوني: " : "Legal name: "}
                {profile.legalName}
              </p>
            ) : null}
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant="outline"
                className="border-indigo-500/30 bg-indigo-500/10 text-[10px] font-semibold text-indigo-600 dark:text-indigo-400"
              >
                {profile.isCompany
                  ? isAr
                    ? "حساب اعتباري"
                    : "Corporate account"
                  : isAr
                    ? "حساب فردي"
                    : "Individual account"}
              </Badge>
              {profile.customerType ? (
                <Badge variant="outline" className="bg-slate-100 text-[10px] font-semibold dark:bg-slate-800">
                  {isAr
                    ? (CUSTOMER_TYPE_LABELS[profile.customerType]?.ar ?? profile.customerType)
                    : (CUSTOMER_TYPE_LABELS[profile.customerType]?.en ?? profile.customerType)}
                </Badge>
              ) : null}
              <span className="flex items-center gap-1 text-[11px] font-medium text-slate-500">
                <Building2 className="size-3.5" />
                {profile.organizationName}
              </span>
            </div>
          </div>
        </div>

        <div
          className={`flex items-center gap-2.5 rounded-xl border px-4 py-3 ${
            verified
              ? "border-emerald-500/30 bg-emerald-500/[0.06]"
              : "border-amber-500/30 bg-amber-500/[0.06]"
          }`}
        >
          {verified ? (
            <BadgeCheck className="size-5 shrink-0 text-emerald-600" />
          ) : (
            <Info className="size-5 shrink-0 text-amber-600" />
          )}
          <div>
            <p
              className={`text-xs font-bold ${
                verified
                  ? "text-emerald-700 dark:text-emerald-300"
                  : "text-amber-800 dark:text-amber-300"
              }`}
            >
              {verified
                ? isAr
                  ? "الهوية مُوثّقة"
                  : "Identity verified"
                : isAr
                  ? "الهوية غير مُوثّقة بعد"
                  : "Identity not yet verified"}
            </p>
            <p className="text-[10px] text-slate-500">
              {verified
                ? `${isAr ? "بتاريخ" : "On"} ${profile.identityVerifiedAt?.slice(0, 10)}`
                : isAr
                  ? "تتم عبر إدارة الكيان"
                  : "Completed through management"}
            </p>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label={isAr ? "وحداتك المسجلة" : "Units registered"}
          icon={<Building2 className="size-4 text-indigo-500" />}
          value={
            <>
              {profile.unitsCount}{" "}
              <span className="text-xs font-semibold text-slate-400">
                {isAr ? "وحدة" : profile.unitsCount === 1 ? "unit" : "units"}
              </span>
            </>
          }
          hint={isAr ? "مرتبطة بحسابك حاليًا" : "Currently linked to your account"}
        />
        <StatCard
          label={isAr ? "رصيدك الحالي" : "Current balance"}
          icon={<Wallet className="size-4 text-indigo-500" />}
          tone={profile.totalBalance > 0 ? "negative" : "positive"}
          value={
            <Money
              amount={profile.totalBalance}
              locale={locale}
              tone={profile.totalBalance > 0 ? "negative" : "positive"}
            />
          }
          hint={
            profile.totalBalance > 0
              ? isAr
                ? "مستحق السداد"
                : "Outstanding"
              : isAr
                ? "الحساب مسوّى"
                : "Fully settled"
          }
        />
        <StatCard
          label={isAr ? "آخر سداد" : "Last payment"}
          icon={<Receipt className="size-4 text-emerald-500" />}
          value={
            profile.lastPaymentAmount === null ? (
              "—"
            ) : (
              <Money amount={profile.lastPaymentAmount} locale={locale} tone="positive" />
            )
          }
          hint={profile.lastPaymentDate ?? (isAr ? "لا توجد دفعات سابقة" : "No payments yet")}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="space-y-4 rounded-2xl border border-border/70 bg-card p-5">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
              <UserRound className="size-4 text-indigo-500" />
              {isAr ? "بياناتك المسجلة" : "Details on record"}
            </h2>
            <p className="text-xs text-slate-500">
              {isAr
                ? "هذه البيانات تديرها إدارة الكيان. لتصحيح أي منها يُرجى التواصل معها مباشرة."
                : "These details are maintained by management. To correct any of them, contact them directly."}
            </p>
          </div>

          <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Field
              icon={<Mail className="size-3" />}
              label={isAr ? "بريد التواصل" : "Contact email"}
              value={profile.contactEmail}
              fallback={notProvided}
            />
            <Field
              icon={<KeyRound className="size-3" />}
              label={isAr ? "بريد تسجيل الدخول" : "Sign-in email"}
              value={profile.signInEmail}
              fallback={notProvided}
            />
            <Field
              icon={<Phone className="size-3" />}
              label={isAr ? "رقم الهاتف" : "Phone"}
              value={profile.phone}
              mono
              fallback={notProvided}
            />
            <Field
              icon={<MapPin className="size-3" />}
              label={isAr ? "الدولة" : "Country"}
              value={profile.countryCode}
              fallback={notProvided}
            />
            <Field
              icon={<MapPin className="size-3" />}
              label={isAr ? "عنوان الفوترة" : "Billing address"}
              value={profile.billingAddress}
              fallback={notProvided}
            />
            <Field
              icon={<BadgeCheck className="size-3" />}
              label={isAr ? "الرقم الضريبي" : "Tax registration no."}
              value={profile.taxRegistrationNumber}
              mono
              fallback={notProvided}
            />
            <Field
              icon={<ShieldCheck className="size-3" />}
              label={isAr ? "نوع مستند الهوية" : "Identity document"}
              value={
                profile.identityDocumentType
                  ? isAr
                    ? (ID_DOC_LABELS[profile.identityDocumentType]?.ar ??
                      profile.identityDocumentType)
                    : (ID_DOC_LABELS[profile.identityDocumentType]?.en ??
                      profile.identityDocumentType)
                  : null
              }
              fallback={notProvided}
            />
            <Field
              icon={<ShieldCheck className="size-3" />}
              label={isAr ? "رقم مستند الهوية" : "Document number"}
              value={profile.identityDocumentNumber}
              mono
              fallback={notProvided}
            />
            <Field
              icon={<CalendarDays className="size-3" />}
              label={isAr ? "مسجّل منذ" : "On record since"}
              value={profile.memberSince}
              mono
              fallback={notProvided}
            />
          </dl>
        </section>

        <section className="space-y-4 rounded-2xl border border-border/70 bg-card p-5">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
              <KeyRound className="size-4 text-indigo-500" />
              {isAr ? "أمان الحساب" : "Account security"}
            </h2>
            <p className="text-xs text-slate-500">
              {isAr
                ? "هذا الحساب بلا كلمة مرور — لا توجد كلمة مرور يمكن تسريبها أو نسيانها."
                : "This account has no password — there is nothing to leak or forget."}
            </p>
          </div>

          <ol className="space-y-3">
            <li className="flex gap-3 rounded-xl border border-border/50 bg-slate-50/60 p-3 dark:bg-slate-900/40">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-[11px] font-bold text-white">
                1
              </span>
              <div className="space-y-0.5">
                <p className="text-xs font-semibold text-slate-900 dark:text-white">
                  {isAr ? "رابط خاص بك" : "A link addressed to you"}
                </p>
                <p className="text-[11px] leading-relaxed text-slate-500">
                  {isAr
                    ? "ترسله إدارة الكيان عبر واتساب أو البريد، وصلاحيته ٧٢ ساعة."
                    : "Sent by management over WhatsApp or email, valid for 72 hours."}
                </p>
              </div>
            </li>
            <li className="flex gap-3 rounded-xl border border-border/50 bg-slate-50/60 p-3 dark:bg-slate-900/40">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-[11px] font-bold text-white">
                2
              </span>
              <div className="space-y-0.5">
                <p className="text-xs font-semibold text-slate-900 dark:text-white">
                  {isAr ? "رمز من ٦ أرقام" : "A six-digit code"}
                </p>
                <p className="text-[11px] leading-relaxed text-slate-500">
                  {isAr
                    ? "يصل في رسالة منفصلة عن الرابط، حتى لا يكفي تحويل الرسالة لدخول حسابك."
                    : "Arrives in a message separate from the link, so forwarding the link alone is not enough to reach your account."}
                </p>
              </div>
            </li>
          </ol>

          <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/[0.06] p-3">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-amber-600" />
            <p className="text-[11px] leading-relaxed text-amber-800 dark:text-amber-300">
              {isAr
                ? "لا تشارك رابط الدخول أو الرمز مع أي شخص — من يملكهما معًا يرى مركزك المالي كاملًا. إذا انتهت جلستك، اطلب رابطًا جديدًا من صفحة الدخول أو من إدارة الكيان."
                : "Never share your sign-in link or code — together they reveal your full financial position. If your session ends, request a new link from the sign-in page or from management."}
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
