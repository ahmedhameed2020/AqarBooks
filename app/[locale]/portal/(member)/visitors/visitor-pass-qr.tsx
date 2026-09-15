"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Copy, Download, QrCode } from "lucide-react";
import { Button } from "@/components/ui/button";

export function VisitorPassQr({
  payload,
  locale,
}: {
  payload: string;
  locale: "ar" | "en";
}) {
  const isAr = locale === "ar";
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(payload, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 260,
      color: { dark: "#0f172a", light: "#ffffff" },
    }).then((url) => {
      if (!cancelled) setSrc(url);
    });
    return () => {
      cancelled = true;
    };
  }, [payload]);

  async function copyPayload() {
    await navigator.clipboard?.writeText(payload);
  }

  return (
    <div className="space-y-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.04] p-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="flex size-[260px] shrink-0 items-center justify-center rounded-2xl border border-border/70 bg-white p-3 shadow-2xs">
          {src ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={src} alt={isAr ? "رمز QR لتصريح الزائر" : "Visitor pass QR code"} className="h-full w-full" />
          ) : (
            <QrCode className="size-10 text-slate-400" />
          )}
        </div>
        <div className="min-w-0 space-y-2">
          <p className="text-sm font-bold text-slate-950 dark:text-white">
            {isAr ? "احفظ هذا الرمز الآن" : "Save this pass now"}
          </p>
          <p className="max-w-md text-xs leading-relaxed text-slate-600 dark:text-slate-300">
            {isAr
              ? "لا يتم تخزين الرمز السري بصيغته الأصلية داخل AqarBooks. يمكنك نسخه أو تنزيل صورة QR من هنا فقط."
              : "AqarBooks stores only the secret hash. Copy or download this QR now; the raw pass cannot be recovered later."}
          </p>
          <code className="block max-w-full overflow-x-auto rounded-xl bg-white/80 p-3 text-[11px] text-slate-700 dark:bg-slate-950 dark:text-slate-200">
            {payload}
          </code>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={copyPayload} className="h-9 gap-2 rounded-xl text-xs font-semibold">
              <Copy className="size-4" />
              {isAr ? "نسخ الرمز" : "Copy"}
            </Button>
            {src ? (
              <a
                href={src}
                download="visitor-pass-qr.png"
                className="inline-flex h-9 items-center gap-2 rounded-xl border border-input bg-background px-3 text-xs font-semibold shadow-xs transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                <Download className="size-4" />
                {isAr ? "تنزيل QR" : "Download QR"}
              </a>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
