import type { Locale } from "@/i18n/routing";
import { AlertCircle, Check, Info, Search } from "lucide-react";
import { Reveal } from "@/components/marketing/reveal";
import { getPricingCopy } from "./pricing-copy";
import { FUTURE_ANCHOR_EGP, ONBOARDING_EGP, formatEgp } from "./pricing-data";
import { DraftingGrid, Num, SectionEyebrow } from "./pricing-primitives";

/* ── Why a single plan ─────────────────────────────────────────────────── */

export function WhyFoundingSection({ locale }: { locale: Locale }) {
  const copy = getPricingCopy(locale);

  return (
    <section className="border-b border-slate-200/80 bg-white">
      <div className="mx-auto max-w-7xl px-6 py-16 lg:py-24">
        <Reveal className="max-w-3xl">
          <SectionEyebrow>{copy.why.eyebrow}</SectionEyebrow>
          <h2 className="mt-5 text-3xl font-black text-slate-950 font-heading sm:text-4xl">
            {copy.why.headline}
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed font-medium text-slate-600 sm:text-base">
            {copy.why.support}
          </p>
        </Reveal>

        <div className="mt-12 grid grid-cols-1 gap-5 md:grid-cols-3">
          {copy.why.blocks.map((block, i) => (
            <Reveal key={block.title} delayMs={i * 70}>
              <div className="h-full rounded-2xl border border-slate-200/90 bg-[#FAFAFA] p-6 sm:p-7">
                <span className="font-mono text-[11px] font-bold text-slate-400">
                  <Num>{`0${i + 1}`}</Num>
                </span>
                <p className="mt-3 text-xs font-bold tracking-wide text-slate-500 uppercase">
                  {block.title}
                </p>
                <p className="font-heading mt-2 text-xl font-black text-[#07425d] sm:text-[1.4rem]">
                  {block.value}
                </p>
                <p className="mt-3 border-t border-slate-200 pt-3 text-[13px] leading-relaxed font-medium text-slate-600">
                  {block.body}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── Onboarding ────────────────────────────────────────────────────────── */

export function OnboardingSection({ locale }: { locale: Locale }) {
  const copy = getPricingCopy(locale);

  return (
    <section className="border-b border-slate-200/80 bg-[#F8F9FA]">
      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-10 px-6 py-16 lg:grid-cols-12 lg:gap-14 lg:py-24">
        <div className="lg:col-span-5">
          <Reveal>
            <SectionEyebrow>{copy.onboarding.eyebrow}</SectionEyebrow>
            <h2 className="mt-5 text-2xl leading-snug font-black text-slate-950 font-heading sm:text-3xl">
              {copy.onboarding.headline}
            </h2>
            <p className="mt-4 text-[15px] leading-relaxed font-medium text-slate-600">
              {copy.onboarding.support}
            </p>

            <div className="mt-7 rounded-2xl border border-slate-300/80 bg-white p-6 shadow-sm">
              <p className="flex flex-wrap items-baseline gap-x-2">
                <Num className="text-4xl leading-none font-black text-slate-950">
                  {formatEgp(ONBOARDING_EGP, locale)}
                </Num>
                <span className="text-base font-bold text-slate-600">{copy.plan.currency}</span>
                <span className="text-[13px] font-bold text-slate-500">
                  {copy.onboarding.priceLabel}
                </span>
              </p>
              <p className="mt-3 border-t border-slate-200 pt-3 text-[13px] font-bold text-slate-700">
                {copy.onboarding.planLabel}
              </p>
              <p className="mt-3 flex items-start gap-2 rounded-xl border border-[#07425d]/15 bg-[#07425d]/[0.04] px-3.5 py-2.5 text-xs font-bold text-[#07425d]">
                <AlertCircle className="mt-px size-3.5 shrink-0" aria-hidden="true" />
                <span>{copy.onboarding.requiredNote}</span>
              </p>
            </div>
          </Reveal>
        </div>

        <div className="lg:col-span-7">
          <Reveal delayMs={80}>
            <div className="rounded-2xl border border-slate-200/90 bg-white p-6 sm:p-8">
              <p className="font-heading text-sm font-black text-slate-950">
                {copy.onboarding.itemsTitle}
              </p>
              <ul className="mt-4">
                {copy.onboarding.items.map((item) => (
                  <li
                    key={item.en}
                    className="flex items-start gap-3 border-t border-slate-200/80 py-3.5 first:border-t-0 first:pt-0"
                  >
                    <Check className="mt-0.5 size-4 shrink-0 text-[#1b60b9]" aria-hidden="true" />
                    <span className="text-[13px] leading-relaxed font-bold text-slate-800 sm:text-sm">
                      {locale === "ar" ? item.ar : item.en}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-5 flex items-start gap-2 border-t border-slate-200 pt-5 text-[13px] leading-relaxed font-medium text-slate-600">
                <Info className="mt-0.5 size-4 shrink-0 text-slate-400" aria-hidden="true" />
                <span>{copy.onboarding.scopeNote}</span>
              </p>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

/* ── Complex data migration ────────────────────────────────────────────── */

export function MigrationSection({ locale }: { locale: Locale }) {
  const copy = getPricingCopy(locale);

  return (
    <section className="border-b border-slate-200/80 bg-white">
      <div className="mx-auto max-w-7xl px-6 py-16 lg:py-24">
        <Reveal>
          <div className="rounded-3xl border border-slate-300/80 bg-[#FAFAFA] p-6 sm:p-10 lg:p-12">
            <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:gap-14">
              <div className="lg:col-span-5">
                <SectionEyebrow>{copy.migration.eyebrow}</SectionEyebrow>
                <h2 className="mt-5 text-2xl leading-snug font-black text-slate-950 font-heading sm:text-3xl">
                  {copy.migration.headline}
                </h2>
                <p className="mt-4 text-[15px] leading-relaxed font-medium text-slate-600">
                  {copy.migration.support}
                </p>

                <p className="mt-7 inline-flex items-center gap-2.5 rounded-2xl border border-slate-300 bg-white px-5 py-4 font-heading text-lg font-black text-[#07425d] sm:text-xl">
                  <Search className="size-5 shrink-0" aria-hidden="true" />
                  <span>{copy.migration.price}</span>
                </p>
              </div>

              <div className="lg:col-span-7">
                <p className="font-heading text-sm font-black text-slate-950">
                  {copy.migration.scopeTitle}
                </p>
                <ul className="mt-4 grid grid-cols-1 gap-x-8 sm:grid-cols-2">
                  {copy.migration.items.map((item) => (
                    <li
                      key={item.en}
                      className="flex items-start gap-3 border-b border-slate-200/80 py-3"
                    >
                      <span
                        className="mt-2 size-1.5 shrink-0 rounded-full bg-[#07425d]/50"
                        aria-hidden="true"
                      />
                      <span className="text-[13px] leading-relaxed font-bold text-slate-800">
                        {locale === "ar" ? item.ar : item.en}
                      </span>
                    </li>
                  ))}
                </ul>

                <p className="mt-6 flex items-start gap-2.5 rounded-xl border border-[#07425d]/15 bg-[#07425d]/[0.04] px-4 py-3.5 text-[13px] leading-relaxed font-bold text-[#07425d]">
                  <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  <span>{copy.migration.scopeNote}</span>
                </p>

                <p className="mt-4 text-[13px] leading-relaxed font-medium text-slate-600">
                  {copy.migration.trustNote}
                </p>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ── Commercial anchor: after the Founding Program ─────────────────────── */

export function AfterFoundingSection({ locale }: { locale: Locale }) {
  const copy = getPricingCopy(locale);

  return (
    <section className="relative overflow-hidden border-b border-slate-200/80 bg-[#F8F9FA]">
      <DraftingGrid className="opacity-50" />

      <div className="relative mx-auto max-w-3xl px-6 py-16 text-center lg:py-24">
        <Reveal>
          <SectionEyebrow>{copy.after.eyebrow}</SectionEyebrow>
          <h2 className="mt-5 text-2xl font-black text-slate-950 font-heading sm:text-3xl">
            {copy.after.headline}
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed font-medium text-slate-600 sm:text-base">
            {copy.after.body}
          </p>

          <div className="mt-9 rounded-2xl border border-slate-300/80 bg-white px-6 py-7 shadow-sm sm:px-10">
            <p className="text-[13px] font-bold text-slate-500">{copy.after.anchorLabel}</p>
            <p className="mt-3 flex flex-wrap items-baseline justify-center gap-x-2">
              <Num className="text-4xl leading-none font-black text-slate-950 sm:text-5xl">
                {formatEgp(FUTURE_ANCHOR_EGP, locale)}
              </Num>
              <span className="text-base font-bold text-slate-600">{copy.plan.currency}</span>
              <span className="text-[13px] font-bold text-slate-500">
                {copy.after.anchorPeriod}
              </span>
            </p>
          </div>

          <p className="mx-auto mt-6 max-w-xl text-[13px] leading-relaxed font-medium text-slate-600">
            {copy.after.support}
          </p>
        </Reveal>
      </div>
    </section>
  );
}
