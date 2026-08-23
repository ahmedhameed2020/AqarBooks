"use client";

import { useMemo, useState, useTransition } from "react";
import {
  AlertCircle,
  Download,
  FileArchive,
  FileImage,
  FileText,
  FolderOpen,
  Landmark,
  Loader2,
  Receipt,
  Building2,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button, buttonVariants } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import {
  getOwnDocumentLinkAction,
  type OwnDocumentItem,
} from "@/lib/actions/member-portal-documents";
import { EmptyState, PortalPageHeader, SearchBox } from "../portal-ui";

function formatSize(bytes: number | null, isAr: boolean): string {
  if (bytes === null || bytes <= 0) return "—";
  const units = isAr ? ["بايت", "ك.ب", "م.ب", "ج.ب"] : ["B", "KB", "MB", "GB"];
  let value = bytes;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function iconFor(mime: string | null) {
  if (!mime) return <FileText className="size-4" />;
  if (mime.startsWith("image/")) return <FileImage className="size-4" />;
  if (mime.includes("zip") || mime.includes("rar")) return <FileArchive className="size-4" />;
  return <FileText className="size-4" />;
}

export function PortalDocumentsClient({
  documents,
  loadFailed,
  locale,
}: {
  documents: OwnDocumentItem[];
  loadFailed: boolean;
  locale: string;
}) {
  const isAr = locale === "ar";
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return documents;
    return documents.filter((d) => d.fileName.toLowerCase().includes(q));
  }, [documents, query]);

  function handleOpen(doc: OwnDocumentItem) {
    setOpeningId(doc.id);
    startTransition(async () => {
      const res = await getOwnDocumentLinkAction(doc.id);
      setOpeningId(null);
      if (!res.ok) {
        toast.add({
          title: isAr ? "تعذر فتح المستند" : "Could not open the document",
          description:
            res.error === "not_found"
              ? isAr
                ? "هذا المستند لم يعد متاحًا على حسابك."
                : "This document is no longer available on your account."
              : isAr
                ? "حدث خطأ أثناء تجهيز رابط التحميل. يرجى المحاولة مرة أخرى."
                : "Something went wrong preparing the download link. Please try again.",
          type: "error",
        });
        return;
      }
      // A signed, short-lived URL -- opened rather than embedded so the
      // browser applies its own handling per file type.
      window.open(res.url, "_blank", "noopener,noreferrer");
    });
  }

  // Documents an owner can produce for themselves at any moment. These are not
  // stored files; they are generated live from the same ledger the screens
  // read, which is why they can never be stale.
  const generated = [
    {
      href: "/portal/statement",
      icon: <FileText className="size-4 text-indigo-500" />,
      titleAr: "كشف الحساب المالي",
      titleEn: "Account statement",
      descAr: "كل الحركات والرصيد الجاري، بفترة مخصصة، PDF أو Excel.",
      descEn: "All movements with a running balance, over any period, as PDF or Excel.",
    },
    {
      href: "/portal/payments",
      icon: <Receipt className="size-4 text-emerald-500" />,
      titleAr: "سندات السداد والإيصالات",
      titleEn: "Receipts & payment vouchers",
      descAr: "إيصال رسمي مستقل لكل سند، أو سجل السندات كاملًا.",
      descEn: "An official receipt per payment, or the full receipts ledger.",
    },
    {
      href: "/portal/dues",
      icon: <Landmark className="size-4 text-rose-500" />,
      titleAr: "بيان المستحقات المفتوحة",
      titleEn: "Open dues statement",
      descAr: "المطالبات القائمة وأعمارها والمتبقي على كل منها.",
      descEn: "Outstanding charges, their aging, and what remains on each.",
    },
    {
      href: "/portal/units",
      icon: <Building2 className="size-4 text-purple-500" />,
      titleAr: "بيان المحفظة العقارية",
      titleEn: "Portfolio schedule",
      descAr: "الوحدات وبياناتها الفنية ونسب الملكية والموقف المالي.",
      descEn: "Units, specifications, ownership shares, and financial position.",
    },
  ];

  return (
    <div className="space-y-6">
      <PortalPageHeader
        title={isAr ? "المستندات" : "Documents"}
        description={
          isAr
            ? "المرفقات المحفوظة على ملفك لدى إدارة الكيان، إضافة إلى المستندات الرسمية التي يمكنك إصدارها بنفسك في أي وقت."
            : "Files held on your record by management, alongside the official documents you can issue for yourself at any time."
        }
      />

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              {isAr ? "مستندات محفوظة على ملفك" : "Files on your record"}
            </h2>
            <p className="text-xs text-slate-500">
              {isAr
                ? "عقود ومرفقات رفعتها إدارة الكيان على حسابك. الروابط مؤقتة وصالحة لخمس دقائق فقط."
                : "Contracts and attachments uploaded to your account by management. Links are temporary and valid for five minutes."}
            </p>
          </div>
          {documents.length > 0 ? (
            <SearchBox
              locale={locale}
              value={query}
              onChange={setQuery}
              placeholder={isAr ? "ابحث باسم الملف" : "Search by file name"}
            />
          ) : null}
        </div>

        {loadFailed ? (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300"
          >
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <span>
              {isAr
                ? "تعذر تحميل قائمة المستندات المحفوظة على ملفك. يرجى تحديث الصفحة، وإذا تكرر الأمر تواصل مع إدارة الكيان."
                : "Could not load the files held on your record. Refresh the page, and if this persists contact management."}
            </span>
          </div>
        ) : visible.length === 0 ? (
          <EmptyState
            icon={<FolderOpen className="size-5" />}
            title={
              documents.length === 0
                ? isAr
                  ? "لا توجد مستندات محفوظة على ملفك"
                  : "No files on your record"
                : isAr
                  ? "لا توجد ملفات مطابقة"
                  : "No matching files"
            }
            description={
              documents.length === 0
                ? isAr
                  ? "لم ترفع إدارة الكيان أي عقود أو مرفقات على حسابك حتى الآن. يمكنك في الوقت نفسه إصدار مستنداتك المالية الرسمية من القسم أدناه."
                  : "Management has not uploaded any contracts or attachments to your account yet. In the meantime, you can issue your official financial documents from the section below."
                : isAr
                  ? "لا توجد ملفات تطابق كلمة البحث."
                  : "No files match your search term."
            }
          />
        ) : (
          <ul className="divide-y divide-border/40 overflow-hidden rounded-2xl border border-border/70 bg-card">
            {visible.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-slate-50 text-slate-500 dark:bg-slate-900">
                    {iconFor(d.mimeType)}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                      {d.fileName}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {formatSize(d.fileSize, isAr)} ·{" "}
                      {isAr ? "أُضيف في" : "Added"} {d.uploadedAt.slice(0, 10)}
                    </p>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={openingId === d.id}
                  onClick={() => handleOpen(d)}
                  className="h-9 gap-1.5 rounded-xl text-xs font-semibold"
                >
                  {openingId === d.id ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Download className="size-3.5 text-indigo-500" />
                  )}
                  <span>{isAr ? "فتح المستند" : "Open"}</span>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-sm font-bold text-slate-900 dark:text-white">
            {isAr ? "مستندات رسمية تُصدرها بنفسك" : "Documents you can issue yourself"}
          </h2>
          <p className="text-xs text-slate-500">
            {isAr
              ? "تُولَّد لحظيًا من نفس دفاتر الحسابات التي تقرأ منها الشاشات، فلا يمكن أن تكون قديمة أو مخالفة لها."
              : "Generated live from the same ledgers the screens read, so they can never be stale or disagree with them."}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {generated.map((g) => (
            <Link
              key={g.href}
              href={g.href}
              locale={locale}
              className="group flex items-start gap-3 rounded-2xl border border-border/70 bg-card p-4 transition-colors hover:border-indigo-500/40"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-slate-50 dark:bg-slate-900">
                {g.icon}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-slate-900 group-hover:text-indigo-600 dark:text-white dark:group-hover:text-indigo-400">
                  {isAr ? g.titleAr : g.titleEn}
                </span>
                <span className="block text-[11px] leading-relaxed text-slate-500">
                  {isAr ? g.descAr : g.descEn}
                </span>
              </span>
            </Link>
          ))}
        </div>

        <div className="rounded-2xl border border-border/60 bg-slate-50 p-4 dark:bg-slate-900/50">
          <p className="text-[11px] leading-relaxed text-slate-500">
            {isAr
              ? "لطلب مستند رسمي غير متاح هنا — مثل شهادة براءة ذمة أو صورة معتمدة من العقد — يُرجى التواصل مع إدارة الكيان، وسيظهر المستند في هذه الصفحة فور رفعه على ملفك."
              : "To request an official document that is not available here — a clearance certificate or a certified copy of your contract, for instance — contact management. It will appear on this page as soon as it is uploaded to your record."}
          </p>
          <Link
            href="/portal/profile"
            locale={locale}
            className={buttonVariants({
              variant: "outline",
              size: "sm",
              className: "mt-3 h-9 rounded-xl text-xs font-semibold",
            })}
          >
            {isAr ? "عرض بيانات التواصل" : "View contact details"}
          </Link>
        </div>
      </section>
    </div>
  );
}
