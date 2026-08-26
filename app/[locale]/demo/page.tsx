import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { MarketingNav } from "../marketing-nav";
import { EnterDemoForm } from "./enter-demo-form";
import { DEMO_STORY } from "@/lib/demo/story";
import {
  Building2,
  Eye,
  Landmark,
  Layers3,
  ShieldCheck,
  ArrowUpRight,
} from "lucide-react";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const isAr = locale === "ar";
  return {
    title: isAr
      ? "استكشف النسخة التجريبية | AqarBooks"
      : "Explore the Live Demo | AqarBooks",
    description: isAr
      ? "ادخل بيئة AqarBooks التجريبية ببيانات عقارية ومحاسبية جاهزة: وحدات، استحقاقات، خزينة، مطابقة بنكية، وتقارير مالية."
      : "Step into a fully populated AqarBooks environment: units, receivables, treasury, bank reconciliation and financial statements.",
    // The demo runs the real product screens. Letting a crawler index them
    // would put duplicates of authenticated surfaces into search results and
    // dilute the landing page, which is the acquisition surface. The entry
    // page itself is excluded for the same reason -- it is a door, not a
    // destination; /pricing and / are what should rank.
    robots: { index: false, follow: true },
  };
}

export default async function DemoEntryPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const loc = locale as Locale;
  setRequestLocale(loc);
  const isAr = loc === "ar";

  const scale = [
    {
      icon: Building2,
      value: DEMO_STORY.headline.properties,
      ar: "مشاريع عقارية",
      en: "Properties",
    },
    {
      icon: Layers3,
      value: DEMO_STORY.headline.units,
      ar: "وحدة سكنية وتجارية",
      en: "Residential & commercial units",
    },
    {
      icon: Landmark,
      value: DEMO_STORY.headline.legalEntities,
      ar: "كيانات قانونية",
      en: "Legal entities",
    },
  ];

  const surfaces = [
    {
      ar: "الهيكل العقاري من المشروع إلى الوحدة",
      en: "Property structure, from compound down to the unit",
    },
    {
      ar: "الاستحقاقات والتحصيل وأعمار الديون",
      en: "Receivables, collections and AR aging",
    },
    {
      ar: "توزيع رسوم الخدمات المشتركة (CAM)",
      en: "Common-area (CAM) charge allocation",
    },
    {
      ar: "الخزينة والحسابات البنكية والمطابقة",
      en: "Treasury, bank accounts and reconciliation",
    },
    {
      ar: "القوائم المالية وميزان المراجعة",
      en: "Financial statements and trial balance",
    },
    {
      ar: "سجل التدقيق وسلسلة التحقق المشفّرة",
      en: "Audit trail and the cryptographic verification chain",
    },
  ];

  return (
    <div className="flex min-h-full flex-1 flex-col bg-white text-slate-900 selection:bg-[#07425d]/20 selection:text-[#07425d]">
      <MarketingNav locale={loc} />

      <main className="relative flex flex-1 items-center justify-center px-6 py-14 lg:py-20">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#f1f5f9_1px,transparent_1px),linear-gradient(to_bottom,#f1f5f9_1px,transparent_1px)] bg-[size:3rem_3rem] opacity-70 pointer-events-none" />

        <div className="relative w-full max-w-5xl">
          <div className="mb-10 text-center">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#07425d]/20 bg-[#07425d]/5 px-3.5 py-1 text-xs font-bold text-[#07425d]">
              <Eye className="size-3.5" />
              <span>{isAr ? "بيئة استعراض حيّة" : "Live showcase environment"}</span>
            </div>

            <h1 className="font-heading text-3xl font-black text-slate-950 sm:text-4xl lg:text-5xl">
              {isAr
                ? "شوف النظام وهو شغّال بالفعل."
                : "See the system already running."}
            </h1>

            <p className="mx-auto mt-4 max-w-2xl text-sm font-medium leading-relaxed text-slate-600 sm:text-base">
              {isAr
                ? "مش حساب فاضي تبدأ تملأه. دي منشأة عقارية افتراضية مكتملة: دليل حسابات، أرصدة افتتاحية، وحدات مؤجّرة ومباعة، تحصيلات، ومطابقات بنكية — جاهزة للاستعراض فورًا."
                : "Not an empty account waiting to be configured. This is a complete fictional property operation — chart of accounts, opening balances, leased and sold units, collections and bank reconciliations — populated and ready to inspect."}
            </p>
          </div>

          <div className="grid gap-6 lg:grid-cols-5">
            {/* Entry card */}
            <div className="lg:col-span-2">
              <div className="rounded-3xl border border-slate-200/90 bg-[#FAFAFA] p-6 sm:p-8 shadow-sm">
                <p className="mb-1 text-xs font-bold uppercase tracking-wider text-slate-500">
                  {isAr ? "المنشأة المعروضة" : "Showcased entity"}
                </p>
                <p className="font-heading text-lg font-black text-slate-950">
                  {isAr ? DEMO_STORY.organization.nameAr : DEMO_STORY.organization.nameEn}
                </p>
                {/* The "this is a demo" framing lives here, one line below the
                    company name -- never appended onto the name itself. */}
                <p className="mt-1 text-xs font-medium text-slate-500">
                  {isAr
                    ? `بيئة العرض التجريبية · ${DEMO_STORY.headline.periodAr}`
                    : `Interactive demo environment · ${DEMO_STORY.headline.periodEn}`}
                </p>

                <div className="my-6 grid grid-cols-3 gap-3">
                  {scale.map((s) => (
                    <div
                      key={s.en}
                      className="rounded-2xl border border-slate-200 bg-white px-3 py-3 text-center"
                    >
                      <s.icon className="mx-auto mb-1.5 size-4 text-[#07425d]" />
                      <p className="font-heading text-lg font-black leading-none text-slate-950">
                        {s.value}
                      </p>
                      <p className="mt-1 text-[10px] font-bold leading-tight text-slate-500">
                        {isAr ? s.ar : s.en}
                      </p>
                    </div>
                  ))}
                </div>

                <EnterDemoForm locale={loc} />
              </div>
            </div>

            {/* What you can inspect */}
            <div className="lg:col-span-3">
              <div className="h-full rounded-3xl border border-slate-200/90 bg-white p-6 sm:p-8">
                <h2 className="font-heading text-base font-black text-slate-950">
                  {isAr ? "اللي هتقدر تفتحه بنفسك" : "What you can open yourself"}
                </h2>
                <ul className="mt-4 grid gap-2.5 sm:grid-cols-2">
                  {surfaces.map((s) => (
                    <li
                      key={s.en}
                      className="flex items-start gap-2.5 rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2.5 text-xs font-medium leading-relaxed text-slate-700"
                    >
                      <span className="mt-0.5 size-1.5 shrink-0 rounded-full bg-[#07425d]" />
                      <span>{isAr ? s.ar : s.en}</span>
                    </li>
                  ))}
                </ul>

                {/* Read-only disclosure. Stated up front rather than discovered
                    on the first disabled button -- a buyer who knows the rules
                    reads a missing button as a boundary, not as a bug. */}
                <div className="mt-6 flex items-start gap-3 rounded-2xl border border-[#07425d]/15 bg-[#07425d]/[0.04] px-4 py-3.5">
                  <ShieldCheck className="mt-0.5 size-4 shrink-0 text-[#07425d]" />
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-slate-900">
                      {isAr ? "للقراءة فقط، بالتصميم" : "Read-only, by design"}
                    </p>
                    <p className="text-[11px] font-medium leading-relaxed text-slate-600">
                      {isAr
                        ? "البيانات افتراضية بالكامل ومنفصلة عن أي عميل. الاستعراض مفتوح، أما الإنشاء والترحيل والحذف فمقفولة على مستوى قاعدة البيانات — مش مجرد أزرار مخفية."
                        : "The data is entirely fictional and isolated from every customer. Browsing is open; creating, posting and deleting are refused at the database layer — not merely hidden in the interface."}
                    </p>
                  </div>
                </div>

                <div className="mt-6 flex flex-wrap gap-3">
                  <Link
                    href="/pricing"
                    locale={loc}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-slate-50/80 px-4 py-2.5 text-xs font-bold text-slate-800 transition-all hover:border-slate-400 hover:bg-white active:translate-y-px"
                  >
                    {isAr ? "اعرض الباقات" : "View pricing"}
                    <ArrowUpRight className="size-3.5" />
                  </Link>
                  <Link
                    href="/demo/request"
                    locale={loc}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-slate-50/80 px-4 py-2.5 text-xs font-bold text-slate-800 transition-all hover:border-slate-400 hover:bg-white active:translate-y-px"
                  >
                    {isAr ? "تحدث معنا عن هيكل شركتك" : "Discuss your setup"}
                    <ArrowUpRight className="size-3.5" />
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
