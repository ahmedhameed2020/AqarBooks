import React from "react";

export interface LogoMarkProps {
  className?: string;
  variant?: "solid" | "outline" | "white" | "monochrome";
}

/**
 * AqarBooks (AB) Architectural & Ledger Monogram
 * - 'A' represents Aqar (Architectural Tower & Gable Elevation)
 * - 'B' represents Books (Accounting Ledger, Balanced Columns & Sheets)
 */
export function LogoMark({ className = "size-9", variant = "solid" }: LogoMarkProps) {
  if (variant === "outline") {
    return (
      <svg
        viewBox="0 0 36 36"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={`shrink-0 ${className}`}
        aria-hidden="true"
      >
        <path
          d="M10 28L18 6L26 28M13 21H23"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M18 13H24.5C26.433 13 28 14.567 28 16.5C28 18.433 26.433 20 24.5 20H18M18 20H25.5C27.433 20 29 21.567 29 23.5C29 25.433 27.433 27 25.5 27H18"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  return (
    <div
      aria-hidden="true"
      className={`relative inline-flex shrink-0 items-center justify-center rounded-2xl bg-[#1A3C2E] text-white shadow-md shadow-[#1A3C2E]/25 transition-transform select-none ${className}`}
    >
      <svg
        viewBox="0 0 36 36"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="size-[78%] drop-shadow-xs"
      >
        {/* Subtle Architectural Grid Lines in Background */}
        <line x1="8" y1="28" x2="28" y2="28" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="18" y1="6" x2="18" y2="28" stroke="rgba(255,255,255,0.2)" strokeWidth="1" strokeDasharray="2 2" />

        {/* Letter 'A' (The Tower Gable) */}
        <path
          d="M8.5 28L17 7C17.4 6.1 18.6 6.1 19 7L24 17.5"
          stroke="#FFFFFF"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M11.5 21H21.5"
          stroke="#FFFFFF"
          strokeWidth="2.4"
          strokeLinecap="round"
        />

        {/* Letter 'B' (The Accounting Ledger Spine & Sheets) in Emerald Accent */}
        <path
          d="M18 12.5H23.8C25.6 12.5 27 13.9 27 15.7C27 17.5 25.6 18.9 23.8 18.9H18M18 18.9H24.8C26.7 18.9 28.2 20.4 28.2 22.3C28.2 24.2 26.7 25.7 24.8 25.7H18"
          stroke="#34D399"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Precision Balance Dot / Cornerstone Accent */}
        <circle cx="18" cy="7" r="1.2" fill="#34D399" />
      </svg>
    </div>
  );
}
