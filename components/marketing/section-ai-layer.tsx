"use client";

import { useState } from "react";
import Image from "next/image";
import type { Locale } from "@/i18n/routing";
import { Sparkles, CheckCircle2, ShieldCheck, ArrowRight, Bot, FileText, Check, Landmark, MessageSquare, Send, BellRing } from "lucide-react";

export function SectionAiLayer({ locale }: { locale: Locale }) {
  const isAr = locale === "ar";
  const [activeExp, setActiveExp] = useState<"ocr" | "recon" | "copilot" | "ask" | "dunning">("ocr");

  return (
    <section id="ai-layer" className="relative bg-white py-20 border-b border-slate-200/80">
      <div className="mx-auto max-w-7xl px-6">
        {/* Section Header */}
        <div className="max-w-3xl">
          <div className="flex items-center gap-2 text-xs font-mono font-bold text-violet-700">
            <span className="flex size-5 items-center justify-center rounded-full bg-violet-100 text-[10px]">08</span>
            <span>{isAr ? "ذكاء تحت السيطرة" : "INTELLIGENCE UNDER CONTROL"}</span>
          </div>

          <h2 className="mt-3 text-3xl sm:text-4xl font-black text-slate-950 font-heading">
            {isAr ? (
              <>
                الذكاء يقترح. <br className="hidden sm:inline" />
                <span className="text-[#1A3C2E]">دفاترك لا تخمّن.</span>
              </>
            ) : (
              <>
                AI proposes. <br className="hidden sm:inline" />
                <span className="text-[#1A3C2E]">Your ledgers never guess.</span>
              </>
            )}
          </h2>

          <p className="mt-3.5 text-sm sm:text-base text-slate-600 font-medium leading-relaxed">
            {isAr
              ? "يقرأ AqarBooks المستندات، يكتشف الأنماط ويقترح الخطوة التالية — لكن الأرقام لا تُترك للنموذج. الحساب والتحقق والصلاحيات والاعتماد تظل داخل المحرك المحاسبي وتحت سيطرة فريقك."
              : "AqarBooks reads documents, detects patterns, and proposes next steps — but numbers are never left to a model. Statutory calculation, validation, permissions, and posting stay firmly inside the core under your team's control."}
          </p>

          {/* Proof Points */}
          <div className="mt-5 flex flex-wrap items-center gap-2.5 text-xs font-bold text-slate-700">
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-violet-50 text-violet-900 px-2.5 py-1 border border-violet-200 shadow-2xs">
              <Sparkles className="size-3.5 text-violet-600" />
              <span>{isAr ? "AI يقترح" : "AI Proposes"}</span>
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 text-slate-900 px-2.5 py-1 border border-slate-200 shadow-2xs">
              <ShieldCheck className="size-3.5 text-[#1A3C2E]" />
              <span>{isAr ? "المحرك يتحقق" : "Core Validates"}</span>
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 text-emerald-900 px-2.5 py-1 border border-emerald-200 shadow-2xs">
              <CheckCircle2 className="size-3.5 text-emerald-600" />
              <span>{isAr ? "الإنسان يعتمد" : "Human Approves"}</span>
            </span>
          </div>
        </div>

        {/* 5 Experience Switchers */}
        <div className="mt-10 flex flex-wrap items-center gap-2 border-b border-slate-200 pb-3">
          <button
            type="button"
            onClick={() => setActiveExp("ocr")}
            className={`rounded-xl px-3.5 py-2 text-xs font-bold transition-all cursor-pointer ${
              activeExp === "ocr"
                ? "bg-[#1A3C2E] text-white shadow-sm"
                : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50"
            }`}
          >
            {isAr ? "1. استخراج فواتير الموردين (OCR)" : "1. Supplier Invoice OCR"}
          </button>

          <button
            type="button"
            onClick={() => setActiveExp("recon")}
            className={`rounded-xl px-3.5 py-2 text-xs font-bold transition-all cursor-pointer ${
              activeExp === "recon"
                ? "bg-[#1A3C2E] text-white shadow-sm"
                : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50"
            }`}
          >
            {isAr ? "2. اقتراح المطابقة البنكية" : "2. Bank Reconciliation Match"}
          </button>

          <button
            type="button"
            onClick={() => setActiveExp("copilot")}
            className={`rounded-xl px-3.5 py-2 text-xs font-bold transition-all cursor-pointer ${
              activeExp === "copilot"
                ? "bg-[#1A3C2E] text-white shadow-sm"
                : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50"
            }`}
          >
            {isAr ? "3. مساعد اقتراح القيود (Copilot)" : "3. Journal Entry Copilot"}
          </button>

          <button
            type="button"
            onClick={() => setActiveExp("ask")}
            className={`rounded-xl px-3.5 py-2 text-xs font-bold transition-all cursor-pointer ${
              activeExp === "ask"
                ? "bg-[#1A3C2E] text-white shadow-sm"
                : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50"
            }`}
          >
            {isAr ? "4. الاستفسار المالي (Ask AqarBooks)" : "4. Ask AqarBooks Analytics"}
          </button>

          <button
            type="button"
            onClick={() => setActiveExp("dunning")}
            className={`rounded-xl px-3.5 py-2 text-xs font-bold transition-all cursor-pointer ${
              activeExp === "dunning"
                ? "bg-[#1A3C2E] text-white shadow-sm"
                : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50"
            }`}
          >
            {isAr ? "5. المتابعة الذكية للمتأخرات" : "5. Smart Dunning & Collection"}
          </button>
        </div>

        {/* The Concrete AI Showcase Grid */}
        <div className="mt-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
          {/* Left/Main interactive demo area */}
          <div className="lg:col-span-8 rounded-3xl border border-slate-200/90 bg-[#FAFAFA] p-6 sm:p-8 shadow-sm flex flex-col justify-between">
            {/* Experience 1: Invoice OCR */}
            {activeExp === "ocr" && (
              <div>
                <div className="flex items-center justify-between pb-4 border-b border-slate-200">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
                    <FileText className="size-4 text-violet-600" />
                    <span>{isAr ? "استخراج وقراءة فاتورة مورد (فاتورة ضريبية)" : "Tax Invoice OCR Data Extraction"}</span>
                  </div>
                  <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 text-violet-800 border border-violet-200 text-[10px] font-bold px-2 py-0.5">
                    {isAr ? "اقتراح ذكي • ثقة 98%" : "AI Suggestion • 98% Confidence"}
                  </span>
                </div>

                <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Step A: AI Extraction in Violet tone */}
                  <div className="rounded-2xl border border-violet-200 bg-white p-4">
                    <span className="text-[10px] font-mono font-bold text-violet-700 uppercase">{isAr ? "البيانات المستخرجة آلياً" : "Extracted Fields"}</span>
                    <div className="mt-2 space-y-1.5 text-xs">
                      <div className="flex justify-between">
                        <span className="text-slate-500">{isAr ? "المورد:" : "Vendor:"}</span>
                        <span className="font-bold text-slate-900">{isAr ? "شركة النور للصيانة والمقاولات" : "Al Noor Maintenance"}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">{isAr ? "الصافي:" : "Net Base:"}</span>
                        <span className="font-mono font-bold text-slate-900">50,000 ج.م</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">{isAr ? "ضريبة القيمة المضافة:" : "VAT 14%:"}</span>
                        <span className="font-mono font-bold text-slate-900">7,000 ج.م</span>
                      </div>
                      <div className="flex justify-between pt-1 border-t border-slate-100 font-bold">
                        <span className="text-slate-800">{isAr ? "الإجمالي:" : "Total:"}</span>
                        <span className="font-mono text-slate-950 font-black">57,000 ج.م</span>
                      </div>
                    </div>
                  </div>

                  {/* Step B: Core Validation & Human Authorization in Green/Navy */}
                  <div className="rounded-2xl border border-[#1A3C2E]/20 bg-white p-4 flex flex-col justify-between">
                    <div>
                      <span className="text-[10px] font-mono font-bold text-[#1A3C2E] uppercase">{isAr ? "تحقق المحرك المحاسبي" : "Core Account Rules Match"}</span>
                      <div className="mt-2 space-y-1.5 text-xs">
                        <div className="flex items-center gap-1.5 text-emerald-800 font-semibold">
                          <CheckCircle2 className="size-3.5 text-emerald-600 shrink-0" />
                          <span>{isAr ? "الحساب المقترح: مصروفات صيانة 50102" : "Suggested: Maintenance Expense (50102)"}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-emerald-800 font-semibold">
                          <CheckCircle2 className="size-3.5 text-emerald-600 shrink-0" />
                          <span>{isAr ? "المطابقة الحسابية: 50,000 + 7,000 = 57,000" : "Arithmetic Proof: 50k + 7k = 57k"}</span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                      <span className="text-[11px] font-bold text-slate-500">{isAr ? "بانتظار اعتماد المحاسب:" : "Awaiting Authorization:"}</span>
                      <span className="rounded-lg bg-[#1A3C2E] text-white px-3 py-1 text-xs font-bold shadow-2xs">
                        {isAr ? "اعتماد وترحيل القيد ✓" : "Approve & Post ✓"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Experience 2: Bank Recon */}
            {activeExp === "recon" && (
              <div>
                <div className="flex items-center justify-between pb-4 border-b border-slate-200">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
                    <Landmark className="size-4 text-violet-600" />
                    <span>{isAr ? "اقتراح مطابقة حركة كشف الحساب البنكي" : "Bank Statement Match Proposal"}</span>
                  </div>
                  <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 text-violet-800 border border-violet-200 text-[10px] font-bold px-2 py-0.5">
                    {isAr ? "مطابقة مقترحة • ثقة 99%" : "Proposed Match • 99% Score"}
                  </span>
                </div>

                <div className="mt-5 space-y-3">
                  <div className="rounded-2xl border border-slate-200 bg-white p-4 text-xs flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <span className="text-[10px] font-mono text-slate-400 font-bold block">{isAr ? "حركة البنك (CIB Current)" : "Bank Statement Line"}</span>
                      <p className="font-bold text-slate-900 mt-0.5">{isAr ? "تحويل صادر — AL NOOR MAINT" : "Wire Out — AL NOOR MAINT"}</p>
                    </div>
                    <span className="font-mono text-sm font-black text-slate-950">57,000.00 ج.م</span>
                  </div>

                  <div className="rounded-2xl border border-violet-200 bg-violet-50/40 p-4 text-xs flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <span className="text-[10px] font-mono text-violet-700 font-bold block">{isAr ? "الفاتورة المكتشفة بالسجلات" : "Matching Ledger Bill"}</span>
                      <p className="font-bold text-slate-900 mt-0.5">{isAr ? "فاتورة مورد #INV-2026-89 (شركة النور)" : "Supplier Invoice #INV-2026-89 (Al Noor)"}</p>
                    </div>
                    <span className="font-mono text-sm font-black text-violet-950">57,000.00 ج.م</span>
                  </div>
                </div>

                <div className="mt-5 rounded-xl bg-emerald-50 p-3 text-xs text-emerald-900 font-medium flex items-center justify-between">
                  <span>{isAr ? "القرار المحاسبي: تتطابق القيمة والتاريخ والمستفيد — بانتظار تأكيدك لإقفال التسوية." : "Policy Rule: Amount, date, and counterparty match — requires user confirmation."}</span>
                  <span className="font-bold text-emerald-800">{isAr ? "تأكيد المطابقة" : "Confirm"}</span>
                </div>
              </div>
            )}

            {/* Experience 3: Journal Copilot */}
            {activeExp === "copilot" && (
              <div>
                <div className="flex items-center justify-between pb-4 border-b border-slate-200">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
                    <Bot className="size-4 text-violet-600" />
                    <span>{isAr ? "مساعد اقتراح مسودة القيد المحاسبي" : "Journal Entry Draft Proposal"}</span>
                  </div>
                  <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 text-violet-800 border border-violet-200 text-[10px] font-bold px-2 py-0.5">
                    {isAr ? "اقتراح مسودة • لا يرحل آلياً" : "Draft Proposal • No Auto-Post"}
                  </span>
                </div>

                <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 text-xs space-y-2 font-mono">
                  <div className="flex justify-between text-slate-700">
                    <span>Dr: 50102 (مصروفات صيانة دورية)</span>
                    <span className="font-bold">50,000.00 ج.م</span>
                  </div>
                  <div className="flex justify-between text-slate-700">
                    <span>Dr: 10302 (ضريبة مدخلات قابلة للخصم 14%)</span>
                    <span className="font-bold">7,000.00 ج.م</span>
                  </div>
                  <div className="flex justify-between text-slate-700">
                    <span>Cr: 20101 (ذمم الموردين — شركة النور)</span>
                    <span className="font-bold">57,000.00 ج.م</span>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between text-xs pt-3 border-t border-slate-200">
                  <span className="text-slate-500 font-medium">{isAr ? "المحرك تحقق من توازن القيد (57,000 = 57,000) وصحة أرقام الحسابات." : "Core validated double-entry balance and active account codes."}</span>
                  <span className="font-bold text-[#1A3C2E] bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
                    {isAr ? "جاهز للاعتماد" : "Ready for Authorization"}
                  </span>
                </div>
              </div>
            )}

            {/* Experience 4: Ask AqarBooks */}
            {activeExp === "ask" && (
              <div>
                <div className="flex items-center justify-between pb-4 border-b border-slate-200">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
                    <MessageSquare className="size-4 text-violet-600" />
                    <span>{isAr ? "التحليل المالي الذكي (Ask AqarBooks)" : "Audited Financial Inquiry Engine"}</span>
                  </div>
                  <span className="text-[10px] font-mono font-bold text-slate-400">LEDGER-BACKED RESPONSE</span>
                </div>

                {/* Chat Flow */}
                <div className="mt-4 space-y-3">
                  <div className="rounded-2xl bg-white p-3.5 border border-slate-200 text-xs font-bold text-slate-800 start-0 max-w-lg">
                    {isAr ? "كم إجمالي المتأخرات في Palm Residence حتى اليوم؟" : "What is the total overdue balance in Palm Residence to date?"}
                  </div>

                  <div className="rounded-2xl bg-emerald-50/70 p-4 border border-emerald-200 text-xs space-y-2">
                    <div className="flex items-baseline justify-between">
                      <span className="font-bold text-emerald-950">{isAr ? "إجمالي المتأخرات المسجلة:" : "Total Overdue Receivables:"}</span>
                      <span className="text-base font-black text-emerald-900 font-mono">1,284,500 ج.م</span>
                    </div>
                    <p className="text-emerald-900/80 font-medium">
                      {isAr
                        ? "من إجمالي 126 وحدة بالمشروع، يوجد 38 وحدة عليها رصيد مستحق متأخر."
                        : "Out of 126 project units, 38 units currently hold overdue balances."}
                    </p>
                    <div className="pt-2 border-t border-emerald-200/80 flex items-center justify-between text-[10px] font-mono text-emerald-800">
                      <span>SOURCE: AR_LEDGER (24/08/2026)</span>
                      <span>100% PROVENANCE TRACEABLE</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Experience 5: Smart Dunning */}
            {activeExp === "dunning" && (
              <div>
                <div className="flex items-center justify-between pb-4 border-b border-slate-200">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
                    <BellRing className="size-4 text-violet-600" />
                    <span>{isAr ? "المتابعة الذكية للمتأخرات وروابط السداد" : "Smart Dunning Notice & Direct Payment"}</span>
                  </div>
                  <span className="text-[10px] font-mono font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                    VERIFIED CORE VALUES
                  </span>
                </div>

                <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 text-xs space-y-2">
                  <div className="flex items-center justify-between text-slate-500 font-mono text-[11px]">
                    <span>TO: Ahmed Mohamed (Unit B-214)</span>
                    <span>CHANNEL: WhatsApp / SMS</span>
                  </div>
                  <p className="text-slate-800 font-medium leading-relaxed pt-1">
                    {isAr
                      ? "عزيزي أ. أحمد، نود تذكيركم بمطالبة رسوم الإدارة المستحقة لوحدة B-214 بمبلغ 28,500 ج.م. يمكنكم السداد مباشرة عبر الرابط المؤمن المعتمد:"
                      : "Dear Mr. Ahmed, a friendly reminder for the CAM dues for Unit B-214 amounting to 28,500 EGP. You can settle securely via the verified link:"}
                  </p>
                  <div className="rounded-xl bg-slate-50 p-2.5 border border-slate-200 font-mono text-[11px] text-blue-700 font-bold">
                    https://aqarbooks.com/pay/ST-90214?token=secure
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between text-xs pt-3 border-t border-slate-200 text-slate-500">
                  <span>{isAr ? "القيم والروابط محقنة مباشرة من قاعدة البيانات المحاسبية، والذكاء لا يخترع أي رقم." : "Amounts and links are injected directly from the database; AI invents zero numbers."}</span>
                  <span className="font-bold text-[#1A3C2E]">{isAr ? "إرسال معتمد ✓" : "Approved to Send"}</span>
                </div>
              </div>
            )}
          </div>

          {/* Right architectural visual side */}
          <div className="lg:col-span-4 rounded-3xl overflow-hidden border border-slate-200 bg-white p-6 shadow-sm flex flex-col justify-between">
            <div className="relative aspect-[4/3] rounded-2xl overflow-hidden bg-slate-100 border border-slate-200/80">
              <Image
                src="/images/aqarbooks-technical-twin.jpg"
                alt={isAr ? "الهيكل الفني المحاسبي للعقار" : "Property Technical Architectural Structure"}
                fill
                sizes="(max-width: 1024px) 100vw, 33vw"
                className="object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950/70 via-transparent to-transparent" />
              <div className="absolute bottom-4 start-4 end-4 text-white">
                <span className="text-[10px] font-mono font-bold uppercase text-emerald-400">FINANCIAL X-RAY</span>
                <p className="text-sm font-black font-heading mt-0.5">{isAr ? "بنية محاسبية تحت كل جدار" : "Accounting Under Every Wall"}</p>
              </div>
            </div>

            <div className="mt-5 rounded-2xl bg-slate-50 p-4 border border-slate-200/80 text-xs">
              <div className="flex items-center gap-2 font-bold text-slate-900">
                <ShieldCheck className="size-4 text-[#1A3C2E]" />
                <span>{isAr ? "مبدأ الحوكمة الصارم" : "Core Governance Principle"}</span>
              </div>
              <p className="mt-1.5 text-[11px] text-slate-600 leading-relaxed font-medium">
                {isAr
                  ? "الذكاء الاصطناعي يقترح ويشرح فقط. المحرك المحاسبي الصارم هو من يحتسب ويتحقق ويثبت المعاملات بعد موافقة الإدارة."
                  : "AI strictly suggests and explains. The deterministic accounting core calculates, validates, and records after management approval."}
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
