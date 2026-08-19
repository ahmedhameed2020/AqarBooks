"use client";

import { useState } from "react";
import { ChevronDown, HelpCircle, Search, Sparkles } from "lucide-react";

interface FaqItem {
  categoryAr: string;
  categoryEn: string;
  qAr: string;
  qEn: string;
  aAr: string;
  aEn: string;
}

const FAQ_ITEMS: FaqItem[] = [
  {
    categoryAr: "المحاسبة والضرائب",
    categoryEn: "Accounting & Tax",
    qAr: "هل يدعم عقار بوكس (AqarBooks) متطلبات السوق المصري والسوق الخليجي؟",
    qEn: "Does AqarBooks support Egyptian and GCC market requirements?",
    aAr: "نعم، النظام مصمم خصيصاً لشركات العقار في مصر ودول الخليج؛ يدعم ضريبة القيمة المضافة 14% (مصر) و 15% (السعودية) و 5% (الإمارات)، وضرائب الخصم والتحصيل WHT، وجاهزية الفاتورة الإلكترونية وزاتكا ZATCA، مع دليل حسابات معرّب ومطابق للمعايير المحاسبية المعتمدة.",
    aEn: "Yes — AqarBooks is natively tailored for Egypt and the GCC: supporting Egyptian 14% VAT & WHT, Saudi 15% VAT & ZATCA e-invoicing Phase 2, UAE 5% VAT, multi-currencies (EGP, SAR, AED, USD), and localized Arabic Chart of Accounts.",
  },
  {
    categoryAr: "المحاسبة والضرائب",
    categoryEn: "Accounting & Tax",
    qAr: "كيف يختلف عقار بوكس عن برامج إدارة العقارات التقليدية؟",
    qEn: "How does AqarBooks differ from traditional property management software?",
    aAr: "البرامج التقليدية غالبًا ما تكون مجرد جداول تسجيل إيجارات أو تحصيل سطحي. عقار بوكس مبني على محرك محاسبة عامة بقيد مزدوج حقيقي (Double-Entry GL)، ترحيل ذري Atomic، ويدعم الكيانات الخمسة (منتجعات سياحية، أبراج، فلل، محلات تجارية، اتحادات ملاك) في بنية واحدة متماسكة.",
    aEn: "Traditional software is often just a billing spreadsheet. AqarBooks is built on a full double-entry general ledger engine with atomic DB posting, audited reversals, and native support for all 5 property entity types.",
  },
  {
    categoryAr: "الكيانات وإدارة العقارات",
    categoryEn: "Entity & Property Management",
    qAr: "هل يمكن إدارة اتحاد شاغلين أو جمعية ملاك مع توزيع المصروفات بحسب الحصص؟",
    qEn: "Can it manage an HOA / Mollak association with pro-rata area expense distribution?",
    aAr: "نعم، يدعم النظام توزيع المصروفات المشتركة (حراسة، صيانة مصاعد، إنارة عامة) بحسب نسبة كل وحدة في ملكية الأرض والأجزاء المشتركة، مع إصدار مطالبات موثقة ومتابعة مديونيات الأعضاء.",
    aEn: "Yes — common operational expenses are automatically apportioned based on each unit's official pro-rata ownership share with audited statements.",
  },
  {
    categoryAr: "الأمان والخصوصية",
    categoryEn: "Security & Privacy",
    qAr: "كيف يضمن النظام عدم التلاعب المالي وسرية الحسابات؟",
    qEn: "How does AqarBooks prevent financial tampering and protect tenant data?",
    aAr: "من خلال ركيزتين أساسيتين: الأولى هي عزل البيانات الصارم عبر تقنية Row-Level Security في PostgreSQL، والثانية هي عدم إمكانية تعديل أو حذف القيود المرحّلة إطلاقاً (أي تصحيح يتم عبر قيد عكسي موثّق مع سجل تدقيق غير قابل للحذف).",
    aEn: "Through two strict pillars: database-level Row-Level Security (RLS) for complete multi-tenant isolation, and an immutable ledger where posted entries cannot be edited — corrections require logged reversing entries.",
  },
  {
    categoryAr: "الواجهة والتشغيل",
    categoryEn: "UI & Operation",
    qAr: "هل النظام ثنائي اللغة (عربي بالكامل وإنجليزي)؟",
    qEn: "Is the platform fully bilingual (Arabic RTL and English LTR)?",
    aAr: "نعم، الواجهة كاملة، شجرة الحسابات، سندات القبض، والتقارير المالية مبنية من الأساس لتدعم اللغة العربية RTL والإنجليزية LTR بخطوط عصرية ومظهر احترافي فائق.",
    aEn: "Yes — the complete UI, Chart of Accounts, receipt vouchers, and financial statements are natively designed for Arabic (RTL) and English (LTR) with modern high-contrast typography.",
  },
  {
    categoryAr: "الواجهة والتشغيل",
    categoryEn: "UI & Operation",
    qAr: "كيف يتم إعداد النظام وبدء الاستخدام؟",
    qEn: "How is the system set up and how do we get started?",
    aAr: "يقوم فريقنا المالي والتقني بتهيئة شجرة الحسابات الخاصة بمنشأتك واستيراد بيانات الوحدات والعقود، مع تقديم تدريب كامل لفريق المحاسبة والإدارة لتبدأ العمل خلال أيام معدودة.",
    aEn: "Our technical team assists in configuring your Chart of Accounts and importing property contracts, providing end-to-end onboarding in just a few days.",
  },
];

export function InteractiveFaq({ isAr }: { isAr: boolean }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  const [activeCategory, setActiveCategory] = useState<string>("all");

  const categories = Array.from(
    new Set(FAQ_ITEMS.map((item) => (isAr ? item.categoryAr : item.categoryEn)))
  );

  const filteredItems = FAQ_ITEMS.filter((item) => {
    const question = isAr ? item.qAr : item.qEn;
    const answer = isAr ? item.aAr : item.aEn;
    const category = isAr ? item.categoryAr : item.categoryEn;

    const matchesSearch =
      question.toLowerCase().includes(searchQuery.toLowerCase()) ||
      answer.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCat = activeCategory === "all" || category === activeCategory;

    return matchesSearch && matchesCat;
  });

  return (
    <section id="faq" className="relative py-28 px-6 border-t border-[var(--mk-border)] bg-[#060a18] overflow-hidden">
      
      <div className="mx-auto max-w-4xl relative z-10 space-y-12">
        
        {/* Header */}
        <div className="text-center max-w-2xl mx-auto space-y-4">
          <div className="inline-flex items-center gap-2 rounded-full border border-purple-500/30 bg-purple-950/40 px-4 py-1 text-xs font-bold text-purple-300">
            <HelpCircle className="size-3.5 text-purple-400" />
            <span>{isAr ? "الأسئلة الشائعة" : "Knowledge Base & FAQ"}</span>
          </div>
          
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
            {isAr ? "كل ما تود معرفته عن المنظومة" : "Everything You Need to Know"}
          </h2>
          
          <p className="text-sm text-slate-300 font-normal">
            {isAr
              ? "إجابات مباشرة ومفصلة عن المحاسبة، الأمان، والتوافق الضريبي الإقليمي."
              : "Clear answers regarding accounting mechanics, security, and regional tax compliance."}
          </p>

          {/* Search bar */}
          <div className="pt-2">
            <div className="relative max-w-md mx-auto">
              <Search className="absolute inset-y-0 start-3.5 my-auto size-4 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={isAr ? "ابحث في الأسئلة الشائعة..." : "Search questions..."}
                className="w-full rounded-2xl border border-white/10 bg-slate-900/90 py-3 ps-10 pe-4 text-xs sm:text-sm text-white placeholder:text-slate-500 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20 transition-all shadow-lg"
              />
            </div>
          </div>

          {/* Categories Pills */}
          <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
            <button
              type="button"
              onClick={() => setActiveCategory("all")}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
                activeCategory === "all"
                  ? "bg-purple-600 text-white shadow-xs"
                  : "bg-slate-900/80 border border-white/5 text-slate-400 hover:text-white"
              }`}
            >
              {isAr ? "جميع الأسئلة" : "All Questions"}
            </button>
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setActiveCategory(cat)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
                  activeCategory === cat
                    ? "bg-purple-600 text-white shadow-xs"
                    : "bg-slate-900/80 border border-white/5 text-slate-400 hover:text-white"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* FAQ Accordion List */}
        <div className="space-y-3.5">
          {filteredItems.length === 0 ? (
            <div className="text-center py-12 text-slate-500 text-sm">
              {isAr ? "لم يتم العثور على نتائج مطابقة للبحث." : "No matching questions found."}
            </div>
          ) : (
            filteredItems.map((item, idx) => {
              const isOpen = openIndex === idx;
              return (
                <div
                  key={idx}
                  className={`rounded-2xl border transition-all duration-200 overflow-hidden ${
                    isOpen
                      ? "border-purple-500/50 bg-slate-900/90 shadow-xl shadow-purple-950/20"
                      : "border-white/10 bg-slate-900/60 hover:border-white/20"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setOpenIndex(isOpen ? null : idx)}
                    className="w-full flex items-center justify-between p-5 sm:p-6 text-start cursor-pointer group"
                  >
                    <span className="text-sm sm:text-base font-bold text-white group-hover:text-purple-300 transition-colors">
                      {isAr ? item.qAr : item.qEn}
                    </span>
                    <div
                      className={`size-8 rounded-xl flex items-center justify-center shrink-0 ms-4 transition-all ${
                        isOpen ? "bg-purple-600 text-white rotate-180" : "bg-slate-800 text-slate-400 group-hover:text-white"
                      }`}
                    >
                      <ChevronDown className="size-4" />
                    </div>
                  </button>

                  {isOpen && (
                    <div className="px-5 sm:px-6 pb-6 pt-1 text-xs sm:text-sm text-slate-300 leading-relaxed border-t border-white/5 font-normal">
                      {isAr ? item.aAr : item.aEn}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

      </div>

    </section>
  );
}
