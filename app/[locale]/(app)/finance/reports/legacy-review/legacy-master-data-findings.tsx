import { AlertTriangle, Building2, Landmark, ShieldAlert, Truck } from "lucide-react";
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
  const bankCount = findings.filter((finding) => finding.finding_type === "BANK_ACCOUNT_IDENTIFIER_MISSING").length;
  const receivableCount = findings.filter((finding) => finding.finding_type === "RECEIVABLE_ACCOUNT_OUTSIDE_PROPERTY_MASTER").length;
  const supplierCount = findings.filter((finding) => finding.finding_type === "PAYABLE_COUNTERPARTY_OUTSIDE_SUPPLIER_MASTER").length;

  return (
    <section className="overflow-hidden rounded-2xl border border-amber-200 bg-white shadow-sm dark:border-amber-900/60 dark:bg-slate-900">
      <div className="border-b border-amber-100 bg-amber-50/80 p-5 dark:border-amber-900/50 dark:bg-amber-950/20">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-3">
            <ShieldAlert className="mt-0.5 size-5 shrink-0 text-amber-700 dark:text-amber-400" />
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-amber-700 dark:text-amber-400">
                {isAr ? "سلامة البيانات الرئيسية المالية" : "Financial master-data integrity"}
              </p>
              <h2 className="mt-1 text-lg font-black text-slate-950 dark:text-white">
                {isAr ? "فجوات تشغيلية لا يجوز استنتاج بياناتها من دفتر الأستاذ" : "Operational gaps that must not be inferred from the ledger"}
              </h2>
              <p className="mt-2 max-w-3xl text-xs font-semibold leading-6 text-slate-600 dark:text-slate-300">
                {isAr
                  ? "دفتر الأستاذ محفوظ كما هو. هذه الحالات تحتاج مستندًا أو اعتمادًا إداريًا قبل إنشاء Bank Account أو Unit أو Owner Link أو Supplier. لا يستخدم AqarBooks اسم الحساب كبديل عن بيانات Master Data المفقودة."
                  : "The general ledger remains unchanged. These cases require documentary or management approval before creating a bank account, unit, owner link, or supplier. AqarBooks does not substitute GL names for missing master data."}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-xs font-black">
            <span className="rounded-full border border-amber-300 bg-white px-3 py-1 text-amber-800 dark:bg-amber-950">
              {isAr ? `${open.length} مفتوحة` : `${open.length} open`}
            </span>
            {high > 0 && (
              <span className="rounded-full border border-rose-300 bg-rose-50 px-3 py-1 text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
                {isAr ? `${high} عالية` : `${high} high`}
              </span>
            )}
            {bankCount > 0 && <CountBadge label={isAr ? `${bankCount} بنوك` : `${bankCount} bank`} tone="cyan" />}
            {receivableCount > 0 && <CountBadge label={isAr ? `${receivableCount} ذمم/وحدات` : `${receivableCount} receivable`} tone="violet" />}
            {supplierCount > 0 && <CountBadge label={isAr ? `${supplierCount} موردين/AP` : `${supplierCount} supplier/AP`} tone="blue" />}
          </div>
        </div>
      </div>

      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {findings.map((finding) => {
          const accountId = typeof finding.evidence.gl_account_id === "string" ? finding.evidence.gl_account_id : null;
          const accountName = typeof finding.evidence.gl_account_name === "string" ? finding.evidence.gl_account_name : finding.entity_key;
          const rawBalance = Number(finding.evidence.gl_balance ?? 0);
          const lastActivity = typeof finding.evidence.last_activity_date === "string" ? finding.evidence.last_activity_date : null;
          const sourceSector = typeof finding.evidence.legacy_source_sector === "string" ? finding.evidence.legacy_source_sector : null;
          const sourceSectorTitle = typeof finding.evidence.legacy_source_sector_title === "string" ? finding.evidence.legacy_source_sector_title : null;
          const sourceUnit = typeof finding.evidence.legacy_source_unit === "string" ? finding.evidence.legacy_source_unit : null;
          const balance = rawBalance.toLocaleString(isAr ? "ar-EG" : "en-US", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          });
          const isHigh = finding.severity === "HIGH";
          const isBank = finding.finding_type === "BANK_ACCOUNT_IDENTIFIER_MISSING";
          const isSupplier = finding.finding_type === "PAYABLE_COUNTERPARTY_OUTSIDE_SUPPLIER_MASTER";

          return (
            <article key={finding.finding_id} className="p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    {isBank ? (
                      <Landmark className="size-4 text-cyan-700" />
                    ) : isSupplier ? (
                      <Truck className="size-4 text-blue-700" />
                    ) : (
                      <Building2 className="size-4 text-violet-700" />
                    )}
                    {isHigh ? <ShieldAlert className="size-4 text-rose-600" /> : <AlertTriangle className="size-4 text-amber-600" />}
                    <span className="font-mono text-sm font-black text-slate-950 dark:text-white">{finding.entity_key}</span>
                    <span className="text-xs font-bold text-slate-600 dark:text-slate-300">{accountName}</span>
                    <FindingTypeBadge findingType={finding.finding_type} locale={locale} />
                    <SeverityBadge severity={finding.severity} locale={locale} />
                  </div>

                  {!isBank && !isSupplier && (sourceSector || sourceUnit) && (
                    <p className="mt-2 text-xs font-semibold text-violet-700 dark:text-violet-300">
                      {isAr ? "مرجع المصدر القديم:" : "Legacy source reference:"}{" "}
                      {[sourceSectorTitle, sourceSector, sourceUnit].filter(Boolean).join(" · ")}
                    </p>
                  )}

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
                      {isAr ? "المستند/الاعتماد المطلوب:" : "Required evidence / approval:"}
                    </p>
                    <p className="mt-1 font-medium text-slate-600 dark:text-slate-300">
                      {isAr ? requestedEvidenceAr(finding.finding_type) : finding.requested_evidence}
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

function requestedEvidenceAr(findingType: string) {
  if (findingType === "BANK_ACCOUNT_IDENTIFIER_MISSING") {
    return "كشف حساب بنكي رسمي أو مستند فتح الحساب يوضح اسم البنك ورقم الحساب أو IBAN والعملة وما إذا كان الحساب ما زال نشطًا.";
  }
  if (findingType === "RECEIVABLE_ACCOUNT_OUTSIDE_PROPERTY_MASTER") {
    return "كشف معتمد للوحدات/الملكية أو إفادة من الإدارة تحدد هل القطاع أو الوحدة ما زالت ضمن نطاق الإدارة الحالي. إذا كانت ضمن النطاق يلزم تحديد الوحدة والمالك/العضو الحالي للربط الصريح، وإذا كانت خارج النطاق يلزم اعتماد تصنيفها كذمة تاريخية أو خارجية دون إنشاء ملكية حالية.";
  }
  if (findingType === "PAYABLE_COUNTERPARTY_OUTSIDE_SUPPLIER_MASTER") {
    return "كشف معتمد بالجهة الدائنة أو ملف المورد. إذا كان الالتزام ما زال تشغيليًا يلزم تحديد الكيان القانوني وبيانات المورد اللازمة لإعداده صراحة في AP. وإذا كان تاريخيًا أو GL-only يلزم اعتماد هذا التصنيف دون إنشاء مورد من اسم الحساب فقط.";
  }
  return "مستند مؤيد أو اعتماد إداري يحدد المعالجة الصحيحة دون استنتاج بيانات جديدة من القيد المحاسبي.";
}

function FindingTypeBadge({ findingType, locale }: { findingType: string; locale: string }) {
  const isAr = locale === "ar";
  if (findingType === "BANK_ACCOUNT_IDENTIFIER_MISSING") {
    return <TypeBadge label={isAr ? "حساب بنكي" : "Bank account"} tone="cyan" />;
  }
  if (findingType === "PAYABLE_COUNTERPARTY_OUTSIDE_SUPPLIER_MASTER") {
    return <TypeBadge label={isAr ? "مورد/AP خارج الماستر" : "Outside Supplier/AP master"} tone="blue" />;
  }
  return <TypeBadge label={isAr ? "ذمة خارج Property Master" : "Outside property master"} tone="violet" />;
}

function TypeBadge({ label, tone }: { label: string; tone: "cyan" | "blue" | "violet" }) {
  const styles = tone === "cyan"
    ? "border-cyan-300 bg-cyan-50 text-cyan-800 dark:border-cyan-900 dark:bg-cyan-950/40 dark:text-cyan-300"
    : tone === "blue"
      ? "border-blue-300 bg-blue-50 text-blue-800 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300"
      : "border-violet-300 bg-violet-50 text-violet-800 dark:border-violet-900 dark:bg-violet-950/40 dark:text-violet-300";
  return <span className={`rounded-full border px-2 py-0.5 text-[10px] font-black ${styles}`}>{label}</span>;
}

function CountBadge({ label, tone }: { label: string; tone: "cyan" | "blue" | "violet" }) {
  const styles = tone === "cyan"
    ? "border-cyan-300 bg-cyan-50 text-cyan-800 dark:border-cyan-900 dark:bg-cyan-950/40 dark:text-cyan-300"
    : tone === "blue"
      ? "border-blue-300 bg-blue-50 text-blue-800 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300"
      : "border-violet-300 bg-violet-50 text-violet-800 dark:border-violet-900 dark:bg-violet-950/40 dark:text-violet-300";
  return <span className={`rounded-full border px-3 py-1 ${styles}`}>{label}</span>;
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
