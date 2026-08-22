"use client";

import { useActionState, useEffect, useState } from "react";
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
import { createOrganization, type ActionResult } from "@/lib/actions/platform";
import { Building2, Sparkles, Check, RefreshCw, AlertCircle } from "lucide-react";

export function CreateOrganizationForm({
  locale,
  onSuccess,
}: {
  locale: string;
  onSuccess?: () => void;
}) {
  const isAr = locale === "ar";
  const [orgName, setOrgName] = useState("");
  const [slug, setSlug] = useState("");
  const [selectedPlan, setSelectedPlan] = useState<"STARTER" | "PROFESSIONAL" | "ENTERPRISE">("STARTER");
  const [currency, setCurrency] = useState("SAR");

  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    createOrganization,
    { ok: true },
  );

  useEffect(() => {
    if (state.ok && !pending && onSuccess && orgName) {
      onSuccess();
    }
  }, [state.ok, pending, onSuccess, orgName]);

  const handleNameChange = (name: string) => {
    setOrgName(name);
    // Auto generate suggested slug
    const generated = name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9\u0600-\u06FF]+/g, "-")
      .replace(/(^-|-$)/g, "");
    setSlug(generated);
  };

  return (
    <form action={formAction} className="space-y-4 pt-2">
      
      {/* Name Input */}
      <div className="space-y-1.5 text-start">
        <Label htmlFor="name" className="text-xs font-bold text-foreground block">
          {isAr ? "اسم المنظمة / الكيان العقاري" : "Organization / Company Name"}
        </Label>
        <Input
          id="name"
          name="name"
          value={orgName}
          onChange={(e) => handleNameChange(e.target.value)}
          placeholder={isAr ? "مثال: مجموعة الزمرد العقارية" : "e.g. Emerald Real Estate Holding"}
          required
          className="h-10 text-sm rounded-xl"
        />
      </div>

      {/* Slug & Currency in 2 cols */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-start">
        <div className="space-y-1.5">
          <Label htmlFor="slug" className="text-xs font-bold text-foreground block">
            {isAr ? "المعرّف التقني (Slug)" : "Unique Slug"}
          </Label>
          <Input
            id="slug"
            name="slug"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder={isAr ? "emerald-group" : "emerald-group"}
            className="h-10 text-xs font-mono rounded-xl"
            dir="ltr"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="defaultCurrency" className="text-xs font-bold text-foreground block">
            {isAr ? "العملة الافتراضية" : "Default Currency"}
          </Label>
          <Select
            name="defaultCurrency"
            value={currency}
            onValueChange={(val) => {
              if (val) setCurrency(val);
            }}
            items={[
              { value: "SAR", label: isAr ? "ريال سعودي (SAR)" : "Saudi Riyal (SAR)" },
              { value: "EGP", label: isAr ? "جنيه مصري (EGP)" : "Egyptian Pound (EGP)" },
              { value: "AED", label: isAr ? "درهم إماراتي (AED)" : "UAE Dirham (AED)" },
              { value: "USD", label: "US Dollar (USD)" },
            ]}
          >
            <SelectTrigger id="defaultCurrency" className="h-10 text-xs rounded-xl w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="SAR">{isAr ? "ريال سعودي (SAR)" : "Saudi Riyal (SAR)"}</SelectItem>
              <SelectItem value="EGP">{isAr ? "جنيه مصري (EGP)" : "Egyptian Pound (EGP)"}</SelectItem>
              <SelectItem value="AED">{isAr ? "درهم إماراتي (AED)" : "UAE Dirham (AED)"}</SelectItem>
              <SelectItem value="USD">US Dollar (USD)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Owner Info & Email Dispatch (New) */}
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-3.5 space-y-3 text-start">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-primary shrink-0" />
          <div>
            <p className="text-xs font-bold text-foreground">
              {isAr ? "بيانات المالك ودعوة البريد الإلكتروني" : "Owner Details & Email Invite"}
            </p>
            <p className="text-[10px] text-muted-foreground">
              {isAr
                ? "سيتم إرسال بريد إلكتروني ترحيبي برابط تعيين كلمة المرور فوراً"
                : "A welcome email with password setup link will be dispatched automatically"}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <div className="space-y-1">
            <Label htmlFor="ownerFullName" className="text-[11px] font-bold text-foreground block">
              {isAr ? "اسم المسؤول / المدير" : "Owner / Admin Name"}
            </Label>
            <Input
              id="ownerFullName"
              name="ownerFullName"
              placeholder={isAr ? "مثال: م. أحمد عبد العزيز" : "e.g. Ahmed Abdulaziz"}
              className="h-9 text-xs rounded-lg bg-background"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="ownerEmail" className="text-[11px] font-bold text-foreground block">
              {isAr ? "بريد العميل الإلكتروني" : "Owner Email Address"}
            </Label>
            <Input
              id="ownerEmail"
              name="ownerEmail"
              type="email"
              placeholder="owner@company.com"
              className="h-9 text-xs rounded-lg bg-background font-mono"
              dir="ltr"
            />
          </div>
        </div>
      </div>

      {/* Plan Selection Cards */}
      <div className="space-y-2 text-start pt-1">
        <Label className="text-xs font-bold text-foreground block">
          {isAr ? "باقة الاشتراك الافتراضية" : "Initial Subscription Plan"}
        </Label>
        <input type="hidden" name="planKey" value={selectedPlan} />
        
        <div className="grid grid-cols-3 gap-2">
          {(
            [
              { key: "STARTER", nameAr: "الأساسية", nameEn: "Starter", badgeAr: "100 وحدة", badgeEn: "100 units" },
              { key: "PROFESSIONAL", nameAr: "الاحترافية", nameEn: "Pro", badgeAr: "1,000 وحدة", badgeEn: "1k units" },
              { key: "ENTERPRISE", nameAr: "المجموعات", nameEn: "Enterprise", badgeAr: "غير محدود", badgeEn: "Unlimited" },
            ] as const
          ).map((plan) => {
            const isSelected = selectedPlan === plan.key;
            return (
              <button
                key={plan.key}
                type="button"
                onClick={() => setSelectedPlan(plan.key)}
                className={`p-3 rounded-xl border text-center transition-all cursor-pointer ${
                  isSelected
                    ? "border-primary bg-primary/10 text-primary ring-1 ring-primary shadow-xs"
                    : "border-border bg-card/80 hover:border-border/80 text-muted-foreground hover:text-foreground"
                }`}
              >
                <span className="text-xs font-black block text-foreground">{isAr ? plan.nameAr : plan.nameEn}</span>
                <span className="text-[10px] text-muted-foreground block mt-0.5">{isAr ? plan.badgeAr : plan.badgeEn}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Error alert */}
      {!state.ok && (
        <div
          role="alert"
          className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs font-semibold text-destructive flex items-center gap-2"
        >
          <AlertCircle className="size-4 shrink-0" />
          <span>
            {state.error === "invalid_input"
              ? isAr
                ? "يرجى التأكد من صحة كافة البيانات المدخلة"
                : "Please check your input values"
              : state.error}
          </span>
        </div>
      )}

      {/* Submit Button */}
      <div className="pt-2">
        <Button
          type="submit"
          disabled={pending}
          className="w-full h-10 font-bold rounded-xl shadow-md gap-2"
        >
          {pending ? (
            <>
              <RefreshCw className="size-4 animate-spin" />
              <span>{isAr ? "جارٍ التهيئة والإنشاء..." : "Creating workspace..."}</span>
            </>
          ) : (
            <>
              <Check className="size-4" />
              <span>{isAr ? "تأكيد وإنشاء المنظمة" : "Create Organization Workspace"}</span>
            </>
          )}
        </Button>
      </div>

    </form>
  );
}
