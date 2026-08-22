import type { CurrencyCode } from "./currency";

export interface CountryInfo {
  code: string;
  nameAr: string;
  nameEn: string;
  flag: string;
  defaultCurrency: CurrencyCode;
  taxNoteAr: string;
  taxNoteEn: string;
  orgPlaceholderAr: string;
  orgPlaceholderEn: string;
  projectPlaceholderAr: string;
  projectPlaceholderEn: string;
}

export const SUPPORTED_COUNTRIES: CountryInfo[] = [
  {
    code: "EG",
    nameAr: "مصر",
    nameEn: "Egypt",
    flag: "🇪🇬",
    defaultCurrency: "EGP",
    taxNoteAr: "ضريبة القيمة المضافة 14% · متوافق مع الفاتورة الإلكترونية (ETA)",
    taxNoteEn: "14% VAT · Egyptian Tax Authority (ETA) E-Invoice Ready",
    orgPlaceholderAr: "شركة المعادي للتطوير العقاري",
    orgPlaceholderEn: "Maadi Real Estate Developments",
    projectPlaceholderAr: "كمباوند زهرة المعادي",
    projectPlaceholderEn: "Zahret El Maadi Compound",
  },
  {
    code: "SA",
    nameAr: "المملكة العربية السعودية",
    nameEn: "Saudi Arabia",
    flag: "🇸🇦",
    defaultCurrency: "SAR",
    taxNoteAr: "ضريبة القيمة المضافة 15% · متوافق مع هيئة الزكاة والضريبة والجمارك (ZATCA)",
    taxNoteEn: "15% VAT · ZATCA Phase 2 E-Invoicing Compliant",
    orgPlaceholderAr: "شركة الأفق العقارية القابضة",
    orgPlaceholderEn: "Al Ofoq Real Estate Holdings",
    projectPlaceholderAr: "مجمع النخيل السكني",
    projectPlaceholderEn: "Al Nakheel Residential Complex",
  },
  {
    code: "AE",
    nameAr: "الإمارات العربية المتحدة",
    nameEn: "United Arab Emirates",
    flag: "🇦🇪",
    defaultCurrency: "AED",
    taxNoteAr: "ضريبة القيمة المضافة 5% · متوافق مع الهيئة الاتحادية للضرائب (FTA)",
    taxNoteEn: "5% VAT · Federal Tax Authority (FTA) Compliant",
    orgPlaceholderAr: "مجموعة دبي لإدارة المرافق والعقارات",
    orgPlaceholderEn: "Dubai Properties & Facilities Group",
    projectPlaceholderAr: "برج مارينا الفاخر",
    projectPlaceholderEn: "Marina Luxury Heights",
  },
  {
    code: "KW",
    nameAr: "الكويت",
    nameEn: "Kuwait",
    flag: "🇰🇼",
    defaultCurrency: "KWD",
    taxNoteAr: "متوافق مع المعايير المحاسبية العقارية الكويتية",
    taxNoteEn: "Kuwaiti Real Estate Accounting Standards",
    orgPlaceholderAr: "شركة الديرة للاستثمار العقاري",
    orgPlaceholderEn: "Al Deira Real Estate Investment",
    projectPlaceholderAr: "أبراج السيف السكنية",
    projectPlaceholderEn: "Al Seef Residential Towers",
  },
  {
    code: "QA",
    nameAr: "قطر",
    nameEn: "Qatar",
    flag: "🇶🇦",
    defaultCurrency: "QAR",
    taxNoteAr: "متوافق مع الأنظمة المالية والتطوير العقاري القطري",
    taxNoteEn: "Qatari Real Estate Financial Systems Compliant",
    orgPlaceholderAr: "شركة اللؤلؤة للتطوير وإدارة الأصول",
    orgPlaceholderEn: "The Pearl Development & Asset Management",
    projectPlaceholderAr: "منتجع اللوسيل الساحلي",
    projectPlaceholderEn: "Lusail Coastal Resort",
  },
  {
    code: "BH",
    nameAr: "البحرين",
    nameEn: "Bahrain",
    flag: "🇧🇭",
    defaultCurrency: "BHD",
    taxNoteAr: "ضريبة القيمة المضافة 10% · الجهاز الوطني للإيرادات (NBR)",
    taxNoteEn: "10% VAT · National Bureau for Revenue (NBR)",
    orgPlaceholderAr: "مملكة العقارات وإدارة المرافق",
    orgPlaceholderEn: "Kingdom Realty & Facilities",
    projectPlaceholderAr: "كمباوند خليج البحرين",
    projectPlaceholderEn: "Bahrain Bay Residences",
  },
  {
    code: "OM",
    nameAr: "سلطنة عُمان",
    nameEn: "Oman",
    flag: "🇴🇲",
    defaultCurrency: "OMR",
    taxNoteAr: "ضريبة القيمة المضافة 5% · جهاز الضرائب العُماني",
    taxNoteEn: "5% VAT · Oman Tax Authority Ready",
    orgPlaceholderAr: "شركة مسقط للتنمية العمرانية",
    orgPlaceholderEn: "Muscat Urban Development Co.",
    projectPlaceholderAr: "منتجع الموج الفاخر",
    projectPlaceholderEn: "Al Mouj Luxury Resort",
  },
  {
    code: "GLOBAL",
    nameAr: "دولي / دول أخرى",
    nameEn: "International / Other",
    flag: "🌐",
    defaultCurrency: "USD",
    taxNoteAr: "معايير المحاسبة الدولية (IFRS) مع تخصيص الضرائب والعملة",
    taxNoteEn: "International IFRS Accounting Standards with custom tax rates",
    orgPlaceholderAr: "الشركة الدولية لإدارة الأصول العقارية",
    orgPlaceholderEn: "Global Real Estate Asset Management",
    projectPlaceholderAr: "مشروع الواحة العقاري",
    projectPlaceholderEn: "Oasis Real Estate Project",
  },
];

export function getCountryByCode(code: string): CountryInfo {
  return SUPPORTED_COUNTRIES.find((c) => c.code === code) || SUPPORTED_COUNTRIES[0];
}
