import React from "react";
import Image from "next/image";

export interface LogoMarkProps {
  className?: string;
  variant?: "solid" | "outline" | "white" | "monochrome";
}

/**
 * AqarBooks Official Brand Logo Mark
 * Featuring the official architectural gable & ledger pillars in Petrol Blue (#07425d -> #1b60b9) and Royal Purple (#7e1898).
 */
export function LogoMark({ className = "size-10" }: LogoMarkProps) {
  return (
    <span
      aria-hidden="true"
      className={`relative inline-flex shrink-0 items-center justify-center select-none ${className}`}
    >
      <Image
        src="/AqarBooks.svg"
        alt="AqarBooks Logo"
        width={80}
        height={80}
        priority
        className="size-full object-contain drop-shadow-xs"
      />
    </span>
  );
}
