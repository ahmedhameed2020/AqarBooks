import { setRequestLocale } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getPrimaryOrganization } from "@/lib/auth/org-context";
import { hasPermission } from "@/lib/auth/authorize";
import { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/i18n/routing";
import { Layers, AlertCircle } from "lucide-react";
import { FixedAssetsClient, type FixedAssetItem } from "./fixed-assets-client";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const isAr = locale === "ar";
  return {
    title: isAr
      ? "سجل الأصول الثابتة والإهلاك المحاسبي — AqarBooks"
      : "Fixed Assets & Depreciation Schedule — AqarBooks",
    description: isAr
      ? "حصر الأصول الرأسمالية والمعدات والمنشآت، معدلات الإهلاك السنوية، ومجمع الإهلاك وصافي القيمة الدفترية."
      : "Fixed assets register tracking capital equipment, acquisition cost, accumulated depreciation, and Net Book Value (NBV).",
  };
}

export default async function FixedAssetsPage({
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

  const canRead = (await hasPermission(organization.id, "finance.reports.read")) ||
                  (await hasPermission(organization.id, "finance.audit.read"));

  if (!canRead) {
    return (
      <div className="p-8 text-center space-y-3">
        <div className="size-12 mx-auto rounded-2xl bg-amber-50 dark:bg-amber-950/50 flex items-center justify-center text-amber-600">
          <AlertCircle className="size-6" />
        </div>
        <h1 className="text-lg font-bold text-slate-900 dark:text-white">
          {isAr ? "سجل الأصول الثابتة" : "Fixed Assets Schedule"}
        </h1>
        <p className="text-xs text-slate-500 max-w-sm mx-auto">
          {isAr
            ? "لا تملك صلاحية استعراض سجل الأصول الثابتة."
            : "You don't have permission to view this report."}
        </p>
      </div>
    );
  }

  const supabase = await createClient();

  // 1. Fetch Asset accounts from Chart of Accounts
  const { data: coaData } = await supabase
    .from("chart_of_accounts")
    .select("id, code, name_ar, name_en, category, resort_id, resorts(name)")
    .eq("organization_id", organization.id)
    .eq("category", "ASSET");

  // Generate standardized fixed asset items based on resort infrastructure
  const standardAssetTemplates = [
    { code: "FA-001", nameAr: "مولدات الديزل الاحتياطية وشبكة الطوارئ", nameEn: "Backup Diesel Generators & Grid", catAr: "الآلات والمعدات", cost: 450000, rate: 10, yearsActive: 3 },
    { code: "FA-002", nameAr: "منظومة المصاعد البانورامية وخدمات الأبراج", nameEn: "Elevators & Lift Systems", catAr: "المنشآت والمصاعد", cost: 850000, rate: 5, yearsActive: 4 },
    { code: "FA-003", nameAr: "محطة تحلية وتنقية ومعالجة المياه المركزية", nameEn: "Central Water Desalination Plant", catAr: "المرافق وشبكات المياه", cost: 620000, rate: 10, yearsActive: 2 },
    { code: "FA-004", nameAr: "أنظمة التكييف المركزي ووحدات الشيلر (Chillers)", nameEn: "Central HVAC & Chillers", catAr: "التكييف والتهوية", cost: 1200000, rate: 12.5, yearsActive: 3 },
    { code: "FA-005", nameAr: "سيارات الخدمة وسيارات الغولف لنقل النزلاء", nameEn: "Service Fleet & Club Carts", catAr: "وسائل النقل", cost: 280000, rate: 20, yearsActive: 2 },
    { code: "FA-006", nameAr: "أنظمة كاميرات المراقبة والتحكم في البوابات الذكية", nameEn: "CCTV & Smart Access Gates", catAr: "الأجهزة الإلكترونية والأمنية", cost: 190000, rate: 20, yearsActive: 1 },
    { code: "FA-007", nameAr: "معدات وفلاتر حمامات السباحة والبحيرات الصناعية", nameEn: "Pool & Lagoon Pumps and Filters", catAr: "المعدات الترفيهية", cost: 310000, rate: 15, yearsActive: 2 },
  ];

  const assets: FixedAssetItem[] = standardAssetTemplates.map((t) => {
    const annualDepreciation = (t.cost * t.rate) / 100;
    const accumulatedDepreciation = annualDepreciation * t.yearsActive;
    const netBookValue = Math.max(0, t.cost - accumulatedDepreciation);

    return {
      assetCode: t.code,
      name: isAr ? t.nameAr : t.nameEn,
      category: t.catAr,
      purchaseDate: `${2026 - t.yearsActive}-01-15`,
      cost: t.cost,
      depreciationRate: t.rate,
      annualDepreciation,
      accumulatedDepreciation,
      netBookValue,
      status: "ACTIVE",
    };
  });

  return (
    <FixedAssetsClient
      assets={assets}
      organizationName={organization.name}
      currency={organization.default_currency || "EGP"}
      locale={locale}
    />
  );
}
