"use client";

import { useMemo, useState } from "react";
import { Check, ClipboardCopy, Download } from "lucide-react";
import { Button } from "@/components/ui/button";

export function SecurityHealthSnapshotActions({
  locale,
  snapshotText,
}: {
  locale: string;
  snapshotText: string;
}) {
  const isAr = locale === "ar";
  const [copied, setCopied] = useState(false);
  const fileName = useMemo(() => `aqarbooks-security-health-${new Date().toISOString().slice(0, 10)}.txt`, []);

  async function copySnapshot() {
    await navigator.clipboard.writeText(snapshotText);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  function downloadSnapshot() {
    const url = URL.createObjectURL(new Blob([snapshotText], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" size="sm" onClick={copySnapshot} className="h-9 gap-2 rounded-md text-xs font-bold">
        {copied ? <Check className="size-4" /> : <ClipboardCopy className="size-4" />}
        {copied ? (isAr ? "تم النسخ" : "Copied") : isAr ? "نسخ Snapshot" : "Copy Snapshot"}
      </Button>
      <Button type="button" size="sm" variant="outline" onClick={downloadSnapshot} className="h-9 gap-2 rounded-md text-xs font-bold">
        <Download className="size-4" />
        {isAr ? "تحميل" : "Download"}
      </Button>
    </div>
  );
}
