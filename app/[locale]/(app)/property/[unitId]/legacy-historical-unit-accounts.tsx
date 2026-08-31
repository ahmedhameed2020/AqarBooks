import { History, ShieldAlert } from "lucide-react";
import { Link } from "@/i18n/navigation";

export interface HistoricalUnitFinancialAccount {
  account_id: string;
  account_code: string;
  legacy_account_name: string;
  posted_debit: number;
  posted_credit: number;
  posted_net: number;
  last_activity_date: string | null;
  link_scope: "HISTORICAL_UNIT_ONLY";
  warning_text: string;
}

export function LegacyHistoricalUnitAccounts({
  accounts,
  locale,
  currency,
}: {
  accounts: HistoricalUnitFinancialAccount[];
  locale: string;
  currency: string;
}) {
  if (!accounts.length) return null;

  const isAr = locale === "ar";
  const fmt = (value: number) =>
    Number(value).toLocaleString(isAr ? "ar-EG" : "en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  return (
    <section className="overflow-hidden rounded-2xl border border-amber-300 bg-white shadow-sm dark:border-amber-900/70 dark:bg-slate-900">
      <div className="border-b border-amber-200 bg-amber-50/90 p-5 dark:border-amber-900/60 dark:bg-amber-950/25">
        <div className="flex items-start gap-3">
          <ShieldAlert className="mt-0.5 size-5 shrink-0 text-amber-700 dark:text-amber-400" />
          <div>
            <div className="flex items-center gap-2">
              <History className="size-4 text-amber-700 dark:text-amber-400" />
              <h2 className="text-sm font-black text-slate-950 dark:text-white">
                {isAr ? "حسابات تاريخية مرتبطة بالوحدة فقط" : "Historical unit-only accounts"}
              </h2>
            </div>
            <p className="mt-2 max-w-4xl text-xs font-bold text-amber-900 dark:text-amber-200">
              {isAr
                ? "هذه الحسابات تخص تاريخ الوحدة في النظام القديم ولم تُنقل إلى المالك الحالي. ظهورها هنا مرجع تدقيقي فقط ولا يعني أن رصيدها مديونية أو رصيدًا للمالك الحالي."
                : "These accounts belong to the unit's legacy history and were not inherited by the current owner. They are shown for audit reference only and do not automatically represent the current owner's debt or credit."}
            </p>
          </div>
        </div>
      </div>

      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {accounts.map((account) => (
          <div
            key={account.account_id}
            className="grid gap-3 p-4 text-xs lg:grid-cols-[minmax(0,1.5fr)_repeat(3,minmax(120px,0.6fr))_auto] lg:items-center"
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono font-black text-amber-700 dark:text-amber-400">
                  {account.account_code}
                </span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  {account.legacy_account_name.trim()}
                </span>
              </div>
              <p className="mt-1 text-[11px] font-semibold text-slate-500">
                {isAr ? "آخر حركة:" : "Last activity:"} {account.last_activity_date || "—"}
              </p>
            </div>
            <Amount label={isAr ? "مدين تاريخي" : "Legacy debit"} value={fmt(account.posted_debit)} currency={currency} />
            <Amount label={isAr ? "دائن تاريخي" : "Legacy credit"} value={fmt(account.posted_credit)} currency={currency} />
            <Amount label={isAr ? "صافي تاريخي" : "Legacy net"} value={fmt(account.posted_net)} currency={currency} />
            <Link
              href={`/finance/reports/general-ledger?accountId=${account.account_id}`}
              className="font-bold text-amber-800 hover:underline dark:text-amber-300"
            >
              {isAr ? "فتح الأستاذ" : "Open ledger"}
            </Link>
          </div>
        ))}
      </div>
    </section>
  );
}

function Amount({ label, value, currency }: { label: string; value: string; currency: string }) {
  return (
    <div>
      <p className="text-[10px] font-semibold text-slate-500">{label}</p>
      <p className="mt-0.5 font-mono font-black text-slate-950 dark:text-white">
        {value} <span className="text-[10px] font-semibold text-slate-500">{currency}</span>
      </p>
    </div>
  );
}
