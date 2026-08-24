import type { Locale } from "@/i18n/routing";
import { ChevronDown } from "lucide-react";
import { Reveal } from "@/components/marketing/reveal";
import { getPricingCopy } from "./pricing-copy";
import { SectionEyebrow } from "./pricing-primitives";

/* Native <details>/<summary> rather than a bespoke accordion: it is keyboard
   operable, exposed to assistive tech and correctly toggled without any
   client JavaScript, which keeps this route fully server-rendered. The
   default disclosure triangle is suppressed in favour of a chevron that
   mirrors correctly under RTL because it rotates rather than points sideways. */

export function PricingFaqSection({ locale }: { locale: Locale }) {
  const copy = getPricingCopy(locale);
  const isAr = locale === "ar";

  return (
    <section id="faq" className="scroll-mt-24 border-b border-slate-200/80 bg-white">
      <div className="mx-auto max-w-3xl px-6 py-16 lg:py-24">
        <Reveal className="text-center">
          <SectionEyebrow>{copy.faq.eyebrow}</SectionEyebrow>
          <h2 className="mt-5 text-2xl font-black text-slate-950 font-heading sm:text-3xl">
            {copy.faq.headline}
          </h2>
        </Reveal>

        <Reveal delayMs={80} className="mt-10">
          <div className="divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200/90 bg-[#FAFAFA]">
            {copy.faq.items.map((item) => (
              <details key={item.q.en} className="group">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-start text-[14px] font-bold text-slate-900 transition-colors hover:bg-white focus-visible:bg-white focus-visible:ring-3 focus-visible:ring-[#1b60b9]/40 focus-visible:outline-none sm:px-6 sm:py-5 sm:text-[15px] [&::-webkit-details-marker]:hidden">
                  <span>{isAr ? item.q.ar : item.q.en}</span>
                  <ChevronDown
                    className="size-4 shrink-0 text-slate-400 transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none"
                    aria-hidden="true"
                  />
                </summary>

                <div className="animate-in fade-in slide-in-from-top-1 space-y-3 border-t border-slate-200/70 bg-white px-5 pt-4 pb-5 duration-200 motion-reduce:animate-none sm:px-6 sm:pb-6">
                  {(isAr ? item.a.ar : item.a.en).map((paragraph) => (
                    <p
                      key={paragraph}
                      className="text-[13px] leading-relaxed font-medium text-slate-600 sm:text-sm"
                    >
                      {paragraph}
                    </p>
                  ))}
                </div>
              </details>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
