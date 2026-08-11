"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Download, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { exportMembersCsvAction } from "@/lib/actions/members-export";
import { useMembersNav } from "./members-nav-context";
import { buildMembersCsv, downloadCsv } from "./csv";

const ALL = "__all__";

export function MembersFilters({ locale }: { locale: string }) {
  const isAr = locale === "ar";
  const { get, pushParams } = useMembersNav();
  const q = get("q");
  const ownership = get("ownership");
  const arrears = get("arrears");

  const [qDraft, setQDraft] = useState(q ?? "");
  const firstRender = useRef(true);
  const inputRef = useRef<HTMLInputElement>(null);
  const [exporting, startExport] = useTransition();

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const timer = setTimeout(() => pushParams({ q: qDraft || undefined, page: undefined }), 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qDraft]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "/") return;
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;
      e.preventDefault();
      inputRef.current?.focus();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const chips: { key: string; label: string }[] = [];
  if (q) chips.push({ key: "q", label: isAr ? `بحث: ${q}` : `Search: ${q}` });
  if (ownership === "owns") chips.push({ key: "ownership", label: isAr ? "يملك وحدات" : "Owns units" });
  if (ownership === "none") chips.push({ key: "ownership", label: isAr ? "لا يملك وحدات" : "Owns none" });
  if (arrears === "1") chips.push({ key: "arrears", label: isAr ? "عليهم متأخرات" : "Has arrears" });

  function removeChip(key: string) {
    if (key === "q") setQDraft("");
    pushParams({ [key]: undefined, page: undefined });
  }

  async function exportAll() {
    startExport(async () => {
      const rows = await exportMembersCsvAction({ q, ownership, arrears });
      downloadCsv(`members-${Date.now()}.csv`, buildMembersCsv(rows, isAr));
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={inputRef}
            value={qDraft}
            onChange={(e) => setQDraft(e.target.value)}
            placeholder={isAr ? "بحث بالاسم أو الهاتف أو البريد… (/)" : "Search name, phone, or email… (/)"}
            className="w-64 ps-8"
          />
        </div>

        <Select
          value={ownership || undefined}
          onValueChange={(v) => pushParams({ ownership: (v === ALL ? undefined : v) as any, page: undefined })}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder={isAr ? "الملكية" : "Ownership"} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{isAr ? "الكل" : "All"}</SelectItem>
            <SelectItem value="owns">{isAr ? "يملك وحدات" : "Owns units"}</SelectItem>
            <SelectItem value="none">{isAr ? "لا يملك وحدات" : "Owns none"}</SelectItem>
          </SelectContent>
        </Select>

        <Button
          type="button"
          variant={arrears === "1" ? "default" : "outline"}
          size="sm"
          onClick={() => pushParams({ arrears: arrears === "1" ? undefined : "1", page: undefined })}
        >
          {isAr ? "عليهم متأخرات فقط" : "Arrears only"}
        </Button>

        <Button type="button" variant="outline" size="sm" onClick={exportAll} disabled={exporting} className="ms-auto">
          <Download className="size-3.5" />
          {exporting ? (isAr ? "جارٍ التصدير…" : "Exporting…") : isAr ? "تصدير CSV" : "Export CSV"}
        </Button>
      </div>

      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {chips.map((chip) => (
            <Badge key={chip.key} variant="secondary" className="gap-1 ps-2.5 pe-1.5">
              {chip.label}
              <button
                type="button"
                onClick={() => removeChip(chip.key)}
                className="rounded-full p-0.5 hover:bg-foreground/10"
                aria-label={isAr ? "إزالة الفلتر" : "Remove filter"}
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))}
          <Button variant="link" size="sm" className="h-5 px-1" onClick={() => { setQDraft(""); pushParams({ q: undefined, ownership: undefined, arrears: undefined, page: undefined }); }}>
            {isAr ? "مسح الكل" : "Clear all"}
          </Button>
        </div>
      )}
    </div>
  );
}
