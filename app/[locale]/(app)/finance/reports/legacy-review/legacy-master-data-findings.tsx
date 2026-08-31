import { AlertTriangle, Landmark, ShieldAlert } from "lucide-react";
import { Link } from "@/i18n/navigation";

export interface LegacyMasterDataFinding {
  finding_id: number;
  finding_type: string;
  severity: "LOW" | "MEDIUM" | "HIGH";
  status: "OPEN" | "RESOLVED" | "DISMISSED";
  entity_type: string;
  entity_key: string;
  title: string;
  requested_evidence: string;
  evidence: Record<string, unknown>;
  created_at: string;
}

export function LegacyMasterDataFindings({
  findings,
  locale,
  currency,
}: {
  findings: LegacyMasterDataFinding[];
  locale: string;
  currency: string;
}) {
  if (!findings.length) return null;

  const isAr = locale === "ar";
  const open = findings.filter((finding) => finding.status === "OPEN");
  const high = open.filter((finding) => finding.severity === "HIGH").length;

  return (
    <section className="overflow-hidden rounded-2xl border border-amber-200 bg-white shadow-sm dark:border-amber-900/60 dark:bg-slate-900">
      <div className="border-b border-amber-100 bg-amber-50/80 p-5 dark:border-amber-900/50 dark:bg-amber-950/20">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-3">
            <Landmark className="mt-0.5 size-5 shrink-0 text-amber-700 dark:text-amber-400" />
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-amber-700 dark:text-amber-400">
                {isAr ? "سلامة البيانات الرئيسية المالية" : "Financial master-data integrity"}
              </p>
              <h2 className="mt-1 text-lg font-black text-slate-950 dark:text-white">
                {isAr ? "حسابات بنكية في دفتر الأستاذ غير مكتملة الإعداد التشغيلي" : "Legacy GL bank accounts missing operational setup"}
              </h2>
              <p className="mt-2 max-w-3xl text-xs font-semibold leading-6 text-slate-600 dark:text-slate-300">
                {isAr
                  ? "تم العثور على الحسابات البنكية في دفتر الأستاذ، لكن المصدر القديم لا يحتوي رقم الحساب أو IBAN بشكل موثوق. لن ينشئ AqarBooks رقمًا بديلًا من كود الحساب أو أرقام الشيكات."
                  : "The bank accounts exist in the general ledger, but the legacy source does not provide a reliable account number or IBAN. AqarBooks will not fabricate one from GL codes or cheque references."}
              </p>
            </div>
          </div>
          <div className="flex gap-2 text-xs font-black">
            <span className="rounded-full border border-amber-300 bg-white px-3 py-1 text-amber-800 dark:bg-amber-950">
              {isAr ? `${open.length} مفتوحة` : `${open.length} open`}
            </span>
            {high > 0 && (
              <span className="rounded-full border border-rose-300 bg-rose-50 px-3 py-1 text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
                {isAr ? `${high} عالية` : `${high} high`}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {findings.map((finding) => {
          const accountId = typeof finding.evidence.gl_account_id === "string" ? finding.evidence.gl_account_id : null;
          const accountName = typeof finding.evidence.gl_account_name === "string" ? finding.evidence.gl_account_name : finding.entity_key;
          const rawBalance = Number(finding.evidence.gl_balance ?? 0);
          const lastActivity = typeof finding.evidence.last_activity_date === "string" ? finding.evidence.last_activity_date : null;
          const balance = rawBalance.toLocaleString(isAr ? "ar-EG" : "en-US", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          });
          const isHigh = finding.severity === "HIGH";

          return (
            <article key={finding.finding_id} className="p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    {isHigh ? (
                      <ShieldAlert className="size-4 text-rose-600" />
                    ) : (
                      <AlertTriangle className="size-4 text-amber-600" />
                    )}
                    <span className="font-mono text-sm font-black text-slate-950 dark:text-white">{finding.entity_key}</span>
                    <span className="text-xs font-bold text-slate-600 dark:text-slate-300">{accountName}</span>
                    <SeverityBadge severity={finding.severity} locale={locale} />
                  </div>
                  <p className="mt-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
                    {isAr ? "الرصيد في دفتر الأستاذ:" : "General-ledger balance:"}{" "}
                    <span className="font-mono font-black text-slate-950 dark:text-white">{balance} {currency}</span>
                    {lastActivity && (
                      <span className="ms-2 text-slate-500">
                        {isAr ? `آخر حركة: ${lastActivity}` : `Last activity: ${lastActivity}`}
                      </span>
                    )}
                  </p>
                  <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs leading-6 dark:border-slate-800 dark:bg-slate-950/50">
                    <p className="font-black text-slate-800 dark:text-slate-200">
                      {isAr ? "المستند المطلوب:" : "Required evidence:"}
                    </p>
                    <p className="mt-1 font-medium text-slate-600 dark:text-slate-300">
                      {isAr
                        ? "كشف حساب بنكي رسمي أو مستند فتح الحساب يوضح اسم البنك ورقم الحساب أو IBAN والعملة وما إذا كان الحساب ما زال نشطًا."
                        : finding.requested_evidence}
                    </p>
                  </div>
                </div>
                {accountId && (
                  <Link
                    href={`/finance/reports/general-ledger?accountId=${accountId}`}
                    className="shrink-0 text-xs font-black text-cyan-700 hover:underline dark:text-cyan-400"
                  >
                    {isAr ? "فتح دفتر الأستاذ" : "Open general ledger"}
                  </Link>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function SeverityBadge({ severity, locale }: { severity: LegacyMasterDataFinding["severity"]; locale: string }) {
  const isAr = locale === "ar";
  const styles = severity === "HIGH"
    ? "border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300"
    : severity === "MEDIUM"
      ? "border-orange-300 bg-orange-50 text-orange-800 dark:border-orange-900 dark:bg-orange-950/40 dark:text-orange-300"
      : "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300";

  const label = isAr
    ? severity === "HIGH" ? "عالية" : severity === "MEDIUM" ? "متوسطة" : "منخفضة"
    : severity;

  return <span className={`rounded-full border px-2 py-0.5 text-[10px] font-black ${styles}`}>{label}</span>;
}
