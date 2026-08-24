import type { ReactNode } from "react";

/* Shared building blocks for the pricing page. Kept deliberately small: the
   page reuses the marketing surface language already established on the
   landing page (white / #FAFAFA surfaces, slate borders, petrol-navy accents)
   rather than introducing a second visual system. */

/** Numerals inside Arabic prose. Western digits are already an LTR bidi run,
    but pinning `dir="ltr"` on the span guarantees the thousands separator and
    any range dash render in the intended order regardless of the neighbouring
    characters. `tabular-nums` keeps the figures optically aligned. */
export function Num({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <span dir="ltr" className={`inline-block tabular-nums ${className}`}>
      {children}
    </span>
  );
}

export function SectionEyebrow({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-[#07425d]/20 bg-[#07425d]/5 px-3.5 py-1 text-xs font-bold text-[#07425d]">
      <span className="size-1.5 rounded-full bg-[#07425d]" aria-hidden="true" />
      {children}
    </span>
  );
}

/** Faint architectural drafting grid used across the marketing surface. */
export function DraftingGrid({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,#f1f5f9_1px,transparent_1px),linear-gradient(to_bottom,#f1f5f9_1px,transparent_1px)] bg-[size:3rem_3rem] ${className}`}
    />
  );
}
