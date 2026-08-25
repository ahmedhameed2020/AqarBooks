"use client";

import { useCallback, useSyncExternalStore } from "react";
import { Link, usePathname } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { Compass, X, ChevronRight, ChevronLeft, Check } from "lucide-react";

/**
 * The optional demo tour.
 *
 * WHY IT IS A DOCKED CARD AND NOT A COACHMARK ENGINE
 * Spec §19 asks for a lightweight walkthrough and explicitly warns against
 * building a tutorial engine. Coachmarks that point at elements need anchors,
 * measurement, and re-measurement on every layout change across two writing
 * directions -- and they break silently when a screen is redesigned. A docked
 * card owns no part of the pages it describes, so it cannot break them, and it
 * survives any redesign of the screens it links to.
 *
 * WHY PROGRESS IS IN localStorage
 * Tour position is per-visitor UI state, not tenant data. Every demo visitor
 * shares one underlying account, so anything persisted server-side would be
 * shared -- one visitor's progress would move another's tour. localStorage is
 * per-browser, which is exactly the scope this needs (spec §14). Reads and
 * writes are wrapped: private windows and blocked site-data both throw, and
 * neither should break the product screen behind the card.
 */

const STORAGE_KEY = "aqarbooks.demo.walkthrough";

type Step = {
  href: string;
  ar: { title: string; body: string };
  en: { title: string; body: string };
};

// Seven steps, each landing on a screen the demo account can actually open.
// The order is the order a buyer's questions arrive in: what is the state of
// the business, what is it made of, what does it collect, how does it split
// shared cost, where is the cash, and can any of it be trusted.
const STEPS: Step[] = [
  {
    href: "/dashboard",
    ar: { title: "لوحة الإدارة التنفيذية", body: "المؤشرات المالية للمنشأة في شاشة واحدة: المستحق، المحصّل، رصيد البنوك، والإشغال." },
    en: { title: "Executive dashboard", body: "The whole operation on one screen: receivables, collections, bank balances and occupancy." },
  },
  {
    href: "/property",
    ar: { title: "الهيكل العقاري", body: "من المشروع إلى العمارة إلى الوحدة — كل وحدة بُعد مالي قائم بذاته له رصيده وحركته." },
    en: { title: "Property structure", body: "Compound to building to unit — every unit is a financial dimension with its own balance and history." },
  },
  {
    href: "/finance/dues",
    ar: { title: "الاستحقاقات والتحصيل", body: "المطالبات الصادرة، المسدَّد منها، والمتأخر — مع أعمار الديون على مستوى الوحدة." },
    en: { title: "Receivables & collections", body: "What was billed, what was paid, and what is overdue — aged down to the unit." },
  },
  {
    href: "/finance/reports/cam-allocation",
    ar: { title: "توزيع رسوم الخدمات (CAM)", body: "تكلفة مشتركة تُوزَّع على الوحدات بالمساحة، ومجموع التوزيع يساوي التكلفة بالضبط." },
    en: { title: "CAM allocation", body: "A shared cost split across units by area — and the split sums to the cost exactly." },
  },
  {
    href: "/finance/banks/reconciliation",
    ar: { title: "الخزينة والمطابقة البنكية", body: "كشف حساب بنكي أمام دفاترك: مطابق، ومقترح، وغير مطابق — كما هي الحال فعليًا." },
    en: { title: "Treasury & bank matching", body: "A bank statement against your books: matched, suggested and unmatched — as it really looks." },
  },
  {
    href: "/finance/reports/audit-trail",
    ar: { title: "التدقيق والحوكمة", body: "كل حركة مالية مسجَّلة في سلسلة تحقق مشفَّرة، ويمكن التحقق من سلامتها." },
    en: { title: "Audit & governance", body: "Every financial action recorded in a cryptographic chain whose integrity can be verified." },
  },
  {
    href: "/dashboard",
    ar: { title: "طبقة الذكاء الاصطناعي", body: "افتح «اسأل AqarBooks» واسأل عن أرقامك. الذكاء يشرح ويقترح — والمحرك المحاسبي وحده يعتمد ويرحّل." },
    en: { title: "AI assistance", body: "Open Ask AqarBooks and question the numbers. AI explains and proposes; only the accounting core authorises and posts." },
  },
];

type Persisted = { step: number; dismissed: boolean };

/**
 * Distinguishes "rendering on the server" from "client with nothing stored".
 * Both are absences, but only the first must render nothing -- returning the
 * same value for both would make the tour flash in during hydration.
 */
// Never collides with a stored value: what this key holds is always JSON,
// so it starts with "{".
const SSR = "__aqarbooks_ssr__";

const CHANGED_EVENT = "aqarbooks:demo-walkthrough";

/**
 * The tour reads localStorage through useSyncExternalStore rather than an
 * effect. Setting state inside an effect to hydrate from storage causes the
 * cascading re-render React 19 warns about, and it is the wrong tool: storage
 * IS an external store, which is exactly what this hook is for. React calls
 * the server snapshot for SSR and the first hydration render, then swaps to
 * the client one -- so there is no mismatch and no effect.
 */
function subscribe(onChange: () => void): () => void {
  // `storage` fires for other tabs; the custom event covers this one, which
  // `storage` deliberately does not notify.
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGED_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGED_EVENT, onChange);
  };
}

/**
 * Must return a value that is referentially stable while nothing changes, so
 * it returns the raw string and leaves parsing to the caller. Returning a
 * fresh object here would re-render forever.
 */
function getSnapshot(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    // Private windows and blocked site data throw on read as well as write.
    return null;
  }
}

function parse(raw: string | null): Persisted {
  if (!raw) return { step: 0, dismissed: false };
  try {
    const parsed = JSON.parse(raw) as Partial<Persisted>;
    const step = Number(parsed.step);
    return {
      step: Number.isInteger(step) && step >= 0 && step < STEPS.length ? step : 0,
      dismissed: parsed.dismissed === true,
    };
  } catch {
    return { step: 0, dismissed: false };
  }
}

function write(value: Persisted): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Losing the position is a smaller cost than losing the screen.
  }
  // Dispatched unconditionally: if the write was refused, the component still
  // needs to re-read and show the truth rather than a position that was never
  // saved.
  window.dispatchEvent(new Event(CHANGED_EVENT));
}

export function DemoWalkthrough({ locale }: { locale: Locale }) {
  const isAr = locale === "ar";
  const pathname = usePathname();

  const raw = useSyncExternalStore(subscribe, getSnapshot, () => SSR);

  const persist = useCallback(
    (next: Partial<Persisted>) => write({ ...parse(raw === SSR ? null : raw), ...next }),
    [raw],
  );

  // Server render and first hydration render: draw nothing, so the tour cannot
  // appear in markup that the client would then contradict.
  if (raw === SSR) return null;

  const { step, dismissed } = parse(raw);

  const current = STEPS[step]!;
  const copy = isAr ? current.ar : current.en;
  const isLast = step === STEPS.length - 1;
  const onCurrentScreen = pathname === current.href;

  // Collapsed: a single button, so a visitor who dismissed the tour can still
  // find it. "Skip" must not mean "gone forever".
  if (dismissed) {
    return (
      <button
        type="button"
        onClick={() => persist({ dismissed: false })}
        className="fixed bottom-4 start-4 z-40 inline-flex items-center gap-1.5 rounded-full border border-[#07425d]/20 bg-white px-3 py-2 text-[11px] font-bold text-[#07425d] shadow-lg transition-transform hover:-translate-y-0.5 print:hidden dark:bg-slate-900"
      >
        <Compass className="size-3.5" />
        {isAr ? "الجولة الإرشادية" : "Guided tour"}
      </button>
    );
  }

  const Next = isAr ? ChevronLeft : ChevronRight;

  return (
    <div className="fixed bottom-4 start-4 z-40 w-[min(20rem,calc(100vw-2rem))] rounded-2xl border border-[#07425d]/20 bg-white p-4 shadow-xl print:hidden dark:border-slate-700 dark:bg-slate-900">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-[#07425d] dark:text-sky-300">
          <Compass className="size-3.5" />
          <span>
            {isAr
              ? `الخطوة ${step + 1} من ${STEPS.length}`
              : `Step ${step + 1} of ${STEPS.length}`}
          </span>
        </div>
        <button
          type="button"
          onClick={() => persist({ dismissed: true })}
          aria-label={isAr ? "إغلاق الجولة" : "Close the tour"}
          className="-m-1 rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
        >
          <X className="size-3.5" />
        </button>
      </div>

      <p className="font-heading text-sm font-black text-slate-950 dark:text-slate-50">
        {copy.title}
      </p>
      <p className="mt-1 text-[11px] font-medium leading-relaxed text-slate-600 dark:text-slate-400">
        {copy.body}
      </p>

      <div className="mt-3 flex items-center gap-2">
        {onCurrentScreen ? (
          <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-[11px] font-bold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
            <Check className="size-3" />
            {isAr ? "أنت هنا" : "You are here"}
          </span>
        ) : (
          <Link
            href={current.href}
            locale={locale}
            className="inline-flex items-center gap-1 rounded-lg bg-[#07425d] px-2.5 py-1.5 text-[11px] font-bold text-white transition-colors hover:bg-[#053247]"
          >
            {isAr ? "افتح الشاشة" : "Open screen"}
            <Next className="size-3" />
          </Link>
        )}

        <div className="ms-auto flex items-center gap-1">
          <button
            type="button"
            disabled={step === 0}
            onClick={() => persist({ step: Math.max(0, step - 1) })}
            className="rounded-lg border border-slate-200 px-2 py-1.5 text-[11px] font-bold text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            {isAr ? "السابق" : "Back"}
          </button>
          <button
            type="button"
            onClick={() =>
              isLast
                ? persist({ dismissed: true, step: 0 })
                : persist({ step: step + 1 })
            }
            className="rounded-lg border border-slate-200 px-2 py-1.5 text-[11px] font-bold text-slate-800 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800"
          >
            {isLast ? (isAr ? "إنهاء" : "Finish") : isAr ? "التالي" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}
