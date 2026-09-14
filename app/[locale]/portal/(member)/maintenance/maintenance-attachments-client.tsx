"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Eye, FileText, ImageIcon, Loader2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient as createBrowserSupabaseClient } from "@/lib/supabase/client";
import {
  abortMaintenanceAttachmentUploadAction,
  beginMaintenanceAttachmentUploadAction,
  finalizeMaintenanceAttachmentUploadAction,
  getMaintenanceAttachmentLinkAction,
} from "@/lib/actions/maintenance";

export type MaintenanceAttachmentKind = "ISSUE" | "BEFORE" | "AFTER" | "INVOICE" | "OTHER";
export type MaintenanceAttachmentVisibility = "STAFF_ONLY" | "MEMBER_VISIBLE";

export type MaintenanceAttachmentItem = {
  id: string;
  kind: MaintenanceAttachmentKind;
  visibility: MaintenanceAttachmentVisibility;
  original_file_name: string;
  mime_type: string;
  byte_size: number;
  created_at: string;
  ready_at: string | null;
  uploaded_by_member_id: string | null;
};

type UploadProgress = {
  total: number;
  uploaded: number;
  failed: number;
  current?: string;
};

type UploadResult = {
  uploaded: number;
  failed: number;
};

const ACCEPTED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;
const ACCEPTED_INPUT = ACCEPTED_MIME_TYPES.join(",");
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_BATCH_FILES = 5;

function labels(locale: "ar" | "en") {
  const isAr = locale === "ar";
  return {
    attachments: isAr ? "المرفقات والصور" : "Photos & Attachments",
    empty: isAr ? "لا توجد مرفقات جاهزة بعد." : "No ready attachments yet.",
    add: isAr ? "إضافة ملفات" : "Add Files",
    upload: isAr ? "رفع الملفات" : "Upload Files",
    view: isAr ? "عرض / تنزيل" : "View / Download",
    remove: isAr ? "إزالة" : "Remove",
    files: isAr ? "ملفات" : "files",
    formats: isAr ? "JPG وPNG وWEBP وPDF حتى 10 ميجابايت للملف." : "JPG, PNG, WEBP, and PDF up to 10 MiB per file.",
    batchLimit: isAr ? "يمكن اختيار 5 ملفات بحد أقصى في المرة الواحدة." : "Select up to 5 files per upload batch.",
    partial: isAr ? "تم إنشاء الطلب، لكن بعض الملفات لم ترفع. يمكنك إعادة المحاولة من هنا." : "The request was created, but some files did not upload. You can retry here.",
    failed: isAr ? "تعذر رفع بعض الملفات." : "Some files could not be uploaded.",
    uploaded: isAr ? "تم رفع الملفات." : "Files uploaded.",
    uploading: isAr ? "جار الرفع" : "Uploading",
    kind: isAr ? "نوع الملف" : "Kind",
    visibility: isAr ? "الظهور" : "Visibility",
    memberVisible: isAr ? "ظاهر للعضو" : "Member visible",
    staffOnly: isAr ? "داخلي فقط" : "Staff only",
    issue: isAr ? "صورة المشكلة" : "Issue",
    before: isAr ? "قبل" : "Before",
    after: isAr ? "بعد" : "After",
    invoice: isAr ? "فاتورة" : "Invoice",
    other: isAr ? "أخرى" : "Other",
  };
}

function formatBytes(value: number, locale: "ar" | "en") {
  const formatter = new Intl.NumberFormat(locale === "ar" ? "ar-EG" : "en-US", {
    maximumFractionDigits: 1,
  });
  if (value >= 1024 * 1024) return `${formatter.format(value / (1024 * 1024))} MiB`;
  return `${formatter.format(value / 1024)} KiB`;
}

function isAcceptedFile(file: File) {
  return ACCEPTED_MIME_TYPES.includes(file.type as (typeof ACCEPTED_MIME_TYPES)[number])
    && file.size > 0
    && file.size <= MAX_FILE_BYTES;
}

export async function uploadMaintenanceFiles({
  requestId,
  files,
  kind,
  visibility,
  onProgress,
}: {
  requestId: string;
  files: File[];
  kind: MaintenanceAttachmentKind;
  visibility: MaintenanceAttachmentVisibility;
  onProgress?: (progress: UploadProgress) => void;
}): Promise<UploadResult> {
  const supabase = createBrowserSupabaseClient();
  let uploaded = 0;
  let failed = 0;

  for (const file of files.slice(0, MAX_BATCH_FILES)) {
    onProgress?.({ total: files.length, uploaded, failed, current: file.name });

    if (!isAcceptedFile(file)) {
      failed += 1;
      continue;
    }

    const intent = await beginMaintenanceAttachmentUploadAction({
      requestId,
      originalFileName: file.name || "attachment",
      mimeType: file.type as (typeof ACCEPTED_MIME_TYPES)[number],
      byteSize: file.size,
      kind,
      visibility,
    });

    if (!intent.ok) {
      failed += 1;
      continue;
    }

    const upload = await supabase.storage
      .from("maintenance-attachments")
      .uploadToSignedUrl(intent.storagePath, intent.token, file, {
        contentType: file.type,
        upsert: false,
      });

    if (upload.error) {
      failed += 1;
      await abortMaintenanceAttachmentUploadAction({ attachmentId: intent.attachmentId });
      continue;
    }

    const finalized = await finalizeMaintenanceAttachmentUploadAction({ attachmentId: intent.attachmentId });
    if (!finalized.ok) {
      failed += 1;
      continue;
    }

    uploaded += 1;
  }

  onProgress?.({ total: files.length, uploaded, failed });
  return { uploaded, failed };
}

function AttachmentCard({
  attachment,
  locale,
  showVisibility,
}: {
  attachment: MaintenanceAttachmentItem;
  locale: "ar" | "en";
  showVisibility: boolean;
}) {
  const t = labels(locale);
  const isImage = attachment.mime_type.startsWith("image/");
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!isImage) return;
    let cancelled = false;
    getMaintenanceAttachmentLinkAction({ attachmentId: attachment.id }).then((result) => {
      if (!cancelled && result.ok) setSignedUrl(result.url);
    });
    return () => {
      cancelled = true;
    };
  }, [attachment.id, isImage]);

  function openAttachment() {
    startTransition(async () => {
      const result = await getMaintenanceAttachmentLinkAction({ attachmentId: attachment.id });
      if (result.ok) {
        setSignedUrl(result.url);
        window.open(result.url, "_blank", "noopener,noreferrer");
      }
    });
  }

  return (
    <article className="overflow-hidden rounded-2xl border border-border/70 bg-background shadow-2xs">
      <div className="flex aspect-video items-center justify-center bg-slate-100 dark:bg-slate-900">
        {isImage && signedUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={signedUrl} alt="" className="h-full w-full object-cover" />
        ) : isImage ? (
          <ImageIcon className="size-9 text-slate-400" />
        ) : (
          <FileText className="size-9 text-slate-400" />
        )}
      </div>
      <div className="space-y-3 p-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-bold text-slate-900 dark:text-white">{attachment.original_file_name}</p>
          <p className="mt-1 text-[11px] text-slate-500">
            {formatBytes(attachment.byte_size, locale)} · {new Date(attachment.created_at).toLocaleDateString(locale === "ar" ? "ar-EG" : "en-US")}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <span className="rounded-full border border-border px-2 py-1 text-[10px] font-bold text-slate-500">{attachment.kind}</span>
          {showVisibility ? (
            <span className="rounded-full border border-border px-2 py-1 text-[10px] font-bold text-slate-500">{attachment.visibility}</span>
          ) : null}
        </div>
        <Button type="button" variant="outline" size="sm" onClick={openAttachment} disabled={isPending} className="h-8 w-full gap-2 rounded-xl text-xs font-semibold">
          {isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Eye className="size-3.5" />}
          {t.view}
        </Button>
      </div>
    </article>
  );
}

export function MaintenanceAttachmentsPanel({
  requestId,
  attachments,
  locale,
  canUpload,
  showVisibility = false,
  initialNotice,
  allowedKinds,
  defaultKind = "ISSUE",
  defaultVisibility = "MEMBER_VISIBLE",
  canChooseVisibility = false,
}: {
  requestId: string;
  attachments: MaintenanceAttachmentItem[];
  locale: "ar" | "en";
  canUpload: boolean;
  showVisibility?: boolean;
  initialNotice?: "partial-upload" | null;
  allowedKinds: MaintenanceAttachmentKind[];
  defaultKind?: MaintenanceAttachmentKind;
  defaultVisibility?: MaintenanceAttachmentVisibility;
  canChooseVisibility?: boolean;
}) {
  const t = labels(locale);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [kind, setKind] = useState<MaintenanceAttachmentKind>(defaultKind);
  const [visibility, setVisibility] = useState<MaintenanceAttachmentVisibility>(defaultVisibility);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [message, setMessage] = useState<"ok" | "failed" | "partial" | null>(
    initialNotice === "partial-upload" ? "partial" : null,
  );
  const [isPending, startTransition] = useTransition();

  const validFiles = useMemo(() => files.filter(isAcceptedFile), [files]);
  const kindLabels = {
    ISSUE: t.issue,
    BEFORE: t.before,
    AFTER: t.after,
    INVOICE: t.invoice,
    OTHER: t.other,
  } satisfies Record<MaintenanceAttachmentKind, string>;

  function onSelect(nextFiles: FileList | null) {
    if (!nextFiles) return;
    setFiles(Array.from(nextFiles).slice(0, MAX_BATCH_FILES));
    setMessage(null);
  }

  function uploadSelected() {
    if (validFiles.length === 0) return;
    startTransition(async () => {
      const result = await uploadMaintenanceFiles({
        requestId,
        files: validFiles,
        kind,
        visibility: canChooseVisibility ? visibility : defaultVisibility,
        onProgress: setProgress,
      });
      setFiles([]);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setMessage(result.failed > 0 ? "failed" : "ok");
    });
  }

  return (
    <section className="space-y-4 rounded-2xl border border-border/70 bg-card p-4 shadow-2xs">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-sm font-bold text-slate-950 dark:text-white">{t.attachments}</h2>
          <p className="text-xs text-slate-500">{t.formats}</p>
        </div>
        {canUpload ? (
          <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} className="h-9 gap-2 rounded-xl text-xs font-semibold">
            <Upload className="size-4" />
            {t.add}
          </Button>
        ) : null}
      </div>

      {attachments.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/70 bg-background p-6 text-center text-xs text-slate-500">
          {t.empty}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {attachments.map((attachment) => (
            <AttachmentCard key={attachment.id} attachment={attachment} locale={locale} showVisibility={showVisibility} />
          ))}
        </div>
      )}

      {canUpload ? (
        <div className="space-y-3 rounded-2xl border border-dashed border-border/70 bg-background p-3">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={ACCEPTED_INPUT}
            className="sr-only"
            onChange={(event) => onSelect(event.target.files)}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-xs font-semibold text-slate-600">
              <span>{t.kind}</span>
              <select value={kind} onChange={(event) => setKind(event.target.value as MaintenanceAttachmentKind)} className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm">
                {allowedKinds.map((item) => <option key={item} value={item}>{kindLabels[item]}</option>)}
              </select>
            </label>
            {canChooseVisibility ? (
              <label className="space-y-1 text-xs font-semibold text-slate-600">
                <span>{t.visibility}</span>
                <select value={visibility} onChange={(event) => setVisibility(event.target.value as MaintenanceAttachmentVisibility)} className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm">
                  <option value="MEMBER_VISIBLE">{t.memberVisible}</option>
                  <option value="STAFF_ONLY">{t.staffOnly}</option>
                </select>
              </label>
            ) : null}
          </div>

          <p className="text-[11px] text-slate-500">{t.batchLimit}</p>

          {files.length > 0 ? (
            <div className="space-y-2">
              {files.map((file) => (
                <div key={`${file.name}-${file.size}-${file.lastModified}`} className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-card px-3 py-2 text-xs">
                  <span className={`truncate font-semibold ${isAcceptedFile(file) ? "text-slate-700 dark:text-slate-200" : "text-rose-600"}`}>
                    {file.name} · {formatBytes(file.size, locale)}
                  </span>
                  <button
                    type="button"
                    onClick={() => setFiles((current) => current.filter((item) => item !== file))}
                    className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                    aria-label={t.remove}
                  >
                    <X className="size-4" />
                  </button>
                </div>
              ))}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[11px] font-semibold text-slate-400">
              {progress?.current ? `${t.uploading}: ${progress.current}` : `${validFiles.length} ${t.files}`}
            </p>
            <Button type="button" onClick={uploadSelected} disabled={isPending || validFiles.length === 0} className="h-9 gap-2 rounded-xl text-xs font-semibold">
              {isPending ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
              {t.upload}
            </Button>
          </div>
        </div>
      ) : null}

      {message ? (
        <p className={`text-xs font-semibold ${message === "ok" ? "text-emerald-600" : "text-amber-600"}`}>
          {message === "ok" ? t.uploaded : message === "partial" ? t.partial : t.failed}
        </p>
      ) : null}
    </section>
  );
}
