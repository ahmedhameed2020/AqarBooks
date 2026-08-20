import React from "react";
import { MarketingNav } from "@/app/[locale]/marketing-nav";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";

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
    <div className="marketing flex min-h-full flex-1 flex-col bg-[#060a18] text-slate-100">
      <MarketingNav locale={locale} />

      <main className="mx-auto w-full max-w-6xl px-6 py-16 lg:py-24">
        <header className="max-w-2xl border-b border-white/10 pb-10">
          <span
            className={`block text-[11px] font-semibold text-cyan-400 ${
              isAr ? "tracking-[0.02em]" : "uppercase tracking-[0.12em]"
            }`}
            style={{ fontFamily: isAr ? "var(--font-plex-arabic)" : "var(--font-plex-mono)" }}
          >
            {eyebrow}
          </span>
          <h1 className="mt-3 text-balance text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
            {title}
          </h1>
          <p className="mt-4 text-pretty text-[15px] leading-relaxed text-slate-400">{intro}</p>
          <p className="mt-5 text-xs text-slate-500">
            {isAr ? "آخر تحديث: " : "Last updated: "}
            <span className="font-medium text-slate-400">{lastUpdated}</span>
          </p>
        </header>

        <div className="mt-12 flex flex-col gap-12 lg:flex-row lg:gap-16">
          {/* Contents: a real index, because the document is long enough to need one */}
          <nav
            aria-label={isAr ? "محتويات المستند" : "Document contents"}
            className="lg:sticky lg:top-24 lg:h-fit lg:w-56 lg:shrink-0"
          >
            <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.1em] text-slate-500">
              {isAr ? "المحتويات" : "Contents"}
            </p>
            <ol className="space-y-2">
              {sections.map((section, i) => (
                <li key={section.id} className="flex gap-2.5 text-[13px] leading-snug">
                  <span className="shrink-0 tabular-nums text-slate-600">{i + 1}.</span>
                  <a
                    href={`#${section.id}`}
                    className="text-slate-400 transition-colors hover:text-cyan-300"
                  >
                    {section.heading}
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          <article className="min-w-0 flex-1 space-y-12">
            {sections.map((section, i) => (
              <section key={section.id} id={section.id} className="scroll-mt-24">
                <h2 className="flex gap-3 text-lg font-bold text-white sm:text-xl">
                  <span className="tabular-nums text-blue-500">{i + 1}.</span>
                  <span className="text-balance">{section.heading}</span>
                </h2>
                <div className="mt-4 max-w-[68ch] space-y-4 text-[15px] leading-[1.85] text-slate-300 [&_a]:font-medium [&_a]:text-cyan-400 [&_a:hover]:underline [&_li]:ps-1 [&_strong]:font-bold [&_strong]:text-white [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:ps-5">
                  {section.body}
                </div>
              </section>
            ))}
          </article>
        </div>

        <footer className="mt-20 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-white/10 pt-8 text-sm">
          <Link href="/terms" locale={locale} className="font-bold text-slate-300 hover:text-cyan-300">
            {isAr ? "شروط الخدمة" : "Terms of Service"}
          </Link>
          <Link href="/privacy" locale={locale} className="font-bold text-slate-300 hover:text-cyan-300">
            {isAr ? "سياسة الخصوصية" : "Privacy Policy"}
          </Link>
          <Link href="/contact" locale={locale} className="font-bold text-slate-300 hover:text-cyan-300">
            {isAr ? "تواصل معنا" : "Contact"}
          </Link>
        </footer>
      </main>
    </div>
  );
}
