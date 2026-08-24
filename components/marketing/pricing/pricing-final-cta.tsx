import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { ArrowUpRight, CheckCircle2 } from "lucide-react";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { Reveal } from "@/components/marketing/reveal";
import { getPricingCopy } from "./pricing-copy";
import { DraftingGrid } from "./pricing-primitives";

export function PricingFinalCta({ locale }: { locale: Locale }) {
  const copy = getPricingCopy(locale);

  return (
    <section className="relative overflow-hidden bg-white pt-16 pb-16 lg:pt-24">
      <DraftingGrid className="opacity-60" />

      <div className="relative mx-auto max-w-7xl px-6">
        <Reveal>
          <div className="mx-auto max-w-4xl rounded-3xl border border-slate-300/80 bg-[#FAFAFA] p-8 text-center shadow-sm sm:p-14">
            <h2 className="text-2xl leading-snug font-black text-slate-950 font-heading sm:text-4xl">
              {copy.finalCta.headline}
            </h2>

            <p className="mx-auto mt-4 max-w-xl text-[15px] leading-relaxed font-medium text-slate-600 sm:text-base">
              {copy.finalCta.support}
            </p>

            <div className="mt-8">
              <Link
                href="/demo"
                locale={locale}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#07425d] px-8 py-3.5 text-sm font-bold text-white shadow-md shadow-[#07425d]/20 transition-colors hover:bg-[#053247] focus-visible:ring-3 focus-visible:ring-[#1b60b9]/50 focus-visible:outline-none"
              >
                <span>{copy.finalCta.cta}</span>
                <ArrowUpRight className="size-4" aria-hidden="true" />
              </Link>
            </div>

            <p className="mx-auto mt-4 max-w-md text-[13px] leading-relaxed font-medium text-slate-600">
              {copy.finalCta.microcopy}
            </p>

            <ul className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-3 border-t border-slate-200/70 pt-6 text-xs font-bold text-slate-800">
              {copy.finalCta.trust.map((item) => (
                <li key={item} className="flex items-center gap-1.5">
                  <CheckCircle2 className="size-3.5 text-[#1b60b9]" aria-hidden="true" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </Reveal>

        <MarketingFooter locale={locale} />
      </div>
    </section>
  );
}
