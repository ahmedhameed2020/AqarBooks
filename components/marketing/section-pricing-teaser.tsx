import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { ArrowUpRight } from "lucide-react";
import {
  ANNUAL_EGP,
  ANNUAL_MONTHLY_EQUIVALENT_EGP,
  MONTHLY_EGP,
  ONBOARDING_EGP,
  UNITS_CAPACITY,
  USERS_CAPACITY,
  formatEgp,
} from "@/components/marketing/pricing/pricing-data";

/* Compact Founding Program teaser for the homepage -- a pointer to /pricing,
   not a second copy of it. Every figure is read from the same constants module
   the pricing page uses, so the homepage cannot drift out of step with it.
   Deliberately absent: the 4,990 commercial anchor, future plan names, the
   feature list, the pricing FAQ, any founding-slot count, and any ETA claim. */

export function SectionPricingTeaser({ locale }: { locale: Locale }) {
  const isAr = locale === "ar";

  const monthly = formatEgp(MONTHLY_EGP, locale);
  const annual = formatEgp(ANNUAL_EGP, locale);
  const annualMonthlyEq = formatEgp(ANNUAL_MONTHLY_EQUIVALENT_EGP, locale);
  const onboarding = formatEgp(ONBOARDING_EGP, locale);
  const units = formatEgp(UNITS_CAPACITY, locale);
  const users = formatEgp(USERS_CAPACITY, locale);

  return (
    <section id="pricing-teaser" className="relative bg-white py-20 border-b border-slate-200/80">
      <div className="mx-auto max-w-7xl px-6">
        <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-12 lg:gap-14">
          {/* Narrative + conversion */}
          <div className="lg:col-span-6">
            <div className="flex items-center gap-2 text-xs font-mono font-bold text-[#07425d]">
              <span className="flex size-5 items-center justify-center rounded-full bg-[#07425d]/10 text-[10px]">
                10
              </span>
              <span>{isAr ? "برنامج المؤسسين" : "FOUNDING PROGRAM"}</span>
            </div>

            <h2 className="mt-3 text-3xl sm:text-4xl font-black text-slate-950 font-heading leading-snug">
              {isAr
                ? "ابدأ AqarBooks بسعر خاص لأول 10 كيانات عقارية"
                : "Start AqarBooks at a launch price reserved for the first 10 real-estate entities"}
            </h2>

            <p className="mt-3.5 text-sm sm:text-base text-slate-600 font-medium leading-relaxed">
              {isAr
                ? `منصة المحاسبة العقارية الكاملة، حتى ${units} وحدة و${users} مستخدمين.`
                : `The complete real-estate accounting platform — up to ${units} units and ${users} system users.`}
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/pricing"
                locale={locale}
                className="inline-flex items-center gap-2 rounded-xl bg-[#07425d] px-6 py-3 text-sm font-bold text-white shadow-md shadow-[#07425d]/20 transition-colors hover:bg-[#053247] focus-visible:ring-3 focus-visible:ring-[#1b60b9]/50 focus-visible:outline-none"
              >
                <span>{isAr ? "شاهد تفاصيل الأسعار" : "See full pricing"}</span>
                <ArrowUpRight className="size-4" aria-hidden="true" />
              </Link>

              <Link
                href="/demo"
                locale={locale}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-6 py-3 text-sm font-bold text-slate-800 transition-colors hover:border-slate-400 hover:bg-slate-50 focus-visible:ring-3 focus-visible:ring-[#1b60b9]/50 focus-visible:outline-none"
              >
                <span>{isAr ? "احجز عرض AqarBooks" : "Book an AqarBooks walkthrough"}</span>
              </Link>
            </div>
          </div>

          {/* Compact price panel */}
          <div className="lg:col-span-6 lg:justify-self-end lg:max-w-md w-full">
            <div className="rounded-2xl border border-slate-300/80 bg-[#FAFAFA] p-6 sm:p-7 shadow-sm">
              <p className="flex flex-wrap items-baseline gap-x-2">
                <span dir="ltr" className="inline-block tabular-nums text-4xl leading-none font-black text-slate-950">
                  {monthly}
                </span>
                <span className="text-base font-bold text-slate-600">
                  {isAr ? "جنيه / شهر" : "EGP / month"}
                </span>
              </p>

              <div className="mt-5 border-t border-slate-200 pt-4">
                <p className="text-[13px] font-bold text-slate-800">
                  {isAr
                    ? `${annual} جنيه سنويًا — يُدفع مقدمًا`
                    : `EGP ${annual} per year — paid upfront`}
                </p>
                <p className="mt-1 text-[13px] font-medium text-slate-600">
                  {isAr
                    ? `ما يعادل ${annualMonthlyEq} جنيه/شهر`
                    : `Equivalent to EGP ${annualMonthlyEq}/month`}
                </p>
              </div>

              <p className="mt-4 border-t border-slate-200 pt-4 text-[13px] font-bold text-slate-800">
                {isAr
                  ? `التهيئة الأساسية: ${onboarding} جنيه مرة واحدة`
                  : `Core onboarding: EGP ${onboarding}, one time`}
              </p>

              <p className="mt-3 text-[13px] leading-relaxed font-medium text-slate-600">
                {isAr
                  ? "ترحيل البيانات المعقدة يُسعّر بعد فحص البيانات."
                  : "Complex data migration is quoted after a data inspection."}
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
