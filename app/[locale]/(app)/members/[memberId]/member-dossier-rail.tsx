"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Pencil,
  Check,
  X,
  Loader2,
  Mail,
  Phone,
  MapPin,
  BadgeCheck,
  ShieldCheck,
  UserRound,
  Building2,
  TriangleAlert,
  CalendarDays,
  KeyRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { updateMemberAction } from "@/lib/actions/member-profile";
import { cn } from "@/lib/utils";

export interface MemberDossier {
  id: string;
  fullName: string;
  legalName: string | null;
  isCompany: boolean;
  customerType: string | null;
  email: string | null;
  phone: string | null;
  countryCode: string | null;
  billingAddress: string | null;
  taxRegistrationNumber: string | null;
  identityDocumentType: string | null;
  identityDocumentNumber: string | null;
  identityVerifiedAt: string | null;
  createdAt: string | null;
  hasPortalAccess: boolean;
}

type FieldKey =
  | "fullName"
  | "legalName"
  | "customerType"
  | "email"
  | "phone"
  | "countryCode"
  | "billingAddress"
  | "taxRegistrationNumber"
  | "identityDocumentType"
  | "identityDocumentNumber";

const CUSTOMER_TYPE_LABELS: Record<string, { ar: string; en: string }> = {
  B2B: { ar: "منشأة (B2B)", en: "Business (B2B)" },
  B2C: { ar: "فرد (B2C)", en: "Consumer (B2C)" },
  UNRESOLVED: { ar: "لم يُحدَّد بعد", en: "Not yet determined" },
};

const ID_DOC_LABELS: Record<string, { ar: string; en: string }> = {
  NATIONAL_ID: { ar: "بطاقة رقم قومي", en: "National ID" },
  PASSPORT: { ar: "جواز سفر", en: "Passport" },
};

export function MemberDossierRail({
  member,
  canManage,
  locale,
}: {
  member: MemberDossier;
  canManage: boolean;
  locale: string;
}) {
  const isAr = locale === "ar";
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = useState<FieldKey | null>(null);
  const [draft, setDraft] = useState("");
  const [isPending, startTransition] = useTransition();

  // Neither an email nor a phone means create_member_invitation will refuse
  // this member outright. That is the single most consequential gap on the
  // page, so it is called out rather than left as two quiet dashes.
  const unreachable = !member.email && !member.phone;

  function begin(field: FieldKey, current: string | null) {
    setEditing(field);
    setDraft(current ?? "");
  }

  function save(field: FieldKey) {
    startTransition(async () => {
      const res = await updateMemberAction({
        memberId: member.id,
        fullName: field === "fullName" ? draft : member.fullName,
        legalName: field === "legalName" ? draft : member.legalName,
        isCompany: member.isCompany,
        // customer_type is NOT NULL in the schema, defaulting to UNRESOLVED --
        // clearing it means "not yet determined", never null.
        customerType: (field === "customerType"
          ? draft || "UNRESOLVED"
          : member.customerType || "UNRESOLVED") as never,
        email: field === "email" ? draft : member.email,
        phone: field === "phone" ? draft : member.phone,
        countryCode: field === "countryCode" ? draft : member.countryCode,
        billingAddress: field === "billingAddress" ? draft : member.billingAddress,
        taxRegistrationNumber:
          field === "taxRegistrationNumber" ? draft : member.taxRegistrationNumber,
        identityDocumentType: (field === "identityDocumentType"
          ? draft || null
          : member.identityDocumentType) as never,
        identityDocumentNumber:
          field === "identityDocumentNumber" ? draft : member.identityDocumentNumber,
      });

      if (!res.ok) {
        toast.add({
          title: isAr ? "تعذر حفظ التعديل" : "Could not save the change",
          description:
            res.error === "invalid_input"
              ? isAr
                ? "تحقق من صيغة القيمة المُدخلة."
                : "Check the format of the value you entered."
              : isAr
                ? "قد لا تملك صلاحية تعديل بيانات الملاك."
                : "You may not have permission to edit owner records.",
          type: "error",
        });
        return;
      }

      setEditing(null);
      router.refresh();
      toast.add({ title: isAr ? "تم الحفظ" : "Saved", type: "success" });
    });
  }

  function Row({
    field,
    icon,
    label,
    value,
    display,
    mono,
    options,
    required,
    placeholder,
  }: {
    field: FieldKey;
    icon: React.ReactNode;
    label: string;
    value: string | null;
    display?: string | null;
    mono?: boolean;
    options?: { value: string; label: string }[];
    /** Highlights the row when empty and something downstream depends on it. */
    required?: boolean;
    placeholder?: string;
  }) {
    const isEditing = editing === field;
    const missing = !value;

    return (
      <div
        className={cn(
          "group rounded-xl border p-2.5 transition-colors",
          missing && required
            ? "border-amber-500/40 bg-amber-500/[0.05]"
            : "border-transparent hover:border-border/60 hover:bg-muted/40",
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-[10px] font-semibold text-muted-foreground">
            {icon}
            {label}
          </span>
          {canManage && !isEditing && (
            <button
              type="button"
              onClick={() => begin(field, value)}
              aria-label={`${isAr ? "تعديل" : "Edit"} ${label}`}
              className="rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
            >
              <Pencil className="size-3" />
            </button>
          )}
        </div>

        {isEditing ? (
          <div className="mt-1.5 flex items-center gap-1.5">
            {options ? (
              <select
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                autoFocus
                className="h-8 flex-1 rounded-lg border border-border bg-background px-2 text-xs"
              >
                <option value="">{isAr ? "— غير محدد —" : "— none —"}</option>
                {options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : (
              <Input
                value={draft}
                autoFocus
                dir={mono ? "ltr" : undefined}
                placeholder={placeholder}
                style={mono ? { textAlign: isAr ? "right" : "left" } : undefined}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") save(field);
                  if (e.key === "Escape") setEditing(null);
                }}
                className="h-8 flex-1 rounded-lg text-xs"
              />
            )}
            <Button
              type="button"
              size="sm"
              disabled={isPending}
              onClick={() => save(field)}
              className="size-8 shrink-0 p-0"
              aria-label={isAr ? "حفظ" : "Save"}
            >
              {isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={isPending}
              onClick={() => setEditing(null)}
              className="size-8 shrink-0 p-0"
              aria-label={isAr ? "إلغاء" : "Cancel"}
            >
              <X className="size-3.5" />
            </Button>
          </div>
        ) : (
          <p
            className={cn(
              "mt-0.5 break-words text-start text-xs font-semibold",
              missing ? "text-muted-foreground/60" : "text-foreground",
              mono && "font-mono",
            )}
          >
            {/* dir goes on the VALUE, never on the paragraph. Putting it on the
                block made every Latin value (email, phone, tax number) align
                left while its Arabic label stayed right, so the two read as
                unrelated. Isolating just the span keeps "name@host.com" in
                correct character order while the field itself still starts
                where the rest of the panel starts. */}
            <span dir={mono && value ? "ltr" : undefined} className="[unicode-bidi:isolate]">
              {display ?? value ?? (isAr ? "غير مسجّل" : "Not on record")}
            </span>
          </p>
        )}
      </div>
    );
  }

  function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
      <div className="space-y-0.5">
        <p className="px-2.5 pb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">
          {title}
        </p>
        {children}
      </div>
    );
  }

  return (
    <aside className="space-y-5 rounded-2xl border border-border/70 bg-card p-4">
      {unreachable && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/[0.06] p-3">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" />
          <div className="space-y-0.5">
            <p className="text-[11px] font-bold text-amber-900 dark:text-amber-200">
              {isAr ? "لا يمكن دعوته للبوابة" : "Cannot be invited to the portal"}
            </p>
            <p className="text-[10px] leading-relaxed text-amber-800/90 dark:text-amber-200/80">
              {isAr
                ? "لا يوجد بريد ولا هاتف مسجل. أضف أحدهما أدناه لتفعيل الدعوة."
                : "No email and no phone on record. Add either one below to enable invitations."}
            </p>
          </div>
        </div>
      )}

      <Section title={isAr ? "الهوية" : "Identity"}>
        <Row
          field="fullName"
          icon={<UserRound className="size-3" />}
          label={isAr ? "الاسم" : "Name"}
          value={member.fullName}
        />
        <Row
          field="legalName"
          icon={<Building2 className="size-3" />}
          label={isAr ? "الاسم القانوني" : "Legal name"}
          value={member.legalName}
        />
        <Row
          field="customerType"
          icon={<BadgeCheck className="size-3" />}
          label={isAr ? "التصنيف الضريبي" : "Tax classification"}
          value={member.customerType}
          display={
            member.customerType
              ? (isAr
                  ? CUSTOMER_TYPE_LABELS[member.customerType]?.ar
                  : CUSTOMER_TYPE_LABELS[member.customerType]?.en) ?? member.customerType
              : null
          }
          options={Object.entries(CUSTOMER_TYPE_LABELS).map(([value, l]) => ({
            value,
            label: isAr ? l.ar : l.en,
          }))}
        />
      </Section>

      <Section title={isAr ? "التواصل" : "Contact"}>
        <Row
          field="phone"
          icon={<Phone className="size-3" />}
          label={isAr ? "الهاتف" : "Phone"}
          value={member.phone}
          mono
          required={unreachable}
          placeholder="+201234567890"
        />
        <Row
          field="email"
          icon={<Mail className="size-3" />}
          label={isAr ? "البريد الإلكتروني" : "Email"}
          value={member.email}
          mono
          required={unreachable}
          placeholder="name@example.com"
        />
        <Row
          field="countryCode"
          icon={<MapPin className="size-3" />}
          label={isAr ? "الدولة" : "Country"}
          value={member.countryCode}
          mono
          placeholder="EG"
        />
        <Row
          field="billingAddress"
          icon={<MapPin className="size-3" />}
          label={isAr ? "عنوان الفوترة" : "Billing address"}
          value={member.billingAddress}
        />
      </Section>

      <Section title={isAr ? "الهوية الضريبية" : "Tax & identity"}>
        <Row
          field="taxRegistrationNumber"
          icon={<BadgeCheck className="size-3" />}
          label={isAr ? "الرقم الضريبي" : "Tax registration no."}
          value={member.taxRegistrationNumber}
          mono
        />
        <Row
          field="identityDocumentType"
          icon={<ShieldCheck className="size-3" />}
          label={isAr ? "نوع مستند الهوية" : "Identity document"}
          value={member.identityDocumentType}
          display={
            member.identityDocumentType
              ? (isAr
                  ? ID_DOC_LABELS[member.identityDocumentType]?.ar
                  : ID_DOC_LABELS[member.identityDocumentType]?.en) ?? member.identityDocumentType
              : null
          }
          options={Object.entries(ID_DOC_LABELS).map(([value, l]) => ({
            value,
            label: isAr ? l.ar : l.en,
          }))}
        />
        <Row
          field="identityDocumentNumber"
          icon={<ShieldCheck className="size-3" />}
          label={isAr ? "رقم المستند" : "Document number"}
          value={member.identityDocumentNumber}
          mono
        />
      </Section>

      {/* Read-only below: these are events that happened, not attributes
          anyone types. A verification you can edit is not a verification. */}
      <Section title={isAr ? "الحالة والسجل" : "Status & record"}>
        <div className="space-y-1.5 px-2.5 pt-1">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-[10px] font-semibold text-muted-foreground">
              <KeyRound className="size-3" />
              {isAr ? "وصول البوابة" : "Portal access"}
            </span>
            <Badge
              variant="outline"
              className={cn(
                "text-[10px] font-semibold",
                member.hasPortalAccess
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                  : "bg-muted text-muted-foreground",
              )}
            >
              {member.hasPortalAccess
                ? isAr
                  ? "مُفعّل"
                  : "Active"
                : isAr
                  ? "غير مُفعّل"
                  : "Not active"}
            </Badge>
          </div>

          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-[10px] font-semibold text-muted-foreground">
              <ShieldCheck className="size-3" />
              {isAr ? "توثيق الهوية" : "Identity verified"}
            </span>
            <span className="text-[11px] font-semibold text-foreground">
              {member.identityVerifiedAt
                ? member.identityVerifiedAt.slice(0, 10)
                : isAr
                  ? "غير موثّقة"
                  : "Not verified"}
            </span>
          </div>

          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-[10px] font-semibold text-muted-foreground">
              <CalendarDays className="size-3" />
              {isAr ? "مسجّل منذ" : "On record since"}
            </span>
            <span className="font-mono text-[11px] font-semibold text-foreground">
              {member.createdAt?.slice(0, 10) ?? "—"}
            </span>
          </div>
        </div>
      </Section>

      {!canManage && (
        <p className="rounded-xl border border-border/60 bg-muted/40 p-2.5 text-[10px] leading-relaxed text-muted-foreground">
          {isAr
            ? "العرض فقط — تحتاج صلاحية «إدارة الملاك» لتعديل هذه البيانات."
            : "View only — editing these details needs the manage-owners permission."}
        </p>
      )}
    </aside>
  );
}
