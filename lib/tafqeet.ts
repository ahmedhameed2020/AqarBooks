// Currency details for Arabic and English spellings
const CURRENCY_INFO: Record<
  string,
  {
    arUnit: string;
    arSubunit: string;
    enUnit: string;
    enSubunit: string;
  }
> = {
  EGP: {
    arUnit: "جنيه مصري",
    arSubunit: "قرش",
    enUnit: "Egyptian Pound",
    enSubunit: "Piastre",
  },
  SAR: {
    arUnit: "ريال سعودي",
    arSubunit: "هللة",
    enUnit: "Saudi Riyal",
    enSubunit: "Halala",
  },
  AED: {
    arUnit: "درهم إماراتي",
    arSubunit: "فلس",
    enUnit: "UAE Dirham",
    enSubunit: "Fils",
  },
  KWD: {
    arUnit: "دينار كويتي",
    arSubunit: "فلس",
    enUnit: "Kuwaiti Dinar",
    enSubunit: "Fils",
  },
  QAR: {
    arUnit: "ريال قطري",
    arSubunit: "درهم",
    enUnit: "Qatari Riyal",
    enSubunit: "Dirham",
  },
  BHD: {
    arUnit: "دينار بحريني",
    arSubunit: "فلس",
    enUnit: "Bahraini Dinar",
    enSubunit: "Fils",
  },
  OMR: {
    arUnit: "ريال عماني",
    arSubunit: "بيسة",
    enUnit: "Omani Rial",
    enSubunit: "Baisa",
  },
  USD: {
    arUnit: "دولار أمريكي",
    arSubunit: "سنت",
    enUnit: "US Dollar",
    enSubunit: "Cent",
  },
  EUR: {
    arUnit: "يورو",
    arSubunit: "سنت",
    enUnit: "Euro",
    enSubunit: "Cent",
  },
};

const AR_ONES = [
  "",
  "واحد",
  "اثنان",
  "ثلاثة",
  "أربعة",
  "خمسة",
  "ستة",
  "سبعة",
  "ثمانية",
  "تسعة",
  "عشرة",
  "أحد عشر",
  "اثنا عشر",
  "ثلاثة عشر",
  "أربعة عشر",
  "خمسة عشر",
  "ستة عشر",
  "سبعة عشر",
  "ثمانية عشر",
  "تسعة عشر",
];

const AR_TENS = [
  "",
  "",
  "عشرون",
  "ثلاثون",
  "أربعون",
  "خمسون",
  "ستون",
  "سبعون",
  "ثمانون",
  "تسعون",
];

const AR_HUNDREDS = [
  "",
  "مائة",
  "مائتان",
  "ثلاثمائة",
  "أربعمائة",
  "خمسمائة",
  "ستمائة",
  "سبعمائة",
  "ثمانمائة",
  "تسعمائة",
];

function arabicGroupToWords(num: number): string {
  if (num === 0) return "";

  const h = Math.floor(num / 100);
  const rem = num % 100;
  const parts: string[] = [];

  if (h > 0) {
    parts.push(AR_HUNDREDS[h]);
  }

  if (rem > 0) {
    if (rem < 20) {
      parts.push(AR_ONES[rem]);
    } else {
      const o = rem % 10;
      const t = Math.floor(rem / 10);
      if (o > 0) {
        parts.push(`${AR_ONES[o]} و${AR_TENS[t]}`);
      } else {
        parts.push(AR_TENS[t]);
      }
    }
  }

  return parts.join(" و");
}

export function tafqeetArabic(num: number, currencyCode = "EGP"): string {
  if (isNaN(num) || num <= 0) return "صفر";

  const currency = CURRENCY_INFO[currencyCode.toUpperCase()] || {
    arUnit: currencyCode,
    arSubunit: "جزء",
    enUnit: currencyCode,
    enSubunit: "Cent",
  };

  const integerPart = Math.floor(num);
  const decimalPart = Math.round((num - integerPart) * 100);

  const billions = Math.floor(integerPart / 1_000_000_000);
  const millions = Math.floor((integerPart % 1_000_000_000) / 1_000_000);
  const thousands = Math.floor((integerPart % 1_000_000) / 1_000);
  const units = integerPart % 1_000;

  const chunks: string[] = [];

  if (billions > 0) {
    if (billions === 1) chunks.push("مليار");
    else if (billions === 2) chunks.push("ملياران");
    else if (billions >= 3 && billions <= 10) chunks.push(`${arabicGroupToWords(billions)} مليارات`);
    else chunks.push(`${arabicGroupToWords(billions)} مليار`);
  }

  if (millions > 0) {
    if (millions === 1) chunks.push("مليون");
    else if (millions === 2) chunks.push("مليونان");
    else if (millions >= 3 && millions <= 10) chunks.push(`${arabicGroupToWords(millions)} ملايين`);
    else chunks.push(`${arabicGroupToWords(millions)} مليون`);
  }

  if (thousands > 0) {
    if (thousands === 1) chunks.push("ألف");
    else if (thousands === 2) chunks.push("ألفان");
    else if (thousands >= 3 && thousands <= 10) chunks.push(`${arabicGroupToWords(thousands)} آلاف`);
    else chunks.push(`${arabicGroupToWords(thousands)} ألف`);
  }

  if (units > 0) {
    chunks.push(arabicGroupToWords(units));
  }

  let result = chunks.length ? chunks.join(" و") : "صفر";
  result += ` ${currency.arUnit}`;

  if (decimalPart > 0) {
    result += ` و${arabicGroupToWords(decimalPart)} ${currency.arSubunit}`;
  }

  return `فقط ${result} لا غير`;
}
