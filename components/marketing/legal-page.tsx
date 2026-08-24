import React from "react";
import { MarketingNav } from "@/app/[locale]/marketing-nav";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { ShieldCheck, FileText, ArrowLeft, ArrowRight } from "lucide-react";

export interface LegalSection {
  id: string;
  heading: string;
  body: React.ReactNode;
}

export function LegalPage({
  locale,
  eyebrow,
  title,
  intro,
  lastUpdated,
  sections,
}: {
  locale: Locale;
  eyebrow: string;
  title: string;
  intro: string;
  lastUpdated: string;
  sections: LegalSection[];
}) {
  const isAr = locale === "ar";

  return (
    <div className="flex min-h-full flex-1 flex-col bg-white text-slate-900 selection:bg-[#07425d]/20 selection:text-[#07425d]">
      <MarketingNav locale={locale} />

      <main className="mx-auto w-full max-w-6xl px-6 py-14 lg:py-20">
        <header className="max-w-3xl border-b border-slate-200 pb-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#07425d]/20 bg-[#07425d]/5 px-3 py-1 text-xs font-bold text-[#07425d] mb-4">
            <ShieldCheck className="size-3.5" />
            <span>{eyebrow}</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-slate-950 font-heading">
            {title}
          </h1>
          <p className="mt-4 text-[15px] leading-relaxed text-slate-600 font-medium">{intro}</p>
          <p className="mt-4 text-xs text-slate-400 font-medium">
            {isAr ? "آخر تحديث رسمي: " : "Last updated: "}
            <span className="font-mono text-slate-600 font-bold">{lastUpdated}</span>
          </p>
        </header>

        <div className="mt-12 flex flex-col gap-12 lg:flex-row lg:gap-16">
          {/* Table of Contents sidebar */}
          <nav
            aria-label={isAr ? "محتويات المستند" : "Document contents"}
            className="lg:sticky lg:top-24 lg:h-fit lg:w-64 lg:shrink-0 rounded-2xl border border-slate-200/90 bg-[#F8F9FA] p-5"
          >
            <p className="mb-3 text-xs font-bold text-slate-900 font-heading">
              {isAr ? "فهرس البنود" : "Document Index"}
            </p>
            <ul className="space-y-1.5 text-xs">
              {sections.map((s, idx) => (
                <li key={s.id}>
                  <a
                    href={`#${s.id}`}
                    className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 font-bold text-slate-600 transition-colors hover:bg-white hover:text-[#07425d]"
                  >
                    <span className="font-mono text-[10px] text-slate-400">0{idx + 1}</span>
                    <span className="line-clamp-1">{s.heading}</span>
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          {/* Body Sections */}
          <article className="min-w-0 flex-1 space-y-12">
            {sections.map((s, idx) => (
              <section
                key={s.id}
                id={s.id}
                className="scroll-mt-24 rounded-2xl border border-slate-200/80 bg-[#FAFAFA] p-6 sm:p-8"
              >
                <div className="flex items-center gap-2 pb-3 border-b border-slate-200">
                  <span className="font-mono text-xs font-bold text-[#07425d] size-6 rounded-lg bg-[#07425d]/10 flex items-center justify-center">
                    0{idx + 1}
                  </span>
                  <h2 className="text-lg font-black text-slate-950 font-heading">
                    {s.heading}
                  </h2>
                </div>
                <div className="prose prose-slate mt-4 max-w-none text-xs sm:text-sm leading-relaxed text-slate-700 font-medium">
                  {s.body}
                </div>
              </section>
            ))}
          </article>
        </div>
      </main>
    </div>
  );
}
