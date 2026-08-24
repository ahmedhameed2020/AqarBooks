import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { LogoMark } from "@/components/marketing/logo-mark";

/* The editorial marketing footer, lifted verbatim out of SectionFinalCta so
   that standalone marketing routes (/pricing) close with the same footer the
   landing page does instead of growing a second, drifting copy. The only
   behavioural change is that the platform-navigation anchors are now rooted
   at "/#..." rather than bare "#...", so they resolve from any route. */

export function MarketingFooter({ locale }: { locale: Locale }) {
  const isAr = locale === "ar";

  const navLinks = [
    { href: "/#story", label: isAr ? "القصة المالية" : "The Transaction Story" },
    { href: "/#engine", label: isAr ? "المحرك المحاسبي" : "Accounting Core" },
    { href: "/#operating-ledger", label: isAr ? "سجل التشغيل" : "Operating Ledger" },
    { href: "/#ai-layer", label: isAr ? "طبقة الذكاء المحاسبي" : "AI Intelligence Layer" },
    { href: "/#entities", label: isAr ? "الهياكل العقارية" : "Entity Structures" },
    { href: "/pricing", label: isAr ? "الأسعار" : "Pricing" },
  ];

  return (
    <footer className="mt-20 pt-10 border-t border-slate-200 grid grid-cols-1 md:grid-cols-12 gap-8 text-xs text-slate-600">
      <div className="md:col-span-5 space-y-3">
        <div className="flex items-center gap-2.5">
          <LogoMark className="size-10.5" />
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <span className="text-base font-black text-slate-950 font-heading">AqarBooks</span>
              <span className="inline-flex rounded-md bg-[#07425d]/10 text-[#07425d] border border-[#07425d]/20 text-[9px] font-black px-1.5 py-0.2">
                ERP
              </span>
            </div>
            <span className="text-[10px] font-bold text-slate-500 -mt-0.5">
              {isAr ? "محاسبة عقارية بذكاء" : "Smart Real Estate Accounting"}
            </span>
          </div>
        </div>
        <p className="text-slate-500 max-w-sm leading-relaxed">
          {isAr
            ? "النظام المحاسبي المتكامل لإدارة العقارات والمنتجعات والكيانات العقارية واتحادات الملاك بقيد مزدوج حقيقي."
            : "Enterprise double-entry accounting ERP built from first principles for real estate entities, resorts, and HOAs."}
        </p>
        <div className="text-[11px] text-slate-400 font-mono">
          © {new Date().getFullYear()} AqarBooks ERP. All rights reserved.
        </div>
      </div>

      <div className="md:col-span-3 space-y-2">
        <span className="font-bold text-slate-900 block">
          {isAr ? "الروابط الرئيسية" : "Platform Navigation"}
        </span>
        <ul className="space-y-1.5 text-slate-600">
          {navLinks.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                locale={locale}
                className="hover:text-[#07425d] transition-colors"
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>

      <div className="md:col-span-4 space-y-2">
        <span className="font-bold text-slate-900 block">
          {isAr ? "الامتثال والتواصل" : "Compliance & Contact"}
        </span>
        <p className="text-slate-500 leading-relaxed text-[11px]">
          {isAr
            ? "مبني على أصول المحاسبة بالقيد المزدوج، مع تهيئة ضريبية ودعم متطلبات الفواتير وفق نطاق النظام."
            : "Built on double-entry accounting principles, with tax configuration and invoicing support within the scope of the system."}
        </p>
        <div className="pt-2 flex flex-col gap-1 text-[11px] font-medium text-slate-600">
          <Link href="/privacy" locale={locale} className="hover:text-[#1A3C2E] transition-colors">
            {isAr ? "سياسة الخصوصية والأمان" : "Privacy & Security Policy"}
          </Link>
          <Link href="/terms" locale={locale} className="hover:text-[#1A3C2E] transition-colors">
            {isAr ? "شروط الاستخدام واتفاقية الخدمة" : "Terms of Service & SLA"}
          </Link>
          <Link href="/contact" locale={locale} className="hover:text-[#1A3C2E] transition-colors">
            {isAr ? "تواصل مع المبيعات والدعم الفني" : "Contact Sales & Enterprise Support"}
          </Link>
        </div>
      </div>
    </footer>
  );
}
