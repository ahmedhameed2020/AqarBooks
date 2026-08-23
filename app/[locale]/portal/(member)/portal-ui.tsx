"use client";

import { useId } from "react";
import { Search, X, CalendarRange, FileSpreadsheet, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// One toolbar vocabulary for the whole owner portal. Before this, each portal
// page hand-rolled its own filter chips, its own export button pair and its own
// stat card, which is how the statement ended up with three filter states and
// the payments ledger with three of the five payment methods. Centralising them
// means a control added here appears, and behaves, identically everywhere.
//
// Everything is logical-property based (ps/pe/ms/me, text-start/text-end) so
// Arabic is a native layout rather than a mirrored English one.

/* ------------------------------------------------------------------ header */

export function PortalPageHeader({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="space-y-1">
        <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl dark:text-white">
          {title}
        </h1>
        {description ? (
          <p className="max-w-2xl text-xs leading-relaxed text-slate-500 sm:text-sm">{description}</p>
        ) : null}
      </div>
      {children ? <div className="flex flex-wrap items-center gap-2">{children}</div> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ exports */

export function ExportButtons({
  onExcel,
  onPdf,
  disabled,
  locale,
  pdfLabel,
}: {
  onExcel: () => void;
  onPdf: () => void;
  disabled?: boolean;
  locale: string;
  /** Overrides the generic "Print PDF" wording where the paper has a name. */
  pdfLabel?: string;
}) {
  const isAr = locale === "ar";
  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled}
        onClick={onExcel}
        className="h-9 gap-2 rounded-xl border-emerald-500/40 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/40"
      >
        <FileSpreadsheet className="size-4" />
        <span>{isAr ? "تصدير Excel" : "Export Excel"}</span>
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled}
        onClick={onPdf}
        className="h-9 gap-2 rounded-xl border-indigo-500/40 text-xs font-semibold text-indigo-700 hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-950/40"
      >
        <Printer className="size-4" />
        <span>{pdfLabel ?? (isAr ? "طباعة PDF" : "Print PDF")}</span>
      </Button>
    </>
  );
}

/* --------------------------------------------------------------- stat cards */

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = "neutral",
  action,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: React.ReactNode;
  tone?: "neutral" | "positive" | "negative" | "accent";
  action?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "space-y-2 rounded-2xl border p-4 shadow-2xs",
        tone === "positive" && "border-emerald-500/30 bg-emerald-500/[0.04]",
        tone === "negative" && "border-rose-500/30 bg-rose-500/[0.04]",
        tone === "accent" && "border-indigo-500/30 bg-indigo-500/[0.04]",
        tone === "neutral" && "border-border/70 bg-card",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
          {icon}
          <span>{label}</span>
        </p>
        {action}
      </div>
      <p className="text-xl font-bold tabular-nums tracking-tight sm:text-2xl">{value}</p>
      {hint ? <p className="text-[11px] font-medium text-slate-500">{hint}</p> : null}
    </div>
  );
}

/* ---------------------------------------------------------- segmented tabs */

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  count?: number;
  /** Colours the active state -- lets charges read red and payments green. */
  tone?: "accent" | "positive" | "negative";
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T;
  options: SegmentOption<T>[];
  onChange: (next: T) => void;
  ariaLabel: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="flex flex-wrap items-center gap-1 rounded-xl border border-border/70 bg-slate-100 p-1 dark:bg-slate-900"
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
              active
                ? cn(
                    "bg-white shadow-2xs dark:bg-slate-800",
                    o.tone === "positive" && "text-emerald-600 dark:text-emerald-400",
                    o.tone === "negative" && "text-rose-600 dark:text-rose-400",
                    (!o.tone || o.tone === "accent") && "text-indigo-600 dark:text-indigo-400",
                  )
                : "text-slate-500 hover:text-slate-900 dark:hover:text-slate-200",
            )}
          >
            {o.label}
            {o.count !== undefined ? (
              <span className="ms-1.5 tabular-nums opacity-60">({o.count})</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/* --------------------------------------------------------------- searchbox */

export function SearchBox({
  value,
  onChange,
  placeholder,
  locale,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
  locale: string;
}) {
  const isAr = locale === "ar";
  const id = useId();
  return (
    <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
      <label htmlFor={id} className="sr-only">
        {placeholder}
      </label>
      <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
      <Input
        id={id}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-9 rounded-xl ps-9 pe-8 text-xs"
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label={isAr ? "مسح البحث" : "Clear search"}
          className="absolute end-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
        >
          <X className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------- date range */

export function DateRangeFilter({
  from,
  to,
  onFrom,
  onTo,
  onReset,
  locale,
}: {
  from: string;
  to: string;
  onFrom: (next: string) => void;
  onTo: (next: string) => void;
  onReset: () => void;
  locale: string;
}) {
  const isAr = locale === "ar";
  const fromId = useId();
  const toId = useId();
  const active = Boolean(from || to);

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/70 bg-card px-3 py-2">
      <CalendarRange className="size-4 shrink-0 text-indigo-500" />
      <label htmlFor={fromId} className="text-[11px] font-semibold text-slate-500">
        {isAr ? "من" : "From"}
      </label>
      <Input
        id={fromId}
        type="date"
        value={from}
        max={to || undefined}
        onChange={(e) => onFrom(e.target.value)}
        className="h-8 w-[9.5rem] rounded-lg text-xs"
      />
      <label htmlFor={toId} className="text-[11px] font-semibold text-slate-500">
        {isAr ? "إلى" : "To"}
      </label>
      <Input
        id={toId}
        type="date"
        value={to}
        min={from || undefined}
        onChange={(e) => onTo(e.target.value)}
        className="h-8 w-[9.5rem] rounded-lg text-xs"
      />
      {active ? (
        <button
          type="button"
          onClick={onReset}
          className="rounded-lg px-2 py-1 text-[11px] font-semibold text-slate-500 hover:text-rose-600"
        >
          {isAr ? "إلغاء الفلتر" : "Reset"}
        </button>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------ empty states */

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="space-y-2 rounded-2xl border border-dashed border-border/70 bg-card px-6 py-12 text-center">
      <div className="mx-auto flex size-11 items-center justify-center rounded-xl border border-border/60 bg-slate-50 text-slate-400 dark:bg-slate-900">
        {icon}
      </div>
      <p className="text-sm font-bold text-slate-900 dark:text-white">{title}</p>
      <p className="mx-auto max-w-sm text-xs leading-relaxed text-slate-500">{description}</p>
      {action ? <div className="pt-2">{action}</div> : null}
    </div>
  );
}

/* ------------------------------------------------------------- aging chart */

export function AgingBar({
  segments,
  total,
}: {
  segments: { key: string; label: string; amount: number; tone: string }[];
  total: number;
}) {
  if (total <= 0) return null;
  return (
    <div className="space-y-2">
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        {segments
          .filter((s) => s.amount > 0)
          .map((s) => (
            <div
              key={s.key}
              className={s.tone}
              style={{ width: `${(s.amount / total) * 100}%` }}
              title={`${s.label}: ${s.amount}`}
            />
          ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {segments
          .filter((s) => s.amount > 0)
          .map((s) => (
            <span key={s.key} className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
              <span className={cn("size-2 rounded-full", s.tone)} />
              {s.label}
            </span>
          ))}
      </div>
    </div>
  );
}
