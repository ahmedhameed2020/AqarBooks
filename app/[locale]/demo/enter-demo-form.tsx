"use client";

import { useActionState } from "react";
import { enterDemoAction } from "@/lib/actions/demo";
import type { ActionResult } from "@/lib/actions/platform";
import { ArrowUpRight, Loader2 } from "lucide-react";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";

const MESSAGES: Record<string, { ar: string; en: string }> = {
  demo_unavailable: {
    ar: "بيئة الاستعراض غير متاحة حاليًا. تواصل معنا ونرتّب لك عرضًا مباشرًا.",
    en: "The demo environment is not available right now. Contact us and we'll arrange a live walkthrough.",
  },
  demo_signin_failed: {
    ar: "تعذّر فتح بيئة الاستعراض. حاول مرة أخرى، أو تواصل معنا مباشرة.",
    en: "We couldn't open the demo environment. Please try again, or contact us directly.",
  },
  demo_misconfigured: {
    ar: "بيئة الاستعراض متوقفة مؤقتًا للصيانة. تواصل معنا ونرتّب لك عرضًا مباشرًا.",
    en: "The demo environment is temporarily paused for maintenance. Contact us and we'll arrange a live walkthrough.",
  },
};

export function EnterDemoForm({ locale }: { locale: Locale }) {
  const isAr = locale === "ar";
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    enterDemoAction,
    { ok: true },
  );

  const failure = !state.ok ? state.error : null;
  const message = failure ? MESSAGES[failure] ?? MESSAGES.demo_signin_failed : null;

  return (
    <div className="space-y-4">
      <form action={formAction}>
        {/* The locale travels in the payload rather than being read from the
            URL inside the action: the action redirects, and it must land the
            visitor in the language they were reading, not the default. */}
        <input type="hidden" name="locale" value={locale} />
        <button
          type="submit"
          disabled={pending}
          className="group relative inline-flex w-full items-center justify-between gap-3 rounded-2xl bg-[#07425d] ps-6 pe-3 py-4 text-sm font-bold text-white shadow-md shadow-[#07425d]/20 transition-all hover:bg-[#053247] active:translate-y-px disabled:cursor-not-allowed disabled:opacity-70"
        >
          <span>
            {pending
              ? isAr
                ? "جارٍ تجهيز البيئة…"
                : "Preparing the environment…"
              : isAr
                ? "استكشف النسخة التجريبية"
                : "Explore Live Demo"}
          </span>
          <span className="flex size-8 items-center justify-center rounded-xl bg-white/15 text-white transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 rtl:group-hover:-translate-x-0.5">
            {pending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <ArrowUpRight className="size-4" />
            )}
          </span>
        </button>
      </form>

      {message ? (
        <div
          role="alert"
          className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-medium leading-relaxed text-amber-900"
        >
          <p>{isAr ? message.ar : message.en}</p>
          <Link
            href="/demo/request"
            locale={locale}
            className="mt-2 inline-flex items-center gap-1 font-bold text-[#07425d] underline underline-offset-4"
          >
            {isAr ? "اطلب عرضًا مباشرًا" : "Request a live walkthrough"}
            <ArrowUpRight className="size-3.5" />
          </Link>
        </div>
      ) : null}

      <p className="text-center text-[11px] font-medium leading-relaxed text-slate-500">
        {isAr
          ? "بيئة استعراض للقراءة فقط ببيانات افتراضية. لا تحتاج بريدًا إلكترونيًا ولا بطاقة ائتمان."
          : "A read-only showcase environment with fictional data. No email, no credit card."}
      </p>
    </div>
  );
}
