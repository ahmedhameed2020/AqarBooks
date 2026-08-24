import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { ArrowUpRight, Building2, Check, Users } from "lucide-react";
import { Reveal } from "@/components/marketing/reveal";
import { getPricingCopy } from "./pricing-copy";
import {
  ANNUAL_EGP,
  ANNUAL_MONTHLY_EQUIVALENT_EGP,
  ANNUAL_SAVING_EGP,
  MONTHLY_EGP,
  UNITS_CAPACITY,
  USERS_CAPACITY,
  formatEgp,
  getFoundingSlotsRemaining,
} from "./pricing-data";
import { Num, SectionEyebrow } from "./pricing-primitives";

function BillingOption({
  label,
  amount,
  currency,
  period,
  support,
  recommended,
  recommendedLabel,
}: {
  label: string;
  amount: string;
  currency: string;
  period: string;
  support: string;
  recommended?: boolean;
  recommendedLabel?: string;
}) {
  return (
    <div
      className={`relative flex flex-col rounded-2xl p-6 sm:p-7 ${
        recommended
          ? "border-2 border-[#07425d] bg-[#07425d]/[0.035]"
          : "border border-slate-200 bg-white"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="text-xs font-bold tracking-wide text-slate-500 uppercase">{label}</span>
        {recommended && recommendedLabel && (
          <span className="shrink-0 rounded-md bg-[#07425d] px-2.5 py-1 text-[10px] leading-none font-bold text-white">
            {recommendedLabel}
          </span>
        )}
      </div>

      <p className="mt-5 flex flex-wrap items-baseline gap-x-2">
        <Num className="text-4xl leading-none font-black text-slate-950 sm:text-[2.75rem]">
          {amount}
        </Num>
        <span className="text-base font-bold text-slate-600">{currency}</span>
      </p>

      <p className="mt-2.5 text-[13px] font-bold text-slate-700">{period}</p>

      <p className="mt-4 border-t border-slate-200/80 pt-4 text-[13px] leading-relaxed font-medium text-slate-600">
        {support}
      </p>
    </div>
  );
}

export function FoundingPlanSection({ locale }: { locale: Locale }) {
  const copy = getPricingCopy(locale);
  const slotsRemaining = getFoundingSlotsRemaining();

  return (
    <section id="founding-program" className="scroll-mt-24 border-b border-slate-200/80 bg-[#F8F9FA]">
      <div className="mx-auto max-w-7xl px-6 py-16 lg:py-24">
        <Reveal className="mx-auto max-w-2xl text-center">
          <SectionEyebrow>{copy.plan.eyebrow}</SectionEyebrow>
          <h2 className="mt-5 text-3xl font-black text-slate-950 font-heading sm:text-4xl">
            {copy.plan.headline}
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed font-medium text-slate-600 sm:text-base">
            {copy.plan.description}
          </p>

          {/* Renders only when a real, configured founding-slot count exists.
              See getFoundingSlotsRemaining() -- never a hard-coded figure. */}
          {slotsRemaining !== null && (
            <p className="mt-6 inline-flex items-center gap-2 rounded-full border border-[#1b60b9]/25 bg-[#1b60b9]/[0.06] px-4 py-1.5 text-xs font-bold text-[#1b60b9]">
              {copy.plan.slotsBadge(slotsRemaining)}
            </p>
          )}
        </Reveal>

        <Reveal delayMs={80} className="mx-auto mt-12 max-w-4xl">
          <div className="overflow-hidden rounded-3xl border border-slate-300/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_12px_32px_-16px_rgba(7,66,93,0.18)]">
            {/* Plan identity + capacity */}
            <div className="flex flex-col gap-4 border-b border-slate-200 bg-[#FAFAFA] px-6 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-8">
              <div>
                <p className="font-heading text-lg font-black text-slate-950">
                  AqarBooks {copy.plan.planName}
                </p>
                <p className="mt-0.5 text-xs font-bold text-slate-500">{copy.plan.capacityTitle}</p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700">
                  <Building2 className="size-3.5 text-[#07425d]" aria-hidden="true" />
                  {copy.plan.capacityUnits(formatEgp(UNITS_CAPACITY, locale))}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700">
                  <Users className="size-3.5 text-[#07425d]" aria-hidden="true" />
                  {copy.plan.capacityUsers(formatEgp(USERS_CAPACITY, locale))}
                </span>
              </div>
            </div>

            {/* Billing options */}
            <div className="px-6 pt-7 pb-6 sm:px-8 sm:pt-9">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-5">
                <BillingOption
                  label={copy.plan.monthly.label}
                  amount={formatEgp(MONTHLY_EGP, locale)}
                  currency={copy.plan.currency}
                  period={copy.plan.monthly.period}
                  support={copy.plan.monthly.support}
                />
                <BillingOption
                  label={copy.plan.annual.label}
                  amount={formatEgp(ANNUAL_EGP, locale)}
                  currency={copy.plan.currency}
                  period={copy.plan.annual.period}
                  support={copy.plan.annual.support(
                    formatEgp(ANNUAL_MONTHLY_EQUIVALENT_EGP, locale),
                  )}
                  recommended
                  recommendedLabel={copy.plan.annual.recommended}
                />
              </div>

              <p className="mt-5 flex items-start gap-2 rounded-xl border border-[#07425d]/15 bg-[#07425d]/[0.04] px-4 py-3 text-[13px] font-bold text-[#07425d]">
                <Check className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <span>{copy.plan.annual.saving(formatEgp(ANNUAL_SAVING_EGP, locale))}</span>
              </p>
            </div>

            {/* Primary conversion */}
            <div className="border-t border-slate-200 bg-[#FAFAFA] px-6 py-7 text-center sm:px-8">
              <Link
                href="/demo"
                locale={locale}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#07425d] px-8 py-3.5 text-sm font-bold text-white shadow-md shadow-[#07425d]/20 transition-colors hover:bg-[#053247] focus-visible:ring-3 focus-visible:ring-[#1b60b9]/50 focus-visible:outline-none"
              >
                <span>{copy.plan.cta}</span>
                <ArrowUpRight className="size-4" aria-hidden="true" />
              </Link>

              <p className="mx-auto mt-4 max-w-md text-[13px] leading-relaxed font-medium text-slate-600">
                {copy.plan.ctaMicrocopy}
              </p>
              <p className="mt-3 text-xs font-medium text-slate-500">{copy.plan.taxNote}</p>
            </div>
          </div>
        </Reveal>

        {/* What the subscription includes */}
        <Reveal delayMs={120} className="mx-auto mt-16 max-w-4xl lg:mt-20">
          <div className="text-center">
            <SectionEyebrow>{copy.features.eyebrow}</SectionEyebrow>
            <h3 className="mt-5 text-2xl font-black text-slate-950 font-heading sm:text-3xl">
              {copy.features.headline}
            </h3>
          </div>

          <ul className="mt-9 grid grid-cols-1 gap-x-8 gap-y-0 sm:grid-cols-2">
            {copy.features.items.map((item) => (
              <li
                key={item.en}
                className="flex items-start gap-3 border-b border-slate-200/80 py-3.5"
              >
                {item.ai ? (
                  /* AI marker: a small violet diamond, not an icon. It differs
                     from the check rows by SHAPE as well as colour, and the
                     row is labelled "AqarBooks AI" in the text itself, so
                     nothing here is communicated by colour alone. */
                  <span
                    className="mt-0.5 flex size-4 shrink-0 items-center justify-center"
                    aria-hidden="true"
                  >
                    <span className="size-2 rotate-45 bg-[#7e1898]" />
                  </span>
                ) : (
                  <Check className="mt-0.5 size-4 shrink-0 text-[#1b60b9]" aria-hidden="true" />
                )}
                <span
                  className={`text-[13px] leading-relaxed font-bold sm:text-sm ${
                    item.ai ? "text-[#7e1898]" : "text-slate-800"
                  }`}
                >
                  {locale === "ar" ? item.ar : item.en}
                </span>
              </li>
            ))}
          </ul>

          <p className="mt-6 text-center text-[13px] leading-relaxed font-medium text-slate-600">
            {copy.features.aiNote}
          </p>
        </Reveal>
      </div>
    </section>
  );
}
