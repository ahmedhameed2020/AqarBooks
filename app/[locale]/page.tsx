import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { MarketingNav } from "./marketing-nav";
import { DashboardPreview } from "./dashboard-preview";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const isAr = locale === "ar";
  const title = isAr
    ? "RESORTOS — الإدارة المالية والتشغيلية لمنتجعك"
    : "RESORTOS — Run Your Resort Finances";
  const description = isAr
    ? "نظام مالي وتشغيلي متكامل للقرى والمنتجعات السياحية: الحسابات، الوحدات، المديونيات، التحصيلات، الخزينة، البنوك، والتقارير في منصة واحدة آمنة."
    : "A financial and operational platform for resorts and gated communities, unifying accounting, units, receivables, collections, treasury, banking, and reporting.";

  return {
    title,
    description,
    openGraph: { title, description, locale: isAr ? "ar_EG" : "en_US", type: "website" },
    twitter: { card: "summary_large_image", title, description },
    alternates: {
      languages: { ar: "/ar", en: "/en" },
    },
  };
}

const FEATURES = [
  {
    key: "accounting",
    icon: "📒",
    titleAr: "محرك محاسبة بقيد مزدوج حقيقي",
    titleEn: "A real double-entry accounting engine",
    descAr: "دليل حسابات هرمي، سنوات وفترات مالية، ترحيل معاملات atomic، وعكس القيود بدل التعديل المباشر.",
    descEn: "Hierarchical chart of accounts, fiscal years and periods, atomic posting, and reversal-based corrections instead of direct edits.",
  },
  {
    key: "property",
    icon: "🏘️",
    titleAr: "الوحدات والأعضاء والمديونيات",
    titleEn: "Units, members, and receivables",
    descAr: "ربط ملكية متعدد للوحدة الواحدة، إصدار مستحقات، وتحصيل بتخصيص جزئي أو متعدد المستحقات.",
    descEn: "Multi-owner unit linking, due issuance, and collection with partial or multi-due allocation.",
  },
  {
    key: "treasury",
    icon: "💵",
    titleAr: "الخزينة والكاشير",
    titleEn: "Treasury and cashier",
    descAr: "جلسات كاشير بصندوق واحد مفتوح في المرة، وتسوية فرق الإقفال بدل تجاهله.",
    descEn: "One open cashier session per cashbox at a time, with closing variance recorded, not discarded.",
  },
  {
    key: "banking",
    icon: "🏦",
    titleAr: "البنوك والشيكات",
    titleEn: "Banks and cheques",
    descAr: "دورة حياة شيك كاملة وموثّقة من الاستلام للتحصيل، وكل انتقال حالة مُدقَّق.",
    descEn: "A fully audited cheque lifecycle from receipt to clearing — every status change is logged.",
  },
  {
    key: "purchasing",
    icon: "🧾",
    titleAr: "الموردون والمصروفات",
    titleEn: "Suppliers and expenses",
    descAr: "طلب شراء يحتاج موافقة صريحة قبل أي التزام، وفواتير موردين بترحيل محاسبي مباشر.",
    descEn: "Purchase requests require explicit approval before any commitment; supplier invoices post directly to the ledger.",
  },
  {
    key: "reports",
    icon: "📊",
    titleAr: "تقارير مالية مشتقة من الداتابيز",
    titleEn: "Reports derived from the database",
    descAr: "ميزان مراجعة، قائمة دخل، ميزانية عمومية، وأعمار ديون — كلها محسوبة من القيود الفعلية.",
    descEn: "Trial balance, income statement, balance sheet, and aging — all computed from actual posted entries.",
  },
] as const;

const SECURITY_POINTS = [
  {
    titleAr: "عزل كامل بين المستأجرين",
    titleEn: "Full tenant isolation",
    descAr: "كل جدول بحساسية بيانات مفعّل عليه Row-Level Security بشكل افتراضي رافض (default-deny).",
    descEn: "Every sensitive table has Row-Level Security enabled with a default-deny policy.",
  },
  {
    titleAr: "لا تعديل على المعاملات المرحّلة",
    titleEn: "Posted transactions cannot be edited",
    descAr: "القيود والمدفوعات المرحّلة لا تملك أي صلاحية تعديل مباشرة — التصحيح يتم بالعكس فقط.",
    descEn: "Posted journal entries and payments have no direct write policy at all — corrections happen only via reversal.",
  },
  {
    titleAr: "كل إجراء حساس مُدقَّق",
    titleEn: "Every sensitive action is audited",
    descAr: "إنشاء المنظمات، الترحيل، التحصيل، وتغييرات الصلاحيات كلها مسجّلة بمن قام بها ومتى ولماذا.",
    descEn: "Organization creation, posting, collection, and permission changes are all logged with who, when, and why.",
  },
] as const;

const PLANS = [
  {
    key: "STARTER",
    nameAr: "الأساسية",
    nameEn: "Starter",
    descAr: "لمنتجع واحد يبدأ رحلته الرقمية.",
    descEn: "For a single resort starting its digital journey.",
    featuresAr: ["منتجع واحد", "حتى 5 مستخدمين", "المحاسبة والكاشير"],
    featuresEn: ["1 resort", "Up to 5 users", "Accounting & cashier"],
    highlighted: false,
  },
  {
    key: "PROFESSIONAL",
    nameAr: "الاحترافية",
    nameEn: "Professional",
    descAr: "لمجموعات المنتجعات متوسطة الحجم.",
    descEn: "For growing multi-resort groups.",
    featuresAr: ["حتى 3 منتجعات", "حتى 25 مستخدمًا", "البنوك والأصول والمخزون"],
    featuresEn: ["Up to 3 resorts", "Up to 25 users", "Banking, assets & inventory"],
    highlighted: true,
  },
  {
    key: "ENTERPRISE",
    nameAr: "المؤسسية",
    nameEn: "Enterprise",
    descAr: "لمجموعات المنتجعات الكبيرة والعلامة الخاصة.",
    descEn: "For large resort groups and white-label needs.",
    featuresAr: ["منتجعات ومستخدمون غير محدودين", "علامة تجارية خاصة", "وصول API"],
    featuresEn: ["Unlimited resorts & users", "White-label branding", "API access"],
    highlighted: false,
  },
] as const;

const FAQ = [
  {
    qAr: "هل النظام يدعم العربية والإنجليزية بشكل كامل؟",
    qEn: "Does the platform fully support Arabic and English?",
    aAr: "نعم، الواجهة كاملة RTL بالعربية و LTR بالإنجليزية، بما في ذلك التقارير المالية والتواريخ والعملات.",
    aEn: "Yes — the entire interface is true RTL in Arabic and LTR in English, including financial reports, dates, and currency formatting.",
  },
  {
    qAr: "هل يمكن لكل منتجع أن يكون له حسابات منفصلة؟",
    qEn: "Can each resort have its own separate books?",
    aAr: "نعم، المنظمة الواحدة يمكن أن تدير عدة منتجعات، وكل منتجع له وحداته وسجلاته الخاصة داخل نفس الحساب.",
    aEn: "Yes — one organization can manage multiple resorts, each with its own units and records within the same account.",
  },
  {
    qAr: "هل بياناتنا معزولة عن باقي العملاء؟",
    qEn: "Is our data isolated from other customers?",
    aAr: "نعم، بشكل صارم عبر Row-Level Security على مستوى قاعدة البيانات، وليس فقط على مستوى الواجهة.",
    aEn: "Yes, strictly — enforced with Row-Level Security at the database level, not just hidden in the UI.",
  },
  {
    qAr: "هل يمكن تخصيص دليل الحسابات؟",
    qEn: "Can the chart of accounts be customized?",
    aAr: "نقدّم قالب حسابات مبدئي اختياري لمنتجعات، وأنت حر تمامًا في تعديله أو البناء من الصفر.",
    aEn: "We offer an optional starter chart-of-accounts template for resorts, and you're free to customize it or start from scratch.",
  },
] as const;

export default async function LandingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const isAr = locale === "ar";

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "RESORTOS",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    description: isAr
      ? "نظام مالي وتشغيلي متكامل للقرى والمنتجعات السياحية."
      : "A financial and operational platform for resorts and gated communities.",
  };

  return (
    <div className="marketing flex min-h-full flex-1 flex-col">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <MarketingNav locale={locale as Locale} />

      {/* Hero */}
      <section className="marketing-grid relative overflow-hidden border-b border-[var(--mk-border)] px-6 pt-20 pb-24 text-center">
        <div className="mx-auto max-w-3xl">
          <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-[var(--mk-border-strong)] px-3 py-1 text-xs text-[var(--mk-text-muted)]">
            <span className="size-1.5 rounded-full bg-[var(--mk-accent)]" />
            {isAr ? "منصة SaaS متعددة المستأجرين" : "Multi-tenant SaaS platform"}
          </p>
          <h1 className="text-balance text-4xl font-semibold tracking-tight text-[var(--mk-pearl)] sm:text-5xl">
            {isAr ? (
              <>
                الإدارة المالية والتشغيلية لمنتجعك.
                <br />
                منصة واحدة. حسابات دقيقة. رؤية أوضح.
              </>
            ) : (
              <>
                Run Your Resort Finances.
                <br />
                One Platform. Accurate Accounts. Clearer Decisions.
              </>
            )}
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-balance text-base text-[var(--mk-text-muted)] sm:text-lg">
            {isAr
              ? "RESORTOS هو نظام مالي وتشغيلي متكامل للقرى والمنتجعات السياحية، يجمع الحسابات والوحدات والمديونيات والتحصيلات والخزينة والبنوك والتقارير في منصة واحدة آمنة."
              : "RESORTOS is a financial and operational platform for resorts and gated communities, unifying accounting, units, receivables, collections, treasury, banking, and reporting."}
          </p>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/demo"
              locale={locale as Locale}
              className="rounded-md bg-[var(--mk-accent)] px-6 py-3 text-sm font-medium text-[var(--mk-bg)] transition-transform hover:-translate-y-0.5"
            >
              {isAr ? "طلب عرض توضيحي" : "Request a Demo"}
            </Link>
            <a
              href="#platform"
              className="rounded-md border border-[var(--mk-border-strong)] px-6 py-3 text-sm font-medium text-[var(--mk-text)] transition-colors hover:bg-[var(--mk-surface)]"
            >
              {isAr ? "استكشف المنصة" : "Explore the Platform"}
            </a>
          </div>
        </div>

        <div className="mx-auto mt-16 max-w-4xl">
          <DashboardPreview isAr={isAr} />
        </div>
      </section>

      {/* Trust indicators */}
      <section className="border-b border-[var(--mk-border)] px-6 py-8">
        <div className="mx-auto grid max-w-5xl grid-cols-2 gap-6 text-center sm:grid-cols-4">
          {[
            { labelAr: "عربي/إنجليزي بالكامل", labelEn: "Fully Arabic/English" },
            { labelAr: "معزول لكل مستأجر (RLS)", labelEn: "Per-tenant isolated (RLS)" },
            { labelAr: "قيد مزدوج حقيقي", labelEn: "Real double-entry" },
            { labelAr: "سجل تدقيق كامل", labelEn: "Full audit trail" },
          ].map((item) => (
            <p key={item.labelEn} className="text-xs font-medium text-[var(--mk-text-muted)] sm:text-sm">
              {isAr ? item.labelAr : item.labelEn}
            </p>
          ))}
        </div>
      </section>

      {/* Problem */}
      <section className="border-b border-[var(--mk-border)] px-6 py-20">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-2xl font-semibold text-[var(--mk-pearl)] sm:text-3xl">
            {isAr ? "الأنظمة المتفرّقة بتكلّفك أكتر مما تتخيّل" : "Fragmented systems cost more than you think"}
          </h2>
          <p className="mt-4 text-[var(--mk-text-muted)]">
            {isAr
              ? "شيت إكسل للحسابات، دفتر ورقي للمتأخرات، وواتساب للتحصيل — كل ده بيسيب فجوات في الدقة والمتابعة. RESORTOS بيجمعهم في نظام واحد مترابط."
              : "A spreadsheet for accounting, a paper ledger for arrears, WhatsApp for collections — every gap between them is a gap in accuracy and follow-up. RESORTOS unifies them into one connected system."}
          </p>
        </div>
      </section>

      {/* Platform overview / feature grid */}
      <section id="platform" className="border-b border-[var(--mk-border)] px-6 py-20">
        <div className="mx-auto max-w-5xl">
          <div className="mb-12 text-center">
            <h2 className="text-2xl font-semibold text-[var(--mk-pearl)] sm:text-3xl">
              {isAr ? "كل ما يحتاجه منتجعك، في مكان واحد" : "Everything your resort needs, in one place"}
            </h2>
          </div>
          <div className="grid gap-px overflow-hidden rounded-xl border border-[var(--mk-border)] bg-[var(--mk-border)] sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.key} id={f.key} className="bg-[var(--mk-bg-elevated)] p-6">
                <span className="text-2xl">{f.icon}</span>
                <h3 className="mt-4 text-sm font-semibold text-[var(--mk-text)]">
                  {isAr ? f.titleAr : f.titleEn}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-[var(--mk-text-muted)]">
                  {isAr ? f.descAr : f.descEn}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Accounting engine deep dive */}
      <section id="accounting" className="border-b border-[var(--mk-border)] px-6 py-20">
        <div className="mx-auto grid max-w-5xl items-center gap-10 lg:grid-cols-2">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--mk-accent)]">
              {isAr ? "المحرك المحاسبي" : "Accounting Engine"}
            </p>
            <h2 className="mt-3 text-2xl font-semibold text-[var(--mk-pearl)] sm:text-3xl">
              {isAr ? "قيد مزدوج، مُرحَّل بشكل atomic، وغير قابل للتعديل" : "Double-entry, posted atomically, never silently edited"}
            </h2>
            <ul className="mt-6 space-y-4">
              {[
                { ar: "لا يُقبل قيد غير متوازن أو بسطر واحد عند الترحيل.", en: "An unbalanced or single-line entry can never post." },
                { ar: "لا ترحيل على حساب تجميعي أو فترة مالية مقفولة.", en: "No posting to a group account or a closed fiscal period." },
                { ar: "الأرقام مضمونة عدم التكرار حتى مع إعادة المحاولة (idempotency).", en: "Numbering stays unique even under retry, via idempotency keys." },
                { ar: "التصحيح دائمًا بعكس القيد، أبدًا بحذفه أو تعديله.", en: "Corrections are always a reversal — never a delete or a silent edit." },
              ].map((item) => (
                <li key={item.en} className="flex items-start gap-3 text-sm text-[var(--mk-text-muted)]">
                  <span className="mt-0.5 text-[var(--mk-accent)]">✓</span>
                  <span>{isAr ? item.ar : item.en}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-xl border border-[var(--mk-border-strong)] bg-[var(--mk-bg-elevated)] p-6 font-mono text-xs leading-relaxed text-[var(--mk-text-muted)]">
            <p className="text-[var(--mk-accent)]">-- {isAr ? "قيد تحصيل مستحق" : "due collection entry"}</p>
            <p className="mt-2">Dr  1110 {isAr ? "الصندوق" : "Cash on Hand"}      1,200.00</p>
            <p>Cr  1130 {isAr ? "ذمم الأعضاء" : "AR — Members"}   1,200.00</p>
            <p className="mt-3 text-[var(--mk-gold)]">status: POSTED · entry #1042</p>
          </div>
        </div>
      </section>

      {/* Security */}
      <section id="security" className="border-b border-[var(--mk-border)] px-6 py-20">
        <div className="mx-auto max-w-5xl">
          <div className="mb-12 text-center">
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--mk-accent)]">
              {isAr ? "الأمان" : "Security"}
            </p>
            <h2 className="mt-3 text-2xl font-semibold text-[var(--mk-pearl)] sm:text-3xl">
              {isAr ? "معمارية متعددة المستأجرين، بُنيت للأمان أولًا" : "Multi-tenant architecture, security-first"}
            </h2>
          </div>
          <div className="grid gap-6 sm:grid-cols-3">
            {SECURITY_POINTS.map((p) => (
              <div key={p.titleEn} className="rounded-lg border border-[var(--mk-border)] p-6">
                <h3 className="text-sm font-semibold text-[var(--mk-text)]">{isAr ? p.titleAr : p.titleEn}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[var(--mk-text-muted)]">
                  {isAr ? p.descAr : p.descEn}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* White-label branding */}
      <section className="border-b border-[var(--mk-border)] px-6 py-20">
        <div className="mx-auto flex max-w-4xl flex-col items-center gap-6 text-center">
          <h2 className="text-2xl font-semibold text-[var(--mk-pearl)] sm:text-3xl">
            {isAr ? "علامتك التجارية، مش علامتنا" : "Your brand, not ours"}
          </h2>
          <p className="max-w-xl text-[var(--mk-text-muted)]">
            {isAr
              ? "الشعار، الألوان، وترويسة التقارير والإيصالات — كلها قابلة للتخصيص للمنظمات المؤهلة، من غير المساس بإمكانية الوصول."
              : "Logo, colors, and report/receipt branding are customizable for entitled organizations — without compromising accessibility."}
          </p>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="border-b border-[var(--mk-border)] px-6 py-20">
        <div className="mx-auto max-w-5xl">
          <div className="mb-12 text-center">
            <h2 className="text-2xl font-semibold text-[var(--mk-pearl)] sm:text-3xl">
              {isAr ? "باقة تناسب حجم منتجعك" : "A plan that fits your resort's size"}
            </h2>
            <p className="mt-3 text-sm text-[var(--mk-text-muted)]">
              {isAr ? "تواصل معنا للحصول على تسعير مخصص." : "Contact us for tailored pricing."}
            </p>
          </div>
          <div className="grid gap-6 sm:grid-cols-3">
            {PLANS.map((plan) => (
              <div
                key={plan.key}
                className={`rounded-xl border p-6 ${
                  plan.highlighted
                    ? "border-[var(--mk-accent)] bg-[var(--mk-bg-elevated)]"
                    : "border-[var(--mk-border)]"
                }`}
              >
                <h3 className="text-sm font-semibold text-[var(--mk-text)]">{isAr ? plan.nameAr : plan.nameEn}</h3>
                <p className="mt-1 text-sm text-[var(--mk-text-muted)]">{isAr ? plan.descAr : plan.descEn}</p>
                <ul className="mt-5 space-y-2.5">
                  {(isAr ? plan.featuresAr : plan.featuresEn).map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-[var(--mk-text-muted)]">
                      <span className="mt-0.5 text-[var(--mk-accent)]">✓</span>
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="border-b border-[var(--mk-border)] px-6 py-20">
        <div className="mx-auto max-w-2xl">
          <h2 className="mb-10 text-center text-2xl font-semibold text-[var(--mk-pearl)] sm:text-3xl">
            {isAr ? "الأسئلة الشائعة" : "Frequently Asked Questions"}
          </h2>
          <div className="space-y-3">
            {FAQ.map((item) => (
              <details
                key={item.qEn}
                className="group rounded-lg border border-[var(--mk-border)] px-5 py-4 open:bg-[var(--mk-bg-elevated)]"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-medium text-[var(--mk-text)]">
                  {isAr ? item.qAr : item.qEn}
                  <span className="ms-4 text-[var(--mk-text-muted)] transition-transform group-open:rotate-45">+</span>
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-[var(--mk-text-muted)]">
                  {isAr ? item.aAr : item.aEn}
                </p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="px-6 py-24 text-center">
        <div className="mx-auto max-w-2xl">
          <h2 className="text-2xl font-semibold text-[var(--mk-pearl)] sm:text-3xl">
            {isAr ? "جاهز تشوف RESORTOS شغّال على منتجعك؟" : "Ready to see RESORTOS running on your resort?"}
          </h2>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/demo"
              locale={locale as Locale}
              className="rounded-md bg-[var(--mk-accent)] px-6 py-3 text-sm font-medium text-[var(--mk-bg)] transition-transform hover:-translate-y-0.5"
            >
              {isAr ? "طلب عرض توضيحي" : "Request a Demo"}
            </Link>
            <Link
              href="/contact"
              locale={locale as Locale}
              className="rounded-md border border-[var(--mk-border-strong)] px-6 py-3 text-sm font-medium text-[var(--mk-text)] transition-colors hover:bg-[var(--mk-surface)]"
            >
              {isAr ? "تواصل معنا" : "Contact Us"}
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[var(--mk-border)] px-6 py-10">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-4 text-xs text-[var(--mk-text-muted)] sm:flex-row">
          <p>© {new Date().getFullYear()} RESORTOS. {isAr ? "جميع الحقوق محفوظة." : "All rights reserved."}</p>
          <div className="flex items-center gap-5">
            <Link href="/contact" locale={locale as Locale} className="hover:text-[var(--mk-text)]">
              {isAr ? "تواصل معنا" : "Contact"}
            </Link>
            <Link href="/demo" locale={locale as Locale} className="hover:text-[var(--mk-text)]">
              {isAr ? "طلب عرض توضيحي" : "Request a Demo"}
            </Link>
            <Link href="/login" locale={locale as Locale} className="hover:text-[var(--mk-text)]">
              {isAr ? "تسجيل الدخول" : "Sign in"}
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
