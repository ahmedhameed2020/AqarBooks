import "server-only";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { exitDemoAction } from "@/lib/actions/demo";
import { Eye, ArrowUpRight, LogOut } from "lucide-react";

/**
 * The persistent "you are in the demo" indicator.
 *
 * A Server Component on purpose. It carries no state, and keeping it off the
 * client boundary means the sign-out form action can be passed straight to
 * `<form action>` without a client wrapper -- and avoids the pitfall where a
 * value imported from a "use client" module into a Server Component silently
 * resolves to undefined.
 *
 * WHY IT IS A BAR AND NOT A MODAL
 * The spec asks for a tasteful, non-intrusive indicator (§17). A visitor
 * evaluating an accounting system is reading numbers; anything that overlays
 * them, or has to be dismissed before each screen, competes with the product
 * for attention. A single strip above the header states the fact once, stays
 * visible, and carries the one action a convinced visitor wants next.
 */
export function DemoBanner({ locale }: { locale: Locale }) {
  const isAr = locale === "ar";

  return (
    <div className="border-b border-[#07425d]/20 bg-[#07425d] text-white print:hidden">
      <div className="mx-auto flex max-w-full flex-wrap items-center justify-between gap-x-4 gap-y-2 px-3.5 py-2 sm:px-6">
        <div className="flex min-w-0 items-center gap-2">
          <Eye className="size-3.5 shrink-0 text-white/70" />
          <p className="truncate text-[11px] font-bold sm:text-xs">
            {isAr
              ? "أنت تستعرض بيئة AqarBooks التجريبية — بيانات افتراضية، للقراءة فقط"
              : "You are exploring the AqarBooks demo environment — fictional data, read-only"}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <Link
            href="/pricing"
            locale={locale}
            className="inline-flex items-center gap-1 rounded-lg bg-white px-2.5 py-1 text-[11px] font-bold text-[#07425d] transition-colors hover:bg-white/90"
          >
            {isAr ? "اختر باقتك" : "View plans"}
            <ArrowUpRight className="size-3" />
          </Link>

          <form action={exitDemoAction}>
            <input type="hidden" name="locale" value={locale} />
            <button
              type="submit"
              className="inline-flex items-center gap-1 rounded-lg border border-white/25 px-2.5 py-1 text-[11px] font-bold text-white/90 transition-colors hover:bg-white/10"
            >
              <LogOut className="size-3" />
              <span className="hidden sm:inline">
                {isAr ? "إنهاء الاستعراض" : "Exit demo"}
              </span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
