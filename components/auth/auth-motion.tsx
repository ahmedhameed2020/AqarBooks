"use client";

import React, { useSyncExternalStore } from "react";

const reducedMotionQuery = "(prefers-reduced-motion: reduce)";

export function useReducedMotion() {
  return useSyncExternalStore(
    (onStoreChange) => {
      const mediaQuery = window.matchMedia(reducedMotionQuery);
      const handleChange = () => onStoreChange();
      mediaQuery.addEventListener("change", handleChange);
      return () => mediaQuery.removeEventListener("change", handleChange);
    },
    () => window.matchMedia(reducedMotionQuery).matches,
    () => false,
  );
}

export function AuthMotionContainer({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={`animate-fade-in ${className}`}>{children}</div>;
}

export function AuthMotionItem({
  children,
  delay = 0,
  className = "",
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const reduced = useReducedMotion();
  
  if (reduced) {
    return <div className={className}>{children}</div>;
  }

  return (
    <div
      className={`transition-all duration-700 ease-out ${className}`}
      style={{
        animationDelay: `${delay}ms`,
        animationFillMode: "both",
      }}
    >
      {children}
    </div>
  );
}
