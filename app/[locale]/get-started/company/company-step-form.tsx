"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertCircle } from "lucide-react";
import { useOnboardingWizard, type EntityType } from "../onboarding-wizard-context";

const ENTITY_TYPES: Array<{ value: EntityType; ar: string; en: string }> = [
  { value: "DEVELOPER", ar: "مطوّر عقاري", en: "Developer" },
  { value: "FACILITY_MANAGEMENT", ar: "إدارة مرافق", en: "Facility Management" },
  { value: "OWNERS_ASSOCIATION", ar: "اتحاد ملاك", en: "Owners Association" },
  { value: "INDIVIDUAL_OWNER", ar: "مالك فردي", en: "Individual Owner" },
  { value: "TOURIST_RESORT", ar: "منتجع سياحي", en: "Tourist Resort" },
  { value: "TOURIST_VILLAGE", ar: "قرية سياحية", en: "Tourist Village" },
  { value: "RESIDENTIAL_COMPOUND", ar: "كمبوند سكني", en: "Residential Compound" },
  { value: "OTHER", ar: "أخرى", en: "Other" },
];

const ERROR_COPY: Record<string, { ar: string; en: string }> = {
  organization_name_required: { ar: "اسم المنشأة مطلوب (حرفان على الأقل)", en: "Company name is required (at least 2 characters)" },
  entity_type_required: { ar: "يرجى اختيار نوع الكيان", en: "Please select an entity type" },
  custom_label_required: { ar: "يرجى وصف نوع الكيان", en: "Please describe the entity type" },
};

export function CompanyStepForm({ locale }: { locale: Locale }) {
  const isAr = locale === "ar";
  const router = useRouter();
  const { company, setCompany } = useOnboardingWizard();

  const [organizationName, setOrganizationName] = useState(company?.organizationName ?? "");
  const [entityType, setEntityType] = useState<EntityType | "">(company?.entityType ?? "");
  const [entityTypeCustomLabel, setEntityTypeCustomLabel] = useState(company?.entityTypeCustomLabel ?? "");
  const [country, setCountry] = useState(company?.country ?? "");
  const [city, setCity] = useState(company?.city ?? "");
  const [expectedPropertiesCount, setExpectedPropertiesCount] = useState(company?.expectedPropertiesCount ?? "");
  const [expectedUnitsCount, setExpectedUnitsCount] = useState(company?.expectedUnitsCount ?? "");
  const [notes, setNotes] = useState(company?.notes ?? "");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    if (organizationName.trim().length < 2) return setError("organization_name_required");
    if (!entityType) return setError("entity_type_required");
    if (entityType === "OTHER" && entityTypeCustomLabel.trim().length < 2) return setError("custom_label_required");

    setError(null);
    setCompany({
      organizationName: organizationName.trim(),
      entityType,
      entityTypeCustomLabel: entityTypeCustomLabel.trim(),
      country: country.trim(),
      city: city.trim(),
      expectedPropertiesCount,
      expectedUnitsCount,
      notes: notes.trim(),
    });
    router.push("/get-started/plan");
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="organizationName">{isAr ? "اسم المنشأة" : "Company / entity name"}</Label>
        <Input id="organizationName" value={organizationName} onChange={(e) => setOrganizationName(e.target.value)} required />
      </div>

      <div className="space-y-2">
        <Label htmlFor="entityType">{isAr ? "نوع الكيان" : "Entity type"}</Label>
        <Select value={entityType} onValueChange={(value) => setEntityType(value as EntityType)}>
          <SelectTrigger id="entityType" className="w-full">
            <SelectValue placeholder={isAr ? "اختر نوع الكيان" : "Select entity type"} />
          </SelectTrigger>
          <SelectContent>
            {ENTITY_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {isAr ? t.ar : t.en}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {entityType === "OTHER" && (
        <div className="space-y-2">
          <Label htmlFor="entityTypeCustomLabel">{isAr ? "صف نوع الكيان" : "Describe the entity type"}</Label>
          <Input
            id="entityTypeCustomLabel"
            value={entityTypeCustomLabel}
            onChange={(e) => setEntityTypeCustomLabel(e.target.value)}
          />
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="country">{isAr ? "الدولة" : "Country"}</Label>
          <Input id="country" value={country} onChange={(e) => setCountry(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="city">{isAr ? "المدينة" : "City"}</Label>
          <Input id="city" value={city} onChange={(e) => setCity(e.target.value)} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="expectedPropertiesCount">{isAr ? "عدد المشاريع/العقارات المتوقع" : "Expected properties/projects"}</Label>
          <Input
            id="expectedPropertiesCount"
            type="number"
            min={0}
            inputMode="numeric"
            value={expectedPropertiesCount}
            onChange={(e) => setExpectedPropertiesCount(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="expectedUnitsCount">{isAr ? "عدد الوحدات المتوقع" : "Expected units"}</Label>
          <Input
            id="expectedUnitsCount"
            type="number"
            min={0}
            inputMode="numeric"
            value={expectedUnitsCount}
            onChange={(e) => setExpectedUnitsCount(e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">{isAr ? "ملاحظات (اختياري)" : "Notes (optional)"}</Label>
        <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
      </div>

      {error && (
        <div role="alert" className="flex items-center gap-2 text-sm text-destructive">
          <AlertCircle className="size-4 shrink-0" />
          <span>{isAr ? ERROR_COPY[error]?.ar : ERROR_COPY[error]?.en}</span>
        </div>
      )}

      <div className="flex gap-3">
        <Button type="button" variant="outline" onClick={() => router.push("/get-started")} className="flex-1">
          {isAr ? "رجوع" : "Back"}
        </Button>
        <Button type="submit" className="flex-1">
          {isAr ? "متابعة" : "Continue"}
        </Button>
      </div>
    </form>
  );
}
