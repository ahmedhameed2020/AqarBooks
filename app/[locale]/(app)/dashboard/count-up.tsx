"use client";

import { useEffect, useRef, useState } from "react";

// Animates 0 → value on mount with an ease-out curve. Falls back to the
// final value instantly when the user prefers reduced motion.
export function CountUp({
  value,
  locale,
  decimals = 2,
  durationMs = 900,
}: {
  value: number;
  locale: string;
  decimals?: number;
  durationMs?: number;
}) {
  const [display, setDisplay] = useState(0);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      // Reduced-motion bypass: skip straight to the final value, no animation loop.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDisplay(value);
      return;
    }
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min((now - start) / durationMs, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(value * eased);
      if (t < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [value, durationMs]);

  return (
    <span>
      {display.toLocaleString(locale, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })}
    </span>
  );
}
